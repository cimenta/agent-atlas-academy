// POST /api/models: asks a provider which models it offers to a key (Settings, Check models) and answers the cleaned list.
// The page policy allows only connect-src 'self', so the page cannot ask the provider itself. The key is used for this one
// call; it is never logged, never stored, and never in an answer.
import { PROVIDER_IDS, keyShapeOk } from "../public/js/engine/providers.js";
import { MODEL_CHECKS_PER_HOUR } from "../public/js/engine/catalog.js";
import { listAnthropicModels } from "../public/js/engine/anthropic.js";
import { listGeminiModels } from "../public/js/engine/gemini.js";
import { redact } from "../public/js/engine/anthropic.js";
import { cleanModelList } from "../public/js/engine/model-check.js";
import { rateLimit } from "./rate-limit.js";

const BODY_MAX_BYTES = 2048;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) return typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_MAX_BYTES * 2) break;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const clientAddress = (req) => String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";

// lists: the function that lists the models of each provider, by provider id (the ids of the registry).
export function createModelsHandler({ lists = { anthropic: listAnthropicModels, google: listGeminiModels }, rateLimitImpl = rateLimit } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
    const raw = await readBody(req);
    if (Buffer.byteLength(raw) > BODY_MAX_BYTES) return sendJson(res, 413, { error: "too_large" });
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: "bad_json" });
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) return sendJson(res, 400, { error: "bad_json" });
    const { provider, key } = body;
    if (!PROVIDER_IDS.includes(provider) || typeof lists[provider] !== "function") return sendJson(res, 400, { error: "bad_provider" });
    if (!keyShapeOk(provider, key)) return sendJson(res, 400, { error: "bad_key" });
    if (!rateLimitImpl(`models:${clientAddress(req)}`, MODEL_CHECKS_PER_HOUR)) return sendJson(res, 429, { error: "rate_limit" });

    let rawIds;
    try {
      rawIds = await lists[provider]({ apiKey: key });
    } catch (error) {
      return sendJson(res, 502, { error: [400, 401, 403].includes(error?.status) ? "rejected" : "unreachable" });
    }
    // A name that contains the key is dropped: the key must not come back in any form.
    const safe = Array.isArray(rawIds) ? rawIds.filter((id) => typeof id !== "string" || redact(id, key) === id) : [];
    return sendJson(res, 200, { ok: true, ...cleanModelList(safe, provider) });
  };
}
