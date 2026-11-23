// POST /api/quota { provider, key }: how many free requests the key has left today. Only OpenRouter says it. The page policy allows only
// connect-src 'self', so the page cannot ask the provider itself. The key is used for this one call; it is never logged, never
// stored, and never in an answer. The answer holds three numbers and the time the count starts again.
import { keyShapeOk } from "../public/js/engine/providers.js";
import { readOpenrouterKey } from "../public/js/engine/openrouter.js";
import { parseFreeQuota, nextResetUtc } from "../public/js/engine/quota.js";
import { rateLimit } from "./rate-limit.js";

const BODY_MAX_BYTES = 2048;
export const QUOTA_CHECKS_PER_HOUR = 60;

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

// readKey: asks the provider about the key; answers its parsed JSON. Tests and mock mode give their own.
export function createQuotaHandler({ readKey = readOpenrouterKey, rateLimitImpl = rateLimit, now = () => new Date() } = {}) {
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
    if (provider !== "openrouter") return sendJson(res, 400, { error: "bad_provider" });
    if (!keyShapeOk(provider, key)) return sendJson(res, 400, { error: "bad_key" });
    if (!rateLimitImpl(`quota:${clientAddress(req)}`, QUOTA_CHECKS_PER_HOUR)) return sendJson(res, 429, { error: "rate_limit" });

    let data;
    try {
      data = await readKey({ apiKey: key });
    } catch (error) {
      return sendJson(res, 502, { error: [400, 401, 403].includes(error?.status) ? "rejected" : "unreachable" });
    }
    const quota = parseFreeQuota(data);
    if (!quota) return sendJson(res, 200, { ok: false, error: "unknown" });
    return sendJson(res, 200, { ok: true, ...quota, resetsAt: nextResetUtc(now()) });
  };
}
