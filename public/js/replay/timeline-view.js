// The timeline as the approved mockup draws it (docs/mockups/step-card.html): a lane for every agent, bars on a real time axis,
// hatching where an agent waits, a check mark where it finished and an arrow with an envelope for every handoff.
// The arrows are drawn in pixels, so draw() must be called once the element is on the page; paint() only moves what changes with time.
import { h } from "../dom.js";

const LANE = 56; // the height of a lane and the middle of it: the arrows are routed with these numbers
const MID = 28;

const percent = (value, total) => `${((value / total) * 100).toFixed(3)}%`;

export function createTimeline({ doc, t, hover, model, colorOf, nameOf, titleOf, fmt, selectedKey, filter, time, playing, onSelect, onFilter, onPlay, onRestart }) {
  const { order, total, bars, arrows, waits, done } = model;
  const lane = (id) => order.indexOf(id);
  const clock = h(doc, "span", { class: "tl-clock", "data-ui": "timeline-clock" });
  const play = h(doc, "button", { type: "button", class: "tl-play", "data-ui": "timeline-play", "aria-label": t("tl.play") }, `${playing ? "❚❚" : "▶"} ${t("tl.play")}`);
  const restart = h(doc, "button", { type: "button", "data-ui": "timeline-restart", "aria-label": t("tl.restart") }, "↺");
  play.addEventListener("click", onPlay);
  restart.addEventListener("click", onRestart);
  const legend = h(
    doc,
    "span",
    { class: "tl-leg" },
    h(doc, "span", {}, h(doc, "i", { class: "lgm" }), t("tl.legend.model")),
    h(doc, "span", {}, h(doc, "i", { class: "lgr" }), t("tl.legend.rule")),
    h(doc, "span", {}, h(doc, "i", { class: "lgh" }), t("tl.legend.harness")),
    h(doc, "span", {}, h(doc, "i", { class: "lgw" }), t("tl.legend.wait")),
    h(doc, "span", {}, h(doc, "b", { class: "lgd" }, "✓"), ` ${t("tl.legend.done")}`),
  );

  // The axis labels are drawn in draw(), when the width of the track is known: no more of them than fit.
  const axisBox = h(doc, "div", { class: "tl-ax" });
  const STEPS_S = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  function drawAxis(width) {
    const fit = Math.max(2, Math.floor(width / 56));
    const stepS = STEPS_S.find((n) => total / 1000 / n <= fit) ?? STEPS_S.at(-1);
    const ticks = [];
    for (let x = 0; x <= total; x += stepS * 1000) ticks.push(h(doc, "span", { style: `left:${percent(x, total)}` }, `${x / 1000} s`));
    axisBox.replaceChildren(...ticks);
  }

  const barEls = bars.map((b) => {
    const el = h(doc, "button", { type: "button", class: `tl-mk o-${b.origin}${b.point ? " pt" : ""}${selectedKey === b.key ? " sel" : ""}`, "data-key": b.key, style: `left:${percent(b.start, total)};${b.point ? "" : `width:${Math.max((b.end - b.start) / total * 100, 0.3).toFixed(3)}%;`}`, "aria-label": `${titleOf(b.key)}, ${nameOf(b.agent)}` });
    hover.attach(el, () => {
      const future = b.start > currentTime;
      return future
        ? { title: t("tl.notYet"), text: t("tl.startsAbout", { name: nameOf(b.agent), time: fmt(b.start) }) }
        : { title: titleOf(b.key), text: nameOf(b.agent), extra: t(`sc.origin.${b.origin}`), rows: [[t("tl.time"), `${fmt(b.start)} → ${fmt(b.end)}`]] };
    });
    el.addEventListener("click", () => {
      if (b.start <= currentTime) onSelect(b.key);
    });
    return { b, el };
  });

  const rows = order.map((id, index) => {
    const name = h(doc, "div", { class: "tl-name", title: t("tl.filterHint") }, h(doc, "span", { class: "wd", style: `background:${colorOf(id)}` }), nameOf(id));
    name.addEventListener("click", () => onFilter(id));
    const track = h(
      doc,
      "div",
      { class: "tl-track" },
      ...waits.filter((w) => w.agent === id).map((w) => h(doc, "span", { class: "tl-wt", title: t("tl.waiting"), style: `left:${percent(w.start, total)};width:${percent(w.end - w.start, total)}` })),
      ...barEls.filter((x) => x.b.agent === id).map((x) => x.el),
      h(doc, "span", { class: "tl-ph" }),
    );
    return h(doc, "div", { class: `tl-row${filter && filter !== id ? " dim" : ""}`, "data-lane": String(index) }, name, track);
  });
  const rowsBox = h(doc, "div", { class: "tl-rows", "data-ui": "timeline-rows" }, ...rows);
  const axis = h(doc, "div", { class: "tl-axis" }, h(doc, "span", {}), axisBox);
  const element = h(doc, "div", { class: "tl", "data-ui": "timeline" }, h(doc, "div", { class: "tl-top" }, play, restart, clock, legend), rowsBox, axis);

  let currentTime = time;
  let drawn = [];

  const stateOf = (b) => (b.start > currentTime ? "fut" : b.end > currentTime ? "run" : "past");
  const progressOf = (b, state) => (state === "fut" ? 0 : state === "run" ? Math.round(((currentTime - b.start) / Math.max(1, b.end - b.start)) * 100) : 100);

  // The arrows and envelopes, in pixels. The line leaves the end of the sender and ends with its head at the start of the receiver.
  function draw() {
    rowsBox.querySelectorAll(".tl-svg,.tl-envs").forEach((e) => e.remove());
    const track = rowsBox.querySelector(".tl-track");
    if (!track) return;
    const width = track.clientWidth;
    const left = track.offsetLeft; // the names column is narrower on a small screen, so the arrows start where the track starts
    drawAxis(width);
    const X = (value) => (value / total) * width;
    const fromCount = new Map();
    for (const a of arrows) fromCount.set(`${a.from}@${a.at}`, (fromCount.get(`${a.from}@${a.at}`) ?? 0) + 1);
    let svg = "";
    const envs = [];
    drawn = [];
    for (const a of arrows) {
      const ls = lane(a.from);
      const lt = lane(a.to);
      if (ls < 0 || lt < 0) continue;
      const down = lt > ls;
      const color = colorOf(a.from);
      const xs = X(a.fromT);
      const xt = X(a.toT);
      const yS = ls * LANE + MID;
      const yT = lt * LANE + MID;
      const fan = fromCount.get(`${a.from}@${a.at}`) > 1;
      const late = xt - xs >= 40; // the receiver starts well after the sender ended: the line leaves the end of the sender bar
      const xv = late ? xt - 14 : Math.max(xs - 22, xs - 0.6 * Math.max(xs, 20));
      const sy = down ? yS + 11 : yS - 11;
      const path = late ? `M${xs} ${yS} H${xv} V${yT} H${xt - 1}` : `M${xv} ${sy} V${yT} H${xt - 1}`;
      const head = `M${xt - 8} ${yT - 4.5} L${xt - 1} ${yT} L${xt - 8} ${yT + 4.5}`;
      svg += `<g class="tl-hog" data-key="${a.key}"><path class="tl-hoa" d="${path}" stroke="${color}"/><path class="tl-hoh" d="${head}" stroke="${color}"/></g>`;
      const cy = fan ? yT - 20 : down ? yS + 26 : yS - 26;
      const env = h(doc, "button", { type: "button", class: `tl-env${selectedKey === a.key ? " sel" : ""}`, "data-key": a.key, "aria-label": titleOf(a.key), style: `left:${xv.toFixed(1)}px;top:${cy}px` }, "✉");
      hover.attach(env, () => (a.at > currentTime ? { title: t("tl.notYet"), text: t("tl.handoffSoon", { from: nameOf(a.from), to: nameOf(a.to) }) } : { title: titleOf(a.key), text: t("tl.handoffInfo", { chars: a.chars, done: fmt(a.fromT), at: fmt(a.at) }) }));
      env.addEventListener("click", () => {
        if (a.at <= currentTime) onSelect(a.key);
      });
      envs.push(env);
      drawn.push({ a, env });
    }
    const marks = done.map((d) => {
      const el = h(doc, "span", { class: "tl-dn", "data-t": String(d.t), style: `left:${X(d.t).toFixed(1)}px;top:${lane(d.agent) * LANE + MID - 17}px`, title: t("tl.doneAt", { time: fmt(d.t) }) }, "✓");
      return el;
    });
    const wrap = h(doc, "div", { class: "tl-envs", style: `left:${left}px;width:${width}px` }, ...envs, ...marks);
    const holder = h(doc, "div", { class: "tl-svg-holder" });
    holder.innerHTML = `<svg class="tl-svg" style="left:${left}px" width="${width}" height="${order.length * LANE}" aria-hidden="true">${svg}</svg>`;
    rowsBox.append(holder.firstChild, wrap);
    paint(currentTime, new Set());
  }

  // Moves everything that depends on the time: the playhead, the bars and arrows that have happened, the clock.
  function paint(now, flash = new Set(), flashDone = false) {
    currentTime = now;
    for (const { b, el } of barEls) {
      const state = stateOf(b);
      el.className = `tl-mk o-${b.origin}${b.point ? " pt" : ""} ${state}${selectedKey === b.key ? " sel" : ""}`;
      el.style.setProperty("--p", `${progressOf(b, state)}%`);
    }
    for (const { a, env } of drawn) {
      const state = a.at > now ? "fut" : "past";
      const blink = flash.has(a.key) ? " blink" : "";
      env.className = `tl-env ${state}${blink}${selectedKey === a.key ? " sel" : ""}`;
      rowsBox.querySelector(`.tl-hog[data-key="${a.key}"]`)?.setAttribute("class", `tl-hog ${state}${blink}`);
    }
    rowsBox.querySelectorAll(".tl-dn").forEach((el) => {
      const reached = now >= Number(el.dataset.t);
      const wasFuture = el.classList.contains("fut");
      const keep = reached && el.classList.contains("blink");
      const start = reached && wasFuture && flashDone;
      el.className = `tl-dn ${reached ? "past" : "fut"}${start || keep ? " blink" : ""}`;
      if (start) globalThis.setTimeout(() => el.classList.remove("blink"), 1000);
    });
    rowsBox.querySelectorAll(".tl-ph").forEach((el) => (el.style.left = `${Math.min(100, (now / total) * 100).toFixed(3)}%`));
    clock.textContent = t("tl.clock", { now: fmt(now), total: fmt(total) });
    play.replaceChildren(doc.createTextNode(`${playing ? "❚❚" : "▶"} ${t("tl.play")}`));
  }

  // The pane or the window can change its width after the first drawing: the arrows are in pixels, so they are drawn again.
  let lastWidth = 0;
  if (typeof globalThis.ResizeObserver === "function") {
    new globalThis.ResizeObserver(() => {
      const width = rowsBox.querySelector(".tl-track")?.clientWidth ?? 0;
      if (width > 0 && width !== lastWidth) {
        lastWidth = width;
        draw();
      }
    }).observe(rowsBox);
  }

  return {
    element,
    draw,
    paint,
    setPlaying(value) {
      playing = value;
    },
  };
}
