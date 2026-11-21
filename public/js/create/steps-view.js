// The parts the guided Create steps are made of: status icon, step bar, footer, inner tabs. No rules here: the state
// comes from steps-model.js and the page decides what a click does.
import { h } from "../dom.js";
import { STEPS } from "./steps-model.js";

const LABEL = { attn: "create.status.attn", none: "create.status.none", part: "create.status.part", done: "create.status.done", lock: "create.status.locked" };

// state: "none" (nothing set), "part" (partly set), "done" (set) or "lock" (not open yet).
export function statusIcon(doc, state, t) {
  return h(doc, "span", { class: "st", "data-s": state, role: "img", "aria-label": t(LABEL[state] ?? LABEL.none) });
}

// The three step tabs. A step that is not open yet is disabled and shows the lock.
export function stepBar({ doc, t, status, current, onGo }) {
  const element = h(doc, "div", { class: "step-bar", role: "tablist", "data-ui": "step-bar" });
  function update(next, now) {
    element.replaceChildren(
      ...STEPS.map((step, i) => {
        const locked = next.locked[step] === true;
        const button = h(doc, "button", { type: "button", class: "step-tab", role: "tab", "data-step": step, "aria-selected": String(now === step), title: locked ? t("create.step.locked") : undefined }, statusIcon(doc, locked ? "lock" : next[step], t), `${i + 1}. ${t(`create.step.${step}`)}`);
        button.disabled = locked;
        button.addEventListener("click", () => {
          if (!locked) onGo(step);
        });
        return button;
      }),
    );
  }
  update(status, current);
  return { element, update };
}

// Back, Next and Run with a line that says what is still missing. nav: what navState gives.
export function footer({ doc, t, onBack, onNext, onRun }) {
  const hint = h(doc, "p", { class: "hint step-hint", "data-ui": "step-hint", role: "status" });
  const button = (ui, text, handler, cls) => {
    const el = h(doc, "button", { type: "button", class: cls, "data-ui": ui }, text);
    el.addEventListener("click", handler);
    return el;
  };
  const back = button("step-back", t("create.back"), () => onBack(), "step-nav");
  const next = button("step-next", t("create.next"), () => onNext(), "step-nav");
  const run = button("run-button", t("create.run"), () => onRun(), "primary run-button");
  const element = h(doc, "div", { class: "step-footer", "data-ui": "step-footer" }, hint, h(doc, "span", { class: "step-footer-buttons" }, back, next, run));
  function update({ nav, hint: text }) {
    back.disabled = !nav.back;
    next.disabled = !nav.next;
    run.disabled = !nav.run;
    hint.replaceChildren(doc.createTextNode(text));
  }
  return { element, update };
}

// The tabs inside step 3. tabs: [{ id, label, state? }]; a tab with a state shows its status icon.
export function innerTabs({ doc, t, tabs, current, onSelect }) {
  const element = h(doc, "div", { class: "inner-tabs", role: "tablist", "data-ui": "inner-tabs" });
  function update(now, states = {}) {
    element.replaceChildren(
      ...tabs.map((tab) => {
        const state = states[tab.id] ?? tab.state;
        const button = h(doc, "button", { type: "button", class: "inner-tab", role: "tab", "data-tab": tab.id, "aria-selected": String(now === tab.id) }, tab.label, ...(state ? [statusIcon(doc, state, t)] : []));
        button.addEventListener("click", () => onSelect(tab.id));
        return button;
      }),
    );
  }
  update(current);
  return { element, update };
}

// A numbered heading of a part of step 1: status icon, text, its help buttons and, right-aligned, an extra control.
// help: an array of help buttons. setState changes the icon when the part gets decided.
export function partHeading({ doc, t, state, text, help = [], extra = null }) {
  const element = h(doc, "h3", { class: "part-heading" });
  const icon = statusIcon(doc, state, t);
  element.append(icon, h(doc, "span", { class: "part-text" }, text), ...help);
  if (extra) element.append(h(doc, "span", { class: "part-extra" }, extra));
  return {
    element,
    setState(next) {
      icon.setAttribute("data-s", next);
      icon.setAttribute("aria-label", t(LABEL[next] ?? LABEL.none));
    },
  };
}

// The bar on top of the workspace layout: where the student stands (three status chips), the estimate and Run.
// update({ status, estimate, hint, runEnabled }): status is what stepStatus gives, estimate a short text ("" when there is none).
export function workspaceBar({ doc, t, onRun }) {
  const chip = (key) => {
    const icon = statusIcon(doc, "none", t);
    return { icon, element: h(doc, "span", { class: "workspace-chip", "data-ui": "workspace-chip" }, icon, t(key === "check" ? "create.ws.check" : `create.step.${key}`)) };
  };
  const chipSetup = chip("setup");
  const chipDiagram = chip("diagram");
  const chipCheck = chip("check");
  const agentCount = h(doc, "span", { class: "pill", "data-ui": "workspace-agents" });
  chipDiagram.element.append(agentCount);
  const estimate = h(doc, "span", { class: "workspace-estimate", "data-ui": "workspace-estimate" });
  const run = h(doc, "button", { type: "button", class: "primary run-button", "data-ui": "run-button" }, t("create.run"));
  run.addEventListener("click", () => onRun());
  const hint = h(doc, "p", { class: "hint step-hint workspace-hint", "data-ui": "step-hint", role: "status" });
  const element = h(doc, "div", { class: "workspace-bar", "data-ui": "workspace-bar" }, h(doc, "div", { class: "workspace-chips" }, chipSetup.element, chipDiagram.element, chipCheck.element), estimate, run);
  let lastHint = null;
  const setIcon = (icon, state) => {
    icon.setAttribute("data-s", state);
    icon.setAttribute("aria-label", t(LABEL[state] ?? LABEL.none));
  };
  function update({ status, estimate: text, hint: hintText, runEnabled, agents = 0 }) {
    agentCount.replaceChildren(doc.createTextNode(t("create.ws.agentMany", { n: agents })));
    setIcon(chipSetup.icon, status.setup);
    setIcon(chipDiagram.icon, status.locked.diagram ? "lock" : status.diagram);
    setIcon(chipCheck.icon, status.locked.check ? "lock" : status.check);
    estimate.replaceChildren(doc.createTextNode(text === "" || text === undefined ? t("create.ws.noEstimate") : text));
    run.disabled = !runEnabled;
    // Only when the text changes, so a screen reader does not repeat it on every keystroke.
    if (hintText !== lastHint) {
      hint.replaceChildren(doc.createTextNode(hintText));
      lastHint = hintText;
    }
  }
  return { element, hintElement: hint, update };
}
