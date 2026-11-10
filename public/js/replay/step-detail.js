// The grey box next to the step list: what the step is, and its input and output drawn for the
// kind of step it is (search query and results, model reply, handoff), not as raw text.
import { h } from "../dom.js";
import { parseMarkdown, isSafeHref } from "../markdown.js";
import { renderBlocks } from "../render.js";

const RESULT_LINE = /^(.*?)\s+-\s+(https?:\/\/\S+)$/;
const looksJson = (text) => /^\s*[[{]/.test(text);

function parseResults(output) {
  if (typeof output !== "string" || output.trim() === "") return null;
  const rows = output.split(/\r?\n/).map((line) => RESULT_LINE.exec(line.trim()));
  if (rows.length === 0 || rows.some((m) => m === null)) return null;
  return rows.map((m) => ({ title: m[1] || m[2], url: m[2] }));
}

export function stepDetail({ doc, t, step, why, viewer, viewerId, fmt, onShowMessages, waiting }) {
  const root = h(doc, "div", { class: "step-detail-body" });
  const hostOf = (url) => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };
  const text = (value) => (typeof value === "string" ? value : value ? t(value.key, value.params) : "");
  const rendered = (value) =>
    looksJson(value) ? viewer.view(viewerId, value) : h(doc, "div", { class: "rendered" }, renderBlocks(parseMarkdown(value), doc));
  const section = (kind, heading, ...children) =>
    h(doc, "section", { class: `io io-${kind}`, "data-ui": `step-${kind}` }, h(doc, "h4", {}, h(doc, "span", { class: "io-mark", "aria-hidden": "true" }, kind === "in" ? "↓" : "↑"), heading), ...children);

  const title = text(step.title);
  root.append(h(doc, "h3", {}, title));
  const explained = t(step.kind === "tool" ? `insp.doc.${step.tool}` : `insp.doc.${step.kind}`);
  if (!explained.startsWith("insp.doc.")) root.append(h(doc, "p", { class: "doc" }, explained));
  if (why) root.append(h(doc, "p", { class: "why" }, h(doc, "strong", {}, `${t("player.explanation")}: `), why));

  const facts = [];
  if (typeof step.ms === "number") facts.push(t("insp.tookTime", { time: fmt(step.ms) }));
  else if (step.server) facts.push(t("insp.inModelHint"));
  if (typeof step.at === "number") facts.push(t("insp.at", { time: fmt(step.at) }));
  if (facts.length) root.append(h(doc, "p", { class: "facts" }, facts.join(" · ")));

  // ----- input
  if (step.kind === "tool") {
    root.append(section("in", t("insp.input"), h(doc, "p", { class: "query" }, h(doc, "span", { class: "lb" }, `${t("insp.searchQuery")}: `), h(doc, "q", {}, step.input))));
  } else if (step.kind === "model") {
    const box = section("in", t("insp.input"), h(doc, "p", {}, t("insp.messagesSent", { n: step.messageCount ?? 0 })));
    if (onShowMessages) {
      const button = h(doc, "button", { type: "button", class: "linklike" }, t("insp.showMessages"));
      button.addEventListener("click", onShowMessages);
      box.append(button);
    }
    root.append(box);
  } else if (step.kind === "handoff") {
    root.append(section("in", t("insp.input"), h(doc, "p", { class: "route" }, h(doc, "span", { class: "chip" }, step.from), h(doc, "span", { "aria-hidden": "true" }, "→"), h(doc, "span", { class: "chip" }, step.to)), h(doc, "p", { class: "hint" }, text(step.input))));
  } else if (step.input) {
    root.append(section("in", t("insp.input"), h(doc, "div", { class: "pre" }, text(step.input))));
  }

  // ----- output
  const out = step.output;
  if (step.kind === "tool") {
    const results = parseResults(out);
    if (out === null) root.append(section("out", t("insp.output"), h(doc, "p", { class: "hint" }, waiting)));
    else if (!results) root.append(section("out", t("insp.output"), viewer.view(viewerId, out)));
    else {
      const list = h(
        doc,
        "ol",
        { class: "results" },
        ...results.map((r) =>
          h(doc, "li", {}, h(doc, "strong", {}, r.title), h(doc, "br"), isSafeHref(r.url) ? h(doc, "a", { href: r.url, target: "_blank", rel: "noopener noreferrer" }, hostOf(r.url)) : h(doc, "span", {}, r.url)),
        ),
      );
      root.append(section("out", t("insp.output"), h(doc, "p", { class: "hint" }, t("insp.resultsCount", { n: results.length })), list));
    }
  } else if (step.kind === "model") {
    const parts = [];
    if (step.stop) {
      const meaning = t(`insp.stop.${step.stop}`);
      parts.push(h(doc, "p", {}, h(doc, "span", { class: "chip" }, `stop_reason: ${step.stop}`), meaning.startsWith("insp.stop.") ? "" : ` ${meaning}`));
    }
    parts.push(step.text ? rendered(step.text) : h(doc, "p", { class: "hint" }, out === null ? waiting : t("insp.noText")));
    root.append(section("out", t("insp.output"), ...parts));
  } else if (typeof out === "string" && out !== "") {
    root.append(section("out", t("insp.output"), rendered(out)));
  } else {
    root.append(section("out", t("insp.output"), h(doc, "p", { class: "hint" }, out === null ? waiting : "—")));
  }
  return root;
}
