// What the Play pages share: the tab bar with the search box, the state of the library list, the run card and the loader of a run.
import { h } from "./dom.js";
import { providerChips } from "./provider-colors.js";
import { getJson } from "./pages.js";
import { formatRunWhen } from "./play-model.js";
import { levelOf, kindOf } from "./library-path.js";
import { refreshResultTab } from "./tab-state.js";
import { clearPageActions, setPageActions } from "./shortcuts.js";

export const PLAY_TABS = [
  { view: "library", href: "#/play", key: "play.tab.library" },
  { view: "replay", href: "#/play/replay", key: "play.tab.replay" },
  { view: "create", href: "#/play/create", key: "play.tab.create" },
  { view: "result", href: "#/play/result", key: "play.tab.result" },
];
export const TAB_OF_VIEW = { library: "library", replay: "replay", run: "replay", create: "create", result: "result" };

// compare: the runs ticked in the library, in the order they were ticked (the first is the base of a comparison).
// The run Create has just finished: Re-play opens it at its end, where the warnings and the message about the end are, not at the start.
export const justFinished = { id: null };
export const lib = { query: "", tab: null, compare: [], right: null, tags: [], goal: "patterns", onlyGoal: false, onlyUndone: false };

// The tab bar lives in the site header, with the library search next to it.
export function tabBar(ctx, view, { onQuery, onFocusList, intro, resultOpen = false } = {}) {
  const { doc, t } = ctx;
  const slot = doc.getElementById("play-tabs");
  if (!slot) return;
  const active = TAB_OF_VIEW[view] ?? "replay";
  const nav = h(
    doc,
    "nav",
    { class: "play-tabs", "aria-label": t("play.tabs") },
    ...PLAY_TABS.map((tab) => h(doc, "a", { href: tab.view === "replay" && rememberedRun() ? `#/play/run/${rememberedRun()}` : tab.href, "data-ui": `tab-${tab.view}`, "aria-current": tab.view === active ? "page" : undefined }, t(tab.key))),
  );
  // On Create there is nothing to search, so the box is greyed out.
  const none = view === "create";
  const input = h(doc, "input", { type: "search", value: none ? "" : lib.query, placeholder: t(none ? "play.searchNone" : "play.search"), "aria-label": t(none ? "play.searchNone" : "play.searchLabel"), "data-ui": "library-search", autocomplete: "off", ...(none ? { disabled: true } : {}) });
  const last = h(doc, "button", { type: "button", "data-ui": "load-last", title: t("play.loadLast"), "aria-label": t("play.loadLast") }, "↻");
  const lastId = rememberedRun();
  last.disabled = !lastId;
  if (!lastId) last.title = t("play.loadLastNone");
  last.addEventListener("click", () => {
    const id = rememberedRun();
    if (id) location.hash = `#/play/run/${id}`;
  });
  const form = h(doc, "form", { class: "lib-search", role: "search", "data-ui": "library-search-form" }, input, last);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    lib.query = input.value;
    if (onQuery) onQuery(lib.query);
    else location.hash = "#/play";
  });
  input.addEventListener("input", () => {
    lib.query = input.value;
    onQuery?.(lib.query);
  });
  // From the search box the arrow down moves into the list of runs.
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && onFocusList?.()) event.preventDefault();
  });
  slot.replaceChildren(...(intro?.length ? [h(doc, "div", { class: "play-intro", "data-ui": "play-intro" }, ...intro)] : []), nav, form);
  slot.hidden = false;
  refreshResultTab(ctx, resultOpen);
}

// The line under the title: how the run ended and when it was made (your own runs).
export function runMeta({ doc, lang, t }, item) {
  const when = formatRunWhen(item.createdAt, lang);
  return when ? h(doc, "span", { class: "run-meta" }, h(doc, "span", { class: "run-when-text", "data-ui": "run-when", title: t("library.tip.when") }, when)) : "";
}

// What a pattern chip says when the mouse rests on it: the name and the one line of Create.
function patternTip(t, pattern) {
  const about = t(`create.pattern.${pattern}`);
  return t("library.tip.pattern", { name: t(`pattern.${pattern}`), about: about === `create.pattern.${pattern}` ? "" : about }).trim();
}

// How the run ended, as the colour of its card: finished green, stopped amber, failed red.
export const outcomeLevel = (outcome) => (!outcome ? "" : outcome === "finished" ? "ok" : outcome === "stopped_user" || outcome === "stopped_limit" || outcome === "waiting_approval" ? "warn" : "fail");

// The providers a run used, each a chip in its color from Settings.
export function providerRow({ doc, settings, t }, item) {
  const chips = providerChips(item.provider, settings?.get().providerColors);
  if (!chips.length) return "";
  const out = h(doc, "span", { class: "run-providers", "data-ui": "run-providers" });
  for (const c of chips) {
    const chip = h(doc, "span", { class: "provider-chip", "data-provider": c.id, title: t("library.tip.provider", { name: c.name }) }, c.name);
    if (chip.style) {
      chip.style.background = c.background;
      chip.style.color = c.color;
    }
    out.append(chip);
  }
  return out;
}

// A card of the library: the tick box and the title on top, the number of the step of the path in the top right corner, below the chips
// (pattern, providers, before and after or bad on purpose) and the level as dots in the bottom right corner. The colour of the card is how
// the run ended (the words are there for a screen reader). The whole card selects its run (show the detail); a click that starts in the
// tick box only ticks. The title is a link to the run in the Library.
// pick: { checked, base, selected, onToggle(on), onSelect(id), step?: { n, done }, goal? }
export function runRow(ctx, item, pick) {
  const { doc, t } = ctx;
  const tick = h(doc, "input", { type: "checkbox", class: "run-compare", "data-ui": "compare-select", title: t("library.tip.tick"), checked: pick.checked, "aria-label": t("compare.select", { title: item.title }) });
  tick.addEventListener("change", () => pick.onToggle(tick.checked));
  const title = h(doc, "a", { href: `#/play/library/${item.id}`, class: "run-title" }, item.title);
  // The link selects without leaving the page; the card's own click would select a second time, so it is told the link did.
  title.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation?.();
    pick.onSelect(item.id);
  });
  const outcome = outcomeLevel(item.outcome);
  const level = levelOf(item);
  const kind = kindOf(item);
  const step = pick.step
    ? h(doc, "span", { class: `step-icon${pick.step.done ? " done" : ""}`, "data-ui": "run-step", role: "img", "aria-label": t(pick.step.done ? "path.stepDone" : "path.step", { n: pick.step.n }), title: t("path.stepTip", { n: pick.step.n, goal: pick.goal ? t(`path.goal.${pick.goal}`) : "" }) }, pick.step.done ? `✓ ${pick.step.n}` : String(pick.step.n))
    : "";
  const dots = level
    ? h(doc, "span", { class: `lv-dots l${level}`, "data-ui": "run-level", role: "img", "aria-label": t("path.level.label", { level: t(`path.level.${level}`) }), title: t(`path.level.${level}`) }, ...[1, 2, 3].map((n) => h(doc, "i", { class: n <= level ? "on" : undefined })))
    : "";
  const li = h(
    doc,
    "li",
    { class: `run-row${outcome ? ` out-${outcome}` : ""}`, "data-ui": "run-row", "data-run": item.id, "aria-current": pick.selected ? "true" : undefined },
    h(doc, "div", { class: "run-top" }, tick, title, pick.base ? h(doc, "span", { class: "badge", "data-ui": "compare-base", title: t("library.tip.base") }, t("compare.baseLib")) : ""),
    step,
    runMeta(ctx, item),
    h(
      doc,
      "div",
      { class: "run-bottom" },
      h(
        doc,
        "span",
        { class: "run-chips" },
        h(doc, "span", { class: `type-chip type-${item.pattern}`, "data-ui": "run-type", title: patternTip(t, item.pattern) }, t(`pattern.${item.pattern}`)),
        providerRow(ctx, item),
        kind ? h(doc, "span", { class: `chip-kind ${kind}`, "data-ui": "run-kind", title: t(`path.kindTip.${kind}`) }, t(`path.kind.${kind}`)) : "",
      ),
      dots,
    ),
    outcome ? h(doc, "span", { class: "visually-hidden", "data-ui": "run-outcome", "data-outcome": item.outcome }, t(`result.status.${item.outcome}`)) : "",
  );
  li.addEventListener("click", (event) => {
    if (event.target?.closest?.("input")) return;
    pick.onSelect(item.id);
  });
  return li;
}

const LAST_RUN_KEY = "aa.lastRun";
export const rememberedRun = () => {
  try {
    return localStorage.getItem(LAST_RUN_KEY);
  } catch {
    return null;
  }
};
export const rememberRun = (id) => {
  try {
    localStorage.setItem(LAST_RUN_KEY, id);
  } catch {
    // remembering is a convenience
  }
};

export async function loadAnyRun(ctx, id) {
  if (typeof id !== "string") return null;
  try {
    const local = await ctx.runStore.get(id);
    if (local) return { run: local, source: "local" };
  } catch {
    // fall through to the examples
  }
  try {
    return { run: await getJson(ctx, `/runs/${id}.json`), source: "gallery" };
  } catch {
    return null;
  }
}


// The keys of Re-play and Result: b goes back to the run in the Library (nothing to go back to without a run), o loads the last opened run.
export function registerPlayKeys(ctx, runId) {
  const { doc } = ctx;
  const actions = {
    back: () => {
      location.hash = runId ? `#/play/library/${runId}` : "#/play";
      return true;
    },
    loadLast: () => {
      const last = doc.querySelector('[data-ui="load-last"]');
      if (last && !last.disabled) last.click();
    },
    say: (name) => {
      let note = doc.querySelector('[data-ui="key-note"]');
      if (!note) {
        note = h(doc, "p", { class: "kbd-note muted", role: "status", "data-ui": "key-note" });
        ctx.main.prepend(note);
      }
      note.textContent = ctx.t(`library.nothing.${name}`);
    },
  };
  setPageActions(actions);
  ctx.onLeave(() => clearPageActions(actions));
}
