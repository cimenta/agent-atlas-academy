import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRunHandler } from "../lib/run-handler.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const port = Number(process.env.PORT) || 8080;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const useMock = process.argv.includes("--mock");
if (useMock && process.env.VERCEL) {
  console.error("--mock is for local development only and is refused on Vercel.");
  process.exit(1);
}
const runHandler = useMock
  ? createRunHandler({ call: createMockCall({ delayMs: 400 }), rateLimitImpl: () => true })
  : createRunHandler();

const server = createServer(async (req, res) => {
  try {
    if (new URL(req.url, "http://localhost").pathname === "/api/run") {
      await runHandler(req, res);
      return;
    }
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const relative = normalize(pathname === "/" ? "/index.html" : pathname);
    const file = join(root, relative);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(port, () => {
  console.log(`Serving public/ at http://localhost:${port}`);
  if (useMock) console.log("MOCK MODE: /api/run answers with fake agents. No key is used and nothing is sent to Anthropic.");
});
