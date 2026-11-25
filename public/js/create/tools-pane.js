// The tab Tools in the settings of one agent: a list of the tools with a switch for each, what it does and what it costs,
// and the number of tool calls the agent may make. Drawn from the approved mockup docs/mockups/tools.html.
import { h } from "../dom.js";
import { helpIcon } from "../help-popup.js";
import { TOOLS } from "../engine/tools.js";
import { OWN_TOOL_KEYS, cleanToolKeys } from "../engine/own-tools.js";
import { TOOL_LIMITS } from "../engine/catalog.js";
import { agentLimitRange } from "../engine/agent-limits.js";
import { DOC_LIMITS, DOC_EXTENSIONS, canAdd, cleanDocName, docChars, textFromFile } from "../engine/documents.js";

// node: the agent. editor: the editor model. changed: called after every change.
// searchUnavailable: the provider of the agent has no web search. webSearchAllowed / ownToolsAllowed: the master switches of Settings, Harness, Tools.
// toolsAvailable: false when the model of the agent takes no tools.
const notices = new WeakMap();

// The documents of the run: the files and the pasted texts the tool document_search looks in. Nothing leaves the browser until a run starts.
function documentsBlock({ doc, t, editor, changed, readFile }) {
  const docs = editor.documents();
  const status = h(doc, "p", { class: "hint doc-status", "data-ui": "docs-status", role: "status" });
  // The last message is kept with the editor, because the pane is drawn again after every change.
  const say = (code, params) => {
    notices.set(editor, code ? { code, params } : null);
    status.textContent = code ? t(`tools.docs.error.${code}`, params) : "";
  };
  const kept = notices.get(editor);
  if (kept) status.textContent = t(`tools.docs.error.${kept.code}`, kept.params);
  const add = (name, text) => {
    const fits = canAdd(editor.documents(), text);
    if (!fits.ok) return say(fits.code, { files: DOC_LIMITS.files, chars: DOC_LIMITS.totalChars });
    say("");
    editor.setDocuments([...editor.documents(), { name: cleanDocName(name), text }]);
    changed();
  };

  const list = docs.map((d, i) => {
    const remove = h(doc, "button", { type: "button", class: "link-button", "data-ui": `doc-remove-${i}`, "aria-label": t("tools.docs.remove", { name: d.name }) }, t("tools.docs.removeShort"));
    remove.addEventListener("click", () => {
      say("");
      editor.setDocuments(editor.documents().filter((_, at) => at !== i));
      changed();
    });
    return h(doc, "li", { class: "doc-item", "data-ui": `doc-item-${i}` }, h(doc, "span", { class: "doc-name" }, d.name), h(doc, "span", { class: "doc-size" }, t("tools.docs.size", { chars: d.text.length })), remove);
  });

  const picker = h(doc, "input", { id: "ed-doc-file", type: "file", accept: DOC_EXTENSIONS.map((e) => `.${e}`).join(","), multiple: true, "data-ui": "doc-file" });
  picker.addEventListener("change", async () => {
    const files = Array.from(picker.files ?? []);
    say("");
    for (const file of files) {
      let raw;
      try {
        raw = await readFile(file);
      } catch {
        say("read", { name: file.name });
        continue;
      }
      const read = textFromFile(file.name, raw);
      if (!read.ok) { say(read.code, { name: file.name, types: DOC_EXTENSIONS.join(", ") }); continue; }
      const fits = canAdd(editor.documents(), read.text);
      if (!fits.ok) { say(fits.code, { files: DOC_LIMITS.files, chars: DOC_LIMITS.totalChars }); break; }
      editor.setDocuments([...editor.documents(), { name: cleanDocName(file.name), text: read.text }]);
    }
    if (files.length > 0) changed();
  });

  const paste = h(doc, "textarea", { id: "ed-doc-paste", rows: 4, placeholder: t("tools.docs.pastePlaceholder"), "data-ui": "doc-paste" });
  const pasteButton = h(doc, "button", { type: "button", class: "secondary", "data-ui": "doc-paste-add" }, t("tools.docs.pasteAdd"));
  pasteButton.addEventListener("click", () => {
    const text = String(paste.value ?? "").replace(/\r\n?/g, "\n").trim();
    if (text === "") return say("empty", {});
    add(t("tools.docs.pastedName", { n: docs.length + 1 }), text);
  });

  return h(doc, "div", { class: "docs-block", "data-ui": "docs-block" },
    h(doc, "h5", {}, t("tools.docs.heading")),
    h(doc, "p", { class: "hint" }, t("tools.docs.intro", { files: DOC_LIMITS.files, chars: DOC_LIMITS.totalChars })),
    docs.length > 0 ? h(doc, "ul", { class: "doc-list" }, ...list) : h(doc, "p", { class: "hint", "data-ui": "docs-empty" }, t("tools.docs.none")),
    h(doc, "p", { class: "hint" }, t("tools.docs.count", { files: docs.length, max: DOC_LIMITS.files, chars: docChars(docs), maxChars: DOC_LIMITS.totalChars })),
    h(doc, "div", { class: "field" }, h(doc, "label", { for: "ed-doc-file" }, t("tools.docs.pick", { types: DOC_EXTENSIONS.join(", ") })), picker),
    h(doc, "div", { class: "field" }, h(doc, "label", { for: "ed-doc-paste" }, t("tools.docs.paste")), paste, pasteButton),
    h(doc, "p", { class: "limit-warning", "data-ui": "docs-privacy" }, t("tools.docs.privacy")),
    status);
}

export function toolsPane({ doc, t, node, editor, changed, searchUnavailable = false, webSearchAllowed = true, ownToolsAllowed = true, toolsAvailable = true, runDefault = TOOL_LIMITS.callsPerAgent, readFile = (file) => file.text() }) {
  const rows = [];
  const row = (key, { checked, reason, onChange, fee }) => {
    const box = h(doc, "input", { id: `ed-tool-${key}`, type: "checkbox", checked: checked && !reason, disabled: reason !== "", "data-ui": `tool-${key}` });
    box.addEventListener("change", () => onChange(box.checked));
    const parts = [box, h(doc, "label", { for: `ed-tool-${key}`, class: "tool-name" }, t(`tools.${key}.name`)), h(doc, "span", { class: `tool-chip${fee ? " fee" : ""}`, "data-ui": `tool-chip-${key}` }, t(fee ? "tools.fee.paid" : "tools.fee.free")), h(doc, "div", { class: "tool-what", "data-ui": `tool-what-${key}` }, t(`tools.${key}.what`))];
    if (reason) parts.push(h(doc, "div", { class: "tool-why", "data-ui": `tool-why-${key}` }, t(reason)));
    rows.push(h(doc, "div", { class: `tool-row${reason ? " off" : ""}`, "data-ui": `tool-row-${key}` }, ...parts));
  };

  row("web_search", {
    checked: node.search === true,
    reason: !toolsAvailable ? "tools.why.model" : searchUnavailable ? "tools.why.search" : "",
    fee: TOOLS.web_search?.extraFee === true,
    onChange: (on) => {
      editor.setNode(node.id, { search: on });
      changed();
    },
  });
  const chosen = cleanToolKeys(node.tools);
  for (const key of OWN_TOOL_KEYS) {
    row(key, {
      checked: chosen.includes(key),
      reason: !toolsAvailable ? "tools.why.model" : !ownToolsAllowed ? "tools.why.master" : key === "notes" && !editor.notebookOn() ? "tools.why.notebook" : "",
      fee: TOOLS[key].extraFee === true,
      onChange: (on) => {
        editor.setNode(node.id, { tools: on ? [...chosen, key] : chosen.filter((k) => k !== key) });
        changed();
      },
    });
  }

  // The calls one agent may make: empty means the default. The limit is kept with the other limits of the agent.
  const range = agentLimitRange("maxToolCalls");
  const calls = h(doc, "input", { id: "ed-tool-calls", type: "number", min: range.min, max: range.max, step: 1, placeholder: t("tools.calls.placeholder", { value: runDefault }), "data-ui": "agent-tool-calls" });
  if (node.limits?.maxToolCalls !== undefined) calls.value = String(node.limits.maxToolCalls);
  calls.addEventListener("change", () => {
    const raw = String(calls.value ?? "").trim();
    const limits = { ...(node.limits ?? {}) };
    if (raw === "") delete limits.maxToolCalls;
    else limits.maxToolCalls = Number(raw);
    editor.setNode(node.id, { limits });
    changed();
  });

  const out = [
    h(doc, "h4", { class: "editor-tools-heading" }, t("editor.toolsHeading"), helpIcon({ doc, t, id: "create-tools", name: t("editor.toolsHeading") })),
    h(doc, "p", { class: "hint" }, t("tools.intro")),
    ...rows,
  ];
  // The documents belong to the run, not to one agent: every agent with the tool searches the same ones.
  if (chosen.includes("document_search") || editor.documents().length > 0) out.push(documentsBlock({ doc, t, editor, changed, readFile }));
  if (TOOLS.web_search?.extraFee) out.push(h(doc, "p", { class: "notice" }, t("editor.searchFee")));
  out.push(h(doc, "p", { class: "hint" }, t("editor.toolsNote")));
  if (searchUnavailable) out.push(h(doc, "p", { class: "limit-warning", "data-ui": "search-provider-off" }, t("editor.searchOffProvider")));
  if (node.search === true && !webSearchAllowed) out.push(h(doc, "p", { class: "limit-warning", "data-ui": "search-off-warning" }, t("editor.searchOffInSettings")));
  if (chosen.length > 0 && !ownToolsAllowed) out.push(h(doc, "p", { class: "limit-warning", "data-ui": "tools-off-warning" }, t("tools.offWarning")));
  if (chosen.includes("notes") && !editor.notebookOn()) out.push(h(doc, "p", { class: "limit-warning", "data-ui": "notes-off-warning" }, t("tools.notesWarning")));
  out.push(h(doc, "div", { class: "tool-calls-row" }, h(doc, "label", { for: "ed-tool-calls" }, t("tools.calls.label")), calls, h(doc, "span", { class: "hint" }, t("tools.calls.note", { rounds: TOOL_LIMITS.rounds }))));
  return out;
}
