// The log of the calls to a provider: what was sent and what came back, exactly, also when a call failed.
// recordingFetch wraps fetch and writes one entry for each call into a list; loggedCall (in the orchestrator) turns the
// entries into events of the run. Values that could identify an account stay out: the name of a header stays, its value is hidden.

export const API_LOG_BODY_MAX = 300000; // characters kept of one body
export const HIDDEN = "(hidden)";
// The bounds of the strings of an entry; the run schema refuses anything over them, so the recording cuts to them.
export const API_TEXT_MAX = 2000; // an address, an error
export const API_HEADERS_MAX = 100; // headers of one request or answer
export const API_HEADER_VALUE_MAX = 2000;

const SECRET_NAMES = new Set(["authorization", "proxy-authorization", "cookie", "set-cookie"]);
const secretName = (name) => SECRET_NAMES.has(name) || (!name.includes("ratelimit") && (name.includes("key") || name.includes("token")));

// Headers (a Headers object, an object or a list of pairs) as a plain object with lower-case names and the secret values hidden.
export function hideHeaders(headers) {
  const pairs = headers == null ? [] : typeof headers.entries === "function" && !Array.isArray(headers) ? [...headers.entries()] : Array.isArray(headers) ? headers : Object.entries(headers);
  const out = {};
  for (const [rawName, value] of pairs.slice(0, API_HEADERS_MAX)) {
    const name = String(rawName).toLowerCase().slice(0, 200);
    out[name] = secretName(name) ? HIDDEN : String(value).slice(0, API_HEADER_VALUE_MAX);
  }
  return out;
}

// The text cut to max characters; bytes is the size of the whole text when it was cut, else null.
export function cutBody(text, max = API_LOG_BODY_MAX) {
  const value = String(text ?? "");
  if (value.length <= max) return { text: value, bytes: null };
  return { text: value.slice(0, max), bytes: new TextEncoder().encode(value).length };
}

const bodyText = (body) => (body == null ? "" : typeof body === "string" ? body : "(not text)");

// A fetch that returns the real answer and records each call in sink: { n, method, url, request, response, error, ms, truncated }.
export function recordingFetch(sink, { baseFetch = globalThis.fetch, now = Date.now } = {}) {
  let n = 0;
  return async function recorded(input, init = {}) {
    const startedAt = now();
    const entry = {
      n: ++n,
      method: String(init?.method ?? input?.method ?? "GET").toUpperCase(),
      url: (typeof input === "string" ? input : String(input?.url ?? input)).replace(/(\/accounts\/)[0-9a-f]{32}/gi, "$1{account}").slice(0, API_TEXT_MAX),
      request: { headers: hideHeaders(init?.headers), body: "" },
      response: null,
      error: null,
      ms: 0,
      truncated: { request: null, response: null },
    };
    const sent = cutBody(bodyText(init?.body));
    entry.request.body = sent.text;
    entry.truncated.request = sent.bytes;
    let response;
    try {
      response = await baseFetch(input, init);
    } catch (error) {
      entry.error = error?.name === "AbortError" ? "cancelled" : error?.name === "TimeoutError" ? "timeout" : String(error?.message ?? error).slice(0, API_TEXT_MAX);
      entry.ms = now() - startedAt;
      sink.push(entry);
      throw error;
    }
    let text = "";
    try {
      text = await response.clone().text();
    } catch (error) {
      // The call was cancelled while the answer was still coming in.
      if (error?.name === "AbortError") entry.error = "cancelled";
      text = "";
    }
    const got = cutBody(text);
    entry.response = { status: response.status, statusText: response.statusText ?? "", headers: hideHeaders(response.headers), body: got.text };
    entry.truncated.response = got.bytes;
    entry.ms = now() - startedAt;
    sink.push(entry);
    return response;
  };
}

// A provider call that records its fetches: the same call, handed a recording fetch, and an api_call event for each fetch
// (also when the call fails), sent before the answer or the error goes on. A call that makes no fetch (a mock) emits nothing.
// The number of a call counts the calls of the agent (rounds and retries), not the fetches of one call.
// pending: a set the caller can wait on, so calls that are cancelled when the run ends are recorded before the run is closed.
export function loggedCall(call, { agent, provider, emit, baseFetch, pending } = {}) {
  let n = 0;
  return function logged(body, options = {}) {
    const sink = [];
    const run = (async () => {
      try {
        return await call(body, { ...options, fetchImpl: recordingFetch(sink, { baseFetch }) });
      } finally {
        for (const entry of sink) emit({ type: "api_call", agent, provider, ...entry, n: ++n });
      }
    })();
    if (pending) {
      pending.add(run);
      const forget = () => pending.delete(run);
      run.then(forget, forget);
    }
    return run;
  };
}

// A call with its bodies left out (the sizes are kept): for a run that is too large to keep every body.
export function withoutBodies(call) {
  const size = (text, cut) => cut ?? (text === "" ? null : new TextEncoder().encode(text).length);
  return { ...call, request: { ...call.request, body: "" }, response: call.response ? { ...call.response, body: "" } : null, truncated: { request: size(call.request?.body ?? "", call.truncated?.request), response: call.response ? size(call.response.body ?? "", call.truncated?.response) : null } };
}
