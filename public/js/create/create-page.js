// The Create tab: task, pattern, diagram, review, then a live run in the player.
import { h } from "../dom.js";
import { helpIcon } from "../help-popup.js";
import { markUnlockAlert } from "../unlock-alert.js";
import { keyState } from "../key-state.js";
import { downloadFile } from "../download.js";
import { outcomeNotice } from "../outcome-view.js";
import { withRetryChoice } from "../replay/retry-choice.js";
import { limitsChoice } from "../replay/limits-choice.js";
import { withCurrentLimits } from "../replay/limits-compare.js";
import { showCenterTip } from "../center-tip.js";
import { refreshResultTab } from "../tab-state.js";
import { SLOT_IDS, isSlot, slotProvider, slotIsFree, slotLabelKey, slotSubKey, slotFreeLimits } from "../key-slots.js";
import { providerSpec, defaultSlot, modelsOfSlot } from "../engine/providers.js";
import { sharedFreeCheck, compareFree, applyOverrides, OVERRIDE_SLOT } from "../engine/free-check.js";
import { modelGoneView } from "./model-gone-view.js";
import { TASK_MAX_CHARS, LIMIT_MAX, DEFAULT_MODEL, providerCatalog, paidOnlyModelUsed, providersOf, nodeModel } from "../engine/catalog.js";
import { PATTERNS, clampLimits } from "../engine/patterns.js";
import { limitFindings, limitOffers, limitSummary, neuronsByAgent } from "../engine/limits.js";
import { limitsView } from "./limits-view.js";
import { buildRunRecord, makeRunId, modelsUsed } from "../engine/run-record.js";
import { startRun, RunStartError } from "../run-client.js";
import { approvalPanel } from "../approval-panel.js";
import { pendingApprovals, approvedAgents } from "../engine/approval.js";
import { mountLiveReplay } from "../replay/view.js";
import { createBatchedSaver } from "../storage/runs-store.js";
import { keepFocus } from "./keep-focus.js";
import { createEditor, isUntouched } from "./editor-model.js";
import { draft, useDefinition, resetDecisions, decideLoaded, resetForLoad, showKeyStep } from "./draft.js";
import { deriveInspector } from "../replay/inspect-model.js";
import { mountEditor } from "./editor-view.js";
import { canRun, reviewSummary, handoffSkipper, createSkipper, resumeAnswers, agentRows, blockedByGoneModel } from "./create-model.js";
import { buildResultModel } from "../play-model.js";
import { loadDefinition, definitionFromRun, aboutForLanguage } from "./definition.js";
import { STEPS, stepStatus, navState, stepAfterChange, missing, footHint, toggleSlot, modelValid, setDefaultKeepingAgents, workspaceLocked, workspaceEstimateUsd, runAllowed } from "./steps-model.js";
import { stepBar, footer, partHeading, innerTabs, workspaceBar, statusIcon } from "./steps-view.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const LIMIT_FIELDS = [
  ["maxSteps", "settings.limitSteps"],
  ["maxTokens", "settings.limitTokens"],
  ["maxSearches", "settings.limitSearches"],
];


function patternIcon(doc, pattern) {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 64 40");
  svg.setAttribute("width", "64");
  svg.setAttribute("height", "40");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "pattern-icon");
  const dot = (x, y) => {
    const c = doc.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", String(x));
    c.setAttribute("cy", String(y));
    c.setAttribute("r", "5");
    c.setAttribute("fill", "currentColor");
    svg.append(c);
  };
  // A ring round a dot: the agent that starts.
  const circle = (x, y) => {
    const c = doc.createElementNS(SVG_NS, "circle");
    for (const [k, v] of Object.entries({ cx: x, cy: y, r: 8, fill: "none", stroke: "currentColor", "stroke-width": 1.5 })) c.setAttribute(k, String(v));
    svg.append(c);
  };
  const ring = (x, y) => {
    const c = doc.createElementNS(SVG_NS, "circle");
    for (const [k, v] of Object.entries({ cx: x, cy: y, r: 4, fill: "none", stroke: "currentColor", "stroke-width": 1.5 })) c.setAttribute(k, String(v));
    svg.append(c);
  };
  // A voter: a ring with a tick. A dimmed one is the voter that differs.
  const voter = (x, y, dim = false) => {
    const c = doc.createElementNS(SVG_NS, "circle");
    for (const [k, v] of Object.entries({ cx: x, cy: y, r: 5, fill: "none", stroke: "currentColor", "stroke-width": 1.5, ...(dim ? { opacity: 0.6 } : {}) })) c.setAttribute(k, String(v));
    const tick = doc.createElementNS(SVG_NS, "path");
    for (const [k, v] of Object.entries({ d: `M${x - 2.5} ${y} L${x - 0.5} ${y + 2} L${x + 3} ${y - 2}`, stroke: "currentColor", "stroke-width": 1.5, fill: "none", ...(dim ? { opacity: 0.6 } : {}) })) tick.setAttribute(k, String(v));
    svg.append(c, tick);
  };
  const line = (x1, y1, x2, y2, { width = 1.5, dashed = false } = {}) => {
    const l = doc.createElementNS(SVG_NS, "line");
    for (const [k, v] of Object.entries({ x1, y1, x2, y2, stroke: "currentColor", "stroke-width": width, ...(dashed ? { "stroke-dasharray": "3 3", opacity: 0.6 } : {}) })) l.setAttribute(k, String(v));
    svg.append(l);
  };
  const shapes = {
    sequential: () => [line(12, 20, 32, 20), line(32, 20, 52, 20), dot(12, 20), dot(32, 20), dot(52, 20)],
    parallel: () => [line(12, 10, 52, 20), line(12, 30, 52, 20), dot(12, 10), dot(12, 30), dot(52, 20)],
    supervisor: () => [line(12, 20, 52, 6), line(12, 20, 52, 16), line(12, 20, 52, 26), line(12, 20, 52, 36), dot(12, 20), dot(52, 6), dot(52, 16), dot(52, 26), dot(52, 36)],
    debate: () => [line(12, 10, 52, 20), line(12, 30, 52, 20), line(12, 10, 12, 30), dot(12, 10), dot(12, 30), dot(52, 20)],
    handoff: () => [line(8, 20, 28, 20), line(28, 20, 56, 20), dot(8, 20), dot(28, 20), dot(56, 20), circle(8, 20)],
    // A switch: one solid, thick branch to a filled dot (the chosen route), two thin dashed branches to empty rings.
    router: () => [line(10, 20, 28, 20), line(28, 20, 52, 20, { width: 3 }), line(28, 20, 50, 7, { dashed: true }), line(28, 20, 50, 33, { dashed: true }), dot(10, 20), dot(55, 20), ring(55, 5), ring(55, 35)],
    // Three voters (the last one differs, dashed and dimmed) run into one filled dot: the tally.
    voting: () => [line(14, 6, 48, 20), line(14, 20, 48, 20), line(14, 34, 48, 20, { dashed: true }), voter(9, 6), voter(9, 20), voter(9, 34, true), dot(54, 20)],
    // One dot fans out into three and they merge back into one dot.
    mapreduce: () => [line(8, 20, 30, 6), line(8, 20, 30, 20), line(8, 20, 30, 34), line(34, 6, 56, 20), line(34, 20, 56, 20), line(34, 34, 56, 20), dot(8, 20), dot(32, 6), dot(32, 20), dot(32, 34), dot(56, 20)],
    // A short list (the plan) and a row of steps, the first one filled.
    planexec: () => [line(6, 6, 40, 6), line(6, 12, 30, 12), line(14, 30, 32, 30), line(40, 30, 50, 30), dot(10, 30), ring(36, 30), ring(54, 30)],
    evaluator: () => [line(12, 14, 52, 14), line(52, 14, 52, 30), line(52, 30, 12, 30), line(12, 30, 12, 14), dot(12, 14), dot(52, 14)],
  };
  shapes[pattern]();
  return svg;
}

function downloadButton(ctx, run) {
  const { doc, t } = ctx;
  const button = h(doc, "button", { type: "button" }, t("create.download"));
  button.addEventListener("click", () => downloadFile(doc, `${run.id}.json`, JSON.stringify(run, null, 2), "application/json"));
  return button;
}

export function renderCreate(ctx) {
  const freeCheck = ctx.freeCheck ?? sharedFreeCheck;
  const vaultFor = (id) => (ctx.vault.forProvider ? ctx.vault.forProvider(id) : ctx.vault);
  const { doc, t } = ctx;
  // A ? next to a heading: it opens that section of Help.
  const help = (id, name) => helpIcon({ doc, t, id, name });
  const hasKey = (id) => vaultFor(id).getSessionKey() !== null || vaultFor(id).hasStoredKey();
  // The student may switch on several key slots (Claude, Gemini free, Gemini paid). Nothing has a default: none is on until they decide.
  const chosenSlots = () => (Array.isArray(draft.slots) && draft.slots.every(isSlot) ? draft.slots : []);
  // The slots the page works with: the chosen ones, or while none is chosen the first one with a key (the diagram stays closed then).
  const workingSlots = () => (chosenSlots().length > 0 ? chosenSlots() : [SLOT_IDS.find(hasKey) ?? "anthropic"]);
  // The models the student chose for gone free models, and what the check found (null while it has not answered yet).
  const chosenModels = () => ctx.settings.get().modelOverrides?.[OVERRIDE_SLOT] ?? {};
  const currentCheck = () => {
    const latest = freeCheck.last();
    if (latest === null) return null;
    // A failed check after a good one does not erase what the good one found.
    const last = latest.ok ? latest : freeCheck.lastGood?.() ?? latest;
    return { check: compareFree({ slotModels: modelsOfSlot(OVERRIDE_SLOT), live: last.live, overrides: chosenModels() }), ageMin: Math.max(0, Math.floor((Date.now() - last.at) / 60000)), overrides: chosenModels() };
  };
  // Asks for the check when the free slot is in use (Create opens with it on, or it is switched on); the answer redraws the review.
  let checkAsked = false;
  const askFreeCheck = (force = false) => {
    checkAsked = true;
    freeCheck.run({ force }).then(() => drawReviewLater());
  };
  let drawReviewLater = () => {};
  const slotName = (id) => (slotLabelKey(id) ? t(slotLabelKey(id)) : providerCatalog(slotProvider(id)).label);
  // The models a slot offers: a free Gemini key offers only the models that have a free tier.
  const offeredModels = (slot) => {
    const all = modelsOfSlot(slot);
    return slotIsFree(slot) ? all.filter((m) => m.freeTier !== false) : all;
  };
  // The id an agent runs on: the one of its slot, or the model the student chose for a gone free model.
  const modelIdFor = (slot, key) => nodeModel({ slot, model: key, ...(slot === OVERRIDE_SLOT && chosenModels()[key] ? { modelId: chosenModels()[key] } : {}) }).id;
  const choiceValue = (slot, key) => `${slot}|${key}`;
  const parseChoice = (value) => {
    const [slot, model] = String(value).split("|");
    return isSlot(slot) && offeredModels(slot).some((m) => m.key === model) ? { slot, model } : null;
  };
  const choiceGroups = () => chosenSlots().map((slot) => ({ label: slotName(slot), options: offeredModels(slot).map((m) => ({ value: choiceValue(slot, m.key), label: `${m.label} (${m.id})` })) }));
  const choiceLabel = (slot, key) => {
    const m = modelsOfSlot(slot).find((x) => x.key === key);
    return m ? `${m.label} (${m.id})` : key;
  };
  // The default model must be one of the chosen slots' models; agents whose choice is gone return to it.
  const keepModels = () => {
    // A loaded definition counts as decided: its providers are the ones its agents use (else the first one with a key).
    if (draft.decisions.providers && chosenSlots().length === 0) {
      const named = [...new Set(draft.editor.design().nodes.map((n) => n.slot).filter(isSlot))];
      draft.slots = named.length > 0 ? named : [workingSlots()[0]];
    }
    const slots = workingSlots();
    const current = draft.editor.defaultModel();
    if (!modelValid(current, slots, offeredModels)) {
      const slot = slots[0];
      const list = offeredModels(slot);
      const choice = { slot, model: (list.find((m) => m.key === DEFAULT_MODEL) ?? list[0]).key };
      // A loaded definition has no default model yet: its agents keep the models they have.
      if (current === null) setDefaultKeepingAgents(draft.editor, choice, (n) => slots.includes(n.slot) && offeredModels(n.slot).some((m) => m.key === n.model));
      else draft.editor.setDefaultModel(choice);
      // The default model the student chose belonged to a provider that is switched off now: they choose again.
      if (current !== null) draft.decisions.model = false;
    }
    draft.editor.keepSlots((node) => slots.includes(node.slot) && offeredModels(node.slot).some((m) => m.key === node.model));
    if (chosenSlots().length === 0) Object.assign(draft.decisions, { providers: false, model: false });
  };
  // The slots the agents use (the working ones while the diagram is empty), each once.
  const usedSlots = (design) => {
    const slots = [];
    for (const n of design.nodes) if (isSlot(n.slot) && !slots.includes(n.slot)) slots.push(n.slot);
    return slots.length > 0 ? slots : [workingSlots()[0]];
  };
  // Retry carries on with the limits of Settings when the box is checked, else with the limits the run had.
  const withLimitChoice = (record, useCurrent) => (useCurrent ? withCurrentLimits(record, ctx.settings.get().limits) : record);
  if (draft.limits === null || !draft.limitsEdited) draft.limits = { ...ctx.settings.get().limits };
  const root = ctx.main;
  let activeRun = null;
  ctx.onLeave(() => activeRun?.stop());
  // An important message also goes into a tooltip in the middle of the screen, which stays until the visitor closes it.
  // The same message is on the page too.
  function importantTip(message) {
    const tip = showCenterTip({ doc, content: h(doc, "p", {}, message), sticky: true, closeLabel: t("about.close"), moveLabel: t("about.move") });
    ctx.onLeave(tip.close);
    return tip;
  }

  function showForm(startNotice = "", noticeRole = "alert") {
    // Task.
    const taskInput = h(doc, "textarea", { id: "cr-task", rows: 4, maxlength: TASK_MAX_CHARS });
    taskInput.value = draft.task;
    const counter = h(doc, "p", { class: "hint", "aria-live": "off" });
    const updateCounter = () => {
      counter.textContent = t("create.taskCounter", { n: taskInput.value.length, max: TASK_MAX_CHARS });
    };
    updateCounter();

    // Pattern.
    const patternGroup = h(doc, "div", { class: "pattern-choice", "data-ui": "pattern-choice", role: "group", "aria-label": t("create.patternHeading") });
    const patternNotice = h(doc, "p", { class: "notice", role: "status", hidden: true });
    const drawPatterns = () => keepFocus(doc, patternGroup, drawPatternsRaw);
    const drawPatternsRaw = () => {
      patternGroup.replaceChildren(
        ...PATTERNS.map((p) => {
          const button = h(
            doc,
            "button",
            { type: "button", class: "pattern-button", "data-ui": `pattern-${p}`, "aria-pressed": String(draft.decisions.pattern && draft.pattern === p), "data-pattern": p },
            patternIcon(doc, p),
            h(doc, "strong", {}, t(`pattern.${p}`)),
            h(doc, "span", { class: "palette-help" }, t(`create.pattern.${p}`)),
          );
          button.addEventListener("click", () => {
            if (draft.decisions.pattern && draft.pattern === p) return;
            const hadNodes = !isUntouched(draft.editor.design());
            if (hadNodes && !doc.defaultView.confirm(t("create.patternConfirm"))) return;
            draft.pattern = p;
            draft.decisions.pattern = true;
            draft.editor.reset(p, { criteria: t("editor.criteriaExample") });
            editorHandle.refresh();
            patternNotice.textContent = hadNodes ? t("create.patternChanged") : "";
            patternNotice.hidden = !hadNodes;
            drawPatterns();
            drawReview();
          });
          return button;
        }),
      );
    };

    // Provider: chosen before the agents, because the models of the agents are the models of the provider.
    // One tile for each provider: its mark, its name and a dot (green: key loaded, yellow: key saved but locked, none: no key).
    const providerTiles = h(doc, "div", { class: "provider-tiles", role: "group", "aria-label": t("create.providerLabel"), "data-ui": "provider-tiles" });
        // The default model: a list of the models of the chosen providers. Agents without a model of their own use it.
    const defaultHost = h(doc, "div", { class: "field default-model", "data-ui": "default-model-field" });
    const drawDefaultModel = () => {
      const current = draft.editor.defaultModel();
      const none = chosenSlots().length === 0;
      // No model is shown as chosen until the student chooses one.
      const select = h(doc, "select", { id: "cr-default-model", "data-ui": "default-model", "aria-label": t("create.defaultModel") }, h(doc, "option", { value: "", selected: !draft.decisions.model }, t(none ? "create.chooseProviderFirst" : "create.chooseModel")), ...choiceGroups().map((g) => h(doc, "optgroup", { label: g.label }, ...g.options.map((o) => h(doc, "option", { value: o.value, selected: draft.decisions.model && current !== null && o.value === choiceValue(current.slot, current.model) }, o.label)))));
      select.disabled = none;
      select.addEventListener("change", () => {
        const choice = parseChoice(select.value);
        if (!choice) return;
        draft.editor.setDefaultModel(choice);
        draft.decisions.model = true;
        editorHandle.refresh();
        drawReview();
      });
      defaultHost.replaceChildren(select);
    };
    const drawProviderTiles = () => keepFocus(doc, providerTiles, drawProviderTilesRaw);
    const drawProviderTilesRaw = () => {
      const chosen = chosenSlots();
      // Only providers that are set up (a key saved or loaded) are offered, and one a loaded definition already uses.
      const offered = SLOT_IDS.filter((id) => chosen.includes(id) || keyState(vaultFor(id)) !== "none");
      if (offered.length === 0) {
        providerTiles.replaceChildren(h(doc, "a", { class: "no-providers", href: "#/settings/key/anthropic", "data-ui": "no-providers" }, t("create.noProviders")));
        drawDefaultModel();
        return;
      }
      providerTiles.replaceChildren(
        ...offered.map((id) => {
          const state = keyState(vaultFor(id));
          const selected = chosen.includes(id);
          const kind = slotProvider(id);
          // A chip: the mark and the plain name of the provider. An orange chip says the key is missing or locked; a red $ on the
          // corner says the key is paid. The tier and the state of the key are in the tooltip.
          const name = providerSpec(kind).chipName;
          const free = slotIsFree(id);
          const warn = state !== "loaded";
          const stateText = t(state === "locked" ? "settings.dotLocked" : state === "none" ? "create.keyMissing" : "settings.dotLoaded");
          const parts = [
            h(doc, "span", { class: `pv-mark pv-${kind}`, "aria-hidden": "true" }, providerSpec(kind).mark),
            h(doc, "span", { class: "pv-name" }, name),
            ...(free ? [] : [h(doc, "span", { class: "pv-paid", title: t("create.paidMark"), role: "img", "aria-label": t("create.paidMark") }, "$")]),
          ];
          const tile = h(doc, "button", { type: "button", class: `provider-tile${selected ? " on" : ""}${warn ? " warn" : ""}`, role: "checkbox", "aria-checked": String(selected), "data-ui": `provider-tile-${id}`, title: `${slotName(id)}${free ? ` (${t("create.providerFree")})` : ` (${t("create.paidMark")})`}: ${stateText}` }, ...parts);
          tile.addEventListener("click", () => {
            // Any number of providers may be on, also none: the student decides.
            draft.slots = toggleSlot(chosen, id, SLOT_IDS);
            draft.decisions.providers = draft.slots.length > 0;
            if (id === OVERRIDE_SLOT && draft.slots.includes(id)) checkAsked = false;
            keepModels();
            editorHandle.refresh();
            drawReview();
          });
          return tile;
        }),
      );
      drawDefaultModel();
    };
    const legendItem = (mark, text) => h(doc, "span", {}, mark, text);
    const providerLegend = h(doc, "div", { class: "pv-legend", "data-ui": "provider-legend" }, legendItem(h(doc, "i", { class: "pv-lg warn" }), t("create.legendWarn")), legendItem(h(doc, "span", { class: "pv-paid pv-paid-legend", "aria-hidden": "true" }, "$"), t("create.legendPaid")));
    const providerField = h(doc, "div", { class: "field provider-field", "data-ui": "provider-field" }, h(doc, "div", { class: "provider-row" }, providerTiles, defaultHost), providerLegend);

    // The model of an agent: its level (Fast, Balanced, Strong), and the provider when more than one is chosen.
    const nodeModelLabel = (node) => {
      const slot = isSlot(node?.slot) ? node.slot : workingSlots()[0];
      const level = modelsOfSlot(slot).find((m) => m.key === node?.model)?.label ?? "";
      return workingSlots().length > 1 ? `${level} · ${slotName(slot)}` : level;
    };

    // Editor.
    const editorHost = h(doc, "div", { class: "editor-host", "data-ui": "editor" });
    const reviewHost = h(doc, "section", { class: "review", "data-ui": "run-review", "aria-label": t("create.reviewHeading") });
    let editorHandle;

    // The guided steps: which one is open, what is set, what the buttons may do. The rules are in steps-model.js.
    let lastVerdict = null;
    let lastBlockedNames = ""; // the names of the agents whose call is too big for a free account
    let lastEstimate = "";
    // The layout is read when Create opens: the guided steps, or the workspace with everything on one screen.
    const workspace = ctx.settings.get().createLayout === "workspace";
    const wsBar = workspace ? workspaceBar({ doc, t, onRun: () => beginRun() }) : null;
    let rightColumn = null;
    let rightInner = null;
    let headings = {};
    const stepsStatus = () => {
      const design = draft.editor.design();
      return stepStatus({ task: draft.task, decisions: draft.decisions, nodeCount: design.nodes.length, editorOk: draft.editor.errors().length === 0, keysReady: usedSlots(design).every((s) => vaultFor(s).getSessionKey() !== null) });
    };
    // "Almost there: ..., add your key": the words about the key are a link to the API key box. The node is kept while the text stays the same.
    let keyHintNode = null;
    let keyHintText = "";
    const keyHint = (status) => {
      const MARK = "";
      const full = t("create.hint.missing", { items: missing(status).map((k) => (k === "key" ? MARK : t(`create.missing.${k}`))).join(", ") });
      const keyText = t("create.missing.key");
      const signature = `${full}|${keyText}`;
      if (keyHintNode && keyHintText === signature) return keyHintNode;
      const [before, after = ""] = full.split(MARK);
      const go = h(doc, "button", { type: "button", class: "linklike hint-go", "data-ui": "hint-go-key", title: t("create.reason.noKeyGo") }, keyText);
      go.addEventListener("click", goToKey);
      keyHintNode = h(doc, "span", {}, before, go, after);
      keyHintText = signature;
      return keyHintNode;
    };
    const hintText = (status) => {
      const kind = footHint(status);
      // Everything is decided but an agent cannot run on a free account: say that instead of Ready to run.
      if (kind === "ready" && lastVerdict?.reasons?.includes("limitsBlocked")) return t("create.reason.limitsBlocked", { agents: lastBlockedNames });
      if (kind === "ready" && lastVerdict?.reasons?.includes("modelGone")) return t("create.reason.modelGone");
      if (workspace && kind === "setup") return t("create.ws.locked");
      // The key is saved but locked: the Unlock box beside the text is the way on, so the words stay plain.
      if (kind === "missing" && missing(status).includes("key") && lockedNow().length === 0) return keyHint(status);
      const word = (k) => t(k === "key" && lockedNow().length > 0 ? "create.missing.unlock" : `create.missing.${k}`);
      return kind === "missing" ? t("create.hint.missing", { items: missing(status).map(word).join(", ") }) : t(`create.hint.${kind}`);
    };
    // The slots the run uses whose saved key is locked.
    const lockedNow = () => usedSlots(draft.editor.design()).filter((s) => vaultFor(s).getSessionKey() === null && vaultFor(s).hasStoredKey());
    // A small password box and an Unlock button; onDone runs after the key is unlocked.
    const makeUnlock = (onDone) => {
      const pass = h(doc, "input", { type: "password", class: "inline-unlock-input", autocomplete: "current-password", "aria-label": t("create.unlockLabel"), "data-ui": "inline-unlock-input" });
      const go = h(doc, "button", { type: "button", class: "inline-unlock-go", title: t("settings.unlock"), "aria-label": t("settings.unlock"), "data-ui": "inline-unlock-go" }, t("settings.unlock"));
      const problem = h(doc, "span", { class: "inline-unlock-problem", role: "alert", hidden: true });
      const submit = async () => {
        if (pass.value === "") return;
        try {
          await (ctx.vault.unlockAll ? ctx.vault.unlockAll(pass.value) : vaultFor(lockedNow()[0]).unlock(pass.value));
          markUnlockAlert(doc, ctx.vault, t);
          onDone();
        } catch (error) {
          problem.textContent = t(`settings.error.${error?.code ?? "storage"}`);
          problem.hidden = false;
        }
      };
      pass.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submit();
        }
      });
      go.addEventListener("click", submit);
      return h(doc, "span", { class: "inline-unlock" }, pass, go, problem);
    };
    // Opens the API key tab (and its step) and puts the cursor in the key box.
    function goToKey() {
      draft.subTab = "key";
      if (!workspace) draft.step = "check";
      refreshSteps();
      drawReview();
      const toKey = () => {
        const box = reviewHost.querySelector('[id^="cr-key"]');
        box?.scrollIntoView?.({ block: "center" });
        box?.focus?.();
      };
      toKey();
      setTimeout(toKey, 0); // the review may be drawn again once more (key state loaded)
    }
    // Next to "Almost there: add your key" the same box shows when the key is saved but locked. It is kept, so what is typed stays.
    let hintUnlock = null;
    const hintExtra = (status) => {
      if (footHint(status) !== "missing" || !missing(status).includes("key")) return null;
      if (lockedNow().length === 0) return null;
      hintUnlock ??= makeUnlock(() => { refreshSteps(); drawReview(); });
      return hintUnlock;
    };
    const panels = { setup: h(doc, "div", { class: "step-panel", "data-ui": "step-setup" }), diagram: h(doc, "div", { class: "step-panel", "data-ui": "step-diagram" }), check: h(doc, "div", { class: "step-panel", "data-ui": "step-check" }) };
    const goStep = (step) => {
      draft.step = step;
      refreshSteps();
    };
    const move = (by) => goStep(STEPS[STEPS.indexOf(draft.step) + by] ?? draft.step);
    const bar = workspace ? null : stepBar({ doc, t, status: stepsStatus(), current: draft.step, onGo: goStep, help: { diagram: "create-diagram", check: "create-run" } });
    const foot = workspace ? null : footer({ doc, t, onBack: () => move(-1), onNext: () => move(1), onRun: () => beginRun() });
    function refreshSteps() {
      const status = stepsStatus();
      if (workspace) {
        const locked = workspaceLocked(status);
        wsBar.update({ status, estimate: lastEstimate, hint: hintText(status), hintExtra: hintExtra(status), runEnabled: runAllowed({ status, verdict: lastVerdict, retryPending: draft.retry !== null }), agents: draft.editor.design().nodes.length });
        for (const [part, heading] of Object.entries(headings)) heading.setState(status.parts[part] ? "done" : "none");
        if (rightColumn) {
          rightColumn.classList.toggle("locked", locked);
          rightInner.inert = locked;
        }
        return;
      }
      draft.step = stepAfterChange(draft.step, status);
      bar.update(status, draft.step);
      const nav = navState({ step: draft.step, status });
      foot.update({ nav: { ...nav, run: nav.run && runAllowed({ status, verdict: lastVerdict, retryPending: draft.retry !== null }) }, hint: hintText(status), hintExtra: hintExtra(status) });
      for (const [part, heading] of Object.entries(headings)) heading.setState(status.parts[part] ? "done" : "none");
      for (const step of STEPS) panels[step].hidden = step !== draft.step;
    }

    // Pressing an offer: the agents move, the sizes change for this run, and the review is drawn again.
    function applyOffer(offer) {
      const before = draft.editor.design();
      const next = offer.apply(before, runSettings());
      // An agent moved to another provider needs that provider switched on in step 1, or the page puts it back.
      const target = next.design.nodes.map((n) => n.slot).filter((id) => isSlot(id) && !chosenSlots().includes(id));
      if (target.length > 0) draft.slots = [...chosenSlots(), ...new Set(target)];
      for (const n of next.design.nodes) {
        const old = before.nodes.find((o) => o.id === n.id);
        if (old && old.slot !== n.slot) draft.editor.setNodeModel(n.id, { slot: n.slot, model: n.model });
      }
      for (const old of before.nodes) if (!next.design.nodes.some((n) => n.id === old.id)) draft.editor.removeNode(old.id);
      if (next.design.rounds !== before.rounds && Number.isInteger(next.design.rounds)) draft.editor.setRounds(next.design.rounds);
      draft.runOverrides = { ...draft.runOverrides, outputTokens: next.settings.outputTokens, handoffChars: next.settings.handoffChars };
      draft.limitsChoice = offer.id === "slowly" || offer.id === "tomorrow" ? offer.id : null;
      editorHandle.refresh();
      drawReview();
    }

    // Review.
    function drawReview() {
      drawReviewLater = drawReview;
      // The review is rebuilt on every change: the element that had the focus gets it back (found by id or data-ui).
      const focused = reviewHost.contains?.(doc.activeElement) ? doc.activeElement : null;
      const focusKey = focused ? (focused.id ? `#${focused.id}` : focused.getAttribute?.("data-ui") ? `[data-ui="${focused.getAttribute("data-ui")}"]` : focused.getAttribute?.("data-tab") ? `[data-tab="${focused.getAttribute("data-tab")}"]` : null) : null;
      keepModels();
      const design = draft.editor.design();
      const limits = clampLimits(draft.limits);
      const used = usedSlots(design);
      const provider = slotProvider(used[0]);
      drawProviderTiles();
      const summary = reviewSummary({ design, limits, provider });
      // Every provider the agents use needs its key.
      const missing = used.filter((s) => vaultFor(s).getSessionKey() === null);
      // The free models of OpenRouter are checked once the free slot is in use; a tier that is gone blocks the agents on it.
      if (used.includes(OVERRIDE_SLOT) && !checkAsked) askFreeCheck();
      const found = used.includes(OVERRIDE_SLOT) ? currentCheck() : null;
      const goneKeys = found?.check.state === "gone" ? found.check.gone.map((g) => g.key) : [];
      const plainVerdict = canRun({ task: taskInput.value, apiKey: missing.length === 0 ? "set" : null, editorErrors: draft.editor.errors(), keyLocked: missing.some((s) => vaultFor(s).hasStoredKey()), modelGone: blockedByGoneModel(design, found?.check) });
      const checkEl = found ? modelGoneView({ doc, t, result: found, tierName: (key) => t(`settings.tier.${key}`), slotName: slotName(OVERRIDE_SLOT), subText: slotSubKey(OVERRIDE_SLOT) ? t(slotSubKey(OVERRIDE_SLOT)) : "", onPick: (key, id) => { ctx.settings.setModelOverride(OVERRIDE_SLOT, key, id); drawReview(); } }) : null;
      const verdict = limitsBlock(design, limits) ? { ok: false, reasons: [...plainVerdict.reasons, "limitsBlocked"] } : plainVerdict;
      // Keys the visitor saved as being on Google's free tier make the run free, unless a model without a free tier is used.
      const marked = used.every(slotIsFree);
      const paidOnly = paidOnlyModelUsed(design, provider);
      const isFree = marked && !paidOnly;

      // The limits are read from Settings; the student may change them for this run. An empty field goes back to the value of Settings.
      const limitInputs = LIMIT_FIELDS.map(([key, labelKey]) => {
        const input = h(doc, "input", { id: `cr-${key}`, type: "number", min: key === "maxSearches" ? 0 : 1, max: LIMIT_MAX[key], step: 1, value: limits[key], placeholder: t("create.limitsPlaceholder", { value: ctx.settings.get().limits[key] }) });
        input.addEventListener("change", () => {
          const own = input.value.trim() !== "";
          draft.limits = clampLimits({ ...draft.limits, [key]: own ? Number(input.value) : ctx.settings.get().limits[key] });
          if (own) draft.limitsEdited = true;
          draft.decisions.limits[key] = true;
          // After the focus has moved on, so that Tab lands on the next field and Run is ready for the click that follows.
          doc.defaultView.setTimeout(() => { const id = doc.activeElement?.id; drawReview(); if (id) doc.getElementById?.(id)?.focus?.(); }, 0);
        });
        return h(doc, "div", { class: "field" }, h(doc, "label", { for: `cr-${key}` }, t(labelKey)), input);
      });

      // The agents table: provider and model (a choice for each agent), the real model name, whether it is paid, and search.
      const agentNeurons = neuronsByAgent({ design, limits, ...runSettings() });
      const rows = agentRows({ design, slotName, slotIsFree, modelInfo: (slot, key) => ({ label: choiceLabel(slot, key), id: modelIdFor(slot, key) }), fallbackSlot: workingSlots()[0] });
      const agentsTable = rows.length
        ? h(
            doc,
            "table",
            { class: "agents-table", "data-ui": "agents-table" },
            h(doc, "thead", {}, h(doc, "tr", {}, ...["agent", "model", "modelName", "paid", "search"].map((c) => h(doc, "th", { scope: "col" }, t(`create.col.${c}`))))),
            h(
              doc,
              "tbody",
              {},
              ...rows.map((r) => {
                const node = design.nodes.find((n) => n.id === r.id);
                const select = h(doc, "select", { "aria-label": `${r.label}: ${t("create.col.model")}`, "data-ui": `agent-model-${r.id}` }, h(doc, "option", { value: "", selected: !r.custom }, modelUi.defaultOption()), ...modelUi.groups().map((g) => h(doc, "optgroup", { label: g.label }, ...g.options.map((o) => h(doc, "option", { value: o.value, selected: r.custom && o.value === modelUi.valueOf(node) }, o.label)))));
                select.addEventListener("change", () => {
                  modelUi.pick(r.id, select.value);
                  editorHandle.refresh();
                  drawReview();
                });
                return h(doc, "tr", {}, h(doc, "th", { scope: "row" }, r.label), h(doc, "td", {}, select), h(doc, "td", {}, h(doc, "code", {}, r.modelId), ...(agentNeurons.has(r.id) ? [" ", h(doc, "span", { class: "hint", "data-ui": `agent-neurons-${r.id}` }, t("create.agentNeurons", { n: new Intl.NumberFormat(ctx.lang === "cs" ? "cs-CZ" : "en-US").format(agentNeurons.get(r.id)) }))] : []), ...(r.slot === OVERRIDE_SLOT && goneKeys.includes(node?.model) ? [" ", h(doc, "span", { class: "bad", "data-ui": "model-gone-badge" }, t("create.modelGone.badge"))] : [])), h(doc, "td", {}, t(r.paid ? "create.paidYes" : "create.paidNo")), h(doc, "td", {}, t(r.search ? "create.searchOn" : "create.searchOff")));
              }),
            ),
          )
        : h(doc, "p", { class: "hint" }, t("editor.empty"));

      const est = summary.estimate;
      // The limits of a free account (Groq): what the run may do to them, and the offers that remove it.
      const runSizes = runSettings();
      const limitArgs = { design, limits, ...runSizes };
      const limitFound = limitFindings(limitArgs);
      lastBlockedNames = [...new Set(limitFound.filter((f) => f.kind === "call-too-big").flatMap((f) => f.agents))].map((id) => rows.find((r) => r.id === id)?.label ?? id).join(", ");
      const limitEl = limitsView({
        doc, t, findings: limitFound, offers: limitOffers({ ...limitArgs, loadedSlots: SLOT_IDS.filter((id) => keyState(vaultFor(id)) !== "none") }), summary: limitSummary(limitArgs),
        providerNameOf: (id) => providerCatalog(id).label,
        providerName: providerCatalog(slotProvider((design.nodes.find((n) => limitFound[0]?.agents?.includes(n.id) && slotFreeLimits(n.slot)) ?? design.nodes.find((n) => slotFreeLimits(n.slot)))?.slot)).label,
        nameOf: (id) => rows.find((r) => r.id === id)?.label ?? id, slotName, num: (n) => new Intl.NumberFormat(ctx.lang === "cs" ? "cs-CZ" : "en-US").format(n),
        chosen: draft.limitsChoice, onApply: applyOffer,
      });
      lastEstimate = design.nodes.length > 0 && draft.decisions.model ? (isFree ? t(providerSpec(provider).text.estimateFree ?? "create.estimateFree") : t("create.ws.estimate", { usd: workspaceEstimateUsd(est) })) : "";
      const estimateLines = [
        h(doc, "p", {}, h(doc, "strong", { "data-ui": isFree ? "estimate-free" : "estimate-cost" }, isFree ? t(providerSpec(provider).text.estimateFree ?? "create.estimateFree") : t("create.estimate", { usd: est.costUsd.toFixed(3), date: est.pricesAsOf }))),
        h(doc, "p", { class: "hint" }, t("create.estimateDetail", { tokens: est.tokensUpper, turns: est.activations })),
        ...(limitEl ? [limitEl] : []),
      ];
      if (summary.warning) {
        const w = summary.warning;
        estimateLines.push(h(doc, "div", { class: "limit-warning", role: "status", "data-ui": "limit-warning" }, h(doc, "b", {}, t("create.limitWarning.title")), t("create.limitWarning.body", { turns: w.turns, tokens: w.tokens.toLocaleString(ctx.lang === "cs" ? "cs-CZ" : "en-US"), steps: w.maxSteps, maxTokens: w.maxTokens.toLocaleString(ctx.lang === "cs" ? "cs-CZ" : "en-US") }), " ", h(doc, "a", { href: "#/settings" }, t("create.limitWarning.link"))));
      }
      if (summary.emptyCriteria) estimateLines.push(h(doc, "div", { class: "limit-warning", role: "status", "data-ui": "criteria-warning" }, t("create.criteriaWarning")));
      if (marked && summary.hasSearch) estimateLines.push(h(doc, "p", { class: "notice", "data-ui": "free-tier-search" }, t("create.freeTierSearch")));
      if (marked && paidOnly) estimateLines.push(h(doc, "p", { class: "notice", "data-ui": "free-tier-no-strong" }, t("create.freeTierNoStrong")));
      if (summary.hasSearch && !isFree) {
        estimateLines.push(h(doc, "p", { class: "notice" }, t(providerSpec(provider).text.estimateSearch, { usd: est.searchCostUsd.toFixed(2) })));
        estimateLines.push(h(doc, "p", { class: "notice" }, t(providerSpec(provider).text.searchFee)));
      }

      // Key: one block for each key slot the agents use.
      const lockedSlots = used.filter((s) => vaultFor(s).getSessionKey() === null && vaultFor(s).hasStoredKey());
      const keyBlock = (slot, index) => {
      const pv = vaultFor(slot);
      const provider = slotProvider(slot);
      const apiKey = pv.getSessionKey();
      const sfx = index === 0 ? "" : `-${slot}`;
      // One passphrase unlocks every saved key, so the locked slots share one unlock form (the first locked slot shows it).
      const isLocked = apiKey === null && pv.hasStoredKey();
      if (isLocked && lockedSlots[0] !== slot) return [];
      const heading = isLocked ? lockedSlots.map(slotName).join(" + ") : slotName(slot);
      const keyParts = used.length > 1 ? [h(doc, "p", { class: "key-slot-name" }, h(doc, "strong", {}, heading))] : [];
      if (apiKey === null) {
        if (pv.hasStoredKey()) {
          const pass = h(doc, "input", { id: `cr-unlock${sfx}`, type: "password", autocomplete: "current-password" });
          const unlock = h(doc, "button", { type: "button" }, t("settings.unlock"));
          const message = h(doc, "p", { class: "notice", role: "alert", hidden: true });
          pass.addEventListener("keydown", (event) => {
            if (event.key === "Enter") unlock.click();
          });
          unlock.addEventListener("click", async () => {
            try {
              await (ctx.vault.unlockAll ? ctx.vault.unlockAll(pass.value) : pv.unlock(pass.value));
              markUnlockAlert(doc, ctx.vault, t);
              drawReview();
            } catch (error) {
              message.textContent = t(`settings.error.${error?.code ?? "storage"}`);
              message.hidden = false;
            }
          });
          keyParts.push(h(doc, "div", { class: "field" }, h(doc, "label", { for: `cr-unlock${sfx}` }, t("create.unlockLabel")), pass), unlock, message);
        } else {
          const keySpec = providerSpec(provider);
          const keyInput = h(doc, "input", { id: `cr-key${sfx}`, type: "password", autocomplete: "off", spellcheck: "false", ...(keySpec.keyPlaceholder ? { placeholder: keySpec.keyPlaceholder } : {}) });
          const keyProblem = h(doc, "p", { class: "notice", role: "alert", hidden: true });
          const save = h(doc, "button", { type: "button" }, t("settings.keySave"));
          keyInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") save.click();
          });
          save.addEventListener("click", () => {
            if (keyInput.value.trim() === "") return;
            // A provider with a key shape (Cloudflare: ACCOUNT_ID:TOKEN) refuses a key of another shape, as Settings does.
            if (keySpec.keyPattern && !keySpec.keyPattern.test(keyInput.value.trim())) {
              keyProblem.textContent = t(keySpec.text.keyFormat);
              keyProblem.hidden = false;
              return;
            }
            pv.setSessionKey(keyInput.value.trim());
            drawReview();
          });
          keyParts.push(h(doc, "div", { class: "field" }, h(doc, "label", { for: `cr-key${sfx}` }, t(providerSpec(provider).text.keyInline)), keyInput), keyProblem, save, h(doc, "p", { class: "hint" }, h(doc, "a", { href: `#/settings/key/${slot}` }, t("create.keySettingsLink"))));
        }
      } else {
        keyParts.push(h(doc, "p", {}, t("settings.keyAvailable")));
        if (providerSpec(provider).text.pricingLink) keyParts.push(h(doc, "p", { class: "hint" }, h(doc, "a", { href: providerSpec(provider).pricingUrl, target: "_blank", rel: "noopener noreferrer" }, t(providerSpec(provider).text.pricingLink))));
      }
      return keyParts;
      };
      const keyParts = used.flatMap((slot, index) => keyBlock(slot, index));

      lastVerdict = verdict;
      // A reason that says the saved key is locked has a small password box and a button right after the words, so it can be unlocked from here.
      const unlockInline = () => makeUnlock(drawReview);
      // "Add your API key first." takes the student to the API key tab and into its key box.
      const keyLink = (text, ui = "reason-go-key") => {
        const go = h(doc, "button", { type: "button", class: "linklike", "data-ui": ui, title: t("create.reason.noKeyGo") }, text);
        go.addEventListener("click", goToKey);
        return go;
      };
      const reasons = verdict.ok ? "" : h(doc, "ul", { class: "reasons", role: "status" }, ...verdict.reasons.map((r) => h(doc, "li", {}, r === "noKey" ? keyLink(t(`create.reason.${r}`)) : t(`create.reason.${r}`, r === "limitsBlocked" ? { agents: lastBlockedNames } : undefined), ...(r === "keyLocked" && lockedSlots.length > 0 ? [unlockInline()] : []))));

      const status = stepsStatus();
      const tabs = innerTabs({ doc, t, tabs: [{ id: "agents", label: t("create.tab.agents") }, { id: "limits", label: t("create.tab.limits"), state: status.limits }, { id: "cost", label: t("create.tab.cost") }, { id: "key", label: t("create.tab.key"), state: status.key === "done" ? "done" : "part" }], current: draft.subTab, onSelect: (id) => {
        draft.subTab = id;
        drawReview();
      } });
      const pane = {
        agents: [agentsTable],
        limits: [h(doc, "h4", {}, t("create.limitsHeading"), help("create-limits", t("create.limitsHeading"))), ...limitInputs],
        cost: design.nodes.length === 0 ? [h(doc, "p", { class: "hint" }, t("create.costNeeds"))] : [h(doc, "h4", {}, t("create.estimateHeading"), help("create-estimate", t("create.estimateHeading"))), ...estimateLines, ...providersOf(design, provider).map((p) => h(doc, "p", { class: "notice" }, t(providerSpec(p).text.dataNotice)))],
        key: [h(doc, "h4", {}, t("create.keyHeading")), ...keyParts],
      }[draft.subTab] ?? [];
      reviewHost.replaceChildren(workspace ? "" : h(doc, "h3", {}, t("create.step.check")),...(checkEl ? [checkEl] : []), tabs.element, h(doc, "div", { class: "inner-pane", role: "tabpanel", "data-ui": `pane-${draft.subTab}` }, ...pane), reasons);
      if (focusKey) reviewHost.querySelector?.(focusKey)?.focus?.();
      refreshSteps();
    }

    // A failed run waits for its key: this button carries it on from the agent that failed.
    const carryOnButton = h(doc, "button", { type: "button", class: "primary", "data-ui": "carry-on" }, t("create.carryOn"));
    const carryLimits = draft.retry && draft.approve !== true ? limitsChoice({ doc, t, current: ctx.settings.get().limits, original: draft.retry.limits, record: draft.retry, repeatStop: ctx.settings.get().repeatStop, initial: draft.retryUseCurrent, onChange: (v) => (draft.retryUseCurrent = v) }) : null;
    carryOnButton.addEventListener("click", () => {
      const run = draft.retry ? (draft.approve === true ? draft.retry : withLimitChoice(draft.retry, draft.retryUseCurrent)) : null;
      if (!run) return;
      if (!keysForRun(run).ready) {
        showKeyStep();
        showForm(t("create.retryNeedsKey"));
        importantTip(t("create.retryNeedsKey"));
        return;
      }
      const approve = draft.approve === true;
      draft.retry = null;
      draft.approve = false;
      beginRun({ resume: run, approve });
    });
    const definitionFile = h(doc, "input", { type: "file", accept: ".json,application/json", hidden: true, "data-ui": "definition-file" });
    // The two buttons of the top row are icons; the name and the hint are in the tooltip.
    const iconOf = (paths) => {
      const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
      for (const [k, v] of Object.entries({ viewBox: "0 0 16 16", width: "16", height: "16", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round" })) svg.setAttribute(k, v);
      for (const d of paths) {
        const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        svg.append(path);
      }
      return svg;
    };
    const loadButton = h(doc, "button", { type: "button", class: "head-icon", "data-ui": "load-definition", title: `${t("create.loadDefinition")}: ${t("create.loadDefinitionHint")}`, "aria-label": t("create.loadDefinition") }, iconOf(["M2 13h12", "M8 11V2.5M4.5 6 8 2.5 11.5 6"]));
    loadButton.addEventListener("click", () => definitionFile.click());
    const clearButton = h(doc, "button", { type: "button", class: "head-icon", "data-ui": "clear-definition", title: `${t("create.clearDefinition")}: ${t("create.clearDefinitionHint")}`, "aria-label": t("create.clearDefinition") }, iconOf(["M3 4h10M6 4V2h4v2M5 4l.7 9h4.6L11 4"]));
    clearButton.addEventListener("click", () => {
      const hasWork = draft.task.trim() !== "" || draft.editor.design().nodes.length > 0;
      if (hasWork && !doc.defaultView.confirm(t("create.clearConfirm"))) return;
      draft.retry = null;
      draft.task = "";
      draft.about = null;
      draft.pattern = "sequential";
      draft.editor = createEditor("sequential");
      // Back to a page where nothing is decided.
      resetDecisions();
      draft.slots = null;
      showForm(t("create.definition.cleared"), "status");
    });
    definitionFile.addEventListener("change", async () => {
      const file = definitionFile.files?.[0];
      definitionFile.value = "";
      if (!file) return;
      const loaded = loadDefinition(await file.text());
      if (!loaded.ok) {
        const first = loaded.errors?.[0];
        const detail = first ? ` ${t(`design.error.${first.code}`, first.params)}` : "";
        showForm(`${t(`create.definition.${loaded.code}`)}${detail}`);
        return;
      }
      if (draft.editor.design().nodes.length > 0 && !doc.defaultView.confirm(t("create.loadConfirm"))) return;
      draft.task = loaded.task;
      draft.about = loaded.about;
      draft.pattern = loaded.pattern;
      draft.editor = loaded.editor;
      // A definition names its pattern, models and memory: loading it is the student deciding them (the providers are read from its agents).
      decideLoaded();
      resetForLoad();
      const notes = loaded.notes.map((n) => t(`create.definition.note.${n}`)).join(" ");
      showForm(`${t("create.definition.loaded")} ${notes}`.trim(), "status");
    });

    taskInput.addEventListener("input", () => {
      draft.task = taskInput.value;
      updateCounter();
      drawReview();
    });

    // Memory management: the shared notebook of the run. Neither choice is made for the student.
    const memoryGroup = h(doc, "div", { class: "memory-choice", role: "group", "aria-label": t("create.memoryHeading"), "data-ui": "notebook-switch" });
    const drawMemory = () => keepFocus(doc, memoryGroup, drawMemoryRaw);
    const drawMemoryRaw = () => {
      memoryGroup.replaceChildren(
        ...[["off", false, "create.memoryOff"], ["on", true, "create.memoryOn"]].map(([id, on, key]) => {
          const button = h(doc, "button", { type: "button", class: "memory-button", "data-ui": `memory-${id}`, "aria-pressed": String(draft.decisions.memory && draft.editor.notebookOn() === on) }, t(key));
          button.addEventListener("click", () => {
            draft.editor.setNotebook(on);
            draft.decisions.memory = true;
            editorHandle.refresh();
            drawMemory();
            drawReview();
          });
          return button;
        }),
      );
    };
    drawMemory();
    // The ? buttons for patterns that have their own section of Help.
    const patternHelp = ["handoff", "router", "voting", "mapreduce", "planexec"].filter((p) => draft.pattern === p).map((p) => help(`create-${p}`, t(`pattern.${p}`)));
    const describeButton = h(doc, "button", { type: "button", class: "small describe-button", "data-ui": "describe-patterns", "aria-pressed": String(draft.describe) }, `ⓘ ${t("create.describe")}`);
    describeButton.addEventListener("click", () => {
      draft.describe = !draft.describe;
      describeButton.setAttribute("aria-pressed", String(draft.describe));
      patternGroup.classList.toggle("describe", draft.describe);
    });
    patternGroup.classList.toggle("describe", draft.describe);
    const heads = {
      task: partHeading({ doc, t, state: "none", text: t("create.part.task"), help: [help("create-task", t("create.part.task"))] }),
      pattern: partHeading({ doc, t, state: "none", text: t("create.part.pattern"), help: [help("create-pattern", t("create.part.pattern")), ...patternHelp], extra: describeButton }),
      providerModel: partHeading({ doc, t, state: "none", text: t("create.part.provider"), help: [help("create-provider", t("create.part.provider"))] }),
      memory: partHeading({ doc, t, state: "none", text: t("create.part.memory"), help: [help("create-memory", t("create.part.memory"))] }),
    };
    headings = heads;

    taskInput.setAttribute("aria-label", t("create.taskLabel"));
    const setupParts = [
      h(doc, "div", { class: "part" }, heads.task.element, taskInput, counter),
      h(doc, "div", { class: "part" }, heads.pattern.element, patternGroup, patternNotice),
      h(doc, "div", { class: "part" }, heads.providerModel.element, providerField),
      h(doc, "div", { class: "part" }, heads.memory.element, memoryGroup),
    ];
    panels.setup.replaceChildren(...setupParts);
    panels.diagram.replaceChildren(...(workspace ? [] : [h(doc, "h3", {}, t("create.step.diagram"))]), editorHost);
    if (workspace) {
      // Settings on the left; diagram and checks on the right, locked until the four parts are decided.
      rightInner = h(doc, "div", { class: "inner" }, editorHost, reviewHost);
      rightColumn = h(doc, "section", { class: "col right-col", "data-ui": "ws-right" }, h(doc, "div", { class: "lockmsg" }, h(doc, "div", {}, statusIcon(doc, "lock", t), ` ${t("create.ws.locked")}`)), rightInner);
    }
    if (!workspace) panels.check.replaceChildren(reviewHost);
    root.replaceChildren(
      h(doc, "div", { class: "create-head" }, h(doc, "h2", {}, t("create.title")), loadButton, clearButton, definitionFile),
      startNotice ? h(doc, "p", { class: "notice", role: noticeRole }, startNotice) : "",
      carryLimits ? carryLimits.element : "",
      draft.retry ? carryOnButton : "",
      ...(workspace ? [wsBar.element, wsBar.hintElement, h(doc, "div", { class: "ws" }, h(doc, "section", { class: "col", "data-ui": "ws-left" }, ...setupParts), rightColumn)] : [bar.element, panels.setup, panels.diagram, panels.check, foot.element]),
    );
    keepModels();
    const modelUi = {
      groups: choiceGroups,
      defaultOption: () => {
        const d = draft.editor.defaultModel();
        return t("create.modelDefault", { model: d ? `${choiceLabel(d.slot, d.model)}${chosenSlots().length > 1 ? ` · ${slotName(d.slot)}` : ""}` : "" });
      },
      label: nodeModelLabel,
      valueOf: (node) => choiceValue(node.slot, node.model),
      pick: (id, value) => {
        const choice = value === "" ? null : parseChoice(value);
        if (value !== "" && !choice) return;
        draft.editor.setNodeModel(id, choice);
      },
    };
    editorHandle = mountEditor(editorHost, { editor: draft.editor, t, doc, onChange: drawReview, webSearchAllowed: () => ctx.settings.get().webSearch, searchAvailable: (node) => (isSlot(node.slot) ? providerSpec(slotProvider(node.slot)).capabilities.search : true), modelUi, runLimits: () => ({ ...clampLimits(draft.limits), maxOutputTokens: ctx.settings.get().maxOutputTokens }) });
    ctx.onLeave(() => editorHandle.destroy());
    drawPatterns();
    drawReview();
  }

  // The key slot of a recorded run whose agents name none (a run from before agents had slots).
  const legacySlot = (run) => defaultSlot(String(run?.recordedWith?.provider ?? "").split("+")[0], run?.recordedWith?.freeTier === true);

  // The keys a recorded run needs again. Null for a key that is not available (not entered, or still locked).
  function keysForRun(run) {
    const fallback = legacySlot(run);
    const slots = [];
    for (const n of run.design.nodes) {
      const s = isSlot(n.slot) ? n.slot : fallback;
      if (!slots.includes(s)) slots.push(s);
    }
    const keys = Object.fromEntries(slots.map((s) => [s, vaultFor(s).getSessionKey()]));
    const slotless = run.design.nodes.some((n) => !isSlot(n.slot));
    const first = slotless ? fallback : slots[0];
    return { keys, apiKey: keys[first], provider: slotProvider(first), ready: Object.values(keys).every((k) => k !== null) };
  }

  // Carries on a run that failed: the agents that finished keep their answers, the failed agent and the rest run again.
  // The new events are added to the same saved run. resume is the run record.
  // The sizes of an answer and a handoff for this run: what an offer of the free-limits warning set, else Settings.
  function runSettings() {
    return { outputTokens: draft.runOverrides.outputTokens ?? ctx.settings.get().maxOutputTokens, handoffChars: draft.runOverrides.handoffChars ?? ctx.settings.get().handoffChars, language: ctx.lang, taskChars: Math.max(draft.task.trim().length, 200) };
  }
  // An agent whose single call can never fit the minute limit of a free account blocks the run until an offer is applied.
  function limitsBlock(design, limits) {
    return limitFindings({ design, limits, ...runSettings() }).some((f) => f.kind === "call-too-big");
  }

  function beginRun({ resume = null, approve = false } = {}) {
    // A new run carries the models the student chose for gone free models (a carried-on run keeps its own design).
    const design = resume ? structuredClone(resume.design) : applyOverrides(draft.editor.design(), ctx.settings.get().modelOverrides);
    const limits = clampLimits(resume ? resume.limits : draft.limits);
    // Every agent names its key slot; the run gets the key of each slot in use.
    const used = resume ? [] : usedSlots(design);
    const own = resume ? keysForRun(resume) : null;
    const provider = resume ? own.provider : slotProvider(used[0]);
    const keys = resume ? own.keys : Object.fromEntries(used.map((s) => [s, vaultFor(s).getSessionKey()]));
    const apiKey = resume ? own.apiKey : keys[used[0]];
    const freeTier = resume ? resume.recordedWith?.freeTier === true : used.every(slotIsFree);
    const task = resume ? resume.task : draft.task.trim();
    if (!canRun({ task, apiKey: Object.values(keys).every((k) => k !== null) ? apiKey : null, editorErrors: resume ? [] : draft.editor.errors(), modelGone: !resume && blockedByGoneModel(design, currentCheck()?.check) }).ok) return;
    if (!resume && limitsBlock(design, limits)) return;

    // What the earlier try left: its events without the ending (the error and the done), and the answers of the finished agents.
    const base = resume ? resume.events.filter((e) => e.type !== "done" && e.type !== "error") : [];
    // Approve: every agent that waited is marked approved, so the run does not stop on it again.
    if (approve) {
      const when = (base.at(-1)?.t ?? 0) + 500;
      for (const waiting of pendingApprovals(base)) base.push({ type: "approved", agent: waiting.agent, t: when, at: Date.now() });
    }
    // What carries the run on: the answers, with the condensings and the recorded verdicts of reviewing guardrails (see resumeAnswers).
    const answers = resumeAnswers(base);
    const earlier = resume ? deriveInspector(resume.events) : null;
    const failedIds = earlier ? earlier.order.filter((a) => earlier.agents[a].status === "error") : [];
    const offset = base.length > 0 ? (base.at(-1).t ?? 0) + 1000 : 0;
    const skipHandoff = handoffSkipper(base);
    const skipCreate = createSkipper(base);

    const id = resume ? resume.id : makeRunId(Date.now());
    const events = [...base];
    // The calls to the provider are kept beside the events (the player steps through events); a carried-on run keeps the earlier calls.
    const apiCalls = resume ? [...(resume.apiCalls ?? [])] : [];
    if (resume && !approve) events.push({ type: "warning", agent: failedIds[0], message: t("run.retrying", { agent: failedIds.join(", ") }), t: offset - 500, at: Date.now() });
    // The clock of a carried-on run continues from the earlier try, so the times of all events fit together.
    const startedAt = Date.now() - offset;
    let endedAt;
    const client = {
      language: typeof navigator === "undefined" ? undefined : navigator.language,
      timezone: (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
          return undefined;
        }
      })(),
      userAgent: typeof navigator === "undefined" ? undefined : navigator.userAgent,
    };
    const record = () => buildRunRecord({ id, design, task, events, apiCalls, apiCallsDropped: resume?.apiCallsDropped === true, about: aboutForLanguage(draft.about, ctx.lang), limits, language: ctx.lang, appVersion: ctx.version, startedAt, endedAt, client, provider, freeTier });
    const saver = createBatchedSaver(ctx.runStore);

    const host = h(doc, "div", { class: "replay-host", "data-ui": "player-host" });
    const after = h(doc, "div", { class: "run-after", "data-ui": "run-after" });
    // How the run ended is shown above the player, so it is the first thing seen when the run is over.
    const outcomeSlot = h(doc, "div", { class: "run-outcome-slot", "data-ui": "run-outcome-slot" });
    root.replaceChildren(outcomeSlot, host, after);
    let ended = false;
    let finalRecordNow = null;
    // A failed agent offers Retry once the run is over: the run carries on from it.
    const retryNow = (agentId, choice, options = {}) => {
      if (!ended || finalRecordNow === null) return;
      const chosen = choice ? withRetryChoice(finalRecordNow, agentId, choice) : finalRecordNow;
      const record2 = withLimitChoice(chosen, options.useCurrentLimits !== false);
      if (!keysForRun(record2).ready) {
        outcomeSlot.append(h(doc, "p", { class: "notice", role: "alert" }, t("create.retryNeedsKeyLive")));
        importantTip(t("create.retryNeedsKeyLive"));
        return;
      }
      live.destroy();
      beginRun({ resume: record2 });
    };
    const live = mountLiveReplay(host, { apiCalls, title: task.split(/\r?\n/)[0].slice(0, 120), pattern: resume ? resume.pattern : draft.pattern, recordedWith: { provider: providersOf(design, provider).join("+"), model: modelsUsed(design, provider) }, t, doc, onStop: () => activeRun?.stop(), layout: ctx.settings.get().playerLayout, providerColors: ctx.settings.get().providerColors, onRetry: retryNow, suggestFallback: ctx.settings.get().fallback !== "off", limitsInfo: () => ({ current: ctx.settings.get().limits, original: finalRecordNow?.limits ?? ctx.settings.get().limits, record: finalRecordNow, repeatStop: ctx.settings.get().repeatStop }) });
    ctx.onLeave(live.destroy);
    for (const e of base) live.append(e);
    if (resume && !approve) live.append(events[base.length]);
    const finish = async () => {
      if (ended) return;
      ended = true;
      endedAt = Date.now();
      live.end();
      const finalRecord = record();
      finalRecordNow = finalRecord;
      await saver.flush();
      const result = await ctx.runStore.save(finalRecord);
      activeRun = null;
      const done = events.at(-1);
      const finalModel = buildResultModel(finalRecord);
      // A carried-on run shows what this try took and cost, not only the whole run.
      const tryNumbers = resume && finalModel.cost !== null
        ? { tryCost: Math.max(0, finalModel.cost - (buildResultModel(resume).cost ?? 0)), durationMs: Math.max(0, (events.at(-1)?.t ?? 0) - (offset - 1000)) }
        : {};
      const notice = outcomeNotice({ doc, t, outcome: done?.outcome, events, cost: finalModel.cost, free: finalModel.free, ...tryNumbers });
      notice.id = "run-outcome";
      if (result.ok) refreshResultTab(ctx);
      // A paused run shows its own panel with the choices, so it gets no tooltip on top of it.
      if (ctx.settings.get().tooltips && done?.outcome !== "waiting_approval") {
        const tipNotice = outcomeNotice({ doc, t, outcome: done?.outcome, events, cost: finalModel.cost, free: finalModel.free, ...tryNumbers });
        const tipContent = result.ok ? h(doc, "div", {}, tipNotice, h(doc, "p", { class: "center-tip-link" }, h(doc, "a", { href: `#/play/result/${id}`, "data-ui": "tip-see-result" }, t("create.seeResult")))) : tipNotice;
        // A run that did not finish well keeps its tooltip on the screen until the visitor closes it.
        const tip = showCenterTip({ doc, content: tipContent, sticky: done?.outcome !== "finished", closeLabel: t("about.close"), moveLabel: t("about.move") });
        ctx.onLeave(tip.close);
      }
      outcomeSlot.replaceChildren(notice);
      if (done?.outcome === "waiting_approval") {
        const pendingNow = pendingApprovals(events);
        const panel = approvalPanel({
          doc,
          t,
          pending: pendingNow,
          onApprove: () => {
            if (!keysForRun(finalRecordNow).ready) {
              outcomeSlot.append(h(doc, "p", { class: "notice", role: "alert" }, t("create.retryNeedsKeyLive")));
              importantTip(t("create.retryNeedsKeyLive"));
              return;
            }
            live.destroy();
            beginRun({ resume: finalRecordNow, approve: true });
          },
          onStop: async () => {
            // Stop here: the run ends as stopped by you. What happened so far stays saved.
            events[events.length - 1] = { ...events.at(-1), outcome: "stopped_user" };
            finalRecordNow = record();
            await ctx.runStore.save(finalRecordNow);
            refreshResultTab(ctx);
            outcomeSlot.replaceChildren(outcomeNotice({ doc, t, outcome: "stopped_user", events, cost: finalModel.cost, free: finalModel.free }));
          },
        });
        outcomeSlot.append(panel);
      }
      const children = [];
      if (result.ok) children.push(h(doc, "p", {}, h(doc, "a", { href: `#/play/result/${id}` }, t("create.seeResult")), " · ", h(doc, "a", { href: `#/play/run/${id}`, "data-ui": "see-replay" }, t("result.watch"))));
      else children.push(h(doc, "p", { class: "notice", role: "alert" }, t("create.saveFailed")), downloadButton(ctx, finalRecord));
      const again = h(doc, "button", { type: "button", class: "primary" }, t("create.newRun"));
      again.addEventListener("click", () => {
        live.destroy();
        showForm();
      });
      children.push(again);
      after.replaceChildren(...children);
      // The run is over and saved. The screen stays as it is, with its warnings; the links below lead to the result and to the replay.
    };

    activeRun = startRun({
      design,
      task,
      limits,
      timeoutSec: ctx.settings.get().requestTimeoutSec,
      outputTokens: resume ? ctx.settings.get().maxOutputTokens : runSettings().outputTokens,
      retries: ctx.settings.get().retries,
      retryDelaySec: ctx.settings.get().retryDelaySec,
      freeTier,
      repeatStop: ctx.settings.get().repeatStop,
      handoffChars: resume ? ctx.settings.get().handoffChars : runSettings().handoffChars,
      webSearch: ctx.settings.get().webSearch,
      fallback: ctx.settings.get().fallback,
      formatEnforcement: ctx.settings.get().formatEnforcement,
      language: ctx.lang,
      apiKey,
      keys,
      resume: answers,
      approved: approvedAgents(base),
      provider,
      onEvent: (event) => {
        if (event.type === "api_call") {
          apiCalls.push(resume ? { ...event, t: (event.t ?? 0) + offset } : event);
          saver.update(record());
          return;
        }
        // Carried on: the clock continues from the earlier try, and a handoff the earlier try already has is not shown twice.
        if (resume && event.type === "handoff" && skipHandoff(event)) return;
        if (resume && (event.type === "agent_created" || event.type === "agent_refused" || event.type === "handoff_refused") && skipCreate(event)) return;
        const shifted = resume ? { ...event, t: (event.t ?? 0) + offset } : event;
        // A warning keeps the clock time it happened at, so a later look at the run shows which came from which try.
        const next = event.type === "warning" ? { ...shifted, at: Date.now() } : shifted;
        events.push(next);
        live.append(next);
        saver.update(record());
      },
    });
    activeRun.done.then(finish, async (error) => {
      activeRun = null;
      live.destroy();
      const code = error instanceof RunStartError ? error.code : "server";
      showForm(t(`run.error.${code}`));
      importantTip(t(`run.error.${code}`));
    });
  }

  ctx.doc.title = `${t("create.title")} · ${t("site.name")}`;
  // A failed run opened from the player (Play or Result) asks to be carried on: start it here.
  const pending = draft.retry;
  const pendingApprove = draft.approve === true;
  ctx.onLeave(() => {
    draft.retry = null;
    draft.approve = false;
    draft.retryUseCurrent = true;
  });
  if (pending) {
    if (keysForRun(pending).ready) {
      const useCurrent = draft.retryUseCurrent;
      draft.retry = null;
      draft.approve = false;
      draft.retryUseCurrent = true;
      beginRun({ resume: pendingApprove ? pending : withLimitChoice(pending, useCurrent), approve: pendingApprove });
    } else {
      // The key is missing (not entered, or locked): show the form with the key fields of the run, and a button that carries on once the key is in.
      const definition = definitionFromRun(pending);
      if (definition) useDefinition(definition);
      draft.slots = Object.keys(keysForRun(pending).keys);
      showKeyStep();
      showForm(t("create.retryNeedsKey"));
      doc.defaultView.scrollTo?.(0, 0);
      importantTip(t("create.retryNeedsKey"));
    }
    return;
  }
  showForm();
}
