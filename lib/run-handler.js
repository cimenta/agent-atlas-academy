// POST /api/run: checks the request, then streams the events of a live run as server-sent events.
// The key is used only for the provider call. It is never logged and never written back.
import { validateDesign, clampLimits } from "../public/js/engine/patterns.js";
import { TASK_MAX_CHARS, PROVIDER_IDS } from "../public/js/engine/catalog.js";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { callAnthropic, redact } from "../public/js/engine/anthropic.js";
import { callGemini } from "../public/js/engine/gemini.js";
import { isSlot, slotProvider } from "../public/js/key-slots.js";
import { rateLimit } from "./rate-limit.js";

const BODY_MAX_BYTES = 65536;
const PING_MS = 15000;
const DEFAULT_RUNS_PER_HOUR = 10;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_MAX_BYTES * 2) break;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const clientAddress = (req) =>
  String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";

export function createRunHandler({ call = callAnthropic, callGoogle = callGemini, rateLimitImpl = rateLimit, env = process.env } = {}) {
  const perHour = Number(env.RUNS_PER_HOUR) > 0 ? Number(env.RUNS_PER_HOUR) : DEFAULT_RUNS_PER_HOUR;

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

    const { design } = body;
    // keys: one key for each key slot the agents use (a run may mix providers). A single apiKey is the older way.
    const keys = body.keys !== undefined && body.keys !== null && typeof body.keys === "object" && !Array.isArray(body.keys) ? body.keys : null;
    const provider = body.provider === undefined ? "anthropic" : body.provider;
    if (!PROVIDER_IDS.includes(provider)) return sendJson(res, 400, { error: "bad_provider" });
    const keyOk = (key, forProvider) => typeof key === "string" && key.length >= 20 && key.length <= 300 && !(forProvider === "google" && key.startsWith("sk-ant-"));
    let apiKey = body.apiKey;
    if (keys) {
      const nodes = Array.isArray(design?.nodes) ? design.nodes : [];
      for (const node of nodes) {
        const slot = isSlot(node?.slot) ? node.slot : null;
        if (slot !== null && !keyOk(keys[slot], slotProvider(slot))) return sendJson(res, 400, { error: "bad_key" });
      }
      if (nodes.some((n) => !isSlot(n?.slot))) {
        if (!keyOk(apiKey, provider)) return sendJson(res, 400, { error: "bad_key" });
      } else if (apiKey === undefined) apiKey = "";
    } else if (!keyOk(apiKey, provider)) return sendJson(res, 400, { error: "bad_key" });
    const secrets = [apiKey, ...(keys ? Object.values(keys) : [])].filter((k) => typeof k === "string");
    const hide = (text) => secrets.reduce((out, k) => redact(out, k), text);
    const task = typeof body.task === "string" ? body.task.trim() : "";
    if (task === "" || task.length > TASK_MAX_CHARS) return sendJson(res, 400, { error: "bad_task" });
    const checked = validateDesign(design);
    if (!checked.ok) return sendJson(res, 400, { error: "bad_design", errors: checked.errors });

    if (!rateLimitImpl(clientAddress(req), perHour)) return sendJson(res, 429, { error: "rate_limit" });

    const limits = clampLimits(body.limits);
    const language = body.language === "cs" ? "cs" : "en";

    res.statusCode = 200;
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-store, no-transform");
    res.setHeader("x-accel-buffering", "no");
    res.flushHeaders?.();

    const control = new AbortController();
    let closed = false;
    res.on("close", () => {
      closed = true;
      control.abort();
    });
    const write = (text) => {
      if (!closed) res.write(text);
    };
    const ping = setInterval(() => write(": ping\n\n"), PING_MS);
    ping.unref?.();

    try {
      await runDesign({
        design,
        task,
        limits,
        language,
        provider,
        signal: control.signal,
        call: (providerBody, { signal } = {}) => (provider === "google" ? callGoogle : call)(providerBody, { apiKey, signal }),
        callFor: keys
          ? (node) => {
              if (!isSlot(node.slot)) return undefined;
              const key = keys[node.slot];
              const send = slotProvider(node.slot) === "google" ? callGoogle : call;
              return (providerBody, { signal } = {}) => send(providerBody, { apiKey: key, signal });
            }
          : undefined,
        emit: (event) => write(`data: ${hide(JSON.stringify(event))}\n\n`),
      });
    } finally {
      clearInterval(ping);
      if (!closed) res.end();
    }
  };
}
