// The Library tab: a list of runs (your runs and the library, as two tabs) on the left, the detail of the chosen run on the right.
// A card selects its run; Load in the detail opens it in Re-play.
import { h } from "./dom.js";
import { getJson, setTitle } from "./pages.js";
import { buildReplayList, filterLibrary } from "./play-model.js";
import { makeRunId } from "./engine/run-record.js";
import { importFiles } from "./library-import.js";
import { libraryActions, listKey } from "./library-keys.js";
import { makeBundle } from "./run-bundle.js";
import { lib, tabBar, runRow, loadAnyRun, rememberRun, rememberedRun } from "./play-shared.js";
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

  let selected = requestedId ?? null;
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

  // keepList: the arrow keys move the selection without leaving the list (on a phone the detail would hide it and the focus with it).
  const select = (id, { keepList = false } = {}) => {
    selected = id;
    lib.selected = id;
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
    return drawDetail();
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
  const barButton = (ui, label, count, { primary = false, disabled = false, onClick }) => {
    const button = h(doc, "button", { type: "button", class: `bar-button${primary ? " primary" : ""}`, "data-ui": ui }, label, h(doc, "span", { class: "bar-count", "aria-hidden": "true" }, String(count)));
    button.setAttribute("aria-label", `${label} (${count})`);
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
  };
  const compareBar = (mineIds) => {
    const n = lib.compare.length;
    const buttons = [
      barButton("compare-go", t("library.bar.compare"), n, { primary: true, disabled: n < 2, onClick: () => { location.hash = `#/play/compare?runs=${lib.compare.join(",")}`; } }),
    ];
    if (n > 0) {
      const clear = h(doc, "button", { type: "button", class: "bar-button", "data-ui": "compare-clear" }, t("compare.clear"));
      clear.addEventListener("click", () => {
        lib.compare = [];
        compareNote = "";
        redraw();
      });
      buttons.push(clear);
    }
    const hint = compareNote || (n > 0 ? t(n === 1 ? "compare.pickOne" : "compare.base") : "");
    const menu = createRunMenu({
      doc,
      t,
      label: t("library.bar.menu"),
      ui: "bar-menu",
      getItems: () => [
        { ui: "import-run", label: t("play.import"), onClick: () => fileInput.click() },
        { ui: "export-ticked", label: `${t("library.bar.exportTicked")} (${n})`, disabled: n === 0, onClick: () => exportRuns(lib.compare) },
        ...(mineIds.length > 0 ? [{ ui: "export-all-mine", label: `${t("library.bar.exportAll")} (${mineIds.length})`, onClick: () => exportRuns(mineIds) }] : []),
      ],
    });
    menu.element.classList.add("bar-menu");
    return h(doc, "div", { class: "compare-bar", "data-ui": "compare-bar" }, ...buttons, ...(hint ? [h(doc, "span", { class: "muted" }, hint)] : []), menu.element);
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
    importFile: () => fileInput.click(),
    loadLast: () => {
      const last = doc.querySelector('[data-ui="load-last"]');
      if (last && !last.disabled) last.click();
    },
  };
  setPageActions(pageActions);
  ctx.onLeave(() => clearPageActions(pageActions));

  async function drawDetail() {
    const token = ++detailToken;
    detailState = null;
    if (!selected) {
      detailHost.replaceChildren(h(doc, "p", { class: "library-hint", "data-ui": "library-hint" }, t("library.selectHint")));
      return;
    }
    const found = await loadAnyRun(ctx, selected);
    if (ctx.isStale() || token !== detailToken) return;
    const back = h(doc, "a", { href: "#/play", class: "back-to-list", "data-ui": "back-to-list" }, t("library.backToList"));
    back.addEventListener("click", (event) => {
      event.preventDefault();
      select(null);
    });
    if (!found) {
      detailHost.replaceChildren(back, h(doc, "p", { class: "notice", role: "alert", "data-ui": "library-not-found" }, t("library.notFound")));
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
      "edit-description": () => panel?.element.querySelector('[data-ui="about-edit"]')?.click(),
    };
    detailState = { id: selected, definition, panel };
    const labels = { load: "library.action.load", "use-in-create": "library.action.useInCreate", export: "library.action.export", compare: "library.action.compare", send: "library.action.send", delete: "library.action.delete", "edit-description": "library.action.editDescription" };
    const actions = actionList({ source, hasDefinition: Boolean(definition), canSubmit: own && canSubmit(run) }).map((ui) => ({ ui, label: t(labels[ui]), primary: ui === "load", danger: ui === "delete", onClick: handlers[ui] }));
    const view = libraryDetail({ doc, t, item, run, source, detail, facts: runFacts(run), actions, aboutPanel: panel?.element ?? null, num: (n) => new Intl.NumberFormat(ctx.lang === "cs" ? "cs-CZ" : "en-US").format(n) });
    detailHost.replaceChildren(back, view);
  }

  const draw = async () => {
    local = await listLocal();
    if (ctx.isStale()) return;
    const built = buildReplayList(gallery, local);
    const shown = filterLibrary(built.gallery, lib.query, texts ?? {});
    const mine = filterLibrary(built.mine, lib.query, texts ?? {});
    const none = (key) => h(doc, "p", { class: "notice" }, t(key));
    const row = (item) =>
      runRow(ctx, item, {
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
      const button = h(doc, "button", { type: "button", class: "tab", role: "tab", "data-ui": `pane-tab-${name}`, "aria-selected": String(active === name) }, `${t(key)} (${count})`);
      button.addEventListener("click", () => {
        lib.tab = name;
        lib.tabChosen = true;
        redraw();
      });
      return button;
    };
    const paneTabs = h(doc, "div", { class: "tabs", role: "tablist", "data-ui": "pane-tabs" }, tabButton("mine", "play.mine", built.mine.length), tabButton("library", "play.library", built.gallery.length), fileInput);
    pane.replaceChildren(
      paneTabs,
      importNote,
      keyNote,
      compareBar(active === "mine" ? built.mine.map((r) => r.id) : []),
      ...(active === "mine"
        ? [mine.length === 0 ? none(lib.query && built.mine.length > 0 ? "play.noMatches" : "play.empty") : h(doc, "ul", { class: "run-list", "data-ui": "run-list-mine" }, ...mine.map((item) => row(item)))]
        : [shown.length === 0 ? none("play.noMatches") : h(doc, "ul", { class: "run-list", "data-ui": "run-list-library" }, ...shown.map((item) => row(item)))]),
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
  await drawDetail();
}
