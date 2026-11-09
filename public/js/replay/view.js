import { h } from "../dom.js";
import { validateRun } from "../run-schema.js";
import { deriveState } from "./state.js";
import { createPlayer } from "./player.js";
import { buildGraphModel, buildTimelineModel, describeStep, stepMessage } from "./view-model.js";

const STATUS_KEY = {
  waiting: "player.statusWaiting",
  working: "player.statusWorking",
  done: "player.statusDone",
};

const KINDS = new Set(["run_start", "agent_start", "round", "tool_call", "tool_result", "handoff", "warning", "title", "agent_output", "done", "error"]);

const defaultClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
};

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
  let selection = null; // { index, cursor }
  let tab = "steps"; // "steps" | "messages" | "output"
  let reached = 0; // furthest cursor seen: steps already played stay listed when the user clicks back
  let filterAgent = null;

  const graph = h(doc, "div", { class: "graph", role: "list", "aria-label": t("player.agents") });
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
  const range = h(doc, "input", {
    type: "range",
    min: 0,
    max: events.length,
    step: 1,
    value: 0,
    "aria-label": t("player.progress"),
  });
  const status = h(doc, "div", { class: "status", "aria-live": "polite" });
  const explanation = h(doc, "div", { class: "explanation" });
  const timeline = h(doc, "ol", { class: "timeline" });
  const outputList = h(doc, "div", { class: "output-list" });
  const messageList = h(doc, "div", { class: "output-list" });
  const stepsHead = h(doc, "p", { class: "lb" });
  const tabButtons = ["steps", "messages", "output"].map((name) => {
    const b = h(doc, "button", { type: "button", class: "tab", role: "tab", "data-tab": name }, t({ steps: "player.tabSteps", messages: "player.tabMessages", output: "player.tabOutput" }[name]));
    b.addEventListener("click", () => {
      tab = name;
      render();
    });
    return b;
  });
  const tabs = h(doc, "div", { class: "tabs", role: "tablist" }, ...tabButtons);
  const messageTitle = h(doc, "h3", {}, t("player.message"));
  const messageBody = h(doc, "pre", { class: "message" });
  const closeButton = h(doc, "button", { type: "button", class: "close" }, t("player.close"));
  const panel = h(doc, "section", { class: "message-panel box", "aria-label": t("player.message") }, messageTitle, messageBody, closeButton);

  const root = h(
    doc,
    "section",
    { class: "replay", "aria-label": t("player.title", { title }) },
    h(doc, "h2", {}, t("player.title", { title }), liveBadge),
    h(doc, "p", { class: "recorded" }, t("player.recordedWith", recordedWith)),
    graph,
    h(doc, "div", { class: "controls" }, playButton, stopButton, restartButton, previousButton, nextButton, speedGroup),
    range,
    status,
    explanation,
    tabs,
    h(doc, "div", { class: "replay-columns" }, h(doc, "div", { class: "steps-col" }, stepsHead, timeline, messageList, outputList), panel),
  );
  container.replaceChildren(root);

  function effectiveIndex() {
    if (selection && selection.cursor === player.cursor) return selection.index;
    return player.cursor - 1;
  }

  function renderGraph(state) {
    graph.replaceChildren(
      ...buildGraphModel(state).nodes.map((node) => {
        const card = h(
          doc,
          "button",
          {
            type: "button",
            class: "node",
            role: "listitem",
            "data-status": node.status,
            "aria-pressed": String(filterAgent === node.id),
            "aria-current": node.active ? "true" : undefined,
          },
          h(doc, "span", { class: "node-name" }, node.label),
          h(doc, "span", { class: "node-status" }, t(STATUS_KEY[node.status])),
        );
        card.addEventListener("click", () => {
          filterAgent = filterAgent === node.id ? null : node.id;
          render();
        });
        return card;
      }),
    );
  }

  function renderOutput(state) {
    const blocks = [];
    events.slice(0, reached).forEach((event) => {
      if (event.type !== "agent_output" || typeof event.text !== "string") return;
      if (filterAgent && event.agent !== filterAgent) return;
      blocks.push(h(doc, "div", { class: "output-card" }, h(doc, "strong", {}, event.agent ?? ""), h(doc, "pre", { class: "message" }, event.text)));
    });
    if (blocks.length === 0) blocks.push(h(doc, "p", { class: "hint" }, t("player.noOutput")));
    outputList.replaceChildren(...blocks);
  }

  function renderTimeline() {
    const focusedIndex = timeline.contains(doc.activeElement) ? doc.activeElement.getAttribute("data-index") : null;
    const model = buildTimelineModel(events, reached, explanations);
    const state = deriveState(events, reached);
    const current = effectiveIndex();
    const shown = model.items.filter((item) => !filterAgent || item.agent === filterAgent);
    stepsHead.textContent = filterAgent ? t("player.stepsOf", { agent: filterAgent }) : t("player.allAgents");
    timeline.replaceChildren(
      ...shown.map((item) => {
        const { key, params } = describeStep(state.steps[item.index]);
        const kind = KINDS.has(item.type) ? item.type : "unknown";
        const button = h(
          doc,
          "button",
          { type: "button", class: "step", "data-kind": kind, "data-index": item.index, "aria-current": item.index === current ? "step" : undefined },
          h(doc, "span", { class: "tg", "data-kind": kind }, t(`kind.${kind}`)),
          h(doc, "span", { class: "ti" }, t(key, params)),
        );
        button.addEventListener("click", () => {
          selection = { index: item.index, cursor: item.index + 1 };
          player.pause();
          player.seek(item.index + 1);
        });
        return h(doc, "li", {}, button);
      }),
    );
    if (focusedIndex !== null) timeline.querySelector(`[data-index="${focusedIndex}"]`)?.focus();
    timeline.scrollTop = timeline.scrollHeight;
  }

  function renderPanel(state) {
    const index = effectiveIndex();
    const open = Boolean(selection && selection.cursor === player.cursor);
    panel.classList.toggle("open", open);
    if (index < 0) {
      messageBody.textContent = t("player.selectStep");
      return;
    }
    const { key, params } = describeStep(state.steps[index]);
    messageTitle.textContent = `${t("player.message")}: ${t(key, params)}`;
    messageBody.textContent = stepMessage(events[index]) || t("player.selectStep");
  }

  // The conversation one agent sees: its role, what was handed to it, its tool calls and results, its answer.
  function renderMessages() {
    const seen = events.slice(0, reached);
    const agent = filterAgent ?? [...seen].reverse().find((e) => typeof e.agent === "string")?.agent ?? null;
    const card = (role, text) =>
      h(doc, "div", { class: "output-card" }, h(doc, "span", { class: "tg", "data-role": role }, t(`msg.${role}`)), h(doc, "pre", { class: "message" }, text));
    const cards = [];
    for (const e of seen) {
      if (e.type === "run_start" && seen.find((x) => x.agent)?.agent === agent && typeof e.task === "string") cards.push(card("user", e.task));
      else if (e.type === "agent_start" && e.agent === agent && typeof e.role === "string") cards.push(card("system", e.role));
      else if (e.type === "handoff" && e.to === agent) cards.push(card("handoff", typeof e.note === "string" ? e.note : `${e.from} → ${e.to}`));
      else if (e.type === "tool_call" && e.agent === agent) cards.push(card("tool", stepMessage(e)));
      else if (e.type === "tool_result" && e.agent === agent) cards.push(card("result", stepMessage(e)));
      else if (e.type === "agent_output" && e.agent === agent && typeof e.text === "string") cards.push(card("assistant", e.text));
    }
    messageList.replaceChildren(
      h(doc, "p", { class: "lb" }, agent ? t("player.messagesOf", { agent }) : ""),
      ...(cards.length ? cards : [h(doc, "p", { class: "hint" }, t("player.noMessages"))]),
    );
  }

  function render() {
    reached = Math.max(reached, player.cursor);
    const state = deriveState(events, player.cursor);
    renderGraph(state);
    playButton.textContent = player.playing ? t("player.pause") : t("player.play");
    previousButton.disabled = player.cursor === 0;
    nextButton.disabled = player.cursor >= events.length;
    for (const button of speedButtons) {
      button.setAttribute("aria-pressed", String(Number(button.getAttribute("data-speed")) === player.speed));
    }
    range.max = String(events.length);
    range.value = String(player.cursor);
    playButton.disabled = player.live;
    liveBadge.hidden = !player.live;
    stopButton.hidden = !player.live;
    const parts = [t("player.step", { n: player.cursor, total: events.length })];
    if (state.tokens.input || state.tokens.output) parts.push(t("player.tokens", state.tokens));
    if (player.finished) parts.push(t("player.finished"));
    status.textContent = parts.join(" · ");
    const items = buildTimelineModel(events, player.cursor, explanations).items;
    const shown = items.find((item) => item.index === effectiveIndex());
    explanation.replaceChildren();
    if (shown && shown.explanation) {
      explanation.append(h(doc, "strong", {}, `${t("player.explanation")}: `), doc.createTextNode(shown.explanation));
    }
    for (const b of tabButtons) b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === tab));
    timeline.hidden = tab !== "steps";
    outputList.hidden = tab !== "output";
    messageList.hidden = tab !== "messages";
    renderTimeline();
    renderMessages();
    renderOutput(state);
    renderPanel(state);
  }

  playButton.addEventListener("click", () => (player.playing ? player.pause() : player.play()));
  restartButton.addEventListener("click", () => {
    reached = 0;
    player.restart();
  });
  stopButton.addEventListener("click", () => onStop?.());
  previousButton.addEventListener("click", () => player.prev());
  nextButton.addEventListener("click", () => player.next());
  for (const button of speedButtons) {
    button.addEventListener("click", () => player.setSpeed(Number(button.getAttribute("data-speed"))));
  }
  range.addEventListener("input", () => player.seek(Number(range.value)));
  closeButton.addEventListener("click", () => {
    selection = null;
    render();
  });

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
