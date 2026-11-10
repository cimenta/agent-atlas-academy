// The Create tab: task, pattern, diagram, review, then a live run in the player.
import { h } from "../dom.js";
import { downloadFile } from "../download.js";
import { outcomeNotice } from "../outcome-view.js";
import { MODELS, TASK_MAX_CHARS, LIMIT_MAX } from "../engine/catalog.js";
import { PATTERNS, clampLimits } from "../engine/patterns.js";
import { buildRunRecord, makeRunId } from "../engine/run-record.js";
import { startRun, RunStartError } from "../run-client.js";
import { mountLiveReplay } from "../replay/view.js";
import { createBatchedSaver } from "../storage/runs-store.js";
import { createEditor } from "./editor-model.js";
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

// Kept while the app is open, so a language switch or a visit to another tab does not lose the diagram.
const draft = { task: "", pattern: "sequential", editor: createEditor("sequential"), limits: null };

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
  const { doc, t } = ctx;
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

    // Editor.
    const editorHost = h(doc, "div", { class: "editor-host", "data-ui": "editor" });
    const reviewHost = h(doc, "section", { class: "review", "data-ui": "run-review", "aria-label": t("create.reviewHeading") });
    let editorHandle;

    // Review.
    function drawReview() {
      const design = draft.editor.design();
      const limits = clampLimits(draft.limits);
      const summary = reviewSummary({ design, limits });
      const apiKey = ctx.vault.getSessionKey();
      const verdict = canRun({ task: taskInput.value, apiKey, editorErrors: draft.editor.errors() });

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
              const modelLabel = MODELS.find((m) => m.key === a.model)?.label ?? a.model;
              return h(doc, "li", {}, `${a.label} — ${modelLabel}${a.search ? `, ${t("create.withSearch")}` : ""}`);
            }),
          )
        : h(doc, "p", { class: "hint" }, t("editor.empty"));

      const est = summary.estimate;
      const estimateLines = [
        h(doc, "p", {}, h(doc, "strong", {}, t("create.estimate", { usd: est.costUsd.toFixed(3), date: est.pricesAsOf }))),
        h(doc, "p", { class: "hint" }, t("create.estimateDetail", { tokens: est.tokensUpper, turns: est.activations })),
      ];
      if (summary.hasSearch) estimateLines.push(h(doc, "p", { class: "notice" }, t("create.estimateSearch", { usd: est.searchCostUsd.toFixed(2) })), h(doc, "p", { class: "notice" }, t("editor.searchFee")));

      // Key.
      const keyParts = [];
      if (apiKey === null) {
        if (ctx.vault.hasStoredKey()) {
          const pass = h(doc, "input", { id: "cr-unlock", type: "password", autocomplete: "current-password" });
          const unlock = h(doc, "button", { type: "button" }, t("settings.unlock"));
          const message = h(doc, "p", { class: "notice", role: "alert", hidden: true });
          unlock.addEventListener("click", async () => {
            try {
              await ctx.vault.unlock(pass.value);
              drawReview();
            } catch (error) {
              message.textContent = t(`settings.error.${error?.code ?? "storage"}`);
              message.hidden = false;
            }
          });
          keyParts.push(h(doc, "div", { class: "field" }, h(doc, "label", { for: "cr-unlock" }, t("create.unlockLabel")), pass), unlock, message);
        } else {
          const keyInput = h(doc, "input", { id: "cr-key", type: "password", autocomplete: "off", spellcheck: "false" });
          const save = h(doc, "button", { type: "button" }, t("settings.keySave"));
          save.addEventListener("click", () => {
            if (keyInput.value.trim() === "") return;
            ctx.vault.setSessionKey(keyInput.value.trim());
            drawReview();
          });
          keyParts.push(h(doc, "div", { class: "field" }, h(doc, "label", { for: "cr-key" }, t("create.keyInline")), keyInput), save, h(doc, "p", { class: "hint" }, h(doc, "a", { href: "#/settings" }, t("create.keySettingsLink"))));
        }
      } else {
        keyParts.push(h(doc, "p", {}, t("settings.keyAvailable")));
      }

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
        h(doc, "p", { class: "notice" }, t("create.dataNotice")),
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
      h(doc, "h3", {}, t("create.designHeading")),
      editorHost,
      reviewHost,
    );
    editorHandle = mountEditor(editorHost, { editor: draft.editor, t, doc, onChange: drawReview });
    ctx.onLeave(() => editorHandle.destroy());
    drawPatterns();
    drawReview();
  }

  function beginRun() {
    const design = draft.editor.design();
    const limits = clampLimits(draft.limits);
    const apiKey = ctx.vault.getSessionKey();
    const task = draft.task.trim();
    if (!canRun({ task, apiKey, editorErrors: draft.editor.errors() }).ok) return;

    const id = makeRunId(Date.now());
    const events = [];
    const firstModel = MODELS.find((m) => m.key === design.nodes[0]?.model) ?? MODELS[0];
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
    const record = () => buildRunRecord({ id, design, task, events, limits, language: ctx.lang, appVersion: ctx.version, startedAt, endedAt, client });
    const saver = createBatchedSaver(ctx.runStore);

    const host = h(doc, "div", { class: "replay-host", "data-ui": "player-host" });
    const after = h(doc, "div", { class: "run-after", "data-ui": "run-after" });
    root.replaceChildren(host, after);
    const live = mountLiveReplay(host, { title: task.split(/\r?\n/)[0].slice(0, 120), pattern: draft.pattern, recordedWith: { provider: "anthropic", model: firstModel.id }, t, doc, onStop: () => activeRun?.stop() });
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
      const notice = outcomeNotice({ doc, t, outcome: done?.outcome, events, cost: buildResultModel(finalRecord).cost });
      notice.id = "run-outcome";
      const children = [notice];
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
