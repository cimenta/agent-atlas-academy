// The Play section: sub-tabs Re-play, Create and Result.
import { h } from "./dom.js";
import { mountReplay } from "./replay/view.js";
import { withRetryChoice } from "./replay/retry-choice.js";
import { loadExplanations, renderNotFound, setTitle, getJson } from "./pages.js";
import { doneMarkFor } from "./library-progress.js";
import { renderResult } from "./result-page.js";
import { renderCreate } from "./create/create-page.js";
import { approvalPanel } from "./approval-panel.js";
import { pendingApprovals } from "./engine/approval.js";
import { draft } from "./create/draft.js";
import { renderCompare } from "./compare-page.js";
import { refreshResultTab } from "./tab-state.js";
import { PLAY_TABS, tabBar, rememberRun, loadAnyRun, registerPlayKeys, justFinished } from "./play-shared.js";
import { renderLibraryTab, removeLocalRun } from "./library-page.js";

// Draws the content area, then fills it. The tab bar is in the site header.
export async function renderPlay(ctx, route = { params: { view: "replay" } }) {
  const view = route.view ?? route.params?.view ?? "replay";
  const id = route.id ?? route.params?.id;
  const content = h(ctx.doc, "div", { class: "play-content" });
  ctx.main.replaceChildren(content);
  const inner = { ...ctx, main: content };
  if (view !== "library" && view !== "run" && view !== "replay") tabBar(ctx, view, { resultOpen: view === "result" && Boolean(id) });
  switch (view) {
    case "create":
      return renderCreate(inner);
    case "result":
      return renderResultTab(inner, id);
    case "run":
      return renderReplayTab(inner, id);
    case "compare":
      return renderCompare(inner, route.params?.ids ?? route.ids ?? [], (runId) => loadAnyRun(inner, runId));
    case "replay":
      return renderNoRun(inner);
    default:
      return renderLibraryTab(inner, id);
  }
}

// The Re-play tab: the player on top (the last run you looked at, or the first example the first
// time), the lists of runs below. A run is loaded but not started; Play replays it from the start.
// Re-play with no run loaded: a hint and the way to the Library.
function renderNoRun(ctx) {
  const { doc, t } = ctx;
  setTitle(ctx, "");
  ctx.main.replaceChildren(h(doc, "p", { class: "library-hint", "data-ui": "library-hint" }, t("play.noRunLoaded"), " ", h(doc, "a", { href: "#/play" }, t("play.pickInLibrary"))));
  tabBar(ctx, "replay", { resultOpen: false });
}

export async function renderReplayTab(ctx, requestedId) {
  const { doc, t } = ctx;
  setTitle(ctx, "");
  const host = h(doc, "div", { class: "replay-host", "data-ui": "player-host", tabindex: "-1" });
  ctx.main.replaceChildren(host);
  tabBar(ctx, requestedId ? "run" : "replay", { resultOpen: Boolean(requestedId) });
  let handle = null;
  ctx.onLeave(() => handle?.destroy());
  registerPlayKeys(ctx, requestedId);
  if (!requestedId) return renderNoRun(ctx);
  const currentId = requestedId;
  const found = await loadAnyRun(ctx, currentId);
  if (ctx.isStale()) return;
  // A run that is loaded has a result to see, so the Result tab shows it and leads to it.
  refreshResultTab(ctx, Boolean(found), found ? currentId : undefined);
  if (!found) {
    host.replaceChildren(h(doc, "p", { class: "notice", role: "alert" }, t("play.runNotFound")), h(doc, "p", {}, h(doc, "a", { href: "#/play" }, t("play.backToLibrary"))));
    return;
  }
  rememberRun(currentId);
  const explanations = found.source === "gallery" ? await loadExplanations(ctx, currentId) : {};
  if (ctx.isStale()) return;
  // Only the visitor own runs can be edited; the library runs are read-only files.
  const onAboutSave =
    found.source === "local"
      ? async (about) => {
          const next = { ...found.run };
          if (about) next.about = about;
          else delete next.about;
          return ctx.runStore.save(next);
        }
      : null;
  const onDelete =
    found.source === "local"
      ? async () => {
          if (await removeLocalRun(ctx, { id: currentId, title: found.run.title })) {
            handle?.destroy();
            location.hash = "#/play";
          }
        }
      : null;
  // A run of the visitor own that failed can be carried on from the agent that failed.
  const onRetry =
    found.source === "local" && found.run.outcome === "failed"
      ? (agentId, choice, options = {}) => {
          draft.retry = choice ? withRetryChoice(found.run, agentId, choice) : found.run;
          draft.retryUseCurrent = options.useCurrentLimits !== false;
          doc.defaultView.location.hash = "#/play/create";
        }
      : null;
  // A library run that is on the recommended path can be marked as done from its menu (in every goal it belongs to).
  let doneMark = null;
  if (found.source === "gallery") {
    try {
      const entry = ((await getJson(ctx, "/runs/index.json")).runs ?? []).find((r) => r.id === currentId);
      const storage = () => {
        try {
          return doc.defaultView?.localStorage ?? null;
        } catch {
          return null;
        }
      };
      doneMark = doneMarkFor(storage, entry);
    } catch {
      // without the index the menu simply has no such item
    }
    if (ctx.isStale()) return;
  }
  const playerHost = h(doc, "div", { class: "player-mount" });
  host.append(playerHost);
  handle = mountReplay(playerHost, { doneMark, run: found.run, explanations, t, doc, autoStart: false, onAboutSave, onDelete, layout: ctx.settings?.get().playerLayout, providerColors: ctx.settings?.get().providerColors, simple: ctx.settings?.get().viewMode === "simple", onFullView: () => ctx.setViewMode?.("full"), onRetry, suggestFallback: ctx.settings?.get().fallback !== "off", limitsInfo: () => ({ current: ctx.settings.get().limits, original: found.run.limits, record: found.run, repeatStop: ctx.settings.get().repeatStop }) });
  // A run Create has just finished opens at its end, so its warnings and the message about how it ended are on the screen.
  if (justFinished.id === currentId) {
    justFinished.id = null;
    handle.player?.seek?.(found.run.events.length);
  }
  // A run that waits for approval shows what the next agent will receive, with Approve and Stop here.
  if (found.source === "local" && found.run.outcome === "waiting_approval") {
    const panel = approvalPanel({
      doc,
      t,
      pending: pendingApprovals(found.run.events),
      onApprove: () => {
        draft.retry = found.run;
        draft.approve = true;
        doc.defaultView.location.hash = "#/play/create";
      },
      onStop: async () => {
        const events = found.run.events.map((e) => (e.type === "done" ? { ...e, outcome: "stopped_user" } : e));
        await ctx.runStore.save({ ...found.run, events, outcome: "stopped_user" });
        handle?.destroy();
        return renderReplayTab(ctx, currentId);
      },
    });
    playerHost.prepend(panel);
  }
  // A run from the library is a recording made with its own limits: the limits of Settings apply only to new runs.
  if (found.source === "gallery") host.append(h(doc, "p", { class: "notice recording-note", "data-ui": "recording-note" }, t("play.recordingNote"), " ", h(doc, "a", { href: "#/learn/lab" }, t("play.recordingNoteLink"))));
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
  registerPlayKeys(ctx, found.run.id);
  setTitle(ctx, t("result.title", { title: found.run.title }));
  renderResult(ctx, found.run);
}

export { renderNotFound, PLAY_TABS };
