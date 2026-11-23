// The run inspector: agent cards, then Steps / Messages / Output for the chosen agent.
// A slim player on top decides how much of the run is revealed (replay), the rest is inspection.
import { providerSpec, freeSlotOf } from "../engine/providers.js";
import { h } from "../dom.js";
import { helpIcon } from "../help-popup.js";
import { validateRun } from "../run-schema.js";
import { createPlayer } from "./player.js";
import { debateProgress, deriveInspector, designLabel, evaluatorProgress, handoffOutcome, handoffProgress, handoffSender, loopOutcome, routerChoice, routerEnd, votingEnd, votingTally, partsOf, planOf, runsOfNode, dynamicEnd, createdOf, refusalsOf } from "./inspect-model.js";
import { createdPanel } from "./created-view.js";
import { designWithCreated } from "../engine/created.js";
import { createViewer } from "./viewer.js";
import { apiCallsOf, apiView } from "./api-view.js";
import { settingsView } from "./settings-view.js";
import { PROVIDERS } from "../engine/providers.js";
import { isSlot, slotIsFree } from "../key-slots.js";
import { markText, searchBar } from "../text-search.js";
import { definitionFromRun } from "../create/definition.js";
import { openInCreate } from "../create/draft.js";
import { downloadFile, safeFileName } from "../download.js";
import { stepDetail } from "./step-detail.js";
import { contextOf } from "./context-model.js";
import { notebookOf } from "./notebook-model.js";
import { notebookPanel } from "./notebook-view.js";
import { condensesOf } from "./condense-model.js";
import { condensePanel } from "./condense-view.js";
import { dynamicPanel } from "./dynamic-view.js";
import { MULTI_RUN, nodeIdOf } from "../engine/spawn.js";
import { contextView } from "./context-view.js";
import { paintModelTag } from "../provider-colors.js";
import { createAboutPanel } from "./about.js";
import { createRunMenu } from "./run-menu.js";
import { retryChoices } from "./retry-choice.js";
import { limitsChoice } from "./limits-choice.js";
import { canSubmit, submitRun } from "../submit-run.js";
import { runForExport } from "../run-export.js";
import { createReplayDiagram, ROUND_MARK } from "./diagram.js";
import { createHoverCard } from "./hover-card.js";
import { describeOutcome } from "../create/create-model.js";
import { outcomeNotice, loopNotice, handoffNotice, handoffPathView, routerNotice, votingNotice, dynamicNotice } from "../outcome-view.js";
import { buildResultModel } from "../play-model.js";
import { clearActivePlayer, setActivePlayer } from "../shortcuts.js";
import { pickNeighbour } from "./spatial.js";

const STATUS_KEY = {
  waiting: "player.statusWaiting",
  idle: "player.statusIdle",
  unreached: "player.statusUnreached",
  stopped: "player.statusStopped",
  working: "player.statusWorking",
  done: "player.statusDone",
  error: "player.statusError",
};
const KIND_KEY = { model: "kind.model", tool: "kind.tool", handoff: "kind.handoff", title: "kind.title", check: "kind.check" };

// Glyphs of the small player buttons (plain text, so no icon font is needed).
const GLYPH = { play: "▶", pause: "❚❚", stop: "■", restart: "↺", previous: "‹", next: "›" };

const defaultClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
};

// The provider as it is written in a sentence: anthropic becomes Anthropic.
const PROVIDER_NAMES = { anthropic: "Anthropic", openai: "OpenAI", gemini: "Gemini", google: "Google" };
const oneProviderName = (id) => PROVIDER_NAMES[id] ?? (typeof id === "string" && id !== "" ? id[0].toUpperCase() + id.slice(1) : "");
// A run that mixed providers has them joined with a plus sign.
const providerName = (id) => (typeof id === "string" ? id.split("+").map(oneProviderName).join(" + ") : "");
// The date and time a message happened, to the second.
function clockTime(ms) {
  try {
    return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}
const fmt = (ms) => (ms == null ? "" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

function mountError(container, doc, t, errors) {
  const list = h(doc, "ul", {});
  for (const message of errors) list.append(h(doc, "li", {}, message));
  container.replaceChildren(
    h(
      doc,
      "section",
      { class: "replay replay-error", role: "alert" },
      h(doc, "p", {}, t("error.invalidRun")),
      h(doc, "details", {}, h(doc, "summary", {}, t("error.details")), list),
    ),
  );
  return { destroy: () => container.replaceChildren() };
}

// The heading of a replay is the task the run was given (its first line), or the run's title.
export function headingOf(run) {
  const task = run.events.find((e) => e.type === "run_start")?.task;
  const line = typeof task === "string" ? task.split(/\r?\n/)[0].trim() : "";
  if (!line) return run.title;
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

export function mountReplay(container, { run, explanations = {}, t, doc = document, clock = defaultClock, autoStart = true, timeScale = 1, onAboutSave = null, onDelete = null, layout = "bar", providerColors, onRetry = null, suggestFallback = false, limitsInfo = null }) {
  const validation = validateRun(run);
  if (!validation.ok) return mountError(container, doc, t, validation.errors);
  return mountView(container, { exportRun: run, pattern: run.pattern, events: run.events, apiCalls: Array.isArray(run.apiCalls) ? run.apiCalls : [], apiCallsDropped: run.apiCallsDropped === true, title: headingOf(run), recordedWith: run.recordedWith, explanations, t, doc, clock, autoStart, timeScale, live: false, onAboutSave, onDelete, layout, providerColors, onRetry, suggestFallback, limitsInfo });
}

// A player that shows a run while it is still arriving. Events are added with append(), end() closes it.
export function mountLiveReplay(container, { title, pattern, recordedWith, apiCalls = [], t, doc = document, clock = defaultClock, onStop = () => {}, layout = "bar", providerColors, onRetry = null, suggestFallback = false, limitsInfo = null, clockStartMs = 0 }) {
  const view = mountView(container, { clockStartMs, events: [], apiCalls, pattern, title, recordedWith, explanations: {}, t, doc, clock, autoStart: false, timeScale: 1, live: true, onStop, layout, providerColors, onRetry, suggestFallback, limitsInfo });
  return {
    append: (event) => view.player.append(event),
    end: () => view.player.endLive(),
    destroy: () => view.destroy(),
  };
}

function mountView(container, { clockStartMs = 0, exportRun, pattern, events, apiCalls = [], apiCallsDropped = false, title, recordedWith, explanations, t, doc, clock, autoStart, timeScale, live, onStop, onAboutSave = null, onDelete = null, layout = "bar", providerColors, onRetry = null, suggestFallback = false, limitsInfo = null }) {
  const player = createPlayer({ events, clock, timeScale, live });
  const ui = { agent: null, tab: "steps", step: null, round: null, follow: true };
  const viewer = createViewer({ doc, t });
  let state = deriveInspector(events, 0);

  const definition = exportRun ? definitionFromRun(exportRun) : null;

  // The About panel: read by everyone, edited only where a save function is given (the visitor's own runs).
  const aboutPanel = exportRun
    ? createAboutPanel({
        doc,
        t,
        getAbout: () => exportRun.about ?? null,
        editable: typeof onAboutSave === "function",
        onSave: async (about) => {
          const result = await onAboutSave(about);
          if (result?.ok) {
            if (about) exportRun.about = about;
            else delete exportRun.about;
          }
          return result;
        },
      })
    : null;
  // The cog in the corner of the player head opens the run menu: About, the two exports, and Delete for your own runs.
  const runMenu = exportRun
    ? createRunMenu({
        doc,
        t,
        getItems: () => [
          { ui: "run-about", label: t("player.about"), hint: t("player.aboutHint"), onClick: () => aboutPanel.toggle() },
          { ui: "export-json", label: t("player.export"), hint: t("player.exportHint"), onClick: () => downloadFile(doc, `${safeFileName(exportRun.id)}.json`, JSON.stringify(runForExport(exportRun), null, 2), "application/json") },
          ...(definition ? [{ ui: "use-in-create", label: t("player.useInCreate"), hint: t("player.useInCreateHint"), onClick: () => openInCreate(doc, t, definition) }] : []),
          ...(definition ? [{ ui: "export-definition", label: t("player.exportDefinition"), hint: t("player.exportDefinitionHint"), onClick: () => downloadFile(doc, `${safeFileName(exportRun.id)}-definition.json`, JSON.stringify(definition, null, 2), "application/json") }] : []),
          ...(typeof onDelete === "function" && canSubmit(exportRun) ? [{ ui: "submit-run", label: t("player.submit"), hint: t("player.submitHint"), onClick: () => submitRun(doc, t, exportRun) }] : []),
          ...(typeof onDelete === "function" ? [{ ui: "run-delete", label: t("play.delete"), hint: t("player.deleteHint"), danger: true, onClick: () => onDelete() }] : []),
        ],
      })
    : null;
  const exportButton = runMenu ? runMenu.element : "";
  // Small icon buttons; the full name is the tooltip and the accessible label.
  const iconButton = (attrs, glyph, name) => h(doc, "button", { type: "button", title: name, "aria-label": name, ...attrs }, glyph);
  const playButton = iconButton({ class: "ib primary", "data-ui": "play-button" }, GLYPH.play, t("player.play"));
  const liveBadge = h(doc, "span", { class: "live-badge", "data-ui": "live-badge" }, t("player.live"));
  const stopButton = iconButton({ class: "ib danger", "data-ui": "stop-button" }, GLYPH.stop, t("player.stop"));
  // The time a live run has taken, ticking next to Stop; it goes away when the run is over (Re-play shows the whole time then).
  const elapsed = h(doc, "span", { class: "clk-pill", "data-ui": "live-clock", title: t("player.clockHelp"), hidden: !live });
  const startedAt = Date.now() - clockStartMs;
  let tickTimer = null;
  const tick = () => {
    tickTimer = null;
    if (!player.live) {
      elapsed.hidden = true;
      return;
    }
    const sec = Math.floor((Date.now() - startedAt) / 1000);
    elapsed.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    tickTimer = clock.setTimeout(tick, 500);
  };
  if (live) tick();
  const restartButton = iconButton({ class: "ib", "data-ui": "restart-button" }, GLYPH.restart, t("player.restart"));
  const previousButton = iconButton({ class: "ib", "data-ui": "previous-button" }, GLYPH.previous, t("player.previous"));
  const nextButton = iconButton({ class: "ib", "data-ui": "next-button" }, GLYPH.next, t("player.next"));
  const sideLayout = layout === "side";
  // A ? that opens a section of Help.
  const help = (id, name) => helpIcon({ doc, t, id, name });
  const speedHelp = help("replay-speed", t("player.speedLabel"));
  // Side layout: one button that cycles through the speeds. Bar layout: a small button for every speed.
  const speedButtons = sideLayout ? [] : player.speeds.map((speed) => h(doc, "button", { type: "button", "data-speed": speed }, t("player.speedOption", { speed })));
  const speedGroup = sideLayout
    ? iconButton({ class: "ib speed-cycle", "data-ui": "speed-cycle" }, "", t("player.speedLabel"))
    : h(doc, "div", { class: "speed", "data-ui": "speed-buttons", role: "group", "aria-label": t("player.speedLabel") }, ...speedButtons);
  // On a narrow screen the bar shows one button that cycles through the speeds instead of one for each.
  const speedMobile = sideLayout ? null : iconButton({ class: "ib speed-mobile", "data-ui": "speed-cycle-mobile" }, "", t("player.speedLabel"));
  const range = h(doc, "input", { type: "range", "data-ui": "player-slider", min: 0, max: events.length, step: 1, value: 0, "aria-label": t("player.progress") });
  const status = h(doc, "div", { class: "status", "data-ui": "player-status", "aria-live": "polite" });
  const banners = h(doc, "div", { class: "banners", "data-ui": "run-banners" });
  // The shared notebook, when the run had it: the notes written so far.
  const notebookHost = h(doc, "div", { class: "notebook-host", "data-ui": "notebook-host" });
  // What was shortened before an agent read it (condensing), and which full texts are open.
  const condenseHost = h(doc, "div", { class: "condense-host", "data-ui": "condense-host" });
  const dynamicHost = h(doc, "div", { class: "dynamic-host", "data-ui": "dynamic-host" });
  // The agents that were created while the run was going sit under the diagram, as the mockup draws them.
  const createdHost = h(doc, "div", { class: "dynamic-host", "data-ui": "created-host" });
  const openCondense = new Set();
  const chips = h(doc, "div", { class: "chips", "data-ui": "agent-cards", role: "list", "aria-label": t("player.agents") });
  // While a run is live the diagram carries only the time and Stop, in its top right corner: play, speed, restart, previous, next and the slider
  // have nothing to do until the run is over.
  const liveCorner = h(doc, "div", { class: "live-corner", "data-ui": "live-corner", hidden: !live }, elapsed, stopButton);
  const chipsBox = h(doc, "div", { class: "chips-box" }, chips, liveCorner);
  const tabButtons = ["steps", "messages", "output", "context", "api", "settings"].map((name) => {
    const button = h(doc, "button", { type: "button", class: "tab", role: "tab", "data-tab": name, "data-ui": `tab-${name}` }, name === "api" ? t("player.tabApi", { n: 0 }) : t({ steps: "player.tabSteps", messages: "player.tabMessages", output: "player.tabOutput", context: "player.tabContext", settings: "player.tabSettings" }[name]));
    button.addEventListener("click", () => {
      ui.tab = name;
      ui.follow = false;
      render();
    });
    return button;
  });
  const tabHelpNames = { steps: "player.tabSteps", messages: "player.tabMessages", output: "player.tabOutput", context: "player.tabContext", api: "player.tabApiName", settings: "player.tabSettings" };
  const tabs = h(doc, "div", { class: "tabs", "data-ui": "inspector-tabs", role: "tablist" }, ...tabButtons.flatMap((button) => {
    const name = button.getAttribute("data-tab");
    return [button, help(`replay-${name}`, t(tabHelpNames[name]))];
  }));
  const body = h(doc, "div", { class: "inspect-body", "data-ui": "inspector-body", tabindex: "-1" });
  // The search box in the site header searches the text of the tab that is open.
  let drawBody = () => {};
  const search = searchBar({
    doc,
    t,
    ui: "inspector-search",
    header: true,
    placeholder: t("play.searchRun"),
    apply: (q) => {
      drawBody();
      return markText(doc, body, q);
    },
  });
  const tabRow = h(doc, "div", { class: "tab-row", "data-ui": "inspector-tab-row" }, tabs);

  // A run that did not finish well says so above the player, with the same message the Create tab shows.
  const doneEvent = events.findLast((e) => e?.type === "done");
  let outcomeBar = "";
  if (exportRun && doneEvent && doneEvent.outcome !== "finished") {
    let cost = null;
    try {
      cost = buildResultModel(exportRun).cost;
    } catch {
      cost = null;
    }
    outcomeBar = outcomeNotice({ doc, t, outcome: doneEvent.outcome, events, cost });
  }

  // The word before the title ("Replay:") is its own span, so it can blink blue while the run plays.
  function headingParts() {
    const full = t(live ? "player.titleLive" : "player.title", { title });
    const at = typeof title === "string" && title !== "" ? full.indexOf(title) : -1;
    // A finished run starts with a round mark that says how it ended: green tick, orange ! (stopped, a limit) or red cross (failed).
    const ended = live ? null : events.findLast?.((e) => e?.type === "done")?.outcome;
    const info = ended ? describeOutcome({ outcome: ended, events, cost: null }) : null;
    const mark = info ? [h(doc, "span", { class: `outcome-icon ${info.level} title-mark`, role: "img", "aria-label": t(`run.outcome.icon.${info.level}`), title: t(`run.outcome.icon.${info.level}`), "data-ui": "run-ended-mark" }, info.icon)] : [];
    if (at <= 0) return [...mark, full];
    return [...mark, h(doc, "span", { class: "replay-word", "data-ui": "replay-word" }, full.slice(0, at)), full.slice(at)];
  }
  // The type chip and the "recorded with" text explain themselves when the pointer rests on them.
  const chipCard = createHoverCard({ doc });
  const patternChip = pattern ? h(doc, "span", { class: `type-chip type-${pattern}`, "data-ui": "player-pattern", tabindex: "0" }, t(`pattern.${pattern}`)) : "";
  if (pattern) {
    const about = t(`create.pattern.${pattern}`);
    chipCard.attach(patternChip, () => ({ title: t(`pattern.${pattern}`), text: about === `create.pattern.${pattern}` ? t("diagram.hover.typeChip") : about }));
  }
  const recordedText = h(doc, "span", { class: "recorded", "data-ui": "recorded-with", tabindex: "0" }, t("player.recordedWith", { provider: providerName(recordedWith.provider) }));
  chipCard.attach(recordedText, () => ({ title: t("player.recordedWith", { provider: providerName(recordedWith.provider) }), text: t("diagram.hover.recorded"), rows: [recordedWith.model ? [t("diagram.hover.model"), String(recordedWith.model)] : null] }));
  const root = h(
    doc,
    "section",
    { class: "replay", "data-ui": "player", "aria-label": t(live ? "player.titleLive" : "player.title", { title }) },
    outcomeBar,
    h(
      doc,
      "div",
      { class: "player-head", "data-ui": "player-head" },
      h(doc, "div", { class: "player-title" }, h(doc, "h2", {}, ...headingParts()), h(doc, "div", { class: "player-chips" }, liveBadge, patternChip, recordedText)),
      exportButton,
    ),
    aboutPanel ? aboutPanel.element : "",
    banners,
    dynamicHost,
    notebookHost,
    condenseHost,
    // Side layout: the buttons form a narrow column to the right of the diagram, slider and status.
    // Bar layout: one slim line under the diagram holds buttons, slider and speed.
    ...(sideLayout
      ? [h(doc, "div", { class: "player-row", "data-ui": "player-row" }, h(doc, "div", { class: "player-stage" }, chipsBox, range, status), h(doc, "div", { class: "controls controls-col", "data-ui": "player-controls" }, playButton, restartButton, previousButton, nextButton, speedGroup, speedHelp))]
      : [chipsBox, h(doc, "div", { class: "controls controls-bar", "data-ui": "player-controls" }, playButton, restartButton, previousButton, nextButton, range, speedGroup, speedMobile, speedHelp), status]),
    createdHost,
    tabRow,
    body,
  );
  container.replaceChildren(root);

  // A parameter that is { key } is a text of its own, translated first (the kind and the place of a guardrail).
  const label = (value) => (typeof value === "string" ? value : value ? t(value.key, Object.fromEntries(Object.entries(value.params ?? {}).map(([k, v]) => [k, v !== null && typeof v === "object" && typeof v.key === "string" ? t(v.key) : v]))) : "");

  // The status of an agent that was cut off: which limit (or you) stopped it.
  function stoppedText(a) {
    const key = `player.stopReason.${a.stopReason}`;
    const reason = t(key);
    return t("player.statusStopped", { reason: reason === key ? t("player.stopReason.limit") : reason });
  }

  // What an agent that never started shows once the run is over: not called (the run finished without it, as in a
  // supervisor run) or not reached (the run stopped before it). While the run goes on, or waits for approval, it is waiting.
  function idleStatus() {
    if (!state.finished || state.outcome === "waiting_approval") return "waiting";
    return state.outcome === "finished" ? "idle" : "unreached";
  }

  function currentAgent() {
    if (ui.agent && state.agents[ui.agent]) return state.agents[ui.agent];
    return state.agents[state.order[0]] ?? null;
  }

  function followPlayer() {
    if (!ui.follow) return;
    const working = state.order.find((id) => state.agents[id].status === "working");
    const last = [...events.slice(0, player.cursor)].reverse().find((e) => typeof (e.agent ?? e.from) === "string");
    ui.agent = working ?? (last ? (last.agent ?? last.from) : null) ?? state.order[0] ?? null;
    ui.step = null;
    ui.round = null;
  }

  // The diagram replaces the agent cards when the run recorded its design (the same picture as on the Create tab).
  let diagram = null;
  let diagramDesign = null;
  let failedAtEnd = null;
  // The design of the run as it is at the cursor: the agents that were created by then are nodes too. The same object is
  // returned until another agent is created, so the diagram is only built again when something appears.
  let designMemo = { base: null, count: -1, design: null };
  function cursorNow() {
    try {
      return player.cursor;
    } catch {
      return events.length;
    }
  }
  function designOfRun() {
    const d = events.find((e) => e.type === "run_start")?.design;
    if (!(d && Array.isArray(d.nodes) && Array.isArray(d.edges) && d.nodes.length > 0)) return null;
    const cursor = cursorNow();
    const count = events.slice(0, cursor).filter((e) => e.type === "agent_created").length;
    if (designMemo.base !== d || designMemo.count !== count) designMemo = { base: d, count, design: designWithCreated(d, events, cursor) };
    return designMemo.design;
  }
  // In a debate the generic words are wrong: the judge takes no part in the rounds, and every argument goes to the judge but is read only at the end.
  function debateWords(design, node, status) {
    if (design.pattern !== "debate" || !node) return null;
    if (node.agent === "judge") return t(`diagram.hover.debate.judge.${["waiting", "working", "done"].includes(status) ? status : "other"}`);
    if (node.agent === "debater") return t(`diagram.hover.debate.debater.${["waiting", "working", "done"].includes(status) ? status : "other"}`);
    return null;
  }
  function debateArrow(design, from, to, flow) {
    if (design.pattern !== "debate") return {};
    const names = { from: designLabel(design, from), to: designLabel(design, to) };
    const kindTo = design.nodes.find((n) => n.id === to)?.agent;
    if (kindTo === "judge") return { text: t(`diagram.hover.debate.toJudge.${flow}`, names) };
    if (kindTo === "debater") return { text: t("diagram.hover.debate.turn", names) };
    return {};
  }
  function renderDiagram() {
    const design = designOfRun();
    if (!design) return false;
    if (!diagram || diagramDesign !== design) {
      try {
        const wide = (doc.defaultView?.innerWidth ?? 1024) >= 720;
        diagram = createReplayDiagram({
          startLabel: `▶ ${t("editor.startFlag")}`,
          doc,
          design,
          createdText: t("player.created"),
          warnLabel: t("replay.warningHelp"),
          errorLabel: t("replay.errorMark"),
          freePlaceText: (n, max) => t("player.freePlace", { n, max }),
          wide,
          boxLabel: (id) => designLabel(design, id),
          statusText: (a) => (a.status === "stopped" ? stoppedText(a) : `${t(STATUS_KEY[a.status])}${a.ms ? ` · ${fmt(a.ms)}` : ""}`),
          explain: {
            node: (id, st, node) => {
              const status = st.status in STATUS_KEY ? st.status : "waiting";
              const help = node?.agent && node.created !== true && node.agent !== "free" ? t(`agent.${node.agent}.help`) : null;
              return {
                title: designLabel(design, id),
                badge: t(STATUS_KEY[status]),
                text: help,
                extra: debateWords(design, node, status) ?? t(`diagram.hover.state.${status}`),
                rows: [st.ms ? [t("diagram.hover.time"), fmt(st.ms)] : null, st.errors > 0 ? [t("diagram.hover.errors"), String(st.errors)] : null, st.warnings > 0 ? [t("diagram.hover.warnings"), String(st.warnings)] : null],
              };
            },
            badge: ({ text, help }) => ({ title: text, text: help }),
            arrow: (from, to, flow) => ({
              ...debateArrow(design, from, to, flow),
              title: t("diagram.hover.arrowTitle", { from: designLabel(design, from), to: designLabel(design, to) }),
              badge: t(`diagram.hover.arrowBadge.${flow}`),
              text: t(`diagram.hover.arrow.${flow}`, { from: designLabel(design, from), to: designLabel(design, to) }),
            }),
          },
          onRetry,
          retryLabel: t("player.retry"),
          retryMenu: onRetry
            ? {
                arrowLabel: t("player.retryMenu"),
                title: t("player.retryMenuTitle"),
                providerName: (p) => providerSpec(p).chipName,
                tagText: (c) => (c.suggested ? `${t("player.retrySuggested")} · ` : "") + (c.current ? t("player.retryTagFailed") : freeSlotOf(c.provider) !== null ? t(c.free ? "player.retryTagFree" : "player.retryTagPaid") : t("player.retryTagPaid")),
                choicesOf: (id) => retryChoices(design, id, String(recordedWith?.provider ?? "anthropic").split("+")[0], { suggest: suggestFallback }),
                extra: limitsInfo ? () => limitsChoice({ doc, t, ...limitsInfo() }) : null,
              }
            : null,
          onSelect: (id) => {
            // The box of a node that runs once for every part or step shows its first run.
            const first = state.order.find((x) => x.startsWith(`${id}#`));
            Object.assign(ui, { agent: first ?? id, follow: false, step: null, round: null });
            render();
          },
        });
        diagramDesign = design;
        chips.replaceChildren(diagram.element);
      } catch {
        diagram = null;
        return false;
      }
    }
    const debate = debateProgress(events, player.cursor);
    const evaluating = evaluatorProgress(events, player.cursor);
    const handing = handoffProgress(events, player.cursor);
    const routing = routerChoice(events, player.cursor);
    // Once the tally has decided, the voters that agree say so and the one that differs is dimmed; the tally shows the count.
    const voted = votingTally(events, player.cursor);
    const marks = new Map();
    if (voted) {
      for (const node of diagramDesign.nodes) {
        if (node.agent === "tally") marks.set(node.id, { text: t("player.voteTally", { votes: voted.votes, total: voted.total }) });
        else marks.set(node.id, voted.agree.includes(node.id) ? { text: t("player.voteAgrees") } : { text: t("player.voteDiffers"), dissent: true });
      }
    }
    // A node that runs once for every part or step is one box with a badge (x4) and a line such as "3 of 4 done".
    const runs = new Map();
    for (const node of diagramDesign.nodes) {
      if (node.agent !== MULTI_RUN[diagramDesign.pattern]) continue;
      const r = runsOfNode(events, node.id, player.cursor);
      if (r.total === 0) continue;
      const mine = state.order.filter((x) => x.startsWith(`${node.id}#`)).map((x) => state.agents[x]);
      const status = mine.some((a) => a.status === "error") ? "error" : r.done >= r.total ? "done" : r.started > 0 ? "working" : "waiting";
      const text = diagramDesign.pattern === "mapreduce" ? t("player.partsDone", { done: r.done, total: r.total }) : r.done >= r.total ? t("player.stepsDone", { total: r.total }) : t("player.stepOf", { n: Math.min(r.total, Math.max(1, r.started)), total: r.total });
      runs.set(node.id, { status, text, badge: `×${r.total}`, total: r.total, started: r.started, done: r.done });
    }
    const dynBadge = (() => {
      const r = [...runs.values()][0];
      if (!r) return "";
      return diagramDesign.pattern === "mapreduce" ? t("player.partsBadge", { n: r.total }) : t("player.stepBadge", { n: Math.min(r.total, Math.max(1, r.started)), total: r.total });
    })();
    // In a recorded (not live) run, the agents that failed at its end are marked from the start.
    if (!live && failedAtEnd === null) {
      const whole = deriveInspector(events);
      failedAtEnd = new Set(whole.order.filter((id) => whole.agents[id].status === "error"));
    }
    diagram.update({
      idleStatus: idleStatus(),
      events,
      cursor: player.cursor,
      state,
      failed: live ? null : failedAtEnd,
      selectedId: currentAgent()?.id ?? null,
      marks,
      runs,
      notes: notebookMarks(),
      badgeText: voted
        ? t("player.votes", { votes: voted.votes, total: voted.total })
        : routing
        ? t("player.routedTo", { name: designLabel(diagramDesign, routing.to) })
        : debate
        ? debate.verdict
          ? t("player.debateVerdict")
          : t("player.debateRound", { n: ROUND_MARK, total: debate.rounds })
        : handing
          ? t("player.handoffHolder", { name: designLabel(diagramDesign, handing.holder) }) + ` · ${t("player.handoffCount", { n: handing.handoffs })}`
          : evaluating
          ? t("player.debateRound", { n: ROUND_MARK, total: evaluating.rounds }) + (evaluating.phase === "judging" ? ` · ${t(diagramDesign.selfCritique === true ? "player.selfJudging" : "player.evaluatorJudging")}` : "")
          : dynBadge,
      badgeHelp: voted ? t("diagram.hover.badge.votes") : routing ? t("diagram.hover.badge.routed") : debate ? t(debate.verdict ? "diagram.hover.badge.verdict" : "diagram.hover.badge.round") : handing ? t("diagram.hover.badge.handoff") : evaluating ? t("diagram.hover.badge.loop") : dynBadge ? t(diagramDesign.pattern === "mapreduce" ? "diagram.hover.badge.parts" : "diagram.hover.badge.steps") : "",
      badgeNumber: debate ? (debate.verdict ? undefined : debate.round) : evaluating ? evaluating.round : undefined,
    });
    return true;
  }

  // What the agents did with the notebook so far: "wrote 2", "read 3", shown on the diagram next to the status.
  function notebookMarks() {
    const book = notebookOf(events, player.cursor);
    const marks = new Map();
    for (const item of condensesOf(events, player.cursor)) marks.set(item.agent, t("player.condensed"));
    if (!book.on) return marks;
    for (const [id, n] of book.perAgent) {
      const parts = [];
      if (n.wrote > 0) parts.push(t("player.notebookWrote", { n: n.wrote }));
      if (n.read > 0) parts.push(t("player.notebookRead", { n: n.read }));
      if (marks.has(id)) parts.push(marks.get(id));
      if (parts.length > 0) marks.set(id, parts.join(" · "));
    }
    return marks;
  }

  function renderNotebook() {
    const book = notebookOf(events, player.cursor);
    const design = designOfRun();
    const panel = book.on ? notebookPanel({ doc, t, notes: book.notes, label: (id) => state.agents[id]?.label ?? (design ? designLabel(design, id) : id), help: help("create-memory", t("create.notebook")) }) : null;
    notebookHost.replaceChildren(...(panel ? [panel] : []));
  }

  function renderDynamic() {
    const design = designOfRun();
    const label = (id) => state.agents[id]?.label ?? (design ? designLabel(design, nodeIdOf(id)) : id);
    const panel = dynamicPanel({
      doc,
      t,
      parts: partsOf(events, player.cursor),
      plan: planOf(events, player.cursor),
      label,
      select: (id) => {
        Object.assign(ui, { agent: id, follow: false, step: null, round: null });
        render();
      },
    });
    // Agents that a Supervisor or Planner created while the run was going.
    const made = createdOf(events, player.cursor);
    const refusals = refusalsOf(events, player.cursor);
    const cap = Math.max(0, ...(design?.nodes ?? []).map((n) => n.creates?.max ?? 0));
    const created = createdPanel({ doc, t, items: made, refusals, max: cap, label, select: (id) => {
      Object.assign(ui, { agent: id, follow: false, step: null, round: null });
      render();
    } });
    dynamicHost.replaceChildren(...(panel ? [panel] : []));
    createdHost.replaceChildren(...(created ? [created] : []));
  }

  function renderCondense() {
    const design = designOfRun();
    const panel = condensePanel({
      doc,
      t,
      items: condensesOf(events, player.cursor),
      label: (id) => state.agents[id]?.label ?? (design ? designLabel(design, id) : id),
      num: (n) => new Intl.NumberFormat(doc.documentElement?.lang || undefined).format(n),
      isOpen: (i) => openCondense.has(i),
      toggle: (i) => {
        if (openCondense.has(i)) openCondense.delete(i);
        else openCondense.add(i);
        renderCondense();
      },
    });
    condenseHost.replaceChildren(...(panel ? [panel] : []));
  }

  function renderChips() {
    if (renderDiagram()) return;
    const agent = currentAgent();
    const nodes = [];
    state.order.forEach((id, i) => {
      const a = state.agents[id];
      if (i > 0) nodes.push(h(doc, "span", { class: "arrow", "aria-hidden": "true" }, "→"));
      // While the agent works, the tools it may use. Once it is done, only the tools it did use.
      const usedCount = (name) => a.steps.filter((x) => x.kind === "tool" && x.tool === name).length;
      const used = a.tools.filter((name) => usedCount(name) > 0).map((name) => `${name} ×${usedCount(name)}`).join(", ");
      const tools = a.status === "done" ? used || t("insp.noToolsUsed") : a.tools.length === 0 ? t("insp.noTools") : a.tools.join(", ");
      const chip = h(
        doc,
        "button",
        { type: "button", class: `ag${agent && agent.id === id ? " sel" : ""}`, "data-ui": `agent-card-${id}`, role: "listitem", "data-status": a.status, "aria-pressed": String(agent?.id === id) },
        h(doc, "span", { class: "n" }, a.label),
        h(doc, "span", { class: "tl" }, tools),
        h(doc, "span", { class: `st ${a.status}` }, a.status === "stopped" ? stoppedText(a) : `${t(STATUS_KEY[a.status])}${a.ms ? ` · ${fmt(a.ms)}` : ""}`),
      );
      chip.addEventListener("click", () => {
        Object.assign(ui, { agent: id, follow: false, step: null, round: null });
        render();
      });
      nodes.push(chip);
    });
    chips.replaceChildren(...nodes);
  }

  function renderSteps(agent) {
    const total = agent.steps.length;
    const selected = total ? (ui.step === null ? total - 1 : Math.min(ui.step, total - 1)) : -1;
    const list = agent.steps.map((step, i) => {
      const button = h(
        doc,
        "button",
        { type: "button", class: `step${i === selected ? " sel" : ""}${step.refused ? " refused" : ""}${step.kind === "check" ? (step.action === "noted" ? " check-note" : step.ok ? " check-ok" : " check-bad") : ""}`, "data-kind": step.kind, "aria-current": i === selected ? "step" : undefined },
        h(doc, "span", { class: "tg", "data-kind": step.kind }, t(KIND_KEY[step.kind] ?? "kind.model")),
        h(doc, "span", { class: "ti" }, label(step.title)),
        h(doc, "span", { class: "ms", title: step.ms == null && step.server ? t("insp.inModelHint") : undefined }, step.ms != null ? fmt(step.ms) : step.server ? t("insp.inModel") : ""),
      );
      button.addEventListener("click", () => {
        ui.step = i;
        ui.follow = false;
        render();
      });
      return button;
    });
    const modelTag = agent.model ? h(doc, "span", { class: "badge agent-model" }, agent.model) : "";
    if (modelTag) paintModelTag(modelTag, agent.model, providerColors);
    const head = h(doc, "p", { class: "agenthead" }, `${t("insp.stepsOf")} `, h(doc, "b", {}, agent.label), modelTag);
    const left = h(doc, "div", { "data-ui": "step-list" }, head, ...list);
    if (agent.status === "working") left.append(h(doc, "div", { class: "working" }, t("insp.working")));

    const step = agent.steps[selected];
    const right = h(doc, "div", { class: "box", "data-ui": "step-detail" }, h(doc, "p", { class: "lb" }, t("insp.whatHappens")));
    if (!step) {
      right.append(h(doc, "p", { class: "doc" }, t("insp.noSteps")));
    } else {
      right.append(
        stepDetail({
          doc,
          t,
          step,
          why: explanations[String(step.eventIndex)],
          viewer,
          viewerId: `s-${agent.id}-${selected}`,
          fmt,
          waiting: agent.status === "working" ? t("insp.waitingRes") : "—",
          onShowMessages:
            step.kind === "model"
              ? () => {
                  Object.assign(ui, { tab: "messages", round: Math.max(0, (step.title.params?.n ?? 1) - 1), follow: false });
                  render();
                }
              : undefined,
        }),
      );
    }
    return h(doc, "div", { class: "cols" }, left, right);
  }

  const blockText = (b) => {
    if (b.type === "text") return b.text;
    if (b.type === "tool_use" || b.type === "server_tool_use") return `${b.name}(${JSON.stringify(b.input)})`;
    if (b.type === "web_search_tool_result") return Array.isArray(b.content) ? b.content.map((r) => `${r.title} – ${r.url}`).join("\n") : JSON.stringify(b.content);
    return JSON.stringify(b);
  };
  const blockEl = (b) => h(doc, "div", { class: "bl" }, h(doc, "span", { class: "bt" }, b.type), b.type === "web_search_tool_result" ? h(doc, "span", { class: "tag-untrusted" }, t("insp.untrusted")) : "", blockText(b));
  const messageEl = (m, isNew, tag) => {
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    return h(
      doc,
      "div",
      { class: `mc${isNew ? " nw" : ""}` },
      h(doc, "span", { class: `rl ${m.role}` }, m.role),
      tag ? h(doc, "span", { class: "rl hf" }, tag) : "",
      isNew ? h(doc, "span", { class: "lb" }, t("insp.newIn")) : "",
      ...blocks.map(blockEl),
    );
  };

  function renderMessages(agent) {
    const system = h(doc, "div", { class: "mc sysbox", "data-ui": "system-prompt" }, h(doc, "span", { class: "lb" }, t("insp.sysPrompt")), h(doc, "div", { class: "pre" }, agent.system || "—"));
    if (agent.rounds.length === 0) return h(doc, "div", {}, agent.system ? system : "", h(doc, "p", { class: "doc" }, t("insp.noCalls")));
    const index = ui.round === null ? agent.rounds.length - 1 : Math.min(ui.round, agent.rounds.length - 1);
    const round = agent.rounds[index];
    const firstTag = agent.from ? t("insp.handoffFrom", { name: state.agents[agent.from]?.label ?? agent.from }) : t("insp.userInput");
    const buttons = agent.rounds.map((r, i) => {
      const button = h(doc, "button", { type: "button", class: i === index ? "sel" : "" }, `${t("insp.round")} ${r.n}`);
      button.addEventListener("click", () => {
        ui.round = i;
        ui.follow = false;
        render();
      });
      return button;
    });
    // In a handoff run every message that carries a note says who handed it over; the first message of the start agent is the task.
    const isHandoff = designOfRun()?.pattern === "handoff";
    const tagOf = (m, i) => {
      if (!isHandoff) return i === 0 ? firstTag : "";
      const sender = handoffSender(typeof m.content === "string" ? m.content : "");
      return sender ? t("insp.handoffFrom", { name: sender }) : i === 0 ? t("insp.userInput") : "";
    };
    const sent = round.messages.map((m, i) => messageEl(m, index > 0 && i >= round.before, tagOf(m, i)));
    const reply = h(doc, "div", { class: "mc nw" }, h(doc, "span", { class: "rl assistant" }, "assistant"), ...round.response.map(blockEl));
    return h(
      doc,
      "div",
      {},
      agent.system ? system : "",
      round.reconstructed ? h(doc, "p", { class: "hint" }, t("insp.reconstructed")) : "",
      h(doc, "div", { class: "rounds", "data-ui": "round-buttons" }, ...buttons, h(doc, "span", { class: "lb" }, `${t("insp.roundNote")}${round.ms != null ? ` · ${fmt(round.ms)}` : ""}`)),
      h(
        doc,
        "div",
        { class: "cols" },
        h(doc, "div", {}, h(doc, "p", { class: "lb" }, `${t("insp.sent")} (${round.messages.length})`), ...sent),
        h(
          doc,
          "div",
          { class: "box" },
          h(doc, "p", { class: "lb" }, t("insp.reply")),
          reply,
          h(doc, "p", { class: "lb" }, "stop_reason: ", h(doc, "b", {}, String(round.stop ?? "?")), round.stop === "tool_use" ? t("insp.toolRun") : "", h(doc, "br"), t("insp.tokLine", { i: round.usage?.input ?? "?", o: round.usage?.output ?? "?" })),
        ),
      ),
    );
  }

  // The API calls tab: what was sent to the provider and what came back, for the chosen agent. The search box opens the rows that match.
  const openedCalls = new Map();
  // The time of the event the player stands on: the tab shows the calls made up to then, as the Context tab does.
  const playedAt = () => (player.cursor > 0 ? events[Math.min(player.cursor, events.length) - 1]?.t ?? 0 : -1);
  const agentOnFreeKey = (agentId) => {
    const node = designOfRun()?.nodes?.find((n) => n.id === agentId || n.id === String(agentId).split("#")[0]);
    return isSlot(node?.slot) && slotIsFree(node.slot);
  };
  const oneDecimal = (n) => new Intl.NumberFormat(doc.documentElement?.lang || undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
  function renderApi(agent) {
    const calls = apiCallsOf(apiCalls, agent.id, playedAt());
    return apiView({ doc, t, calls, wire: PROVIDERS[calls[0]?.provider]?.wire ?? null, viewer, query: search.query(), dropped: apiCallsDropped, opened: openedCalls, free: agentOnFreeKey(agent.id), runHasCalls: apiCalls.length > 0, num: oneDecimal });
  }

  function renderContext(agent) {
    return contextView({ doc, t, label: agent.label, rows: contextOf(events, agent.id, player.cursor), num: (n) => new Intl.NumberFormat(doc.documentElement?.lang || undefined).format(n) });
  }

  function renderOutput(agent) {
    // In a handoff run control can come back, so the agent that ended the run is not the last one that appeared.
    const ended = handoffOutcome(events);
    const last = ended ? ended.by === agent.id : state.order.at(-1) === agent.id;
    const note = agent.output ? (last ? t("insp.outFinal") : t("insp.outNext")) : "";
    return h(doc, "div", {}, h(doc, "p", { class: "lb" }, `${t("insp.outOf")} ${agent.label}${note}`), viewer.view(`o-${agent.id}`, agent.output ?? t("insp.nothing")));
  }

  // The settings of the chosen agent in this run, read from the design of the run (a created agent is in it too).
  function renderSettings(agent) {
    const design = designOfRun();
    const node = design?.nodes?.find((n) => n.id === agent.id) ?? null;
    return settingsView({ doc, t, node, design, agent, num: (n) => new Intl.NumberFormat(doc.documentElement?.lang || undefined).format(n) });
  }

  function renderBanners() {
    const items = [];
    if (state.error) {
      // A message that starts with the way out (then a blank line and the provider's own text) shows it first, in bold.
      const [first, ...rest] = state.error.split("\n\n");
      items.push(h(doc, "div", { class: "banner" }, ...(rest.length ? [h(doc, "strong", { class: "banner-fix" }, first), rest.join("\n\n")] : [first])));
    }
    // The same message from the same agent, one after another, shows once, with how many times it came in a filled pill under its mark: 3×.
    const sameAs = (i, j) => state.warnings[i] === state.warnings[j] && Boolean(state.warningErrors[i]) === Boolean(state.warningErrors[j]) && (state.warningLabels?.[i] ?? null) === (state.warningLabels?.[j] ?? null);
    const repeats = new Map();
    for (let i = 0; i < state.warnings.length; ) {
      let j = i + 1;
      while (j < state.warnings.length && sameAs(i, j)) j++;
      repeats.set(i, j - i);
      i = j;
    }
    state.warnings.forEach((w, i) => {
      if (!repeats.has(i)) return;
      const count = repeats.get(i);
      const at = state.warningTimes[i];
      const time = typeof at === "number" ? clockTime(at) : "";
      // The same round mark as on the agent (orange for a warning, red for an error), then the name of the agent and the time on one line and the message under it.
      const bad = Boolean(state.warningErrors[i]);
      const label = state.warningLabels?.[i] ?? null;
      const head = [...(label ? [h(doc, "strong", { class: "banner-who" }, label)] : []), ...(time ? [h(doc, "time", { class: "banner-time", "data-ui": "banner-time", datetime: new Date(at).toISOString() }, time)] : [])];
      items.push(h(doc, "div", { class: `banner banner-stack${bad ? "" : " warn"}`, "data-kind": bad ? "error" : "warning" }, h(doc, "span", { class: "banner-lead" }, h(doc, "span", { class: `banner-badge ${bad ? "err" : "warn"}`, "aria-hidden": "true" }, "!"), ...(count > 1 ? [h(doc, "span", { class: `banner-count ${bad ? "err" : "warn"}`, "data-ui": "banner-count", title: t("replay.repeatedTitle", { n: count }) }, t("replay.repeatedTimes", { n: count }))] : [])), h(doc, "span", { class: "banner-body" }, ...(head.length ? [h(doc, "span", { class: "banner-head" }, ...head)] : []), h(doc, "span", { class: "banner-text" }, state.warningBare?.[i] ?? w)), help(state.warningHelps[i] ?? "replay-warnings", t("replay.warningHelp"))));
    });
    // How an evaluator loop ended shows once the replay has reached that point.
    // A handoff run shows the path so far, and at its end how it ended.
    const handing = handoffProgress(events, player.cursor);
    const handDesign = events.find((e) => e.type === "run_start")?.design;
    if (handing && player.cursor > 0) items.push(handoffPathView({ doc, t, design: handDesign, path: handing.path }));
    const handed = handoffOutcome(events);
    const routedTo = routerChoice(events, player.cursor);
    if (routedTo && player.cursor > 0) items.push(handoffPathView({ doc, t, design: handDesign, path: [handDesign.nodes.find((n) => n.agent === "router")?.id, routedTo.to] }));
    const voting = votingEnd(events);
    if (voting && player.cursor > events.findIndex((e) => e.type === "done")) items.push(votingNotice({ doc, t, end: voting }));
    const dyn = dynamicEnd(events);
    if (dyn && player.cursor > events.findIndex((e) => e.type === "done")) items.push(dynamicNotice({ doc, t, end: dyn }));
    const routed = routerEnd(events);
    if (routed && player.cursor > events.findIndex((e) => e.type === "done")) items.push(routerNotice({ doc, t, design: handDesign, end: routed }));
    if (handed && player.cursor > events.findIndex((e) => e.type === "done")) items.push(handoffNotice({ doc, t, design: handDesign, outcome: handed }));
    const loop = loopOutcome(events);
    if (loop && player.cursor > events.findIndex((e) => e.type === "loop_end")) items.push(loopNotice({ doc, t, loop }));
    banners.replaceChildren(...items);
  }

  function render() {
    state = deriveInspector(events, player.cursor);
    followPlayer();
    root.classList?.toggle("is-playing", player.playing);
    const playName = player.playing ? t("player.pause") : t("player.play");
    playButton.textContent = player.playing ? GLYPH.pause : GLYPH.play;
    playButton.setAttribute("title", playName);
    playButton.setAttribute("aria-label", playName);
    if (sideLayout) speedGroup.textContent = t("player.speedOption", { speed: player.speed });
    else speedMobile.textContent = t("player.speedOption", { speed: player.speed });
    previousButton.disabled = player.cursor === 0;
    nextButton.disabled = player.cursor >= events.length;
    for (const button of speedButtons) button.setAttribute("aria-pressed", String(Number(button.getAttribute("data-speed")) === player.speed));
    range.max = String(events.length);
    range.value = String(player.cursor);
    playButton.disabled = player.live;
    liveBadge.hidden = !player.live;
    stopButton.hidden = !player.live;
    liveCorner.hidden = !player.live;
    range.hidden = player.live;
    root.classList?.toggle("is-live", player.live);
    // A live run has no fixed total (more steps are still to come), so it counts the steps that are finished; a recording shows where it is in all of them.
    const parts = [live ? t("player.stepsFinished", { n: events.filter((e) => e.type === "agent_output").length }) : t("player.step", { n: player.cursor, total: events.length })];
    if (state.tokens.input || state.tokens.output) parts.push(t("player.tokens", state.tokens));
    if (player.finished) parts.push(t("player.finished"));
    const debate = debateProgress(events, player.cursor);
    const roundBadge = debate ? h(doc, "span", { class: "round-badge", "data-ui": "debate-round" }, debate.verdict ? t("player.debateVerdict") : t("player.debateRound", { n: debate.round, total: debate.rounds })) : "";
    // With a diagram the round badge sits on the diagram; without one it stays in the status line.
    status.replaceChildren(...(debate && !designOfRun() ? [roundBadge] : []), parts.join(" · "));
    for (const b of tabButtons) b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === ui.tab));
    // The count of the calls of the chosen agent is part of the name of its tab.
    const apiTab = tabButtons.find((b) => b.getAttribute("data-tab") === "api");
    const shownCalls = apiCallsOf(apiCalls, currentAgent()?.id, playedAt()).length;
    apiTab.replaceChildren(doc.createTextNode(shownCalls > 0 ? t("player.tabApi", { n: shownCalls }) : t("player.tabApiName")));
    renderBanners();
    renderNotebook();
    renderCondense();
    renderDynamic();
    renderChips();
    drawBody = () => {
      const agent = currentAgent();
      // A card of an agent that never started: say why, and where to read the decision.
      const idle = ui.agent && !state.agents[ui.agent] ? idleStatus() : "waiting";
      if (idle !== "waiting") {
        body.replaceChildren(h(doc, "p", { class: "doc", "data-ui": "idle-agent" }, t(idle === "idle" && designOfRun()?.pattern === "router" ? "insp.idleRouter" : `insp.${idle}`)));
        return;
      }
      if (!agent) {
        body.replaceChildren(h(doc, "p", { class: "doc" }, t("insp.waiting")));
        return;
      }
      body.replaceChildren(ui.tab === "steps" ? renderSteps(agent) : ui.tab === "messages" ? renderMessages(agent) : ui.tab === "context" ? renderContext(agent) : ui.tab === "api" ? renderApi(agent) : ui.tab === "settings" ? renderSettings(agent) : renderOutput(agent));
    };
    if (search.query()) search.run();
    else drawBody();
  }

  const follow = (fn) => () => {
    ui.follow = true;
    fn();
  };
  playButton.addEventListener("click", follow(() => (player.playing ? player.pause() : player.play())));
  restartButton.addEventListener("click", follow(() => player.restart()));
  stopButton.addEventListener("click", () => onStop?.());
  previousButton.addEventListener("click", follow(() => player.prev()));
  nextButton.addEventListener("click", follow(() => player.next()));
  for (const button of speedButtons) button.addEventListener("click", () => player.setSpeed(Number(button.getAttribute("data-speed"))));
  const nextSpeed = () => player.setSpeed(player.speeds[(player.speeds.indexOf(player.speed) + 1) % player.speeds.length]);
  if (sideLayout) speedGroup.addEventListener("click", nextSpeed);
  else speedMobile.addEventListener("click", nextSpeed);
  range.addEventListener("input", follow(() => player.seek(Number(range.value))));

  // What the keyboard shortcuts can do with this player.
  const keyApi = {
    toggle: follow(() => {
      if (player.live) return;
      if (player.playing) player.pause();
      else player.play();
    }),
    prev: follow(() => player.prev()),
    next: follow(() => player.next()),
    restart: follow(() => player.restart()),
    end: follow(() => player.seek(events.length)),
    slower: () => player.setSpeed(player.speeds[Math.max(0, player.speeds.indexOf(player.speed) - 1)]),
    faster: () => player.setSpeed(player.speeds[Math.min(player.speeds.length - 1, player.speeds.indexOf(player.speed) + 1)]),
    tab: (name) => {
      ui.tab = name;
      ui.follow = false;
      render();
    },
    isLive: () => player.live,
    stop: () => onStop?.(),
  };
  // Keyboard zones. Tab goes player, Steps, Messages, Output, Context and round again (Shift+Tab goes back, and
  // leaves from the player). In the player the arrows or W A S D move between the agents and Enter inspects
  // the one that has the focus. In Steps and Messages the same keys move between steps or rounds.
  const ZONES = ["player", "steps", "messages", "output", "context", "api", "settings"];
  const MOVES = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
  const isLetter = (key) => key.length === 1;
  let lastG = 0;
  const zoneOf = (target) => {
    if (!target || !target.tagName || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return null;
    if (chips.contains(target)) return "player";
    if (body.contains(target) || body === target || tabRow.contains(target)) return ui.tab;
    // Anywhere else in the player (the buttons, the slider, the heading) the player keys are active too.
    if (root.contains(target)) return "player";
    return null;
  };
  function focusZone(zone) {
    if (zone === "player") {
      (chips.querySelector('[aria-pressed="true"]') ?? chips.querySelector("button"))?.focus();
      return;
    }
    ui.tab = zone;
    ui.follow = false;
    render();
    const inside = zone === "steps" ? body.querySelector(".step.sel") ?? body.querySelector(".step") : zone === "messages" ? body.querySelector(".rounds .sel") ?? body.querySelector(".rounds button") : null;
    (inside ?? body).focus();
  }
  function moveAgent(direction) {
    const boxes = [...chips.querySelectorAll("button")];
    const at = boxes.indexOf(doc.activeElement);
    if (boxes.length === 0) return;
    if (at < 0) return (chips.querySelector('[aria-pressed="true"]') ?? boxes[0]).focus();
    const centers = boxes.map((b) => {
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const next = pickNeighbour(centers, at, direction);
    if (next >= 0) boxes[next].focus();
  }
  function moveInList(zone, forward) {
    if (zone === "steps") {
      const steps = [...body.querySelectorAll(".step")];
      if (steps.length === 0) return;
      const at = steps.includes(doc.activeElement) ? steps.indexOf(doc.activeElement) : steps.findIndex((s) => s.classList.contains("sel"));
      const next = Math.min(steps.length - 1, Math.max(0, at + (forward ? 1 : -1)));
      ui.step = next;
      ui.follow = false;
      render();
      body.querySelectorAll(".step")[next]?.focus();
    } else if (zone === "messages") {
      const rounds = [...body.querySelectorAll(".rounds button")];
      if (rounds.length === 0) return;
      const at = rounds.includes(doc.activeElement) ? rounds.indexOf(doc.activeElement) : rounds.findIndex((r) => r.classList.contains("sel"));
      const next = Math.min(rounds.length - 1, Math.max(0, at + (forward ? 1 : -1)));
      ui.round = next;
      ui.follow = false;
      render();
      body.querySelectorAll(".rounds button")[next]?.focus();
    }
  }
  root.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === "g") lastG = Date.now();
    const zone = zoneOf(event.target);
    if (zone === null) return;
    const used = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.key === "Tab") {
      const at = ZONES.indexOf(zone);
      used();
      // Tab goes round the player and its tabs: player, Steps, Messages, Output, Context and round again; Shift+Tab goes back.
      focusZone(ZONES[(at + (event.shiftKey ? -1 : 1) + ZONES.length) % ZONES.length]);
      return;
    }
    // Escape lets go of the zones (during a live run it is the stop shortcut instead).
    if (event.key === "Escape" && !player.live) {
      used();
      doc.activeElement?.blur?.();
      return;
    }
    const move = MOVES[event.key];
    if (!move) return;
    // w a s d are letters: right after g they belong to the go-to shortcuts (g a, g s).
    if (isLetter(event.key) && Date.now() - lastG < 1500) return;
    if (zone === "player") {
      used();
      moveAgent(move);
    } else if (zone === "steps" || zone === "messages") {
      used();
      moveInList(zone, move === "down" || move === "right");
    }
  });
  keyApi.focusPlayer = () => focusZone("player");
  keyApi.moveAgent = moveAgent;
  keyApi.focusLast = () => focusZone("output");
  // The zone that has the keyboard focus gets a ring, so it is clear which part the keys act on.
  const markZones = (el) => {
    const inInspector = Boolean(el && (body.contains(el) || body === el || tabRow.contains(el)));
    chips.classList.toggle("zone-active", Boolean(el && root.contains(el) && !inInspector));
  };
  root.addEventListener("focusin", (event) => markZones(event.target));
  root.addEventListener("focusout", (event) => markZones(event.relatedTarget));
  setActivePlayer(keyApi);

  const unsubscribe = player.subscribe(render);
  render();
  if (autoStart) player.play();

  return {
    player,
    openAbout: () => aboutPanel?.open(),
    destroy() {
      clearActivePlayer(keyApi);
      if (tickTimer !== null) clock.clearTimeout(tickTimer);
      player.pause();
      unsubscribe();
      container.replaceChildren();
    },
  };
}
