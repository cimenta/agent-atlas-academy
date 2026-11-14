// The Create tab: task, pattern, diagram, review, then a live run in the player.
import { h } from "../dom.js";
import { markUnlockAlert } from "../unlock-alert.js";
import { keyState } from "../key-state.js";
import { downloadFile } from "../download.js";
import { outcomeNotice } from "../outcome-view.js";
import { showCenterTip } from "../center-tip.js";
import { refreshResultTab } from "../tab-state.js";
import { SLOT_IDS, isSlot, slotProvider, slotIsFree } from "../key-slots.js";
import { TASK_MAX_CHARS, LIMIT_MAX, PRICING_URLS, DEFAULT_MODEL, providerCatalog, paidOnlyModelUsed, providersOf } from "../engine/catalog.js";
import { PATTERNS, clampLimits } from "../engine/patterns.js";
import { buildRunRecord, makeRunId, modelsUsed } from "../engine/run-record.js";
import { startRun, RunStartError } from "../run-client.js";
import { mountLiveReplay } from "../replay/view.js";
import { createBatchedSaver } from "../storage/runs-store.js";
import { createEditor } from "./editor-model.js";
import { draft } from "./draft.js";
import { mountEditor } from "./editor-view.js";
import { canRun, reviewSummary } from "./create-model.js";
import { buildResultModel } from "../play-model.js";
import { loadDefinition } from "./definition.js";

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
  const line = (x1, y1, x2, y2) => {
    const l = doc.createElementNS(SVG_NS, "line");
    for (const [k, v] of Object.entries({ x1, y1, x2, y2, stroke: "currentColor", "stroke-width": 1.5 })) l.setAttribute(k, String(v));
    svg.append(l);
  };
  const shapes = {
    sequential: () => [line(12, 20, 32, 20), line(32, 20, 52, 20), dot(12, 20), dot(32, 20), dot(52, 20)],
    parallel: () => [line(12, 10, 52, 20), line(12, 30, 52, 20), dot(12, 10), dot(12, 30), dot(52, 20)],
    supervisor: () => [line(12, 20, 52, 6), line(12, 20, 52, 16), line(12, 20, 52, 26), line(12, 20, 52, 36), dot(12, 20), dot(52, 6), dot(52, 16), dot(52, 26), dot(52, 36)],
    debate: () => [line(12, 10, 52, 20), line(12, 30, 52, 20), line(12, 10, 12, 30), dot(12, 10), dot(12, 30), dot(52, 20)],
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
  const vaultFor = (id) => (ctx.vault.forProvider ? ctx.vault.forProvider(id) : ctx.vault);
  const { doc, t } = ctx;
  const hasKey = (id) => vaultFor(id).getSessionKey() !== null || vaultFor(id).hasStoredKey();
  // The visitor may choose several key slots (Claude, Gemini free, Gemini paid). Until a choice is made it is the first one with a key.
  const chosenSlots = () => {
    if (!Array.isArray(draft.slots) || draft.slots.length === 0 || !draft.slots.every(isSlot)) draft.slots = [SLOT_IDS.find(hasKey) ?? "anthropic"];
    return draft.slots;
  };
  const slotName = (id) => (slotProvider(id) === "google" ? t(slotIsFree(id) ? "create.geminiFree" : "create.geminiPaid") : providerCatalog(slotProvider(id)).label);
  // The models a slot offers: a free Gemini key offers only the models that have a free tier.
  const modelsOfSlot = (slot) => {
    const all = providerCatalog(slotProvider(slot)).models;
    return slotIsFree(slot) ? all.filter((m) => m.freeTier !== false) : all;
  };
  const choiceValue = (slot, key) => `${slot}|${key}`;
  const parseChoice = (value) => {
    const [slot, model] = String(value).split("|");
    return isSlot(slot) && modelsOfSlot(slot).some((m) => m.key === model) ? { slot, model } : null;
  };
  const choiceGroups = () => chosenSlots().map((slot) => ({ label: slotName(slot), options: modelsOfSlot(slot).map((m) => ({ value: choiceValue(slot, m.key), label: `${m.label} (${m.id})` })) }));
  const choiceLabel = (slot, key) => {
    const m = providerCatalog(slotProvider(slot)).models.find((x) => x.key === key);
    return m ? `${m.label} (${m.id})` : key;
  };
  // The default model must be one of the chosen slots' models; agents whose choice is gone return to it.
  const keepModels = () => {
    const current = draft.editor.defaultModel();
    const ok = current && chosenSlots().includes(current.slot) && modelsOfSlot(current.slot).some((m) => m.key === current.model);
    if (!ok) {
      const slot = chosenSlots()[0];
      const list = modelsOfSlot(slot);
      draft.editor.setDefaultModel({ slot, model: (list.find((m) => m.key === DEFAULT_MODEL) ?? list[0]).key });
    }
    draft.editor.keepSlots((node) => chosenSlots().includes(node.slot) && modelsOfSlot(node.slot).some((m) => m.key === node.model));
  };
  // The slots the agents use (the chosen ones while the diagram is empty), each once.
  const usedSlots = (design) => {
    const slots = [];
    for (const n of design.nodes) if (isSlot(n.slot) && !slots.includes(n.slot)) slots.push(n.slot);
    return slots.length > 0 ? slots : [chosenSlots()[0]];
  };
  if (draft.limits === null) draft.limits = { ...ctx.settings.get().limits };
  const root = ctx.main;
  let activeRun = null;
  ctx.onLeave(() => activeRun?.stop());

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
    const drawPatterns = () => {
      patternGroup.replaceChildren(
        ...PATTERNS.map((p) => {
          const button = h(
            doc,
            "button",
            { type: "button", class: "pattern-button", "aria-pressed": String(draft.pattern === p), "data-pattern": p },
            patternIcon(doc, p),
            h(doc, "strong", {}, t(`pattern.${p}`)),
            h(doc, "span", { class: "palette-help" }, t(`create.pattern.${p}`)),
          );
          button.addEventListener("click", () => {
            if (draft.pattern === p) return;
            const hadNodes = draft.editor.design().nodes.length > 0;
            if (hadNodes && !doc.defaultView.confirm(t("create.patternConfirm"))) return;
            draft.pattern = p;
            draft.editor.reset(p);
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
    const MARKS = { anthropic: "A", google: "G" };
    // The default model: a list of the models of the chosen providers. Agents without a model of their own use it.
    const defaultHost = h(doc, "div", { class: "field default-model", "data-ui": "default-model-field" });
    const drawDefaultModel = () => {
      const current = draft.editor.defaultModel();
      const select = h(doc, "select", { id: "cr-default-model", "data-ui": "default-model" }, ...choiceGroups().map((g) => h(doc, "optgroup", { label: g.label }, ...g.options.map((o) => h(doc, "option", { value: o.value, selected: current !== null && o.value === choiceValue(current.slot, current.model) }, o.label)))));
      select.addEventListener("change", () => {
        const choice = parseChoice(select.value);
        if (!choice) return;
        draft.editor.setDefaultModel(choice);
        editorHandle.refresh();
        drawReview();
      });
      defaultHost.replaceChildren(h(doc, "label", { for: "cr-default-model" }, t("create.defaultModel")), select, h(doc, "p", { class: "hint" }, t("create.defaultModelHint")));
    };
    const drawProviderTiles = () => {
      const chosen = chosenSlots();
      providerTiles.replaceChildren(
        ...SLOT_IDS.map((id) => {
          const state = keyState(vaultFor(id));
          const selected = chosen.includes(id);
          const kind = slotProvider(id);
          const name = slotName(id);
          const noKey = state === "none" && !selected;
          const sub = noKey ? t("create.providerAddKey") : kind === "google" ? t(slotIsFree(id) ? "create.providerFree" : "create.providerPaid") : "";
          const dotText = t(state === "locked" ? "settings.dotLocked" : "settings.dotLoaded");
          const parts = [
            h(doc, "span", { class: `pv-mark pv-${kind}`, "aria-hidden": "true" }, MARKS[kind]),
            h(doc, "span", { class: "pv-text" }, h(doc, "span", { class: "pv-name" }, name), ...(sub ? [h(doc, "span", { class: "pv-sub" }, sub)] : [])),
            ...(state === "none" ? [] : [h(doc, "span", { class: `pv-dot ${state === "locked" ? "yellow" : "green"}`, role: "img", "aria-label": dotText, title: dotText })]),
            ...(noKey ? [] : [h(doc, "span", { class: "pv-check", "aria-hidden": "true" }, selected ? "✓" : "")]),
          ];
          // A provider without a key is a link to Settings, unless it is the one chosen (its key is entered below).
          if (noKey) return h(doc, "a", { class: "provider-tile dim", href: `#/settings/key/${id}`, "data-ui": `provider-tile-${id}`, title: t("create.providerAddKey") }, ...parts);
          const tile = h(doc, "button", { type: "button", class: `provider-tile${selected ? " on" : ""}`, role: "checkbox", "aria-checked": String(selected), "data-ui": `provider-tile-${id}` }, ...parts);
          tile.addEventListener("click", () => {
            // Any number of providers may be chosen, but one stays.
            if (selected && chosen.length === 1) return;
            draft.slots = SLOT_IDS.filter((s) => (s === id ? !selected : chosen.includes(s)));
            keepModels();
            editorHandle.refresh();
            drawReview();
          });
          return tile;
        }),
      );
      drawDefaultModel();
    };
    const legendItem = (cls, text) => h(doc, "span", {}, ...(cls ? [h(doc, "i", { class: `pv-lg ${cls}` })] : []), text);
    const providerLegend = h(doc, "div", { class: "pv-legend", "data-ui": "provider-legend" }, legendItem("green", t("create.legendLoaded")), legendItem("yellow", t("create.legendLocked")), legendItem("", t("create.legendNone")));
    const providerField = h(doc, "div", { class: "field provider-field", "data-ui": "provider-field" }, h(doc, "p", { class: "pv-title" }, t("create.providerLabel")), providerTiles, providerLegend, h(doc, "p", { class: "hint" }, t("create.providerHint")), defaultHost);

    // The model of an agent: its level (Fast, Balanced, Strong), and the provider when more than one is chosen.
    const nodeModelLabel = (node) => {
      const slot = isSlot(node?.slot) ? node.slot : chosenSlots()[0];
      const level = providerCatalog(slotProvider(slot)).models.find((m) => m.key === node?.model)?.label ?? "";
      return chosenSlots().length > 1 ? `${level} · ${slotName(slot)}` : level;
    };

    // Editor.
    const editorHost = h(doc, "div", { class: "editor-host", "data-ui": "editor" });
    const reviewHost = h(doc, "section", { class: "review", "data-ui": "run-review", "aria-label": t("create.reviewHeading") });
    let editorHandle;

    // Review.
    function drawReview() {
      keepModels();
      const design = draft.editor.design();
      const limits = clampLimits(draft.limits);
      const used = usedSlots(design);
      const provider = slotProvider(used[0]);
      drawProviderTiles();
      const summary = reviewSummary({ design, limits, provider });
      // Every provider the agents use needs its key.
      const missing = used.filter((s) => vaultFor(s).getSessionKey() === null);
      const verdict = canRun({ task: taskInput.value, apiKey: missing.length === 0 ? "set" : null, editorErrors: draft.editor.errors(), keyLocked: missing.some((s) => vaultFor(s).hasStoredKey()) });
      // Keys the visitor saved as being on Google's free tier make the run free, unless a model without a free tier is used.
      const marked = used.every(slotIsFree);
      const paidOnly = paidOnlyModelUsed(design, provider);
      const isFree = marked && !paidOnly;

      const limitInputs = LIMIT_FIELDS.map(([key, labelKey]) => {
        const input = h(doc, "input", { id: `cr-${key}`, type: "number", min: key === "maxSearches" ? 0 : 1, max: LIMIT_MAX[key], step: 1, value: limits[key] });
        input.addEventListener("change", () => {
          draft.limits = clampLimits({ ...draft.limits, [key]: Number(input.value) });
          drawReview();
        });
        return h(doc, "div", { class: "field" }, h(doc, "label", { for: `cr-${key}` }, t(labelKey)), input);
      });

      const agents = summary.agents.length
        ? h(
            doc,
            "ul",
            {},
            ...summary.agents.map((a) => {
              const node = design.nodes.find((n) => n.id === a.id);
              return h(doc, "li", {}, `${a.label} — ${nodeModelLabel(node)}${a.search ? `, ${t("create.withSearch")}` : ""}`);
            }),
          )
        : h(doc, "p", { class: "hint" }, t("editor.empty"));

      const est = summary.estimate;
      const estimateLines = [
        h(doc, "p", {}, h(doc, "strong", { "data-ui": isFree ? "estimate-free" : "estimate-cost" }, isFree ? t("create.estimateFree") : t("create.estimate", { usd: est.costUsd.toFixed(3), date: est.pricesAsOf }))),
        h(doc, "p", { class: "hint" }, t("create.estimateDetail", { tokens: est.tokensUpper, turns: est.activations })),
      ];
      if (marked && summary.hasSearch) estimateLines.push(h(doc, "p", { class: "notice", "data-ui": "free-tier-search" }, t("create.freeTierSearch")));
      if (marked && paidOnly) estimateLines.push(h(doc, "p", { class: "notice", "data-ui": "free-tier-no-strong" }, t("create.freeTierNoStrong")));
      if (summary.hasSearch && !isFree) {
        estimateLines.push(h(doc, "p", { class: "notice" }, t(provider === "google" ? "create.estimateSearchGoogle" : "create.estimateSearch", { usd: est.searchCostUsd.toFixed(2) })));
        estimateLines.push(h(doc, "p", { class: "notice" }, t(provider === "google" ? "editor.searchFeeGoogle" : "editor.searchFee")));
      }

      // Key: one block for each key slot the agents use.
      const keyBlock = (slot, index) => {
      const pv = vaultFor(slot);
      const provider = slotProvider(slot);
      const apiKey = pv.getSessionKey();
      const sfx = index === 0 ? "" : `-${slot}`;
      const keyParts = used.length > 1 ? [h(doc, "p", { class: "key-slot-name" }, h(doc, "strong", {}, slotName(slot)))] : [];
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
          const keyInput = h(doc, "input", { id: `cr-key${sfx}`, type: "password", autocomplete: "off", spellcheck: "false" });
          const save = h(doc, "button", { type: "button" }, t("settings.keySave"));
          keyInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") save.click();
          });
          save.addEventListener("click", () => {
            if (keyInput.value.trim() === "") return;
            pv.setSessionKey(keyInput.value.trim());
            drawReview();
          });
          keyParts.push(h(doc, "div", { class: "field" }, h(doc, "label", { for: `cr-key${sfx}` }, t(provider === "google" ? "create.keyInlineGoogle" : "create.keyInline")), keyInput), save, h(doc, "p", { class: "hint" }, h(doc, "a", { href: `#/settings/key/${slot}` }, t("create.keySettingsLink"))));
        }
      } else {
        keyParts.push(h(doc, "p", {}, t("settings.keyAvailable")));
        if (provider === "google") keyParts.push(h(doc, "p", { class: "hint" }, h(doc, "a", { href: PRICING_URLS.google, target: "_blank", rel: "noopener noreferrer" }, t("settings.googlePricingLink"))));
      }
      return keyParts;
      };
      const keyParts = used.flatMap((slot, index) => keyBlock(slot, index));

      const run = h(doc, "button", { type: "button", class: "primary run-button", disabled: !verdict.ok }, t("create.run"));
      run.addEventListener("click", () => beginRun());
      const reasons = verdict.ok ? "" : h(doc, "ul", { class: "reasons", role: "status" }, ...verdict.reasons.map((r) => h(doc, "li", {}, t(`create.reason.${r}`))));

      reviewHost.replaceChildren(
        h(doc, "h3", {}, t("create.reviewHeading")),
        h(doc, "h4", {}, t("create.reviewAgents")),
        agents,
        h(doc, "h4", {}, t("create.limitsHeading")),
        ...limitInputs,
        h(doc, "h4", {}, t("create.estimateHeading")),
        ...estimateLines,
        ...providersOf(design, provider).map((p) => h(doc, "p", { class: "notice" }, t(p === "google" ? "create.dataNoticeGoogle" : "create.dataNotice"))),
        h(doc, "h4", {}, t("create.keyHeading")),
        ...keyParts,
        reasons,
        run,
      );
    }

    const definitionFile = h(doc, "input", { type: "file", accept: ".json,application/json", hidden: true, "data-ui": "definition-file" });
    const loadButton = h(doc, "button", { type: "button", "data-ui": "load-definition", title: t("create.loadDefinitionHint") }, t("create.loadDefinition"));
    loadButton.addEventListener("click", () => definitionFile.click());
    const clearButton = h(doc, "button", { type: "button", "data-ui": "clear-definition", title: t("create.clearDefinitionHint") }, t("create.clearDefinition"));
    clearButton.addEventListener("click", () => {
      const hasWork = draft.task.trim() !== "" || draft.editor.design().nodes.length > 0;
      if (hasWork && !doc.defaultView.confirm(t("create.clearConfirm"))) return;
      draft.task = "";
      draft.pattern = "sequential";
      draft.editor = createEditor("sequential");
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
      draft.pattern = loaded.pattern;
      draft.editor = loaded.editor;
      const notes = loaded.notes.map((n) => t(`create.definition.note.${n}`)).join(" ");
      showForm(`${t("create.definition.loaded")} ${notes}`.trim(), "status");
    });

    taskInput.addEventListener("input", () => {
      draft.task = taskInput.value;
      updateCounter();
      drawReview();
    });

    root.replaceChildren(
      h(doc, "div", { class: "create-head" }, h(doc, "h2", {}, t("create.title")), loadButton, clearButton, definitionFile),
      startNotice ? h(doc, "p", { class: "notice", role: noticeRole }, startNotice) : "",
      h(doc, "div", { class: "field wide" }, h(doc, "label", { for: "cr-task" }, t("create.taskLabel")), taskInput, counter),
      h(doc, "h3", {}, t("create.patternHeading")),
      h(doc, "p", { class: "hint" }, t("create.patternHelp")),
      patternGroup,
      patternNotice,
      providerField,
      h(doc, "h3", {}, t("create.designHeading")),
      editorHost,
      reviewHost,
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
    editorHandle = mountEditor(editorHost, { editor: draft.editor, t, doc, onChange: drawReview, modelUi });
    ctx.onLeave(() => editorHandle.destroy());
    drawPatterns();
    drawReview();
  }

  function beginRun() {
    const design = draft.editor.design();
    const limits = clampLimits(draft.limits);
    // Every agent names its key slot; the run gets the key of each slot in use.
    const used = usedSlots(design);
    const provider = slotProvider(used[0]);
    const keys = Object.fromEntries(used.map((s) => [s, vaultFor(s).getSessionKey()]));
    const apiKey = keys[used[0]];
    const freeTier = used.every(slotIsFree);
    const task = draft.task.trim();
    if (!canRun({ task, apiKey: Object.values(keys).every((k) => k !== null) ? apiKey : null, editorErrors: draft.editor.errors() }).ok) return;

    const id = makeRunId(Date.now());
    const events = [];
    const startedAt = Date.now();
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
    const record = () => buildRunRecord({ id, design, task, events, limits, language: ctx.lang, appVersion: ctx.version, startedAt, endedAt, client, provider, freeTier });
    const saver = createBatchedSaver(ctx.runStore);

    const host = h(doc, "div", { class: "replay-host", "data-ui": "player-host" });
    const after = h(doc, "div", { class: "run-after", "data-ui": "run-after" });
    // How the run ended is shown above the player, so it is the first thing seen when the run is over.
    const outcomeSlot = h(doc, "div", { class: "run-outcome-slot", "data-ui": "run-outcome-slot" });
    root.replaceChildren(outcomeSlot, host, after);
    const live = mountLiveReplay(host, { title: task.split(/\r?\n/)[0].slice(0, 120), pattern: draft.pattern, recordedWith: { provider: providersOf(design, provider).join("+"), model: modelsUsed(design, provider) }, t, doc, onStop: () => activeRun?.stop(), layout: ctx.settings.get().playerLayout, providerColors: ctx.settings.get().providerColors });
    ctx.onLeave(live.destroy);

    let ended = false;
    const finish = async () => {
      if (ended) return;
      ended = true;
      endedAt = Date.now();
      live.end();
      const finalRecord = record();
      await saver.flush();
      const result = await ctx.runStore.save(finalRecord);
      activeRun = null;
      const done = events.at(-1);
      const finalModel = buildResultModel(finalRecord);
      const notice = outcomeNotice({ doc, t, outcome: done?.outcome, events, cost: finalModel.cost, free: finalModel.free });
      notice.id = "run-outcome";
      if (result.ok) refreshResultTab(ctx);
      if (ctx.settings.get().tooltips) {
        const tipNotice = outcomeNotice({ doc, t, outcome: done?.outcome, events, cost: finalModel.cost, free: finalModel.free });
        const tipContent = result.ok ? h(doc, "div", {}, tipNotice, h(doc, "p", { class: "center-tip-link" }, h(doc, "a", { href: `#/play/result/${id}`, "data-ui": "tip-see-result" }, t("create.seeResult")))) : tipNotice;
        // A run that did not finish well keeps its tooltip on the screen until the visitor closes it.
        const tip = showCenterTip({ doc, content: tipContent, sticky: done?.outcome !== "finished", closeLabel: t("about.close"), moveLabel: t("about.move") });
        ctx.onLeave(tip.close);
      }
      outcomeSlot.replaceChildren(notice);
      const children = [];
      if (result.ok) children.push(h(doc, "p", {}, h(doc, "a", { href: `#/play/result/${id}` }, t("create.seeResult"))));
      else children.push(h(doc, "p", { class: "notice", role: "alert" }, t("create.saveFailed")), downloadButton(ctx, finalRecord));
      const again = h(doc, "button", { type: "button", class: "primary" }, t("create.newRun"));
      again.addEventListener("click", () => {
        live.destroy();
        showForm();
      });
      children.push(again);
      after.replaceChildren(...children);
    };

    activeRun = startRun({
      design,
      task,
      limits,
      language: ctx.lang,
      apiKey,
      keys,
      provider,
      onEvent: (event) => {
        events.push(event);
        live.append(event);
        saver.update(record());
      },
    });
    activeRun.done.then(finish, async (error) => {
      activeRun = null;
      live.destroy();
      const code = error instanceof RunStartError ? error.code : "server";
      showForm(t(`run.error.${code}`));
    });
  }

  ctx.doc.title = `${t("create.title")} · ${t("site.name")}`;
  showForm();
}
