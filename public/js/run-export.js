// A run as it leaves the browser in Export run: without what identifies the person or their account.
// The stored copy keeps everything; only the exported file is cleaned.
export function runForExport(run) {
  const copy = structuredClone(run);
  delete copy.client; // language, time zone and browser of the person who made the run
  for (const event of copy.events ?? []) {
    if (event?.raw?.http) delete event.raw.http.headers; // rate limits and request ids of their account
  }
  return copy;
}
