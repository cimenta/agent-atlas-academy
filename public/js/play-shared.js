// What the Play pages share: the tab bar with the search box, the state of the library list, the run card and the loader of a run.
import { h } from "./dom.js";
import { providerChips } from "./provider-colors.js";
import { getJson } from "./pages.js";
import { formatRunWhen } from "./play-model.js";
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
export const lib = { query: "", tab: null, compare: [], cloud: true, tags: [] };

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
export function runMeta({ doc, lang }, item) {
  const when = formatRunWhen(item.createdAt, lang);
  return when ? h(doc, "span", { class: "run-meta" }, h(doc, "span", { class: "run-when-text", "data-ui": "run-when" }, when)) : "";
}

// How the run ended, as a round icon: a check, a stop mark or a cross on a green, amber or red background.
const OUTCOME_ICONS = { ok: "✓", warn: "■", fail: "✕" };
export function outcomeIcon({ doc, t }, item) {
  if (!item.outcome) return "";
  const level = item.outcome === "finished" ? "ok" : item.outcome === "stopped_user" || item.outcome === "stopped_limit" || item.outcome === "waiting_approval" ? "warn" : "fail";
  const label = t(`result.status.${item.outcome}`);
  return h(doc, "span", { class: `outcome-icon ${level}`, role: "img", "aria-label": label, title: label, "data-ui": "run-outcome-chip", "data-outcome": item.outcome }, OUTCOME_ICONS[level]);
}

// The providers a run used, each a chip in its color from Settings.
export function providerRow({ doc, settings }, item) {
  const chips = providerChips(item.provider, settings?.get().providerColors);
  if (!chips.length) return "";
  const out = h(doc, "span", { class: "run-providers", "data-ui": "run-providers" });
  for (const c of chips) {
    const chip = h(doc, "span", { class: "provider-chip", "data-provider": c.id }, c.name);
    if (chip.style) {
      chip.style.background = c.background;
      chip.style.color = c.color;
    }
    out.append(chip);
  }
  return out;
}

// A card of the library: the title with the outcome icon and the tick box on top, the time below, then the providers and the pattern tag.
// The whole card selects its run (show the detail); a click that starts in the tick box only ticks. The title is a link to the run in the Library.
// pick: { checked, base, selected, onToggle(on), onSelect(id) }
export function runRow(ctx, item, pick) {
  const { doc, t } = ctx;
  const tick = h(doc, "input", { type: "checkbox", class: "run-compare", "data-ui": "compare-select", checked: pick.checked, "aria-label": t("compare.select", { title: item.title }) });
  tick.addEventListener("change", () => pick.onToggle(tick.checked));
  const title = h(doc, "a", { href: `#/play/library/${item.id}`, class: "run-title" }, item.title);
  // The link selects without leaving the page; the card's own click would select a second time, so it is told the link did.
  title.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation?.();
    pick.onSelect(item.id);
  });
  const li = h(
    doc,
    "li",
    { class: "run-row", "data-ui": "run-row", "data-run": item.id, "aria-current": pick.selected ? "true" : undefined },
    title,
    pick.base ? h(doc, "span", { class: "badge", "data-ui": "compare-base" }, t("compare.baseLib")) : "",
    h(doc, "span", { class: "run-tools" }, outcomeIcon(ctx, item), tick),
    runMeta(ctx, item),
    providerRow(ctx, item),
    h(doc, "span", { class: `type-chip type-${item.pattern}`, "data-ui": "run-type" }, t(`pattern.${item.pattern}`)),
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
