// The Play section: sub-tabs Re-play, Create and Result.
import { h } from "./dom.js";
import { mountReplay } from "./replay/view.js";
import { getJson, loadExplanations, renderNotFound, setTitle } from "./pages.js";
import { buildReplayList, filterLibrary, formatRunWhen, prepareImport } from "./play-model.js";
import { makeRunId } from "./engine/run-record.js";
import { renderResult } from "./result-page.js";
import { renderCreate } from "./create/create-page.js";
import { createRunMenu } from "./replay/run-menu.js";
import { definitionFromRun } from "./create/definition.js";
import { openInCreate } from "./create/draft.js";
import { downloadFile, safeFileName } from "./download.js";
import { runForExport } from "./run-export.js";
import { refreshResultTab } from "./tab-state.js";
import { clearPageActions, focusActivePlayer, setPageActions } from "./shortcuts.js";

const TABS = [
  { view: "replay", href: "#/play", key: "play.tab.replay" },
  { view: "create", href: "#/play/create", key: "play.tab.create" },
  { view: "result", href: "#/play/result", key: "play.tab.result" },
];
const TAB_OF_VIEW = { replay: "replay", run: "replay", create: "create", result: "result" };

const PANE_KEY = "aa.libraryOpen";
const paneOpen = () => {
  try {
    return localStorage.getItem(PANE_KEY) !== "0";
  } catch {
    return true;
  }
};
const lib = { query: "", open: paneOpen(), tab: null };

// The tab bar lives in the site header, with the library search next to it.
function tabBar(ctx, view, { onQuery, onToggle, onFocusList, intro, resultOpen = false } = {}) {
  const { doc, t } = ctx;
  const slot = doc.getElementById("play-tabs");
  if (!slot) return;
  const active = TAB_OF_VIEW[view] ?? "replay";
  const nav = h(
    doc,
    "nav",
    { class: "play-tabs", "aria-label": t("play.tabs") },
    ...TABS.map((tab) => h(doc, "a", { href: tab.href, "data-ui": `tab-${tab.view}`, "aria-current": tab.view === active ? "page" : undefined }, t(tab.key))),
  );
  const input = h(doc, "input", { type: "search", value: lib.query, placeholder: t("play.search"), "aria-label": t("play.searchLabel"), "data-ui": "library-search", autocomplete: "off" });
  const last = h(doc, "button", { type: "button", "data-ui": "load-last", title: t("play.loadLast"), "aria-label": t("play.loadLast") }, "↻");
  const lastId = rememberedRun();
  last.disabled = !lastId;
  if (!lastId) last.title = t("play.loadLastNone");
  last.addEventListener("click", () => {
    const id = rememberedRun();
    if (id) location.hash = `#/play/run/${id}`;
  });
  const toggle = onToggle
    ? h(doc, "button", { type: "button", class: "pane-toggle", "data-ui": "library-toggle", "aria-pressed": String(lib.open), title: t("play.toggleLibrary"), "aria-label": t("play.toggleLibrary") }, "▤")
    : "";
  if (onToggle) {
    toggle.addEventListener("click", () => {
      lib.open = !lib.open;
      try {
        localStorage.setItem(PANE_KEY, lib.open ? "1" : "0");
      } catch {
        // remembering is a convenience
      }
      toggle.setAttribute("aria-pressed", String(lib.open));
      onToggle(lib.open);
    });
  }
  const form = h(doc, "form", { class: "lib-search", role: "search", "data-ui": "library-search-form" }, toggle, input, last);
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

// Draws the content area, then fills it. The tab bar is in the site header.
export async function renderPlay(ctx, route = { params: { view: "replay" } }) {
  const view = route.view ?? route.params?.view ?? "replay";
  const id = route.id ?? route.params?.id;
  const content = h(ctx.doc, "div", { class: "play-content" });
  ctx.main.replaceChildren(content);
  const inner = { ...ctx, main: content };
  if (view !== "replay" && view !== "run") tabBar(ctx, view, { resultOpen: view === "result" && Boolean(id) });
  switch (view) {
    case "create":
      return renderCreate(inner);
    case "result":
      return renderResultTab(inner, id);
    case "run":
      return renderReplayTab(inner, id);
    default:
      return renderReplayTab(inner);
  }
}

// The line under the title: how the run ended and when it was made (your own runs).
function runMeta({ doc, t, lang }, item) {
  const parts = [];
  if (item.outcome) {
    const level = item.outcome === "finished" ? "ok" : item.outcome === "stopped_user" || item.outcome === "stopped_limit" ? "warn" : "fail";
    parts.push(h(doc, "span", { class: `outcome-chip ${level}`, "data-ui": "run-outcome-chip", "data-outcome": item.outcome }, t(`result.status.${item.outcome}`)));
  }
  const when = formatRunWhen(item.createdAt, lang);
  if (when) parts.push(h(doc, "span", { class: "run-when-text", "data-ui": "run-when" }, when));
  return parts.length ? h(doc, "span", { class: "run-meta" }, ...parts) : "";
}

// A row of the library: the title and the cog on top, the outcome and the pattern tag below.
function runRow(ctx, item, menu) {
  const { doc, t } = ctx;
  return h(
    doc,
    "li",
    { class: "run-row", "data-ui": "run-row" },
    h(doc, "a", { href: `#/play/run/${item.id}`, class: "run-title" }, item.title),
    menu,
    runMeta(ctx, item),
    h(doc, "span", { class: `type-chip type-${item.pattern}`, "data-ui": "run-type" }, t(`pattern.${item.pattern}`)),
  );
}

// Set when About was chosen on a row of another run: that run opens with its About panel shown.
let openAboutFor = null;

const LAST_RUN_KEY = "aa.lastRun";
const rememberedRun = () => {
  try {
    return localStorage.getItem(LAST_RUN_KEY);
  } catch {
    return null;
  }
};
const rememberRun = (id) => {
  try {
    localStorage.setItem(LAST_RUN_KEY, id);
  } catch {
    // remembering is a convenience
  }
};

// The Re-play tab: the player on top (the last run you looked at, or the first example the first
// time), the lists of runs below. A run is loaded but not started; Play replays it from the start.
export async function renderReplayTab(ctx, requestedId) {
  const { doc, t } = ctx;
  setTitle(ctx, "");
  const host = h(doc, "div", { class: "replay-host", "data-ui": "player-host", tabindex: "-1" });
  const pane = h(doc, "aside", { class: "library-pane", "data-ui": "library-pane", "aria-label": t("play.library") });
  const layout = h(doc, "div", { class: "replay-layout", "data-ui": "replay-layout", "data-pane": lib.open ? "open" : "closed" }, pane, host);
  ctx.main.replaceChildren(layout);
  pane.hidden = !lib.open;

  // Keyboard in the library: the arrows move between runs (Enter opens the focused one, it is a link),
  // Tab switches between Your runs and Library, Escape goes back to the player.
  let activePane = "mine";
  let focusList = false;
  const runLinks = () => [...pane.querySelectorAll(".run-list .run-title")];
  // The keyboard lands on the run that is open in this list (or the first); its row flashes twice.
  const focusEntryRun = (flash = true) => {
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
  const focusFirstRun = () => focusEntryRun(true);
  pane.addEventListener("keydown", (event) => {
    const links = runLinks();
    const at = links.indexOf(doc.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (links.length === 0) return;
      event.preventDefault();
      const next = at < 0 ? 0 : Math.min(links.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)));
      links[next].focus();
    } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && (at >= 0 || doc.activeElement?.getAttribute?.("role") === "tab")) {
      // The left and right arrows switch between Your runs and Library.
      event.preventDefault();
      lib.tab = activePane === "mine" ? "library" : "mine";
      focusList = true;
      redraw();
    } else if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey && (at >= 0 || doc.activeElement?.getAttribute?.("role") === "tab")) {
      // Tab and Shift+Tab switch between Your runs and Library; q goes to the player.
      event.preventDefault();
      lib.tab = activePane === "mine" ? "library" : "mine";
      focusList = true;
      redraw();
    } else if (event.key === "Escape" && pane.contains(doc.activeElement)) {
      event.preventDefault();
      if (!focusActivePlayer()) host.focus();
    }
  });

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

  // Nothing is loaded until the visitor picks a run or presses "load last opened".
  const currentId = requestedId;
  let redraw = async () => {};
  tabBar(ctx, requestedId ? "run" : "replay", {
    resultOpen: Boolean(requestedId),
    onQuery: () => redraw(),
    onFocusList: focusFirstRun,
    onToggle: (open) => {
      pane.hidden = !open;
      layout.setAttribute("data-pane", open ? "open" : "closed");
    },
  });

  let handle = null;
  ctx.onLeave(() => handle?.destroy());
  if (!currentId) host.replaceChildren(h(doc, "p", { class: "library-hint", "data-ui": "library-hint" }, t("play.pickRun")));
  if (currentId) {
    const found = await loadAnyRun(ctx, currentId);
    if (ctx.isStale()) return;
    // A run that is loaded has a result to see, so the Result tab shows it and leads to it.
    refreshResultTab(ctx, Boolean(found), found ? currentId : undefined);
    if (!found) {
      host.replaceChildren(h(doc, "p", { class: "notice", role: "alert" }, t("play.runNotFound")));
    } else {
      rememberRun(currentId);
      const explanations = found.source === "gallery" ? await loadExplanations(ctx, currentId) : {};
      if (ctx.isStale()) return;
      // Only the visitor's own runs can be edited; the library's runs are read-only files.
      const onAboutSave =
        found.source === "local"
          ? async (about) => {
              const next = { ...found.run };
              if (about) next.about = about;
              else delete next.about;
              return ctx.runStore.save(next);
            }
          : null;
      const onDelete = found.source === "local" ? () => removeRun({ id: currentId, title: found.run.title }) : null;
      handle = mountReplay(host, { run: found.run, explanations, t, doc, autoStart: false, onAboutSave, onDelete, layout: ctx.settings?.get().playerLayout });
      if (openAboutFor === currentId) handle.openAbout?.();
      openAboutFor = null;
      host.append(h(doc, "p", {}, h(doc, "a", { href: `#/play/result/${currentId}` }, t("play.tab.result"))));
    }
  }

  // Import: a run file from your computer becomes one of your own runs.
  const importNote = h(doc, "div", { class: "import-note", "aria-live": "polite" });
  const fileInput = h(doc, "input", { type: "file", accept: ".json,application/json", hidden: true, "data-ui": "import-file" });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    const prepared = prepareImport(await file.text(), () => makeRunId(Date.now()));
    if (!prepared.ok) {
      importNote.replaceChildren(h(doc, "p", { class: "notice", role: "alert" }, t(prepared.reason === "json" ? "play.importNotJson" : "play.importInvalid")));
      return;
    }
    const saved = await ctx.runStore.save(prepared.run);
    if (!saved.ok) {
      importNote.replaceChildren(h(doc, "p", { class: "notice", role: "alert" }, t("play.importFailed")));
      return;
    }
    location.hash = `#/play/run/${prepared.run.id}`;
  });
  const importButton = h(doc, "button", { type: "button", class: "icon-button", "data-ui": "import-run", title: t("play.import"), "aria-label": t("play.import") }, "⤒");
  importButton.addEventListener("click", () => fileInput.click());

  // Deleting one of your own runs asks first. If it is the run on screen, the page shows no run afterwards.
  const removeRun = async (item) => {
    if (!doc.defaultView.confirm(t("play.deleteConfirm", { title: item.title }))) return;
    await ctx.runStore.remove(item.id);
    if (item.id === currentId) {
      rememberRun("");
      handle?.destroy();
      location.hash = "#/play";
      return;
    }
    await refreshResultTab(ctx);
    await draw();
  };

  // The keys b, i and o do what the three buttons of this page do.
  const pageActions = {
    focusLibrary: () => (lib.open ? focusEntryRun() : false),
    toggleLibrary: () => doc.querySelector('[data-ui="library-toggle"]')?.click(),
    importFile: () => importButton.click(),
    loadLast: () => {
      const last = doc.querySelector('[data-ui="load-last"]');
      if (last && !last.disabled) last.click();
    },
  };
  setPageActions(pageActions);
  ctx.onLeave(() => clearPageActions(pageActions));

  const draw = async () => {
    local = await listLocal();
    if (ctx.isStale()) return;
    const built = buildReplayList(gallery, local);
    const shown = filterLibrary(built.gallery, lib.query);
    const mine = filterLibrary(built.mine, lib.query);
    const none = (key) => h(doc, "p", { class: "notice" }, t(key));
    // The menu of a row loads its run when it is opened, so the list stays light.
    const menuOf = (item) =>
      createRunMenu({
        doc,
        t,
        getItems: async () => {
          const found = await loadAnyRun(ctx, item.id);
          if (!found) return [];
          const run = found.run;
          const definition = definitionFromRun(run);
          return [
            {
              ui: "run-about",
              label: t("player.about"),
              hint: t("player.aboutHint"),
              onClick: () => {
                if (item.id === currentId) return handle?.openAbout();
                openAboutFor = item.id;
                location.hash = `#/play/run/${item.id}`;
              },
            },
            { ui: "export-json", label: t("player.export"), hint: t("player.exportHint"), onClick: () => downloadFile(doc, `${safeFileName(run.id)}.json`, JSON.stringify(runForExport(run), null, 2), "application/json") },
            ...(definition ? [{ ui: "use-in-create", label: t("player.useInCreate"), hint: t("player.useInCreateHint"), onClick: () => openInCreate(doc, t, definition) }] : []),
            ...(definition ? [{ ui: "export-definition", label: t("player.exportDefinition"), hint: t("player.exportDefinitionHint"), onClick: () => downloadFile(doc, `${safeFileName(run.id)}-definition.json`, JSON.stringify(definition, null, 2), "application/json") }] : []),
            ...(found.source === "local" ? [{ ui: "run-delete", label: t("play.delete"), hint: t("player.deleteHint"), danger: true, onClick: () => removeRun(item) }] : []),
          ];
        },
      }).element;
    const row = (item) => {
      const li = runRow(ctx, item, menuOf(item));
      if (item.id === currentId) li.setAttribute("aria-current", "true");
      return li;
    };
    // Two tabs in the pane: your own runs and the library. The last choice is kept; the first time
    // the tab with something in it opens.
    const active = lib.tab ?? (built.mine.length > 0 ? "mine" : "library");
    activePane = active;
    const tabButton = (name, key, count) => {
      const button = h(doc, "button", { type: "button", class: "tab", role: "tab", "data-ui": `pane-tab-${name}`, "aria-selected": String(active === name) }, `${t(key)} (${count})`);
      button.addEventListener("click", () => {
        lib.tab = name;
        draw();
      });
      return button;
    };
    const paneTabs = h(doc, "div", { class: "tabs", role: "tablist", "data-ui": "pane-tabs" }, tabButton("mine", "play.mine", built.mine.length), tabButton("library", "play.library", built.gallery.length), importButton, fileInput);
    pane.replaceChildren(
      paneTabs,
      importNote,
      ...(active === "mine"
        ? [
            mine.length === 0 ? none(lib.query && built.mine.length > 0 ? "play.noMatches" : "play.empty") : h(doc, "ul", { class: "run-list", "data-ui": "run-list-mine" }, ...mine.map((item) => row(item))),
          ]
        : [shown.length === 0 ? none("play.noMatches") : h(doc, "ul", { class: "run-list", "data-ui": "run-list-library" }, ...shown.map((item) => row(item)))]),
    );
    // After Tab switched the list, the focus goes to its first run (or to the tab when it is empty).
    if (focusList) {
      focusList = false;
      // Switching lists with Tab moves the focus without the flash.
      if (!focusEntryRun(false)) pane.querySelector('[role="tab"][aria-selected="true"]')?.focus();
    }
  };
  redraw = draw;
  await draw();
}

async function loadAnyRun(ctx, id) {
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

export async function renderResultTab(ctx, id) {
  const { doc, t } = ctx;
  let found = null;
  if (id) found = await loadAnyRun(ctx, id);
  else {
    try {
      const newest = (await ctx.runStore.list())[0];
      if (newest) found = await loadAnyRun(ctx, newest.id);
    } catch {
      found = null;
    }
  }
  if (ctx.isStale()) return;
  if (!found) {
    ctx.main.replaceChildren(h(doc, "p", { class: "notice" }, t(id ? "play.runNotFound" : "play.resultEmpty")));
    return;
  }
  setTitle(ctx, t("result.title", { title: found.run.title }));
  renderResult(ctx, found.run);
}

export { renderNotFound };
