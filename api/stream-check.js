import { parseSeconds } from "../lib/stream-check.js";

// GET /api/stream-check?seconds=N writes one line every 5 s for N seconds.
export default async function handler(req, res) {
  const seconds = parseSeconds(new URL(req.url, "http://localhost").searchParams.get("seconds"));
  res.statusCode = 200;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("cache-control", "no-store, no-transform");
  res.flushHeaders?.();
  let closed = false;
  res.on("close", () => {
    closed = true;
  });
  const started = Date.now();
  let tick = 0;
  while (!closed && Date.now() - started < seconds * 1000) {
    tick += 1;
    res.write(`tick ${tick} after ${Math.round((Date.now() - started) / 1000)} s\n`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  res.end(`done after ${Math.round((Date.now() - started) / 1000)} s\n`);
}
