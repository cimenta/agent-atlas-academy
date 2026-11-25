// The Library tab: a list of runs (your runs and the library, as two tabs) on the left, the detail of the chosen run on the right.
// A card selects its run; Load in the detail opens it in Re-play.
import { h } from "./dom.js";
import { getJson, setTitle } from "./pages.js";
import { buildReplayList, filterLibrary } from "./play-model.js";
import { makeRunId } from "./engine/run-record.js";
import { importFiles } from "./library-import.js";
import { libraryActions, listKey } from "./library-keys.js";
import { makeBundle } from "./run-bundle.js";
import { lib, tabBar, runRow, pairFrame, loadAnyRun, rememberRun, rememberedRun } from "./play-shared.js";
import { libraryDetail } from "./library-detail.js";
import { actionList, runFacts, searchText } from "./library-model.js";
import { definitionFromRun } from "./create/definition.js";
import { createRunMenu } from "./replay/run-menu.js";
import { showCenterTip } from "./center-tip.js";
import { openInCreate } from "./create/draft.js";
import { downloadFile, safeFileName } from "./download.js";
import { runForExport } from "./run-export.js";
import { canSubmit, submitRun } from "./submit-run.js";
import { createAboutPanel } from "./replay/about.js";
import { MAX_COMPARE } from "./compare-model.js";
import { clearPageActions, setPageActions } from "./shortcuts.js";
import { groupOfTag, tagCounts, filterByTags, cloudRows, tagWeight } from "./library-tags.js";
import { stepOf, groupPairs } from "./library-path.js";
import { loadProgress, setDone, isDone, withoutDone } from "./library-progress.js";
import { drawPath, drawFilterBar } from "./library-path-view.js";

export { importFiles };

// The result of an import as a block above the list: the counts, then one row per run with what happened to it.
function importSummary(ctx, result, onClose) {
  const { doc, t } = ctx;
  const reasonText = (reason) => (["json", "invalid", "empty", "definition", "storage", "too_large"].includes(reason) ? t(`library.import.reason.${reason}`) : t("library.import.reason.other"));
  // A refused run says so in a word; the reason opens in a tip, so a long explanation does not squeeze the table.
  const resultCell = (row) => {
    if (row.status !== "refused") return h(doc, "td", {}, t(`library.import.status.${row.status}`));
    const why = h(doc, "button", { type: "button", class: "why-button", "data-ui": "import-why", "aria-label": t("library.import.why") }, t("library.import.why"));
    why.addEventListener("click", () => showCenterTip({ doc, content: h(doc, "p", {}, reasonText(row.reason).replace(/^./, (c) => c.toUpperCase())), sticky: true, closeLabel: t("about.close"), moveLabel: t("about.move") }));
    return h(doc, "td", {}, t("library.import.status.refused"), " ", why);
  };
  const files = new Set(result.rows.map((row) => row.file)).size;
  const level = result.counts.refused > 0 ? "warn" : "ok";
  const close = h(doc, "button", { type: "button", "data-ui": "import-close" }, t("library.import.close"));
  close.addEventListener("click", onClose);
  return h(
    doc,
    "div",
    { class: "import-summary", "data-ui": "import-summary" },
    h(doc, "div", { class: `msg ${level}`, role: "status" }, h(doc, "b", {}, t("library.import.title", { files })), t("library.import.counts", result.counts)),
    h(doc, "table", { class: "detail-table" }, h(doc, "tr", {}, h(doc, "th", {}, t("library.import.colFile")), h(doc, "th", {}, t("library.import.colRun")), h(doc, "th", {}, t("library.import.colResult"))), ...result.rows.map((row) => h(doc, "tr", { "data-status": row.status }, h(doc, "td", {}, row.file), h(doc, "td", {}, row.title || "-"), resultCell(row)))),
    h(doc, "p", { class: "facts" }, t("library.import.note")),
    close,
  );
}
import { refreshResultTab } from "./tab-state.js";

// The detail file of a library run in the language of the page (English when there is none). The index lists the languages a run has
// a detail file in (detail: ["en", "cs"]), so a run without one is not asked for.
async function loadDetail(ctx, entry) {
  const have = Array.isArray(entry?.detail) ? entry.detail : [];
  for (const lang of [ctx.lang, "en"]) {
    if (!have.includes(lang)) continue;
    try {
      return await getJson(ctx, `/runs/${entry.id}.detail.${lang}.json`);
    } catch {
      // try the next language
    }
  }
  return null;
}

// Deleting one of your own runs asks first. Returns true when it was deleted.
export async function removeLocalRun(ctx, item) {
  if (!ctx.doc.defaultView.confirm(ctx.t("play.deleteConfirm", { title: item.title }))) return false;
  await ctx.runStore.remove(item.id);
  lib.compare = lib.compare.filter((id) => id !== item.id);
  if (rememberedRun() === item.id) rememberRun("");
  await refreshResultTab(ctx);
  return true;
}

// Deletes several of the visitor's own runs after one confirmation that says how many (the library's own runs are never in the list).
export async function removeLocalRuns(ctx, ids) {
  if (ids.length === 0) return false;
  if (!ctx.doc.defaultView.confirm(ctx.t("library.bar.deleteConfirm", { n: ids.length }))) return false;
  for (const id of ids) {
    await ctx.runStore.remove(id);
    lib.compare = lib.compare.filter((x) => x !== id);
    if (rememberedRun() === id) rememberRun("");
  }
  await refreshResultTab(ctx);
  return true;
}

export async function renderLibraryTab(ctx, requestedId) {
  const { doc, t } = ctx;
  setTitle(ctx, "");
  const pane = h(doc, "aside", { class: "library-pane", "data-ui": "library-pane", "aria-label": t("play.library") });
  const detailHost = h(doc, "div", { class: "library-detail-host", "data-ui": "library-detail-host", tabindex: "-1" });
  const layout = h(doc, "div", { class: "replay-layout library-layout", "data-ui": "library-layout", "data-view": requestedId ? "detail" : "list" }, pane, detailHost);
  ctx.main.replaceChildren(layout);

  let gallery = [];
  try {
    gallery = (await getJson(ctx, "/runs/index.json")).runs ?? [];
  } catch {
    gallery = [];
  }
  const listLocal = async () => {
    try {
      return await ctx.runStore.list();
    } catch {
      return [];
    }
  };
  let local = await listLocal();
  if (ctx.isStale()) return;

  // A run opened from a link shows its detail. Coming back to the Library shows the run and the tab of the right side as they were
  // (a run that is gone is forgotten); the first visit shows the recommended path with no run chosen.
  const stillThere = (id) => Boolean(id) && (gallery.some((r) => r.id === id) || local.some((r) => r.id === id));
  let selected = requestedId ?? (stillThere(lib.selected) ? lib.selected : null);
  if (!selected) lib.selected = null;
  if (requestedId) lib.right = "detail";
  else if (!selected && (lib.right === "detail" || !lib.right)) lib.right = "path";
  else if (!lib.right) lib.right = "detail";
  let detailToken = 0;
  // What the chosen run offers to the letter keys (set when its detail is drawn), and which list is shown.
  let detailState = null;
  let activeTab = "mine";
  let focusAfter = false;
  let listScroll = 0;
  let deepLinkTab = Boolean(requestedId);
  let redraw = async () => {};
  // The words of the detail files, searched too; loaded the first time something is typed.
  let texts = null;
  const ensureTexts = async () => {
    if (texts) return;
    texts = {};
    await Promise.all(gallery.map(async (r) => {
      const d = await loadDetail(ctx, r);
      texts[r.id] = searchText(r, d);
    }));
  };
  // Choosing a card from the list adds a history entry (so the Back button of a phone returns to the list); moving between cards replaces it.
  const setAddress = (id, push) => {
    const history = doc.defaultView.history;
    const url = id ? `#/play/library/${id}` : "#/play";
    if (push) history?.pushState?.(null, "", url);
    else history?.replaceState?.(null, "", url);
  };

  tabBar(ctx, "library", {
    onQuery: async () => {
      if (lib.query.trim() !== "") await ensureTexts();
      if (!ctx.isStale()) redraw();
    },
    onFocusList: () => focusEntry(),
  });
  ctx.onLeave(() => {});

  const runLinks = () => [...pane.querySelectorAll(".run-list .run-title")];
  const focusEntry = (flash = true) => {
    // On a phone the list is hidden while the detail shows: bring it back first.
    if (layout.getAttribute("data-view") === "detail" && doc.defaultView.getComputedStyle?.(pane).display === "none") layout.setAttribute("data-view", "list");
    const links = runLinks();
    const target = links.find((link) => link.closest("li")?.getAttribute("aria-current") === "true") ?? links[0];
    if (!target) return false;
    target.focus();
    const row = target.closest("li");
    row?.classList.remove("kbd-flash");
    if (flash) {
      void row?.offsetWidth;
      row?.classList.add("kbd-flash");
    }
    return true;
  };

  // The detail may be above the part of the page the student is looking at (a step far down the path, a run at the end of the list):
  // bring it into view so it can be read without scrolling by hand. A detail that is already on screen stays where it is.
  const revealDetail = () => {
    const rect = detailHost.getBoundingClientRect?.();
    const win = doc.defaultView;
    if (!rect || !win) return;
    if (rect.top < 0 || rect.top > (win.innerHeight ?? 800) * 0.6) detailHost.scrollIntoView?.({ block: "start" });
  };

  // keepList: the arrow keys move the selection without leaving the list (on a phone the detail would hide it and the focus with it).
  const select = (id, { keepList = false } = {}) => {
    selected = id;
    lib.selected = id;
    lib.right = id ? "detail" : "path";
    setAddress(id, Boolean(id) && layout.getAttribute("data-view") === "list" && !keepList);
    // On a phone the page scrolls: the list position is kept while the detail is shown, and Back returns to it.
    const win = doc.defaultView;
    if (id && !keepList && layout.getAttribute("data-view") === "list") {
      listScroll = win.scrollY ?? 0;
      win.scrollTo?.(0, 0);
    }
    const wasDetail = layout.getAttribute("data-view") === "detail";
    if (!(keepList && layout.getAttribute("data-view") === "list")) layout.setAttribute("data-view", id ? "detail" : "list");
    if (!id && wasDetail) win.scrollTo?.(0, listScroll);
    for (const row of pane.querySelectorAll(".run-row")) {
      if (row.getAttribute("data-run") === id) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    }
    const drawn = drawRight();
    if (id && !keepList) Promise.resolve(drawn).then(revealDetail);
    return drawn;
  };

  let compareNote = "";
  // One file with the runs: the library's and your own, each as a single export would write it.
  const exportRuns = async (ids) => {
    const runs = [];
    for (const id of ids) {
      const found = await loadAnyRun(ctx, id);
      if (found) runs.push(found.run);
    }
    if (runs.length === 0) return;
    downloadFile(doc, `agent-atlas-runs-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(makeBundle(runs), null, 2), "application/json");
    compareNote = t("library.exported", { n: runs.length });
    redraw();
  };
  // The bar under the tabs: Compare with its count in the upper right corner, and a cog menu with import and export. Shown on both lists.
  const barButton = (ui, label, count, { primary = false, disabled = false, tip = "", onClick }) => {
    const button = h(doc, "button", { type: "button", class: `bar-button${primary ? " primary" : ""}`, "data-ui": ui, title: tip || undefined }, label, h(doc, "span", { class: "bar-count", "aria-hidden": "true" }, String(count)));
    button.setAttribute("aria-label", `${label} (${count})`);
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
  };
  const compareBar = (mineIds) => {
    const n = lib.compare.length;
    // Compare is there only when at least two runs are ticked.
    const buttons = n >= 2 ? [barButton("compare-go", t("library.bar.compare"), n, { primary: true, tip: t("library.tip.compare"), onClick: () => { location.hash = `#/play/compare?runs=${lib.compare.join(",")}`; } })] : [];
    if (n > 0) {
      const clear = h(doc, "button", { type: "button", class: "bar-button", "data-ui": "compare-clear", title: t("library.tip.clearTicks") }, t("compare.clear"));
      clear.addEventListener("click", () => {
        lib.compare = [];
        compareNote = "";
        redraw();
      });
      buttons.push(clear);
    }
    if (lib.tags.length > 0) {
      buttons.push(
        barButton("tags-clear", t("library.tags.clear"), lib.tags.length, {
          tip: t("library.tip.clearTags"),
          onClick: () => {
            lib.tags = [];
            redraw();
            refreshRight();
          },
        }),
      );
    }
    const ownTicked = lib.compare.filter((id) => mineIds.includes(id));
    const deleteRuns = async (ids) => {
      if (await removeLocalRuns(ctx, ids)) {
        if (ids.includes(selected)) await select(null);
        await redraw();
      }
    };
    const hint = compareNote || (n > 0 ? t(n === 1 ? "compare.pickOne" : "compare.base") : "");
    const menu = createRunMenu({
      doc,
      t,
      label: t("library.bar.menu"),
      ui: "bar-menu",
      getItems: () => [
        { ui: "only-undone", label: t(lib.onlyUndone ? "library.bar.showAll" : "library.bar.onlyUndone"), onClick: () => { lib.onlyUndone = !lib.onlyUndone; redraw(); } },
        { ui: "import-run", label: t("play.import"), onClick: () => fileInput.click() },
        { ui: "export-ticked", label: `${t("library.bar.exportTicked")} (${n})`, disabled: n === 0, onClick: () => exportRuns(lib.compare) },
        ...(mineIds.length > 0 ? [{ ui: "export-all-mine", label: `${t("library.bar.exportAll")} (${mineIds.length})`, onClick: () => exportRuns(mineIds) }] : []),
        ...(mineIds.length > 0
          ? [
              { ui: "delete-ticked", label: `${t("library.bar.deleteTicked")} (${ownTicked.length})`, disabled: ownTicked.length === 0, danger: true, onClick: () => deleteRuns(ownTicked) },
              { ui: "delete-all-mine", label: `${t("library.bar.deleteAll")} (${mineIds.length})`, danger: true, onClick: () => deleteRuns(mineIds) },
            ]
          : []),
      ],
    });
    menu.element.classList.add("bar-menu");
    // The blue bar is there only when there is something to do (a run ticked, a tag chosen, a note); the menu is in the row of the tabs.
    const bar = buttons.length > 0 || hint ? h(doc, "div", { class: "compare-bar", "data-ui": "compare-bar" }, ...buttons, ...(hint ? [h(doc, "span", { class: "muted" }, hint)] : [])) : null;
    return { bar, menu: menu.element };
  };

  // Import: a run file from your computer becomes one of your own runs.
  const importNote = h(doc, "div", { class: "import-note", "aria-live": "polite" });
  const fileInput = h(doc, "input", { type: "file", accept: ".json,application/json", multiple: true, hidden: true, "data-ui": "import-file" });
  fileInput.addEventListener("change", async () => {
    const chosen = [...(fileInput.files ?? [])];
    fileInput.value = "";
    if (chosen.length === 0) return;
    const files = await Promise.all(chosen.map(async (f) => ({ name: f.name, text: await f.text() })));
    const result = await importFiles(files, { runStore: ctx.runStore, makeId: () => makeRunId(Date.now()), reservedIds: new Set(gallery.map((r) => r.id)) });
    if (result.counts.added + result.counts.copy > 0) {
      lib.tab = "mine";
      lib.tabChosen = true;
      await refreshResultTab(ctx);
    }
    importNote.replaceChildren(importSummary(ctx, result, () => importNote.replaceChildren()));
    await redraw();
    // A single run that was added is shown right away.
    const first = result.rows.find((row) => row.status === "added" || row.status === "copy");
    if (result.rows.length === 1 && first) await select(first.id);
  });

  // A key that had nothing to act on says so here (a live region, so a screen reader reads it).
  const keyNote = h(doc, "p", { class: "kbd-note muted", role: "status", "data-ui": "key-note" });
  const say = (name) => {
    keyNote.textContent = t(`library.nothing.${name}`);
  };
  const keyActions = libraryActions({
    selectedId: () => selected,
    isOwn: (id) => local.some((r) => r.id === id),
    hasDefinition: (id) => detailState?.id === id && Boolean(detailState.definition),
    ticked: () => lib.compare,
    mineIds: () => local.map((r) => r.id),
    load: (id) => {
      location.hash = `#/play/run/${id}`;
    },
    compare: () => {
      location.hash = `#/play/compare?runs=${lib.compare.join(",")}`;
    },
    exportRuns: (ids) => exportRuns(ids),
    useInCreate: () => openInCreate(doc, t, detailState.definition),
    editDescription: () => detailState?.panel?.element.querySelector('[data-ui="about-edit"]')?.click(),
    remove: async (id) => {
      const item = local.find((r) => r.id === id);
      if (item && (await removeLocalRun(ctx, item))) {
        await select(null);
        await redraw();
      }
    },
  });
  const withNoteCleared = (fn) => () => {
    keyNote.textContent = "";
    return fn();
  };

  // Keys in the list: the arrows move between the cards (the detail follows), Left and Right switch the two lists, Space ticks,
  // Enter loads, Escape goes to the search box. The letter keys are the page actions below.
  const cardLinks = () => [...pane.querySelectorAll(".run-list .run-title")];
  pane.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const links = cardLinks();
    const at = links.indexOf(doc.activeElement);
    if (at < 0 && doc.activeElement?.getAttribute?.("role") !== "tab") return;
    const ids = links.map((l) => l.closest("li")?.getAttribute("data-run"));
    listKey(event, {
      ids,
      at,
      selectAt: (i) => {
        links[i].focus();
        select(ids[i], { keepList: true });
      },
      tickAt: (i) => pane.querySelectorAll(".run-list .run-compare")[i]?.click(),
      loadAt: (i) => {
        location.hash = `#/play/run/${ids[i]}`;
      },
      switchTab: () => {
        lib.tab = activeTab === "mine" ? "library" : "mine";
        lib.tabChosen = true;
        focusAfter = true;
        redraw();
      },
      leave: () => doc.querySelector('[data-ui="library-search"]')?.focus(),
    });
  });
  layout.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && detailHost.contains(doc.activeElement) && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      doc.querySelector('[data-ui="library-search"]')?.focus();
    }
  });

  // The keys of the page: the letters act on the chosen run or the ticked runs; i and o do what the import and load-last buttons do.
  const pageActions = {
    focusLibrary: () => focusEntry(),
    ...Object.fromEntries(Object.entries(keyActions).map(([name, fn]) => [name, withNoteCleared(fn)])),
    say,
    scope: (target) => !target || target.tagName === "BODY" || layout.contains(target),
    // q swaps the focus between the list and the detail.
    swapFocus: (target) => {
      if (!pane.contains(target)) return focusEntry(false);
      (detailHost.querySelector("button") ?? detailHost).focus();
      return true;
    },
    toggleTags: withNoteCleared(() => showTags()),
    importFile: () => fileInput.click(),
    loadLast: () => {
      const id = rememberedRun();
      if (id) doc.defaultView.location.hash = `#/play/run/${id}`;
    },
  };
  setPageActions(pageActions);
  ctx.onLeave(() => clearPageActions(pageActions));

  // The right side has three tabs: the recommended path (what a first visit shows), the tag cloud and the detail of the chosen run.
  const tagLabel = (id) => {
    const text = t(`tag.${id}`);
    return text === `tag.${id}` ? id : text;
  };
  const storage = () => {
    try {
      return doc.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  };
  const progressNow = () => {
    try {
      return loadProgress(storage());
    } catch {
      return new Set();
    }
  };
  // The one line of what a library run teaches, in the language of the page.
  const teachesOf = (item) => item?.teaches?.[ctx.lang] ?? item?.teaches?.en ?? "";
  // On a phone the list and the right side take turns; the right side is the one that is hidden while the list shows.
  const detailHidden = () => doc.defaultView.getComputedStyle?.(detailHost).display === "none";
  const showTags = () => {
    lib.right = "tags";
    if (detailHidden()) layout.setAttribute("data-view", "detail");
    drawRight();
    return true;
  };
  const refreshRight = () => {
    if (lib.right !== "detail") drawRight();
  };
  const pickTag = (tag) => {
    lib.tags = lib.tags.includes(tag) ? lib.tags.filter((x) => x !== tag) : [...lib.tags, tag];
    if (lib.tags.length > 0 && activeTab !== "library") {
      lib.tab = "library";
      lib.tabChosen = true;
    }
    // On a phone the cloud hides the list: show the list the choice has narrowed down.
    if (layout.getAttribute("data-view") === "detail" && doc.defaultView.matchMedia?.("(max-width: 759px)").matches) layout.setAttribute("data-view", "list");
    redraw();
    refreshRight();
  };
  const filterBar = () =>
    drawFilterBar({
      doc,
      t,
      tags: lib.tags,
      goal: lib.goal,
      onlyGoal: lib.onlyGoal,
      tagLabel,
      onRemove: pickTag,
      onClear: () => {
        lib.tags = [];
        redraw();
        refreshRight();
      },
      onOnlyGoal: (on) => {
        lib.onlyGoal = on;
        redraw();
        refreshRight();
      },
    });
  // What has the focus on the right (a tag, a goal, a button of a step), so it can get it back when the side is drawn again.
  const focusKey = () => {
    const el = doc.activeElement;
    if (!el || !detailHost.contains(el)) return null;
    const tag = el.getAttribute?.("data-tag");
    if (tag) return `[data-tag="${tag}"]`;
    const goal = el.getAttribute?.("data-goal");
    if (goal) return `[data-goal="${goal}"]`;
    const run = el.closest?.("li")?.getAttribute?.("data-run");
    const ui = el.getAttribute?.("data-ui");
    return run && ui ? `li[data-run="${run}"] [data-ui="${ui}"]` : null;
  };

  const drawCloud = (body) => {
    const items = buildReplayList(gallery, []).gallery;
    // With the switch on, the cloud counts only the runs of the chosen goal.
    const pool = lib.onlyGoal && lib.goal ? items.filter((item) => stepOf(item, lib.goal)) : items;
    const all = tagCounts(pool);
    const left = filterByTags(pool, lib.tags);
    const shown = tagCounts(left);
    const max = Math.max(0, ...all.values());
    const rows = cloudRows(all).map((row) =>
      h(
        doc,
        "div",
        { class: "tag-row" },
        ...row.flatMap((tag, i) => {
          const on = lib.tags.includes(tag);
          const word = h(doc, "button", { type: "button", class: `tag-word tag-${groupOfTag(tag)}${on ? " on" : ""}${!on && !shown.has(tag) ? " dim" : ""}`, "data-ui": "tag-word", "data-tag": tag, "aria-pressed": String(on), title: t(on ? "library.tags.wordTitleOn" : "library.tags.wordTitle", { tag: tagLabel(tag), n: all.get(tag) }) }, tagLabel(tag), h(doc, "sup", { class: "tag-count" }, String(all.get(tag))));
          word.style.fontSize = `${(0.9 + tagWeight(all.get(tag), max) * 1.2).toFixed(2)}rem`;
          word.addEventListener("click", () => pickTag(tag));
          // A small dot between two words, so they read as separate tags.
          return i === 0 ? [word] : [h(doc, "span", { class: "tag-sep", "aria-hidden": "true" }, "·"), word];
        }),
      ),
    );
    const key = h(doc, "div", { class: "tag-key" }, ...["pattern", "task", "efficiency", "basics"].map((g) => h(doc, "span", { class: `tag-${g}`, title: t(`library.tags.groupTip.${g}`) }, t(`library.tags.group.${g}`))));
    body.replaceChildren(
      h(doc, "h2", { class: "tag-title" }, t("library.tags.title")),
      h(doc, "p", { class: "muted" }, all.size === 0 ? t("library.tags.none") : lib.tags.length > 0 ? t("path.cloudResult", { n: left.length }) : t("path.cloudHint")),
      filterBar(),
      ...(rows.length > 0 ? [h(doc, "div", { class: "tag-cloud", role: "group", "aria-label": t("library.tags.title"), "data-ui": "tag-cloud" }, ...rows), key] : []),
    );
  };

  // Opening a step shows the run in the list (the library's list) and its detail on the right.
  const openRun = (id) => {
    if (activeTab !== "library") {
      lib.tab = "library";
      lib.tabChosen = true;
    }
    const shown = select(id);
    redraw();
    return shown;
  };
  const drawPathPane = (body) => {
    body.replaceChildren(
      drawPath({
        doc,
        t,
        items: buildReplayList(gallery, []).gallery,
        goal: lib.goal,
        tags: lib.tags,
        done: progressNow(),
        tagLabel,
        teachesOf,
        filterBar: filterBar(),
        onGoal: (goal) => {
          // A second click on the chosen goal takes the choice back: no goal, no steps.
          lib.goal = lib.goal === goal ? "" : goal;
          redraw();
          drawRight();
        },
        onToggleDone: (goal, id, on) => {
          try {
            setDone(storage(), goal, id, on);
          } catch {
            // the mark is not kept; the page still works
          }
          redraw();
          drawRight();
        },
        onOpen: openRun,
      }),
    );
  };

  async function drawDetail(body, token) {
    if (!selected) {
      body.replaceChildren(h(doc, "p", { class: "library-hint", "data-ui": "library-hint" }, t("path.detailHint")));
      return;
    }
    const found = await loadAnyRun(ctx, selected);
    if (ctx.isStale() || token !== detailToken) return;
    if (!found) {
      body.replaceChildren(h(doc, "p", { class: "notice", role: "alert", "data-ui": "library-not-found" }, t("library.notFound")));
      return;
    }
    const { run, source } = found;
    const item = [...local.map((r) => ({ ...r, source: "local" })), ...gallery].find((r) => r.id === selected) ?? { id: selected, title: run.title, pattern: run.pattern };
    const detail = source === "gallery" ? await loadDetail(ctx, item) : null;
    if (ctx.isStale() || token !== detailToken) return;
    const definition = definitionFromRun(run);
    const own = source === "local";
    let panel = null;
    if (own || run.about) {
      panel = createAboutPanel({
        doc,
        t,
        getAbout: () => run.about ?? null,
        editable: own,
        closable: false, showHeading: false,
        headingKey: own ? "about.heading" : "about.headingPattern",
        onSave: async (about) => {
          const next = { ...run };
          if (about) next.about = about;
          else delete next.about;
          const result = await ctx.runStore.save(next);
          if (result?.ok) {
            if (about) run.about = about;
            else delete run.about;
          }
          return result;
        },
      });
      panel.open();
    }
    const handlers = {
      load: () => {
        location.hash = `#/play/run/${selected}`;
      },
      "use-in-create": () => openInCreate(doc, t, definition),
      export: () => downloadFile(doc, `${safeFileName(run.id)}.json`, JSON.stringify(runForExport(run), null, 2), "application/json"),
      compare: () => {
        lib.compare = [selected, ...lib.compare.filter((id) => id !== selected)].slice(0, MAX_COMPARE);
        compareNote = t("library.compareHint");
        redraw();
      },
      send: () => submitRun(doc, t, run),
      delete: async () => {
        if (await removeLocalRun(ctx, { id: selected, title: run.title })) {
          await select(null);
          await redraw();
        }
      },
      "edit-description": () => {
        body.querySelector('[data-ui="detail-tab-pattern"]')?.click();
        panel?.element.querySelector('[data-ui="about-edit"]')?.click();
      },
    };
    const libraryCounts = tagCounts(buildReplayList(gallery, []).gallery);
    const tagInfo = (tag) => {
      const desc = t(`tag.desc.${tag}`);
      if (desc === `tag.desc.${tag}`) return null;
      const n = libraryCounts.get(tag) ?? 0;
      return { text: desc, badge: n > 0 ? t(n === 1 ? "library.tip.tagRun1" : "library.tip.tagRuns", { n }) : "" };
    };
    detailState = { id: selected, definition, panel };
    const labels = { load: "library.action.load", "use-in-create": "library.action.useInCreate", export: "library.action.export", compare: "library.action.compare", send: "library.action.send", delete: "library.action.delete", "edit-description": "library.action.editDescription" };
    const actions = actionList({ source, hasDefinition: Boolean(definition), canSubmit: own && canSubmit(run) }).map((ui) => ({ ui, label: t(labels[ui]), primary: ui === "load", danger: ui === "delete", onClick: handlers[ui] }));
    const view = libraryDetail({ doc, t, item, run, source, detail, facts: runFacts(run), actions, aboutPanel: panel?.element ?? null, tagLabel, tagInfo, num: (n) => new Intl.NumberFormat(ctx.lang === "cs" ? "cs-CZ" : "en-US").format(n) });
    body.replaceChildren(view);
  }

  let focusRightTab = false;
  const RIGHT_TABS = ["path", "tags", "detail"];
  const rightTabs = () => {
    const label = { path: "path.tab", tags: "path.tags", detail: "path.detail" };
    const list = h(
      doc,
      "div",
      { class: "tabs right-tabs", role: "tablist", "aria-label": t("path.tabs"), "data-ui": "right-tabs" },
      ...RIGHT_TABS.map((name) => {
        const button = h(doc, "button", { type: "button", class: "tab", role: "tab", "data-ui": `right-tab-${name}`, "aria-selected": String(lib.right === name), tabindex: lib.right === name ? "0" : "-1" }, t(label[name]));
        button.addEventListener("click", () => {
          lib.right = name;
          focusRightTab = true;
          drawRight();
        });
        return button;
      }),
    );
    list.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const at = RIGHT_TABS.indexOf(lib.right);
      lib.right = RIGHT_TABS[(at + (event.key === "ArrowRight" ? 1 : RIGHT_TABS.length - 1)) % RIGHT_TABS.length];
      focusRightTab = true;
      drawRight();
    });
    return list;
  };

  async function drawRight() {
    const token = ++detailToken;
    detailState = null;
    const key = focusKey();
    // On a phone the right side comes with a link back to the list.
    const back = h(doc, "a", { href: "#/play", class: "back-to-list", "data-ui": "back-to-list" }, t("library.backToList"));
    back.addEventListener("click", (event) => {
      event.preventDefault();
      if (lib.right === "detail" && selected) select(null);
      else layout.setAttribute("data-view", "list");
    });
    const body = h(doc, "div", { class: "right-body", "data-ui": "right-body" });
    const tabs = rightTabs();
    detailHost.replaceChildren(back, tabs, body);
    if (focusRightTab) {
      focusRightTab = false;
      tabs.querySelector('[aria-selected="true"]')?.focus();
    }
    if (lib.right === "path") drawPathPane(body);
    else if (lib.right === "tags") drawCloud(body);
    else {
      await drawDetail(body, token);
      return;
    }
    if (key) body.querySelector(key)?.focus();
  }

  const draw = async () => {
    local = await listLocal();
    if (ctx.isStale()) return;
    const built = buildReplayList(gallery, local);
    // With the switch on the right, the library list holds only the runs of the chosen goal.
    const ofGoal = lib.onlyGoal && lib.goal ? built.gallery.filter((item) => stepOf(item, lib.goal)) : built.gallery;
    // With "Not done only" a run marked done on the path (in any goal) is left out.
    const undone = lib.onlyUndone ? withoutDone(ofGoal, progressNow()) : ofGoal;
    const shown = filterLibrary(filterByTags(undone, lib.tags), lib.query, texts ?? {});
    const mine = filterLibrary(built.mine, lib.query, texts ?? {});
    const none = (key) => h(doc, "p", { class: "notice" }, t(key));
    // The steps of the goal that is chosen on the path: a run of that goal shows its number, done or not.
    const progress = progressNow();
    const row = (item) =>
      runRow(ctx, item, {
        goal: lib.goal,
        step: stepOf(item, lib.goal) ? { n: stepOf(item, lib.goal), done: isDone(progress, lib.goal, item.id) } : null,
        checked: lib.compare.includes(item.id),
        base: lib.compare[0] === item.id,
        selected: item.id === selected,
        onSelect: (id) => select(id),
        onToggle: (on) => {
          if (on && lib.compare.length >= MAX_COMPARE) {
            compareNote = t("compare.max", { n: MAX_COMPARE });
          } else {
            compareNote = "";
            lib.compare = on ? [...lib.compare, item.id] : lib.compare.filter((id) => id !== item.id);
          }
          redraw();
        },
      });
    // Two tabs in the list: your runs and the library. A run opened from a link shows its own tab; otherwise the last choice, or the
    // tab with something in it.
    const tabOfSelected = selected ? (built.mine.some((r) => r.id === selected) ? "mine" : built.gallery.some((r) => r.id === selected) ? "library" : null) : null;
    if (tabOfSelected && deepLinkTab) lib.tab = tabOfSelected;
    deepLinkTab = false;
    const active = lib.tab ?? (built.mine.length > 0 ? "mine" : "library");
    activeTab = active;
    const focusedId = pane.contains(doc.activeElement) ? doc.activeElement.closest?.("li")?.getAttribute("data-run") : null;
    const tabButton = (name, key, count) => {
      const button = h(doc, "button", { type: "button", class: "tab", role: "tab", "data-ui": `pane-tab-${name}`, title: t(name === "mine" ? "library.tip.tabMine" : "library.tip.tabLibrary"), "aria-selected": String(active === name) }, `${t(key)} (${count})`);
      button.addEventListener("click", () => {
        lib.tab = name;
        lib.tabChosen = true;
        redraw();
      });
      return button;
    };
    const bar = compareBar(active === "mine" ? built.mine.map((r) => r.id) : []);
    const paneTabs = h(doc, "div", { class: "tabs", role: "tablist", "data-ui": "pane-tabs" }, tabButton("mine", "play.mine", built.mine.length), tabButton("library", "play.library", built.gallery.length), h(doc, "span", { class: "tab-tools" }, bar.menu), fileInput);
    pane.replaceChildren(
      paneTabs,
      importNote,
      keyNote,
      ...(bar.bar ? [bar.bar] : []),
      ...(active === "mine"
        ? [mine.length === 0 ? none(lib.query && built.mine.length > 0 ? "play.noMatches" : "play.empty") : h(doc, "ul", { class: "run-list", "data-ui": "run-list-mine" }, ...mine.map((item) => row(item)))]
        : [shown.length === 0 ? none("play.noMatches") : h(doc, "ul", { class: "run-list", "data-ui": "run-list-library" }, ...groupPairs(shown).map((entry) => (entry.pair ? pairFrame(ctx, entry.pair, row) : row(entry))))]),
    );
    // The list was drawn again (a tick, the other list): the focus stays on the same card, or goes to the first card after Left or Right.
    const links = [...pane.querySelectorAll(".run-list .run-title")];
    const keep = focusedId && links.find((l) => l.closest("li")?.getAttribute("data-run") === focusedId);
    if (focusAfter) {
      focusAfter = false;
      if (!focusEntry(false)) pane.querySelector('[role="tab"][aria-selected="true"]')?.focus();
    } else if (keep) keep.focus();
  };
  redraw = draw;
  await draw();
  await drawRight();
}
