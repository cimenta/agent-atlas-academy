// The run inspector: agent cards, then Steps / Messages / Output for the chosen agent.
// A slim player on top decides how much of the run is revealed (replay), the rest is inspection.
import { h } from "../dom.js";
import { validateRun } from "../run-schema.js";
import { createPlayer } from "./player.js";
import { deriveInspector } from "./inspect-model.js";
import { createViewer } from "./viewer.js";

const STATUS_KEY = {
  waiting: "player.statusWaiting",
  working: "player.statusWorking",
  done: "player.statusDone",
  error: "player.statusError",
};
const KIND_KEY = { model: "kind.model", tool: "kind.tool", handoff: "kind.handoff", title: "kind.title" };

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

export function mountReplay(container, { run, explanations = {}, t, doc = document, clock = defaultClock, autoStart = true, timeScale = 1 }) {
  const validation = validateRun(run);
  if (!validation.ok) return mountError(container, doc, t, validation.errors);
  return mountView(container, { events: run.events, title: run.title, recordedWith: run.recordedWith, explanations, t, doc, clock, autoStart, timeScale, live: false });
}

// A player that shows a run while it is still arriving. Events are added with append(), end() closes it.
export function mountLiveReplay(container, { title, recordedWith, t, doc = document, clock = defaultClock, onStop = () => {} }) {
  const view = mountView(container, { events: [], title, recordedWith, explanations: {}, t, doc, clock, autoStart: false, timeScale: 1, live: true, onStop });
  return {
    append: (event) => view.player.append(event),
    end: () => view.player.endLive(),
    destroy: () => view.destroy(),
  };
}

function mountView(container, { events, title, recordedWith, explanations, t, doc, clock, autoStart, timeScale, live, onStop }) {
  const player = createPlayer({ events, clock, timeScale, live });
  const ui = { agent: null, tab: "steps", step: null, round: null, follow: true };
  const viewer = createViewer({ doc, t });
  let state = deriveInspector(events, 0);

  const playButton = h(doc, "button", { type: "button", class: "primary" });
  const liveBadge = h(doc, "span", { class: "live-badge" }, t("player.live"));
  const stopButton = h(doc, "button", { type: "button", class: "danger" }, t("player.stop"));
  const restartButton = h(doc, "button", { type: "button" }, t("player.restart"));
  const previousButton = h(doc, "button", { type: "button" }, t("player.previous"));
  const nextButton = h(doc, "button", { type: "button" }, t("player.next"));
  const speedButtons = player.speeds.map((speed) =>
    h(doc, "button", { type: "button", "data-speed": speed }, t("player.speedOption", { speed })),
  );
  const speedGroup = h(doc, "div", { class: "speed", role: "group", "aria-label": t("player.speedLabel") }, ...speedButtons);
  const range = h(doc, "input", { type: "range", min: 0, max: events.length, step: 1, value: 0, "aria-label": t("player.progress") });
  const status = h(doc, "div", { class: "status", "aria-live": "polite" });
  const banners = h(doc, "div", { class: "banners" });
  const chips = h(doc, "div", { class: "chips", role: "list", "aria-label": t("player.agents") });
  const tabButtons = ["steps", "messages", "output"].map((name) => {
    const button = h(doc, "button", { type: "button", class: "tab", role: "tab", "data-tab": name }, t({ steps: "player.tabSteps", messages: "player.tabMessages", output: "player.tabOutput" }[name]));
    button.addEventListener("click", () => {
      ui.tab = name;
      ui.follow = false;
      render();
    });
    return button;
  });
  const tabs = h(doc, "div", { class: "tabs", role: "tablist" }, ...tabButtons);
  const body = h(doc, "div", { class: "inspect-body" });

  const root = h(
    doc,
    "section",
    { class: "replay", "aria-label": t("player.title", { title }) },
    h(doc, "h2", {}, t("player.title", { title }), liveBadge),
    h(doc, "p", { class: "recorded" }, t("player.recordedWith", recordedWith)),
    h(doc, "div", { class: "controls" }, playButton, stopButton, restartButton, previousButton, nextButton, speedGroup),
    range,
    status,
    banners,
    chips,
    tabs,
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

  function renderChips() {
    const agent = currentAgent();
    const nodes = [];
    state.order.forEach((id, i) => {
      const a = state.agents[id];
      if (i > 0) nodes.push(h(doc, "span", { class: "arrow", "aria-hidden": "true" }, "→"));
      const tools = a.tools.length ? a.tools.join(", ") : t("insp.noTools");
      const chip = h(
        doc,
        "button",
        { type: "button", class: `ag${agent && agent.id === id ? " sel" : ""}`, role: "listitem", "data-status": a.status, "aria-pressed": String(agent?.id === id) },
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
        h(doc, "span", { class: "ms" }, step.ms != null ? fmt(step.ms) : step.server ? t("insp.inModel") : ""),
      );
      button.addEventListener("click", () => {
        ui.step = i;
        ui.follow = false;
        render();
      });
      return button;
    });
    const head = h(doc, "p", { class: "agenthead" }, `${t("insp.stepsOf")} `, h(doc, "b", {}, agent.label), agent.model ? h(doc, "span", { class: "badge" }, agent.model) : "");
    const left = h(doc, "div", {}, head, ...list);
    if (agent.status === "working") left.append(h(doc, "div", { class: "working" }, t("insp.working")));

    const step = agent.steps[selected];
    const right = h(doc, "div", { class: "box" }, h(doc, "p", { class: "lb" }, t("insp.whatHappens")));
    if (!step) {
      right.append(h(doc, "p", { class: "doc" }, t("insp.noSteps")));
    } else {
      const why = explanations[String(step.eventIndex)];
      right.append(h(doc, "h3", {}, label(step.title)));
      const key = step.kind === "tool" ? `insp.doc.${step.tool}` : `insp.doc.${step.kind}`;
      const explained = t(key);
      right.append(h(doc, "p", { class: "doc" }, explained === key ? "" : explained));
      if (why) right.append(h(doc, "p", { class: "why" }, h(doc, "strong", {}, `${t("player.explanation")}: `), why));
      if (step.input) right.append(h(doc, "p", { class: "lb" }, t("insp.input")), h(doc, "div", { class: "pre" }, label(step.input)));
      const cut = step.outCut ? h(doc, "button", { type: "button", class: "cutnote" }, t("insp.outCut")) : null;
      if (cut) {
        cut.addEventListener("click", () => {
          ui.tab = "output";
          render();
        });
      }
      right.append(h(doc, "p", { class: "lb" }, t("insp.output"), cut ?? ""));
      right.append(viewer.view(`s-${agent.id}-${selected}`, step.output ?? (agent.status === "working" ? t("insp.waitingRes") : "—")));
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
    const system = h(doc, "div", { class: "mc sysbox" }, h(doc, "span", { class: "lb" }, t("insp.sysPrompt")), h(doc, "div", { class: "pre" }, agent.system || "—"));
    if (agent.rounds.length === 0) {
      return h(doc, "div", {}, agent.system ? system : "", h(doc, "p", { class: "doc" }, agent.steps.length ? t("insp.noRounds") : t("insp.noCalls")));
    }
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
      system,
      h(doc, "div", { class: "rounds" }, ...buttons, h(doc, "span", { class: "lb" }, `${t("insp.roundNote")}${round.ms != null ? ` · ${fmt(round.ms)}` : ""}`)),
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
    playButton.textContent = player.playing ? t("player.pause") : t("player.play");
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
    status.textContent = parts.join(" · ");
    for (const b of tabButtons) b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === ui.tab));
    renderBanners();
    renderChips();
    const agent = currentAgent();
    if (!agent) {
      body.replaceChildren(h(doc, "p", { class: "doc" }, t("insp.waiting")));
      return;
    }
    body.replaceChildren(ui.tab === "steps" ? renderSteps(agent) : ui.tab === "messages" ? renderMessages(agent) : renderOutput(agent));
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
  range.addEventListener("input", follow(() => player.seek(Number(range.value))));

  const unsubscribe = player.subscribe(render);
  render();
  if (autoStart) player.play();

  return {
    player,
    destroy() {
      player.pause();
      unsubscribe();
      container.replaceChildren();
    },
  };
}
