// The Play section: sub-tabs Re-play, Create and Result.
import { h } from "./dom.js";
import { mountReplay } from "./replay/view.js";
import { getJson, loadExplanations, renderNotFound, setTitle } from "./pages.js";
import { buildReplayList, filterLibrary, prepareImport } from "./play-model.js";
import { makeRunId } from "./engine/run-record.js";
import { renderResult } from "./result-page.js";
import { renderCreate } from "./create/create-page.js";
import { createRunMenu } from "./replay/run-menu.js";
import { definitionFromRun } from "./create/definition.js";
import { downloadFile, safeFileName } from "./download.js";

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
const lib = { query: "", open: paneOpen() };

// The tab bar lives in the site header, with the library search next to it.
function tabBar(ctx, view, { onQuery, onToggle, intro } = {}) {
  const { doc, t } = ctx;
  const slot = doc.getElementById("play-tabs");
  if (!slot) return;
  const active = TAB_OF_VIEW[view] ?? "replay";
  const nav = h(
    doc,
    "nav",
    { class: "play-tabs", "aria-label": t("play.tabs") },
    ...TABS.map((tab) => h(doc, "a", { href: tab.href, "aria-current": tab.view === active ? "page" : undefined }, t(tab.key))),
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
  slot.replaceChildren(...(intro?.length ? [h(doc, "div", { class: "play-intro", "data-ui": "play-intro" }, ...intro)] : []), nav, form);
  slot.hidden = false;
}

// Draws the content area, then fills it. The tab bar is in the site header.
export async function renderPlay(ctx, route = { params: { view: "replay" } }) {
  const view = route.view ?? route.params?.view ?? "replay";
  const id = route.id ?? route.params?.id;
  const content = h(ctx.doc, "div", { class: "play-content" });
  ctx.main.replaceChildren(content);
  const inner = { ...ctx, main: content };
  if (view !== "replay" && view !== "run") tabBar(ctx, view);
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

// A row of the library: the title and the cog on top, the outcome and the pattern tag below.
function runRow(ctx, item, menu) {
  const { doc, t } = ctx;
  return h(
    doc,
    "li",
    { class: "run-row", "data-ui": "run-row" },
    h(doc, "a", { href: `#/play/run/${item.id}`, class: "run-title" }, item.title),
    menu,
    item.outcome ? h(doc, "span", { class: "run-meta" }, t(`result.status.${item.outcome}`)) : "",
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
  const host = h(doc, "div", { class: "replay-host", "data-ui": "player-host" });
  const pane = h(doc, "aside", { class: "library-pane", "data-ui": "library-pane", "aria-label": t("play.library") });
  const layout = h(doc, "div", { class: "replay-layout", "data-ui": "replay-layout", "data-pane": lib.open ? "open" : "closed" }, pane, host);
  ctx.main.replaceChildren(layout);
  pane.hidden = !lib.open;

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
    onQuery: () => redraw(),
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
      handle = mountReplay(host, { run: found.run, explanations, t, doc, autoStart: false, onAboutSave, onDelete });
      if (openAboutFor === currentId) handle.openAbout?.();
      openAboutFor = null;
      handle.player?.seek(found.run.events.length);
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
    await draw();
  };

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
            { ui: "export-json", label: t("player.export"), hint: t("player.exportHint"), onClick: () => downloadFile(doc, `${safeFileName(run.id)}.json`, JSON.stringify(run, null, 2), "application/json") },
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
    pane.replaceChildren(
      h(doc, "div", { class: "pane-head" }, h(doc, "h2", {}, t("play.mine")), importButton, fileInput),
      importNote,
      mine.length === 0
        ? none(lib.query && built.mine.length > 0 ? "play.noMatches" : "play.empty")
        : h(
            doc,
            "ul",
            { class: "run-list", "data-ui": "run-list-mine" },
            ...mine.map((item) => row(item)),
          ),
      h(doc, "div", { class: "pane-head" }, h(doc, "h2", {}, t("play.library"))),
      shown.length === 0 ? none("play.noMatches") : h(doc, "ul", { class: "run-list", "data-ui": "run-list-library" }, ...shown.map((item) => row(item))),
    );
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
