// The tab Backup of Settings > Data: the title with the time of the last backup, two inner tabs (Backups: the files in the folder; Settings:
// General, When to back up, Where to back up) and the button Back up now next to the tabs. Builds DOM and keeps only which tab is open;
// everything else is in the backup service (data-backup.js).
import { h } from "./dom.js";
import { OPTIONS } from "./data-backup.js";

export function createBackupView({ doc, t, service, redraw, refreshOverview }) {
  let tab = "files";
  let sub = "when";
  let armed = null; // the file whose Delete has been clicked once
  let token = 0; // the list of files is read after the screen is drawn; a newer drawing makes an older list stale

  const lang = () => doc.documentElement?.lang || undefined;
  const fmt = (ms) => new Date(ms).toLocaleString(lang(), { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`);
  const duration = (minutes) => (minutes < 60 ? t("data.dur.min", { n: minutes }) : minutes === 1440 ? t("data.dur.day") : t("data.dur.hour", { n: minutes / 60 }));
  const supported = () => typeof globalThis.showDirectoryPicker === "function";

  const tabButtons = (cls, ui, ids, current, text, pick) =>
    h(doc, "div", { class: cls, role: "tablist", "data-ui": `data-${ui}s` }, ...ids.map((id) => {
      const b = h(doc, "button", { type: "button", class: "ptab", role: "tab", "aria-selected": String(current === id), "data-ui": `data-${ui}-${id}` }, text(id));
      b.addEventListener("click", () => {
        pick(id);
        armed = null;
        redraw();
      });
      return b;
    }));

  // ---- Backups: the files that are in the folder now
  function filesPanel() {
    if (!supported()) return [h(doc, "p", { class: "notice", "data-ui": "data-folder-unsupported" }, t("data.folderUnsupported"))];
    const box = h(doc, "div", { "data-ui": "data-files" });
    const mine = (token += 1);
    service.listFiles().then((listing) => {
      if (mine !== token) return;
      box.replaceChildren(...listContent(listing));
    }).catch(() => {});
    return [box];
  }

  function listContent(listing) {
    if (!listing.ok) return [h(doc, "p", { class: "notice", "data-ui": "data-files-problem" }, t(`data.filesProblem.${listing.reason}`))];
    if (listing.files.length === 0) return [h(doc, "p", { class: "hint", "data-ui": "data-files-empty" }, t("data.filesEmpty"))];
    const rows = listing.files.map((f, i) => {
      const sure = armed === f.name;
      const del = h(doc, "button", { type: "button", class: `danger${sure ? " sure" : ""}`, "data-ui": `data-file-delete-${f.name}` }, t(sure ? "data.deleteSure" : "data.delete"));
      del.addEventListener("click", async () => {
        if (armed !== f.name) {
          armed = f.name;
          redraw();
          return;
        }
        armed = null;
        await service.deleteFile(f.name);
        redraw();
      });
      return h(doc, "tr", { "data-ui": `data-file-${f.name}` }, h(doc, "td", {}, fmt(f.date), i === 0 ? h(doc, "span", { class: "data-tag" }, t("data.newest")) : ""), h(doc, "td", { class: "data-filename" }, f.name), h(doc, "td", {}, size(f.size), f.encrypted ? h(doc, "span", { class: "data-tag enc" }, t("data.withPassword")) : ""), h(doc, "td", { class: "data-delete-cell" }, del));
    });
    return [
      h(doc, "table", { class: "detail-table", "data-ui": "data-files-table" }, h(doc, "tr", {}, h(doc, "th", {}, t("data.fileWhen")), h(doc, "th", { class: "data-filename" }, t("data.fileName")), h(doc, "th", {}, t("data.fileSize")), h(doc, "th", {})), ...rows),
      h(doc, "p", { class: "hint" }, t("data.filesFoot", { folder: service.folderName() || t("data.noFolder") })),
    ];
  }

  // ---- Settings
  const choice = (key, values, current, text) => {
    const sel = h(doc, "select", { id: `data-${key}`, "data-ui": `data-${key}` }, ...values.map((v) => h(doc, "option", { value: String(v), selected: v === current }, text(v))));
    sel.addEventListener("change", () => {
      service.update({ [key]: Number.isNaN(Number(sel.value)) ? sel.value : Number(sel.value) });
      redraw();
    });
    return sel;
  };
  const field = (label, id, control) => h(doc, "div", { class: "field" }, h(doc, "label", { for: id }, label), control);

  function generalPanel(state) {
    const pass = h(doc, "input", { id: "data-pass-auto", type: "password", autocomplete: "new-password", placeholder: service.hasPassword() ? t("data.autoPassSet") : t("data.passPlaceholder"), "data-ui": "data-pass-auto" });
    pass.addEventListener("input", () => service.setPassword(pass.value));
    const keys = h(doc, "input", { type: "checkbox", id: "data-auto-keys", checked: state.autoKeys, "data-ui": "data-auto-keys" });
    keys.addEventListener("change", () => {
      service.update({ autoKeys: keys.checked });
      redraw();
    });
    return [
      field(t("data.autoPass"), "data-pass-auto", pass),
      h(doc, "p", { class: "hint" }, t("data.passHelp")),
      h(doc, "div", { class: "field checkbox" }, keys, h(doc, "label", { for: "data-auto-keys" }, t("data.autoKeys"))),
      h(doc, "p", { class: "hint" }, t("data.keysHelp")),
      ...(state.autoKeys ? [h(doc, "p", { class: "notice", "data-ui": "data-auto-keys-warning" }, t("data.keysWarning"))] : []),
    ];
  }

  function whenPanel(state) {
    const modes = ["off", "remind", "auto"].map((m) => {
      const radio = h(doc, "input", { type: "radio", name: "data-mode", id: `data-mode-${m}`, value: m, checked: state.mode === m, disabled: m === "auto" && !supported(), "data-ui": `data-mode-${m}` });
      radio.addEventListener("change", () => {
        service.update({ mode: m });
        redraw();
      });
      return h(doc, "div", { class: "field checkbox" }, radio, h(doc, "label", { for: `data-mode-${m}` }, t(`data.mode.${m}`)));
    });
    let more = [];
    if (state.mode === "remind") {
      more = [field(t("data.remindAfter"), "data-remindAfter", choice("remindAfter", OPTIONS.remindAfter, state.remindAfter, (n) => t("data.remindOpt", { n }))), h(doc, "p", { class: "hint" }, t("data.remindHint"))];
    }
    if (state.mode === "auto") {
      const when = state.trigger === "time"
        ? [field(t("data.every"), "data-interval", choice("interval", OPTIONS.interval, state.interval, duration))]
        : [field(t("data.quiet"), "data-quiet", choice("quiet", OPTIONS.quiet, state.quiet, duration)), field(t("data.gap"), "data-gap", choice("gap", OPTIONS.gap, state.gap, duration))];
      more = [
        field(t("data.when"), "data-trigger", choice("trigger", ["time", "change"], state.trigger, (v) => t(`data.trigger.${v}`))),
        ...when,
        h(doc, "p", { class: "hint" }, t(state.trigger === "change" ? "data.autoHintChange" : "data.autoHintTime"), " ", t("data.autoHintOpen")),
      ];
    }
    return [h(doc, "div", { class: "field" }, h(doc, "b", {}, t("data.whenHeading")), ...modes), ...more];
  }

  function wherePanel(state) {
    if (!supported()) return [h(doc, "p", { class: "notice", "data-ui": "data-folder-unsupported" }, t("data.folderUnsupported"))];
    const folderName = service.folderName();
    const choose = h(doc, "button", { type: "button", "data-ui": "data-folder-choose" }, t(folderName ? "data.folderChange" : "data.folderChoose"));
    choose.addEventListener("click", async () => {
      try {
        await service.chooseFolder();
        redraw();
      } catch {
        // the student closed the folder window
      }
    });
    return [
      h(doc, "p", { class: "hint" }, t("data.whereHint")),
      h(doc, "div", { class: "data-actions" }, choose, h(doc, "span", { class: "hint", "data-ui": "data-folder-name" }, folderName || t("data.noFolder"))),
      ...(state.mode === "auto" && folderName === "" ? [h(doc, "p", { class: "notice", "data-ui": "data-need-target" }, t("data.needTarget"))] : []),
      h(doc, "p", { class: "hint" }, t("data.cloudLater")),
    ];
  }

  function settingsPanel(state) {
    const subs = supported() ? ["general", "when", "where"] : ["when", "where"];
    if (!subs.includes(sub)) sub = "when";
    const panel = sub === "general" ? generalPanel(state) : sub === "where" ? wherePanel(state) : whenPanel(state);
    return [tabButtons("ptabs sub", "stab", subs, sub, (id) => t(`data.stab.${id}`), (id) => (sub = id)), ...panel];
  }

  // ---- the whole tab
  return function view() {
    if (!supported() && service.state().mode === "auto") service.update({ mode: "remind" }); // Firefox and Safari: only the reminder
    const state = service.state();
    const info = state.failedAt
      ? t("data.lastFailed", { when: fmt(state.failedAt) }) + (state.lastBackup ? ` · ${t("data.lastBackupInfo", { when: fmt(state.lastBackup) })}` : "")
      : state.lastBackup ? t("data.lastBackupInfo", { when: fmt(state.lastBackup) }) : t("data.noBackupYet");
    const message = h(doc, "div", { "data-ui": "data-backup-message", "aria-live": "polite" });
    const now = h(doc, "button", { type: "button", class: "primary", "data-ui": "data-backup-now", disabled: service.folderName() === "" }, t("data.backupNow"));
    now.addEventListener("click", async () => {
      const outcome = await service.backupNow({ interactive: true });
      if (outcome.ok) {
        refreshOverview();
        redraw();
        return;
      }
      message.replaceChildren(h(doc, "p", { class: "notice error", "data-ui": "data-backup-result" }, t(`data.backupFail.${outcome.reason}`)));
    });
    const problem = service.error() ? [h(doc, "p", { class: "notice error", "data-ui": "data-backup-error" }, t(`data.backupFail.${service.error()}`))] : [];
    const tabs = tabButtons("ptabs", "btab", ["files", "set"], tab, (id) => t(`data.btab.${id}`), (id) => (tab = id));
    return [
      h(doc, "div", { class: "data-card wide", "data-ui": "data-backup-card" },
        h(doc, "div", { class: "data-btitle" }, h(doc, "h3", {}, t("data.backupHeading")), h(doc, "span", { class: `hint data-lastinfo${state.failedAt ? " bad" : ""}`, "data-ui": "data-lastinfo" }, info)),
        h(doc, "p", {}, t("data.backupIntro")),
        h(doc, "div", { class: "data-btabsrow" }, tabs, ...(supported() ? [now] : [])),
        message,
        ...problem,
        ...(tab === "set" ? settingsPanel(state) : filesPanel())),
    ];
  };
}
