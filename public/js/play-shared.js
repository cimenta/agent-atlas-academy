// What the Play pages share: the tab bar with the search box, the state of the library list, the run card and the loader of a run.
import { h } from "./dom.js";
import { providerChips } from "./provider-colors.js";
import { getJson } from "./pages.js";
import { formatRunWhen } from "./play-model.js";
import { levelOf, kindOf, groupKey } from "./library-path.js";
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
export const lib = { query: "", tab: null, compare: [], right: null, tags: [], goal: "", onlyGoal: false, onlyUndone: false };

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
  const form = h(doc, "form", { class: "lib-search", role: "search", "data-ui": "library-search-form" }, input);
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

// A card of the library: the title, below it the chips (pattern and providers). A column in the top right corner holds, from the top, the tick box,
// the kind of the run as an icon (before and after, bad on purpose), the number of the step of the path and, at the bottom, the level as dots.
// The colour of the card is how the run ended (the words are there for a screen reader). The whole card selects its run (show the detail); a click
// that starts in the tick box only ticks. The title is a link to the run in the Library.
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
  // The kind of the run (before and after, bad on purpose) is an icon in the side column; its words are the label and the tip.
  const kindIcon = kind ? h(doc, "span", { class: `chip-kind ${kind}`, "data-ui": "run-kind", role: "img", "aria-label": t(`path.kind.${kind}`), title: `${t(`path.kind.${kind}`)}: ${t(`path.kindTip.${kind}`)}` }, kind === "pair" ? "⇄" : kind === "trio" ? "⇶" : "⚠") : "";
  const li = h(
    doc,
    "li",
    { class: `run-row${outcome ? ` out-${outcome}` : ""}`, "data-ui": "run-row", "data-run": item.id, "aria-current": pick.selected ? "true" : undefined },
    h(doc, "div", { class: "run-side" }, tick, kindIcon, step, dots),
    h(doc, "div", { class: "run-top" }, title, pick.base ? h(doc, "span", { class: "badge", "data-ui": "compare-base", title: t("library.tip.base") }, t("compare.baseLib")) : ""),
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
      ),
    ),
    outcome ? h(doc, "span", { class: "visually-hidden", "data-ui": "run-outcome", "data-outcome": item.outcome }, t(`result.status.${item.outcome}`)) : "",
  );
  li.addEventListener("click", (event) => {
    if (event.target?.closest?.("input")) return;
    pick.onSelect(item.id);
  });
  return li;
}

// The two runs of a before and after pair in one frame. The header holds a question mark: on hover, focus or a click it says what the pair compares
// and what each run teaches. rowOf(item) draws one card.
export function pairFrame(ctx, members, rowOf, { idPrefix = "pair-tip" } = {}) {
  const { doc, t, lang } = ctx;
  const trio = members.length === 3;
  const key = groupKey(members);
  const said = t(`pair.cmp.${key}`);
  const compares = said === `pair.cmp.${key}` ? t("pair.cmpDefault") : said;
  const teaches = (item) => item?.teaches?.[lang] ?? item?.teaches?.en ?? "";
  const tipId = `${idPrefix}-${key}`;
  const tip = h(doc, "div", { class: "pair-tip", id: tipId, role: "tooltip", hidden: true, "data-ui": "pair-tip" },
    h(doc, "b", {}, t("pair.compared")),
    h(doc, "p", {}, compares),
    h(doc, "dl", {}, ...members.flatMap((item, i) => [h(doc, "dt", {}, t(trio ? ["pair.top", "pair.middle", "pair.bottom"][i] : ["pair.top", "pair.bottom"][i])), h(doc, "dd", {}, teaches(item))])),
    h(doc, "p", { class: "muted" }, t(trio ? "pair.tickTrio" : "pair.tick")));
  const help = h(doc, "button", { type: "button", class: "pair-help", "data-ui": "pair-help", "aria-label": t("pair.help"), "aria-describedby": tipId, "aria-expanded": "false" }, "?");
  let pinned = false;
  const show = (on) => {
    tip.hidden = !on;
    help.setAttribute("aria-expanded", on ? "true" : "false");
  };
  help.addEventListener("mouseenter", () => show(true));
  help.addEventListener("mouseleave", () => { if (!pinned) show(false); });
  help.addEventListener("focus", () => show(true));
  help.addEventListener("blur", () => { if (!pinned) show(false); });
  help.addEventListener("click", (event) => {
    event.stopPropagation?.();
    pinned = !pinned;
    show(pinned);
  });
  return h(doc, "li", { class: "pair-group", "data-ui": "pair-group", "data-pair": key },
    h(doc, "div", { class: "pair-head" }, h(doc, "span", {}, `${trio ? "⇶" : "⇄"} ${t(trio ? "path.kind.trio" : "path.kind.pair")}`), help),
    tip,
    h(doc, "ul", { class: "pair-cards" }, ...members.map(rowOf)));
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
      const id = rememberedRun();
      if (id) doc.defaultView.location.hash = `#/play/run/${id}`;
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
