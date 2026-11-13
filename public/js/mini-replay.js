// A small decorative replay for the home page on phones: three agents that wake up one after the other, with a
// spinning cog on the agent that is working. It is not a real run and has no controls that do anything.
const AGENTS = ["researcher", "writer", "critic"];
const STEPS = 6;
const CYCLE = STEPS + 2;

// What the agents show at a given tick: waiting, working or done.
export function miniStatuses(tick) {
  const at = ((tick % CYCLE) + CYCLE) % CYCLE;
  return AGENTS.map((_, i) => (at >= i * 2 + 2 ? "done" : at >= i * 2 ? "working" : "waiting"));
}

export function miniStepNumber(tick) {
  const at = ((tick % CYCLE) + CYCLE) % CYCLE;
  return Math.max(1, Math.min(at + 1, STEPS));
}

export function createMiniReplay({ doc, t, h, setInterval: every = (fn, ms) => globalThis.setInterval(fn, ms), clearInterval: stop = (id) => globalThis.clearInterval(id), intervalMs = 1100 }) {
  const cards = AGENTS.map((id) => {
    const state = h(doc, "span", { class: "mini-state" }, t("player.statusWaiting"));
    const cog = h(doc, "span", { class: "mini-cog", "aria-hidden": "true" }, "\u2699");
    const card = h(doc, "div", { class: "mini-agent", "data-status": "waiting" }, cog, h(doc, "b", {}, t(`agent.${id}.label`)), state);
    return { card, state };
  });
  const parts = [];
  cards.forEach((c, i) => {
    if (i > 0) parts.push(h(doc, "span", { class: "mini-arrow", "aria-hidden": "true" }, "\u2192"));
    parts.push(c.card);
  });
  const fill = h(doc, "i", { class: "mini-fill" });
  const stepText = h(doc, "span", { class: "mini-step" }, "");
  const element = h(
    doc,
    "div",
    { class: "mini-replay", "data-ui": "mini-replay", "aria-hidden": "true" },
    h(doc, "div", { class: "mini-agents" }, ...parts),
    h(
      doc,
      "div",
      { class: "mini-controls" },
      h(doc, "span", { class: "mini-btn" }, "\u25B6"),
      h(doc, "span", { class: "mini-btn" }, "\u21BA"),
      h(doc, "span", { class: "mini-bar" }, fill),
      stepText,
    ),
  );
  let tick = 0;
  const paint = () => {
    miniStatuses(tick).forEach((status, i) => {
      cards[i].card.setAttribute("data-status", status);
      cards[i].state.textContent = t(status === "done" ? "player.statusDone" : status === "working" ? "player.statusWorking" : "player.statusWaiting");
    });
    const step = miniStepNumber(tick);
    fill.style.width = `${Math.round(((step - 1) / (STEPS - 1)) * 100)}%`;
    stepText.textContent = t("player.step", { n: step, total: STEPS });
  };
  paint();
  const id = every(() => {
    tick += 1;
    paint();
  }, intervalMs);
  return { element, destroy: () => stop(id) };
}
