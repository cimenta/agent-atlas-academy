// The API calls tab: for the chosen agent, every call to the provider in order, what was sent and what came back.
// Everything from the run is drawn as text (an imported run is not trusted).
import { h } from "../dom.js";
import { API_LOG_BODY_MAX } from "../engine/api-log.js";
import { safeStringify } from "./viewer.js";

// The calls of one agent in order; upTo: only those made by this time of the run (the position of the player).
export const apiCallsOf = (apiCalls, agentId, upTo = Infinity) => (Array.isArray(apiCalls) ? apiCalls : []).filter((c) => c?.agent === agentId && Number(c.t) <= upTo);

const headerLines = (headers) => Object.entries(headers ?? {}).map(([name, value]) => `${name}: ${value}`);

// A JSON body the way the viewer shows it, so a search finds what the student sees as well as the raw text.
function prettyBody(body) {
  if (typeof body !== "string" || !/^\s*[[{]/.test(body)) return "";
  try {
    return safeStringify(JSON.parse(body), "");
  } catch {
    return "";
  }
}

// All the text of a call, for the search.
const textOf = (call) =>
  [call.method, call.url, ...headerLines(call.request?.headers), call.request?.body, prettyBody(call.request?.body), call.response ? `${call.response.status} ${call.response.statusText}` : "", ...headerLines(call.response?.headers), call.response?.body, prettyBody(call.response?.body), call.error]
    .filter((x) => typeof x === "string" && x !== "")
    .join("\n")
    .toLowerCase();

const failed = (call) => call.response === null || call.response === undefined || call.response.status >= 400;

function modelOf(call) {
  try {
    const model = JSON.parse(call.request?.body)?.model;
    if (typeof model === "string") return model;
  } catch {
    // not JSON
  }
  return /\/models\/([^/:?]+)/.exec(String(call.url))?.[1] ?? "";
}

// The tokens the provider counted, from the usual places of the three formats; null when the answer has none.
function tokensOf(call) {
  try {
    const data = JSON.parse(call.response?.body);
    const u = data?.usage ?? {};
    const g = data?.usageMetadata ?? {};
    const input = u.input_tokens ?? u.prompt_tokens ?? g.promptTokenCount;
    const output = u.output_tokens ?? u.completion_tokens ?? g.candidatesTokenCount;
    if (Number.isFinite(input) && Number.isFinite(output)) return { i: input, o: output };
  } catch {
    // not JSON
  }
  return null;
}

// What a row needs from the bodies, found once for each call: a live run redraws the tab on every event.
const summaries = new WeakMap();
function summaryOf(call) {
  let found = summaries.get(call);
  if (!found) {
    found = { model: modelOf(call), tokens: tokensOf(call) };
    summaries.set(call, found);
  }
  return found;
}

const defaultNum = (n) => n.toFixed(1);

// opened: a Map of the rows the student opened or closed (id -> open), so a redraw (every live event) keeps their choice.
// free: the agent used a key on a free tier. runHasCalls: the run has calls (of some agent). num: writes a number with one decimal.
export function apiView({ doc, t, calls, wire, viewer, query = "", dropped = false, opened = new Map(), free = false, runHasCalls = false, num = defaultNum }) {
  if (!Array.isArray(calls) || calls.length === 0) return h(doc, "div", { class: "empty", "data-ui": "api-none" }, t(dropped ? "replay.api.dropped" : runHasCalls ? "replay.api.none" : "replay.api.old"));
  const q = String(query ?? "").trim().toLowerCase();
  const firstFailed = calls.findIndex(failed);
  const seconds = (ms) => `${num(Math.max(0, Number(ms) || 0) / 1000)} s`;

  const hiddenSpan = (value) => (value === "(hidden)" ? h(doc, "span", { class: "hid" }, value) : doc.createTextNode(value));
  const headers = (map) => h(doc, "pre", { class: "api-headers" }, ...Object.entries(map ?? {}).flatMap(([name, value], i) => [doc.createTextNode(`${i > 0 ? "\n" : ""}${name}: `), hiddenSpan(String(value))]));
  // The note under a body that was cut or not kept at all.
  const bodyNote = (body, bytes) => {
    if (!bytes) return [];
    const kb = Math.round(bytes / 1024);
    return [h(doc, "p", { class: "hint" }, body === "" ? t("replay.api.omitted", { kb }) : t("replay.api.cut", { shown: Math.round(API_LOG_BODY_MAX / 1000), kb }))];
  };

  const reason = (call) => {
    if (call.response) return call.response.status === 429 ? t("replay.api.reasonRate") : call.response.status < 400 ? t("replay.api.reasonOk") : t("replay.api.reasonError");
    return call.error === "cancelled" ? t("replay.api.reasonCancelled") : call.error === "timeout" ? t("replay.api.reasonTimeout") : String(call.error ?? "").slice(0, 80);
  };

  // The two columns of a row, built when the row is open (a closed row costs nothing on a redraw).
  const columns = (call, id) => {
    const sent = h(doc, "div", {}, h(doc, "h4", {}, t("replay.api.sent")), h(doc, "p", { class: "line" }, `${call.method} ${call.url}`), headers(call.request?.headers), viewer.view(`${id}-req`, call.request?.body ?? ""), ...bodyNote(call.request?.body ?? "", call.truncated?.request));
    const got = h(doc, "div", {}, h(doc, "h4", {}, t("replay.api.received")));
    if (call.response) {
      got.append(h(doc, "p", { class: "line" }, h(doc, "span", { class: call.response.status >= 400 ? "rl" : "" }, String(call.response.status)), doc.createTextNode(` ${call.response.statusText ?? ""}`)), headers(call.response.headers), viewer.view(`${id}-res`, call.response.body ?? ""), ...bodyNote(call.response.body ?? "", call.truncated?.response));
    } else got.append(h(doc, "p", { class: "line" }, t("replay.api.nothing")), ...(call.error && call.error !== "timeout" && call.error !== "cancelled" ? [h(doc, "p", { class: "hint" }, String(call.error))] : []));
    return h(doc, "div", { class: "cols" }, sent, got);
  };

  const row = (call, index) => {
    const bad = call.response ? call.response.status >= 400 : false;
    const badge = h(doc, "span", { class: `st ${call.response ? (bad ? "bad" : "ok") : "none"}` }, call.response ? String(call.response.status) : t("replay.api.noAnswer"));
    const { model, tokens } = summaryOf(call);
    // How long the app waited before the next call, when this one failed (the next call's own time is not part of the wait).
    const next = calls[index + 1];
    const waited = failed(call) && next ? Math.round((Number(next.t) - (Number(next.ms) || 0) - Number(call.t)) / 1000) : 0;
    const meta = [seconds(call.ms), waited >= 1 ? t("replay.api.retried", { s: waited }) : "", free ? t("replay.api.free") : "", tokens ? t("replay.api.tokens", tokens) : ""].filter(Boolean).join(" · ");
    const id = `api-${call.agent}-${call.n}`;
    const open = opened.has(id) ? opened.get(id) : q ? textOf(call).includes(q) : index === firstFailed;
    let shown = open;
    const summary = h(doc, "summary", {}, badge, h(doc, "b", {}, t("replay.api.call", { n: call.n })), doc.createTextNode(`${model ? ` · ${model}` : ""} · ${reason(call)}`), h(doc, "span", { class: "meta" }, meta));
    const details = h(doc, "details", { class: "call", "data-ui": "api-call", open }, summary);
    let built = false;
    const build = () => {
      if (built) return;
      built = true;
      details.append(columns(call, id));
    };
    if (open) build();
    summary.addEventListener("click", () => {
      shown = !shown;
      opened.set(id, shown);
      if (shown) build();
    });
    return details;
  };

  const noteKey = wire?.noteKey ?? "replay.api.noteSame";
  const note = h(doc, "div", { class: "explain", "data-ui": "api-note" }, h(doc, "p", {}, h(doc, "b", {}, t(`${noteKey}Lead`)), doc.createTextNode(` ${t(noteKey)}`)), h(doc, "p", { class: "hint" }, t("replay.api.hiddenNote")));
  if (Array.isArray(wire?.map) && wire.map.length > 0) {
    note.append(
      h(doc, "table", { class: "conv", "data-ui": "api-table" }, h(doc, "tr", {}, h(doc, "th", {}, t("replay.api.table.inside")), h(doc, "th", {}, t("replay.api.table.sent"))), ...wire.map.map(([inside, sent]) => h(doc, "tr", {}, h(doc, "td", {}, inside), h(doc, "td", {}, sent)))),
    );
  }
  return h(doc, "div", { class: "api-calls", "data-ui": "api-calls" }, note, ...calls.map(row), h(doc, "p", { class: "hint", "data-ui": "api-hint" }, t("replay.api.hint")));
}
