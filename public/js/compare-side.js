// The side-by-side view: the chosen runs play together on one shared clock, one column per run.
import { h } from "./dom.js";
import { MAX_SIDE } from "./compare-model.js";
import { createCompareClock, durationOf, totalsAt } from "./compare-sync.js";
import { deriveInspector } from "./replay/inspect-model.js";
import { notebookOf } from "./replay/notebook-model.js";
import { condensesOf } from "./replay/condense-model.js";

const SPEEDS = [0.5, 1, 2];
const letter = (i) => String.fromCharCode(65 + i);
const eventsOf = (run) => (Array.isArray(run?.events) ? run.events : []);

// The last text produced up to the cursor, and by which agent: the latest reply of a model call or the output of an agent.
function lastText(events, cursor) {
  for (let i = Math.min(cursor, events.length) - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e?.type === "agent_output" && typeof e.text === "string" && e.text !== "") return { agent: e.agent, text: e.text };
    if (e?.type === "round") {
      const text = (Array.isArray(e.content) ? e.content : []).filter((b) => b?.type === "text").map((b) => b.text).join("\n\n");
      if (text !== "") return { agent: e.agent, text };
    }
  }
  return null;
}

export function compareSide({ doc, t, runs, clockApi, num = String }) {
  const shown = runs.slice(0, MAX_SIDE);
  const clock = createCompareClock({ runs: shown, clock: clockApi });
  const secs = (ms) => `${num(Math.round(ms / 100) / 10)} s`;
  const fill = (el, ...children) => el.replaceChildren(...children.map((c) => (typeof c === "string" ? doc.createTextNode(c) : c)));
  const icon = (ui, glyph, label) => h(doc, "button", { type: "button", class: "icon-button", "data-ui": ui, title: label, "aria-label": label }, glyph);

  const play = h(doc, "button", { type: "button", class: "icon-button", "data-ui": "compare-side-play" });
  const restart = icon("compare-side-restart", "↺", t("player.restart"));
  const prev = icon("compare-side-prev", "‹", t("player.previous"));
  const next = icon("compare-side-next", "›", t("player.next"));
  const speedButtons = SPEEDS.map((x) => {
    const b = h(doc, "button", { type: "button", "data-ui": "compare-side-speed", "aria-label": `${t("player.speedLabel")} ${x}×` }, `${x}×`);
    b.addEventListener("click", () => clock.setSpeed(x));
    return { b, x };
  });
  const scrub = h(doc, "input", { type: "range", min: 0, max: 0, step: 1, class: "compare-scrub", "data-ui": "compare-side-scrub", "aria-label": t("compare.side.scrub") });
  const readout = h(doc, "span", { class: "compare-readout", "data-ui": "compare-side-readout", "aria-live": "off" });
  const hint = h(doc, "span", { class: "muted", "data-ui": "compare-side-hint" });
  const byTime = h(doc, "button", { type: "button", "data-ui": "compare-side-mode-time" }, t("compare.side.time"));
  const byStep = h(doc, "button", { type: "button", "data-ui": "compare-side-mode-step" }, t("compare.side.step"));
  play.addEventListener("click", () => (clock.playing ? clock.pause() : clock.play()));
  restart.addEventListener("click", () => clock.restart());
  prev.addEventListener("click", () => clock.prev());
  next.addEventListener("click", () => clock.next());
  scrub.addEventListener("input", () => clock.seek(Number(scrub.value)));
  byTime.addEventListener("click", () => clock.setMode("time"));
  byStep.addEventListener("click", () => clock.setMode("step"));

  const ruler = h(doc, "p", { class: "compare-ruler muted", "data-ui": "compare-side-ruler" }, shown.map((r, i) => t("compare.side.endsAt", { run: letter(i), time: secs(durationOf(eventsOf(r))) })).join(" · "));
  const cols = shown.map(() => h(doc, "section", { class: "compare-col", "data-ui": "compare-side-col" }));
  const controls = h(
    doc,
    "div",
    { class: "compare-controls", "data-ui": "compare-side-controls" },
    h(doc, "div", { class: "compare-buttons" }, play, restart, prev, next),
    h(doc, "div", { class: "compare-buttons" }, ...speedButtons.map((s) => s.b)),
    scrub,
    readout,
  );
  const modes = h(doc, "div", { class: "compare-modes-row" }, h(doc, "div", { class: "compare-modes" }, byTime, byStep), hint);
  const grid = h(doc, "div", { class: "compare-cols", "data-ui": "compare-side-cols" }, ...cols);
  const root = h(doc, "div", { class: "compare-side", "data-ui": "compare-side" }, controls, ruler, modes, grid);
  if (runs.length > MAX_SIDE) root.append(h(doc, "p", { class: "notice", "data-ui": "compare-side-max" }, t("compare.sideMax", { n: MAX_SIDE })));

  function drawColumn(el, run, i, cursor) {
    const events = eventsOf(run);
    const inspector = deriveInspector(events, cursor);
    const book = notebookOf(events, cursor);
    const condensed = new Set(condensesOf(events, cursor).map((c) => c.agent));
    const totals = totalsAt(run, cursor);
    const design = run.design ?? events.find((e) => e?.type === "run_start")?.design;
    const badges = [];
    if (i === 0) badges.push(h(doc, "span", { class: "badge" }, t("compare.baseLib")));
    const hasNotebook = design?.memory?.notebook === true;
    const hasCondense = (design?.nodes ?? []).some((n) => n.condense === true);
    if (hasNotebook) badges.push(h(doc, "span", { class: "badge" }, t("compare.side.notebook")));
    if (hasCondense) badges.push(h(doc, "span", { class: "badge" }, t("compare.side.condense")));
    if (!hasNotebook && !hasCondense) badges.push(h(doc, "span", { class: "badge" }, t("compare.side.noMemory")));
    const cards = inspector.order.map((id) => {
      const a = inspector.agents[id];
      const marks = [];
      const mem = book.perAgent.get(id);
      if (mem?.wrote) marks.push(t("player.notebookWrote", { n: mem.wrote }));
      if (mem?.read) marks.push(t("player.notebookRead", { n: mem.read }));
      if (condensed.has(id)) marks.push(t("player.condensed"));
      const state = t(`compare.side.status.${a.status}`) + (a.status === "done" && typeof a.ms === "number" ? ` · ${secs(a.ms)}` : "");
      return h(doc, "div", { class: `compare-agent status-${a.status}`, "data-ui": "compare-side-agent" }, h(doc, "b", {}, a.label ?? id), h(doc, "span", { class: "muted" }, state), marks.length > 0 ? h(doc, "span", { class: "muted" }, marks.join("  ")) : "");
    });
    const last = lastText(events, cursor);
    // In By time every column shows the clock itself; a run that has ended keeps its own end time.
    const time = clock.mode === "time" ? Math.min(clock.position, durationOf(events)) : totals.ms;
    const total = (label, value) => h(doc, "span", {}, `${label} `, h(doc, "b", {}, value));
    fill(
      el,
      h(doc, "h3", { title: run.title ?? run.id }, `${letter(i)} `, ...badges),
      h(doc, "div", { class: "compare-agents" }, ...cards),
      h(doc, "div", { class: "compare-last-label muted" }, last ? t("compare.side.lastOf", { agent: inspector.agents[last.agent]?.label ?? last.agent ?? "" }) : ""),
      h(doc, "div", { class: last === null ? "compare-last muted" : "compare-last", "data-ui": "compare-side-last" }, last?.text ?? t("compare.side.nothingYet")),
      h(doc, "p", { class: "compare-totals", "data-ui": "compare-side-totals" }, total(t("compare.side.tTime"), secs(time)), total(t("compare.side.tCost"), totals.cost === null ? "–" : `$${totals.cost.toFixed(4)}`), total(t("compare.side.tTokens"), num(totals.tokens))),
    );
  }

  function render() {
    const cursors = clock.cursors();
    shown.forEach((run, i) => drawColumn(cols[i], run, i, cursors[i] ?? 0));
    scrub.setAttribute("max", String(Math.ceil(clock.max)));
    scrub.setAttribute("step", "1");
    scrub.value = String(clock.position);
    const pos = clock.mode === "time" ? secs(clock.position) : num(clock.position);
    const max = clock.mode === "time" ? secs(clock.max) : num(clock.max);
    scrub.setAttribute("aria-valuetext", t("compare.side.of", { pos, max }));
    fill(play, clock.playing ? "⏸" : "▶");
    play.setAttribute("title", t(clock.playing ? "player.pause" : "player.play"));
    play.setAttribute("aria-label", t(clock.playing ? "player.pause" : "player.play"));
    byTime.setAttribute("aria-pressed", String(clock.mode === "time"));
    byStep.setAttribute("aria-pressed", String(clock.mode === "step"));
    speedButtons.forEach(({ b, x }) => b.setAttribute("aria-pressed", String(clock.speed === x)));
    fill(readout, t("compare.side.of", { pos, max }));
    fill(hint, t(clock.mode === "time" ? "compare.side.byTimeHint" : "compare.side.byStepHint"));
  }

  const off = clock.subscribe(render);
  render();
  return {
    element: root,
    destroy() {
      off();
      clock.pause();
    },
  };
}
