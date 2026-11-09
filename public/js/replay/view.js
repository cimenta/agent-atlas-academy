import { validateRun } from "../run-schema.js";
import { deriveState } from "./state.js";
import { createPlayer } from "./player.js";
import { buildGraphModel, buildTimelineModel, describeStep, stepMessage } from "./view-model.js";

const STATUS_KEY = {
  waiting: "player.statusWaiting",
  working: "player.statusWorking",
  done: "player.statusDone",
};

// All text goes through textContent / text nodes, never HTML strings.
function h(doc, tag, attrs = {}, ...children) {
  const el = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) el.append(typeof child === "string" ? doc.createTextNode(child) : child);
  return el;
}

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

export function mountReplay(container, { run, explanations = {}, t, doc = document, clock = defaultClock, autoStart = true }) {
  const validation = validateRun(run);
  if (!validation.ok) return mountError(container, doc, t, validation.errors);

  const events = run.events;
  const player = createPlayer({ events, clock });
  let selection = null; // { index, cursor }

  const graph = h(doc, "div", { class: "graph", role: "list", "aria-label": t("player.agents") });
  const playButton = h(doc, "button", { type: "button", class: "primary" });
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
  const messageTitle = h(doc, "h3", {}, t("player.message"));
  const messageBody = h(doc, "pre", { class: "message" });
  const closeButton = h(doc, "button", { type: "button", class: "close" }, t("player.close"));
  const panel = h(doc, "section", { class: "message-panel", "aria-label": t("player.message") }, messageTitle, messageBody, closeButton);

  const root = h(
    doc,
    "section",
    { class: "replay", "aria-label": t("player.title", { title: run.title }) },
    h(doc, "h2", {}, t("player.title", { title: run.title })),
    h(doc, "p", { class: "recorded" }, t("player.recordedWith", run.recordedWith)),
    graph,
    h(doc, "div", { class: "controls" }, playButton, restartButton, previousButton, nextButton, speedGroup),
    range,
    status,
    explanation,
    h(doc, "div", { class: "replay-columns" }, h(doc, "div", {}, h(doc, "h3", {}, t("player.timeline")), timeline), panel),
  );
  container.replaceChildren(root);

  function effectiveIndex() {
    if (selection && selection.cursor === player.cursor) return selection.index;
    return player.cursor - 1;
  }

  function renderGraph(state) {
    graph.replaceChildren(
      ...buildGraphModel(state).nodes.map((node) =>
        h(
          doc,
          "div",
          { class: "node", role: "listitem", "data-status": node.status, "aria-current": node.active ? "true" : undefined },
          h(doc, "span", { class: "node-name" }, node.label),
          h(doc, "span", { class: "node-status" }, t(STATUS_KEY[node.status])),
        ),
      ),
    );
  }

  function renderTimeline() {
    const focusedIndex = timeline.contains(doc.activeElement) ? doc.activeElement.getAttribute("data-index") : null;
    const model = buildTimelineModel(events, player.cursor, explanations);
    const state = deriveState(events, player.cursor);
    const current = effectiveIndex();
    timeline.replaceChildren(
      ...model.items.map((item) => {
        const { key, params } = describeStep(state.steps[item.index]);
        const button = h(
          doc,
          "button",
          { type: "button", "data-index": item.index, "aria-current": item.index === current ? "step" : undefined },
          t(key, params),
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
    timeline.lastElementChild?.scrollIntoView?.({ block: "nearest" });
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

  function render() {
    const state = deriveState(events, player.cursor);
    renderGraph(state);
    playButton.textContent = player.playing ? t("player.pause") : t("player.play");
    previousButton.disabled = player.cursor === 0;
    nextButton.disabled = player.cursor >= events.length;
    for (const button of speedButtons) {
      button.setAttribute("aria-pressed", String(Number(button.getAttribute("data-speed")) === player.speed));
    }
    range.value = String(player.cursor);
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
    renderTimeline();
    renderPanel(state);
  }

  playButton.addEventListener("click", () => (player.playing ? player.pause() : player.play()));
  restartButton.addEventListener("click", () => player.restart());
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
    destroy() {
      player.pause();
      unsubscribe();
      container.replaceChildren();
    },
  };
}
