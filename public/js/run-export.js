import { HIDDEN } from "./engine/api-log.js";

const KEPT_RESPONSE_HEADERS = /^(retry-after|date|content-type|content-length|x-ratelimit-.*|anthropic-ratelimit-.*)$/i;

// A run as it leaves the browser in Export run: without what identifies the person or their account.
// The stored copy keeps everything; only the exported file is cleaned.
export function runForExport(run) {
  const copy = structuredClone(run);
  delete copy.client; // language, time zone and browser of the person who made the run
  for (const event of [...(copy.events ?? []), ...(Array.isArray(copy.apiCalls) ? copy.apiCalls : [])]) {
    if (event?.raw?.http) delete event.raw.http.headers; // rate limits and request ids of their account
    // The calls to the provider keep the headers that teach (limits, waiting time) and hide the rest: the name stays, the value goes.
    if (event?.type === "api_call" && event.response?.headers) {
      for (const name of Object.keys(event.response.headers)) if (!KEPT_RESPONSE_HEADERS.test(name)) event.response.headers[name] = HIDDEN;
    }
  }
  return copy;
}
