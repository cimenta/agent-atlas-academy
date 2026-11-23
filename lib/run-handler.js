// POST /api/run: checks the request, then streams the events of a live run as server-sent events.
// The key is used only for the provider call. It is never logged and never written back.
import { validateDesign, clampLimits } from "../public/js/engine/patterns.js";
import { TASK_MAX_CHARS, PROVIDER_IDS, clampTimeoutSec, timeoutMsFor, clampOutputTokens, clampRetries, clampRetryDelaySec, clampRepeatStop, clampHandoffChars, clampFallback, REQUEST_MAX_BYTES as BODY_MAX_BYTES, RESUME_MAX_BYTES, DEFAULT_RUNS_PER_HOUR } from "../public/js/engine/catalog.js";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { cleanRecordedVerdicts } from "../public/js/engine/guardrails.js";
import { callAnthropic, redact } from "../public/js/engine/anthropic.js";
import { callGemini } from "../public/js/engine/gemini.js";
import { callGroq as callGroqDefault } from "../public/js/engine/groq.js";
import { callOpenrouter as callOpenrouterDefault } from "../public/js/engine/openrouter.js";
import { callCloudflare as callCloudflareDefault } from "../public/js/engine/cloudflare.js";
import { nodeModel } from "../public/js/engine/catalog.js";
import { keyShapeOk, modelsOfSlot } from "../public/js/engine/providers.js";
import { providerCalls } from "./provider-calls.js";
import { isSlot, slotProvider } from "../public/js/key-slots.js";
import { rateLimit } from "./rate-limit.js";

const PING_MS = 15000;

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
    if (size > RESUME_MAX_BYTES * 2) break;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const clientAddress = (req) =>
  String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";

// Whether the call to modelId of this agent may ask for a forced reply format: by the model of the call (a reviewer or a condensing call may use
// another tier than the agent), and never for a model the student picked.
export function forcedFormatFor(node, modelId) {
  if (typeof node?.modelId === "string" && node.modelId === modelId) return false;
  const found = isSlot(node?.slot) ? modelsOfSlot(node.slot).find((m) => m.id === modelId) : undefined;
  return found ? found.forcedFormat !== false : nodeModel(node).forcedFormat;
}

export function createRunHandler({ call = callAnthropic, callGoogle = callGemini, callGroq = callGroqDefault, callOpenrouter = callOpenrouterDefault, callCloudflare = callCloudflareDefault, rateLimitImpl = rateLimit, env = process.env } = {}) {
  const calls = providerCalls({ call, callGoogle, callGroq, callOpenrouter, callCloudflare });
  const perHour = Number(env.RUNS_PER_HOUR) > 0 ? Number(env.RUNS_PER_HOUR) : DEFAULT_RUNS_PER_HOUR;

  return async function handler(req, res) {
    if (req.method !== "POST") return sendJson(res, 405, { error: "method" });

    const raw = await readBody(req);
    const bytes = Buffer.byteLength(raw);
    if (bytes > RESUME_MAX_BYTES) return sendJson(res, 413, { error: "too_large" });
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return sendJson(res, 400, { error: "bad_json" });
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) return sendJson(res, 400, { error: "bad_json" });

    if (bytes > BODY_MAX_BYTES && !Array.isArray(body.resume)) return sendJson(res, 413, { error: "too_large" });
    const { design } = body;
    // keys: one key for each key slot the agents use (a run may mix providers). A single apiKey is the older way.
    const keys = body.keys !== undefined && body.keys !== null && typeof body.keys === "object" && !Array.isArray(body.keys) ? body.keys : null;
    const provider = body.provider === undefined ? "anthropic" : body.provider;
    if (!PROVIDER_IDS.includes(provider)) return sendJson(res, 400, { error: "bad_provider" });
    const keyOk = (key, forProvider) => keyShapeOk(forProvider, key);
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
    // A key of the form ACCOUNT_ID:TOKEN (Cloudflare) is hidden whole and in its two parts.
    const secrets = [apiKey, ...(keys ? Object.values(keys) : [])].filter((k) => typeof k === "string").flatMap((k) => (k.indexOf(":") > 0 ? [k, k.slice(0, k.indexOf(":")), k.slice(k.indexOf(":") + 1)] : [k]));
    const hide = (text) => secrets.reduce((out, k) => redact(out, k), text);
    const task = typeof body.task === "string" ? body.task.trim() : "";
    if (task === "" || task.length > TASK_MAX_CHARS) return sendJson(res, 400, { error: "bad_task" });
    const checked = validateDesign(design);
    if (!checked.ok) return sendJson(res, 400, { error: "bad_design", errors: checked.errors });

    if (!rateLimitImpl(clientAddress(req), perHour)) return sendJson(res, 429, { error: "rate_limit" });

    // resume: answers of agents that finished in an earlier try, so a failed run can carry on where it stopped.
    const ids = new Set(design.nodes.map((n) => n.id));
    const resume = Array.isArray(body.resume)
      ? body.resume.slice(0, 200).filter((r) => r && typeof r.agent === "string" && ids.has(r.agent) && (typeof r.text === "string" || r.pending === true || r.inputChecks === true)).map((r) => ({ agent: r.agent, text: typeof r.text === "string" ? r.text : "", tokens: { input: Number(r.tokens?.input) || 0, output: Number(r.tokens?.output) || 0 }, ...(r.pending === true ? { pending: true } : {}), ...(r.inputChecks === true ? { inputChecks: true } : {}), ...(Array.isArray(r.guardrails) && r.guardrails.length > 0 ? { guardrails: cleanRecordedVerdicts(r.guardrails) } : {}), ...(r.condense && typeof r.condense.text === "string" ? { condense: { from: Number(r.condense.from) || 0, to: Number(r.condense.to) || 0, text: r.condense.text.slice(0, 5000), usage: { input: Number(r.condense.usage?.input) || 0, output: Number(r.condense.usage?.output) || 0 }, kept: r.condense.kept !== false } } : {}) }))
      : [];
    // approved: the agents the visitor already approved in this run, so they are not asked about again.
    const approved = Array.isArray(body.approved) ? body.approved.slice(0, 20).filter((id) => typeof id === "string" && ids.has(id)) : [];
    const limits = clampLimits(body.limits);
    const timeoutMs = clampTimeoutSec(body.timeoutSec) * 1000;
    const maxOutputTokens = clampOutputTokens(body.outputTokens);
    const retries = clampRetries(body.retries);
    const retryDelaySec = clampRetryDelaySec(body.retryDelaySec);
    const freeTier = body.freeTier === true;
    const repeatStop = clampRepeatStop(body.repeatStop);
    const handoffChars = clampHandoffChars(body.handoffChars);
    const allowSearch = body.webSearch !== false;
    const fallback = clampFallback(body.fallback);
    const formatEnforcement = body.formatEnforcement !== false;
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
        maxOutputTokens,
        retries,
        retryDelaySec,
        freeTier,
        repeatStop,
        handoffChars,
        allowSearch,
        fallback,
        formatEnforcement,
        approved,
        language,
        provider,
        resume,
        signal: control.signal,
        call: (providerBody, { signal, fetchImpl } = {}) => calls[provider](providerBody, { apiKey, signal, timeoutMs: timeoutMsFor(provider, timeoutMs), fetchImpl }),
        callFor: keys
          ? (node) => {
              if (!isSlot(node.slot)) return undefined;
              const key = keys[node.slot];
              const send = calls[slotProvider(node.slot)];
              // A model that cannot take a forced reply format (the free Strong model of OpenRouter) is told so.
              return (providerBody, { signal, fetchImpl } = {}) => send(providerBody, { apiKey: key, signal, timeoutMs: timeoutMsFor(slotProvider(node.slot), timeoutMs), fetchImpl, forcedFormat: forcedFormatFor(node, providerBody?.model) });
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
