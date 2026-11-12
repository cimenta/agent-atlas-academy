// The run inspector: agent cards, then Steps / Messages / Output for the chosen agent.
// A slim player on top decides how much of the run is revealed (replay), the rest is inspection.
import { h } from "../dom.js";
import { validateRun } from "../run-schema.js";
import { createPlayer } from "./player.js";
import { debateProgress, deriveInspector, designLabel } from "./inspect-model.js";
import { createViewer } from "./viewer.js";
import { markText, searchBar } from "../text-search.js";
import { definitionFromRun } from "../create/definition.js";
import { openInCreate } from "../create/draft.js";
import { downloadFile, safeFileName } from "../download.js";
import { stepDetail } from "./step-detail.js";
import { createAboutPanel } from "./about.js";
import { createRunMenu } from "./run-menu.js";
import { runForExport } from "../run-export.js";
import { createReplayDiagram, ROUND_MARK } from "./diagram.js";
import { outcomeNotice } from "../outcome-view.js";
import { buildResultModel } from "../play-model.js";
import { clearActivePlayer, setActivePlayer } from "../shortcuts.js";
import { pickNeighbour } from "./spatial.js";

const STATUS_KEY = {
  waiting: "player.statusWaiting",
  working: "player.statusWorking",
  done: "player.statusDone",
  error: "player.statusError",
};
const KIND_KEY = { model: "kind.model", tool: "kind.tool", handoff: "kind.handoff", title: "kind.title" };

// Glyphs of the small player buttons (plain text, so no icon font is needed).
const GLYPH = { play: "▶", pause: "❚❚", stop: "■", restart: "↺", previous: "‹", next: "›" };

const defaultClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
};

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

export function mountReplay(container, { run, explanations = {}, t, doc = document, clock = defaultClock, autoStart = true, timeScale = 1, onAboutSave = null, onDelete = null, layout = "bar" }) {
  const validation = validateRun(run);
  if (!validation.ok) return mountError(container, doc, t, validation.errors);
  return mountView(container, { exportRun: run, pattern: run.pattern, events: run.events, title: headingOf(run), recordedWith: run.recordedWith, explanations, t, doc, clock, autoStart, timeScale, live: false, onAboutSave, onDelete, layout });
}

// A player that shows a run while it is still arriving. Events are added with append(), end() closes it.
export function mountLiveReplay(container, { title, pattern, recordedWith, t, doc = document, clock = defaultClock, onStop = () => {}, layout = "bar" }) {
  const view = mountView(container, { events: [], pattern, title, recordedWith, explanations: {}, t, doc, clock, autoStart: false, timeScale: 1, live: true, onStop, layout });
  return {
    append: (event) => view.player.append(event),
    end: () => view.player.endLive(),
    destroy: () => view.destroy(),
  };
}

function mountView(container, { exportRun, pattern, events, title, recordedWith, explanations, t, doc, clock, autoStart, timeScale, live, onStop, onAboutSave = null, onDelete = null, layout = "bar" }) {
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
  const restartButton = iconButton({ class: "ib", "data-ui": "restart-button" }, GLYPH.restart, t("player.restart"));
  const previousButton = iconButton({ class: "ib", "data-ui": "previous-button" }, GLYPH.previous, t("player.previous"));
  const nextButton = iconButton({ class: "ib", "data-ui": "next-button" }, GLYPH.next, t("player.next"));
  const sideLayout = layout === "side";
  // Side layout: one button that cycles through the speeds. Bar layout: a small button for every speed.
  const speedButtons = sideLayout ? [] : player.speeds.map((speed) => h(doc, "button", { type: "button", "data-speed": speed }, t("player.speedOption", { speed })));
  const speedGroup = sideLayout
    ? iconButton({ class: "ib speed-cycle", "data-ui": "speed-cycle" }, "", t("player.speedLabel"))
    : h(doc, "div", { class: "speed", "data-ui": "speed-buttons", role: "group", "aria-label": t("player.speedLabel") }, ...speedButtons);
  const range = h(doc, "input", { type: "range", "data-ui": "player-slider", min: 0, max: events.length, step: 1, value: 0, "aria-label": t("player.progress") });
  const status = h(doc, "div", { class: "status", "data-ui": "player-status", "aria-live": "polite" });
  const banners = h(doc, "div", { class: "banners", "data-ui": "run-banners" });
  const chips = h(doc, "div", { class: "chips", "data-ui": "agent-cards", role: "list", "aria-label": t("player.agents") });
  const tabButtons = ["steps", "messages", "output"].map((name) => {
    const button = h(doc, "button", { type: "button", class: "tab", role: "tab", "data-tab": name, "data-ui": `tab-${name}` }, t({ steps: "player.tabSteps", messages: "player.tabMessages", output: "player.tabOutput" }[name]));
    button.addEventListener("click", () => {
      ui.tab = name;
      ui.follow = false;
      render();
    });
    return button;
  });
  const tabs = h(doc, "div", { class: "tabs", "data-ui": "inspector-tabs", role: "tablist" }, ...tabButtons);
  const body = h(doc, "div", { class: "inspect-body", "data-ui": "inspector-body", tabindex: "-1" });
  // One search box next to the tabs: it searches the text of the tab that is open.
  let drawBody = () => {};
  const search = searchBar({
    doc,
    t,
    ui: "inspector-search",
    apply: (q) => {
      drawBody();
      return markText(doc, body, q);
    },
  });
  const tabRow = h(doc, "div", { class: "tab-row", "data-ui": "inspector-tab-row" }, tabs, search.element);

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

  const root = h(
    doc,
    "section",
    { class: "replay", "data-ui": "player", "aria-label": t("player.title", { title }) },
    outcomeBar,
    h(
      doc,
      "div",
      { class: "player-head", "data-ui": "player-head" },
      h(doc, "div", { class: "player-title" }, h(doc, "h2", {}, t("player.title", { title }), liveBadge), pattern ? h(doc, "span", { class: `type-chip type-${pattern}`, "data-ui": "player-pattern" }, t(`pattern.${pattern}`)) : ""),
      exportButton,
    ),
    aboutPanel ? aboutPanel.element : "",
    h(doc, "p", { class: "recorded" }, t("player.recordedWith", recordedWith)),
    banners,
    // Side layout: the buttons form a narrow column to the right of the diagram, slider and status.
    // Bar layout: one slim line under the diagram holds buttons, slider and speed.
    ...(sideLayout
      ? [h(doc, "div", { class: "player-row", "data-ui": "player-row" }, h(doc, "div", { class: "player-stage" }, chips, range, status), h(doc, "div", { class: "controls controls-col", "data-ui": "player-controls" }, playButton, stopButton, restartButton, previousButton, nextButton, speedGroup))]
      : [chips, h(doc, "div", { class: "controls controls-bar", "data-ui": "player-controls" }, playButton, stopButton, restartButton, previousButton, nextButton, range, speedGroup), status]),
    tabRow,
    body,
  );
  container.replaceChildren(root);

  const label = (value) => (typeof value === "string" ? value : value ? t(value.key, value.params) : "");

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
  function designOfRun() {
    const d = events.find((e) => e.type === "run_start")?.design;
    return d && Array.isArray(d.nodes) && Array.isArray(d.edges) && d.nodes.length > 0 ? d : null;
  }
  function renderDiagram() {
    const design = designOfRun();
    if (!design) return false;
    if (!diagram || diagramDesign !== design) {
      try {
        const wide = (doc.defaultView?.innerWidth ?? 1024) >= 720;
        diagram = createReplayDiagram({
          doc,
          design,
          wide,
          boxLabel: (id) => designLabel(design, id),
          statusText: (a) => `${t(STATUS_KEY[a.status])}${a.ms ? ` · ${fmt(a.ms)}` : ""}`,
          onSelect: (id) => {
            Object.assign(ui, { agent: id, follow: false, step: null, round: null });
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
    diagram.update({
      events,
      cursor: player.cursor,
      state,
      selectedId: currentAgent()?.id ?? null,
      badgeText: debate ? (debate.verdict ? t("player.debateVerdict") : t("player.debateRound", { n: ROUND_MARK, total: debate.rounds })) : "",
      badgeNumber: debate && !debate.verdict ? debate.round : undefined,
    });
    return true;
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
        h(doc, "span", { class: `st ${a.status}` }, `${t(STATUS_KEY[a.status])}${a.ms ? ` · ${fmt(a.ms)}` : ""}`),
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
        { type: "button", class: `step${i === selected ? " sel" : ""}`, "data-kind": step.kind, "aria-current": i === selected ? "step" : undefined },
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
    const head = h(doc, "p", { class: "agenthead" }, `${t("insp.stepsOf")} `, h(doc, "b", {}, agent.label), agent.model ? h(doc, "span", { class: "badge" }, agent.model) : "", agent.ms != null ? h(doc, "span", { class: "badge time" }, t("insp.total", { time: fmt(agent.ms) })) : "");
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
  const blockEl = (b) => h(doc, "div", { class: "bl" }, h(doc, "span", { class: "bt" }, b.type), blockText(b));
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
    const sent = round.messages.map((m, i) => messageEl(m, index > 0 && i >= round.before, i === 0 ? firstTag : ""));
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

  function renderOutput(agent) {
    const last = state.order.at(-1) === agent.id;
    const note = agent.output ? (last ? t("insp.outFinal") : t("insp.outNext")) : "";
    return h(doc, "div", {}, h(doc, "p", { class: "lb" }, `${t("insp.outOf")} ${agent.label}${note}`), viewer.view(`o-${agent.id}`, agent.output ?? t("insp.nothing")));
  }

  function renderBanners() {
    const items = [];
    if (state.error) items.push(h(doc, "div", { class: "banner" }, state.error));
    for (const w of state.warnings) items.push(h(doc, "div", { class: "banner warn" }, `⚠ ${w}`));
    banners.replaceChildren(...items);
  }

  function render() {
    state = deriveInspector(events, player.cursor);
    followPlayer();
    const playName = player.playing ? t("player.pause") : t("player.play");
    playButton.textContent = player.playing ? GLYPH.pause : GLYPH.play;
    playButton.setAttribute("title", playName);
    playButton.setAttribute("aria-label", playName);
    if (sideLayout) speedGroup.textContent = t("player.speedOption", { speed: player.speed });
    previousButton.disabled = player.cursor === 0;
    nextButton.disabled = player.cursor >= events.length;
    for (const button of speedButtons) button.setAttribute("aria-pressed", String(Number(button.getAttribute("data-speed")) === player.speed));
    range.max = String(events.length);
    range.value = String(player.cursor);
    playButton.disabled = player.live;
    liveBadge.hidden = !player.live;
    stopButton.hidden = !player.live;
    const parts = [t("player.step", { n: player.cursor, total: events.length })];
    if (state.tokens.input || state.tokens.output) parts.push(t("player.tokens", state.tokens));
    if (player.finished) parts.push(t("player.finished"));
    const debate = debateProgress(events, player.cursor);
    const roundBadge = debate ? h(doc, "span", { class: "round-badge", "data-ui": "debate-round" }, debate.verdict ? t("player.debateVerdict") : t("player.debateRound", { n: debate.round, total: debate.rounds })) : "";
    // With a diagram the round badge sits on the diagram; without one it stays in the status line.
    status.replaceChildren(...(debate && !designOfRun() ? [roundBadge] : []), parts.join(" · "));
    for (const b of tabButtons) b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === ui.tab));
    renderBanners();
    renderChips();
    drawBody = () => {
      const agent = currentAgent();
      if (!agent) {
        body.replaceChildren(h(doc, "p", { class: "doc" }, t("insp.waiting")));
        return;
      }
      body.replaceChildren(ui.tab === "steps" ? renderSteps(agent) : ui.tab === "messages" ? renderMessages(agent) : renderOutput(agent));
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
  if (sideLayout) speedGroup.addEventListener("click", () => player.setSpeed(player.speeds[(player.speeds.indexOf(player.speed) + 1) % player.speeds.length]));
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
  // Keyboard zones. Tab goes player, Steps, Messages, Output and round again (Shift+Tab goes back, and
  // leaves from the player). In the player the arrows or W A S D move between the agents and Enter inspects
  // the one that has the focus. In Steps and Messages the same keys move between steps or rounds.
  const ZONES = ["player", "steps", "messages", "output"];
  const MOVES = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
  const isLetter = (key) => key.length === 1;
  let lastG = 0;
  const zoneOf = (target) => {
    if (!target || !target.tagName || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return null;
    if (chips.contains(target)) return "player";
    if (body.contains(target) || body === target || tabRow.contains(target)) return ui.tab;
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
    if (at < 0) return boxes[0].focus();
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
  // The zone that has the keyboard focus gets a ring, so it is clear which part the keys act on.
  const markZones = (el) => {
    chips.classList.toggle("zone-active", Boolean(el && chips.contains(el)));
    const inInspector = Boolean(el && (body.contains(el) || body === el || tabRow.contains(el)));
    body.classList.toggle("zone-active", inInspector);
    tabRow.classList.toggle("zone-active", inInspector);
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
      player.pause();
      unsubscribe();
      container.replaceChildren();
    },
  };
}
