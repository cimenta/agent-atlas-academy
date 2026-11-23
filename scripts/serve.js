import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRunHandler } from "../lib/run-handler.js";
import { createModelsHandler } from "../lib/models-handler.js";
import { createQuotaHandler } from "../lib/quota-handler.js";
import { mockOpenrouterKey } from "./mock-quota.js";
import { PROVIDERS } from "../public/js/engine/providers.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";
import { AnthropicError } from "../public/js/engine/anthropic.js";
import { callChatCompletions } from "../public/js/engine/openai-compat.js";
import { createGroqMock } from "./mock-groq.js";
import { createOpenrouterMock, mockOpenrouterList } from "./mock-openrouter.js";
import { createCloudflareMock, mockCloudflareList } from "./mock-cloudflare.js";
import { callCloudflare } from "../public/js/engine/cloudflare.js";

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
// Mock mode: the fake provider also answers on this server (/mock-provider/v1/messages), and the fake call goes there through
// the fetch it is given, so the log of API calls has real entries to show without a key.
const mockCall = createMockCall({ delayMs: 400 });
const mockOverFetch = async (body, { signal, fetchImpl } = {}) => {
  if (!fetchImpl) return mockCall(body, { signal });
  const res = await fetchImpl(`http://localhost:${port}/mock-provider/v1/messages`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": "mock-key" }, body: JSON.stringify(body), signal });
  const data = await res.json();
  if (!res.ok) throw new AnthropicError(data?.error?.message ?? "The mock provider failed", { status: res.status });
  return data;
};
// Groq in mock mode: the real chat-completions adapter talks to the local stand-in. MOCK_GROQ_429=minute|day makes every third call a 429.
const groqMock = createGroqMock({ mockCall });
const mockGroq = (body, options = {}) => callChatCompletions(body, { ...options, url: `http://localhost:${port}/mock-provider/groq/chat/completions`, who: "Groq" });
// OpenRouter in mock mode: the same adapter talks to the local stand-in. MOCK_OR_429=minute|day makes every third call a 429; =gone hides a free model.
const openrouterMock = createOpenrouterMock({ mockCall });
const mockOpenrouter = (body, options = {}) => callChatCompletions(body, { ...options, url: `http://localhost:${port}/mock-provider/openrouter/chat/completions`, who: "OpenRouter", maxTokensField: "max_tokens", reasoningEffort: null });
// Cloudflare in mock mode: the real adapter (key split, account address) talks to the local stand-in. MOCK_CF_429=quota makes every third call a quota answer.
const cloudflareMock = createCloudflareMock({ mockCall });
const mockCloudflare = (body, options = {}) => callCloudflare(body, { ...options, fetchImpl: (url, init) => (options.fetchImpl ?? fetch)(String(url).replace("https://api.cloudflare.com", `http://localhost:${port}/mock-provider/cloudflare`), init) });
const runHandler = useMock
  ? createRunHandler({ call: mockOverFetch, callGroq: mockGroq, callOpenrouter: mockOpenrouter, callCloudflare: mockCloudflare, rateLimitImpl: () => true })
  : createRunHandler();

// Mock mode: the list of models of a provider is its catalog plus a few made-up models, and no provider is asked.
const mockList = (id) => id === "openrouter" ? async () => mockOpenrouterList() : id === "cloudflare" ? async () => mockCloudflareList() : async () => [...PROVIDERS[id].models.map((m) => m.id), "mock-model-1", "mock-model-2", "mock-model-3"];
const modelsHandler = useMock
  ? createModelsHandler({ lists: Object.fromEntries(Object.keys(PROVIDERS).map((id) => [id, mockList(id)])), rateLimitImpl: () => true })
  : createModelsHandler();

// Mock mode: the free requests left are made up, and OpenRouter is not asked.
const quotaHandler = useMock ? createQuotaHandler({ readKey: async () => mockOpenrouterKey(), rateLimitImpl: () => true }) : createQuotaHandler();

const server = createServer(async (req, res) => {
  try {
    if (new URL(req.url, "http://localhost").pathname === "/api/run") {
      await runHandler(req, res);
      return;
    }
    if (useMock && req.method === "POST" && new URL(req.url, "http://localhost").pathname === "/mock-provider/groq/chat/completions") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const stopped = new AbortController();
      res.on("close", () => stopped.abort());
      try {
        const made = await groqMock(JSON.parse(Buffer.concat(chunks).toString("utf8")), { signal: stopped.signal });
        res.writeHead(made.status, { "content-type": "application/json", ...made.headers }).end(JSON.stringify(made.body));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: String(error?.message ?? error) } }));
      }
      return;
    }
    if (useMock && req.method === "POST" && new URL(req.url, "http://localhost").pathname === "/mock-provider/openrouter/chat/completions") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const stopped = new AbortController();
      res.on("close", () => stopped.abort());
      try {
        const made = await openrouterMock(JSON.parse(Buffer.concat(chunks).toString("utf8")), { signal: stopped.signal });
        res.writeHead(made.status, { "content-type": "application/json", ...made.headers }).end(JSON.stringify(made.body));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: String(error?.message ?? error) } }));
      }
      return;
    }
    if (useMock && req.method === "POST" && /^\/mock-provider\/cloudflare\/.+\/chat\/completions$/.test(new URL(req.url, "http://localhost").pathname)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const stopped = new AbortController();
      res.on("close", () => stopped.abort());
      try {
        const made = await cloudflareMock(JSON.parse(Buffer.concat(chunks).toString("utf8")), { signal: stopped.signal });
        res.writeHead(made.status, { "content-type": "application/json", ...made.headers }).end(JSON.stringify(made.body));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: String(error?.message ?? error) } }));
      }
      return;
    }
    if (useMock && req.method === "POST" && new URL(req.url, "http://localhost").pathname === "/mock-provider/v1/messages") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const stopped = new AbortController();
      res.on("close", () => stopped.abort());
      try {
        const answer = await mockCall(JSON.parse(Buffer.concat(chunks).toString("utf8")), { signal: stopped.signal });
        res.writeHead(200, { "content-type": "application/json", "request-id": "req_mock", "x-ratelimit-remaining-requests": "99" }).end(JSON.stringify({ id: "msg_mock", type: "message", role: "assistant", model: "mock", ...answer }));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: String(error?.message ?? error) } }));
      }
      return;
    }
    if (new URL(req.url, "http://localhost").pathname === "/api/quota") {
      await quotaHandler(req, res);
      return;
    }
    if (new URL(req.url, "http://localhost").pathname === "/api/models") {
      await modelsHandler(req, res);
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
