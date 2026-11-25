// Settings > Data: what the app remembers in this browser. An overview, export and import of the whole of it (by category, with an optional
// password), and cleanup. Builds DOM and keeps no state of its own besides the open sub-tab; every change goes through the stores.
import { h } from "./dom.js";
import { SLOT_IDS } from "./key-slots.js";
import { parseBackup, applyBackup, backupCategories, BACKUP_CATEGORIES } from "./storage/backup.js";
import { decryptText, isEncryptedText, fileToText, FileCryptoError } from "./storage/file-crypto.js";
import { createBackupService, createFolderStore, reminderDue } from "./data-backup.js";
import { createBackupView } from "./data-backup-view.js";
import { exportProgress, clearProgress } from "./library-progress.js";

const META_KEY = "aa.data.meta";
const SETTINGS_KEY = "aa.settings";
const FILE_NAME = "agent-atlas-export";

const formatSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`);
const textOf = (value) => (value === undefined ? "" : JSON.stringify(value));

function readMeta(storage) {
  try {
    const meta = JSON.parse(storage?.getItem(META_KEY) ?? "{}");
    return meta !== null && typeof meta === "object" ? meta : {};
  } catch {
    return {};
  }
}
function writeMeta(storage, meta) {
  try {
    storage?.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // the date just is not remembered
  }
}

// The counts and the size of every category, as they are now.
export async function dataStats({ runStore, settings, skills, storage, vaultOf, verdictStore }) {
  const items = await runStore.list();
  let runBytes = 0;
  for (const item of items) runBytes += textOf(await runStore.get(item.id)).length;
  const skillData = skills ? skills.exportData() : { skills: [], defaults: {} };
  const progress = exportProgress(storage);
  const verdicts = verdictStore.exportAll();
  const keys = SLOT_IDS.filter((id) => vaultOf(id).hasStoredKey());
  const counts = { runs: items.length, settings: 1, skills: skillData.skills.length, progress: progress.length, verdicts: Object.keys(verdicts).length, keys: keys.length };
  const bytes = { runs: runBytes, settings: textOf(settings.get()).length, skills: textOf(skillData).length, progress: textOf(progress).length, verdicts: textOf(verdicts).length, keys: keys.reduce((n, id) => n + textOf(vaultOf(id).exportRecord()).length, 0) };
  return { counts, bytes, total: Object.values(bytes).reduce((a, b) => a + b, 0) };
}

export function renderDataSettings({ doc, t, say, runStore, settings, vault, vaultOf, skills, storage, verdictStore, version, title = null, backup = null, onChanged = () => {} }) {
  const service = backup ?? createBackupService({ storage, runStore, settings, skills, vault, vaultOf, verdictStore, getVersion: () => version, folderStore: createFolderStore() });
  let tab = "export";
  const selected = Object.fromEntries(BACKUP_CATEGORIES.map((c) => [c, c !== "keys"]));
  let armed = null; // the delete button that has been clicked once
  let stats = null;
  const overview = h(doc, "div", { class: "data-overview", "data-ui": "data-overview" });
  const body = h(doc, "div", { class: "data-body", "data-ui": "data-body" });
  const root = h(doc, "div", { class: "data-settings", "data-ui": "data-settings" }, overview, body);

  const stamp = () => writeMeta(storage, { ...readMeta(storage), lastExport: new Date().toISOString() });

  async function drawOverview() {
    try {
      stats = await dataStats({ runStore, settings, skills, storage, vaultOf, verdictStore });
    } catch {
      stats = null;
    }
    // the heading with the size in the top right corner, and the intro right under it
    overview.replaceChildren(
      h(doc, "div", { class: "data-head" }, title ?? h(doc, "h2", {}, t("settings.dataHeading")), h(doc, "div", { class: "data-size", title: t("data.tip.size"), tabindex: "0", "data-ui": "data-size" }, stats ? formatSize(stats.total) : "?")),
      h(doc, "p", { class: "data-intro" }, t("settings.dataIntro")),
    );
    if (tab === "stats") draw();
  }

  // ---- statistics: the counts of every part (settings are one record, so they are not counted) and the last export
  function statsView() {
    const last = readMeta(storage).lastExport;
    const when = last ? new Date(last).toLocaleString(doc.documentElement?.lang || undefined) : t("data.never");
    return [
      h(doc, "div", { class: "data-cells", "data-ui": "data-cells" }, ...BACKUP_CATEGORIES.filter((c) => c !== "settings").map((c) => h(doc, "div", { class: "data-cell", title: t(`data.tip.${c}`), tabindex: "0", "data-ui": `data-count-${c}` }, h(doc, "b", {}, stats ? String(stats.counts[c]) : "?"), h(doc, "span", {}, t(`data.cat.${c}`))))),
      h(doc, "p", { class: "hint", "data-ui": "data-last" }, t("data.lastExport", { when })),
      h(doc, "p", { class: "hint", "data-ui": "data-last-backup" }, t("data.lastBackup", { when: service.state().lastBackup ? new Date(service.state().lastBackup).toLocaleString(doc.documentElement?.lang || undefined) : t("data.never") }), " ", t("data.changesSince", { n: service.state().changes })),
    ];
  }

  const backupView = createBackupView({ doc, t, service, redraw: () => draw(), refreshOverview: () => drawOverview() });

  // The reminder of the mode remind, above the tabs.
  const reminder = () => {
    const state = service.state();
    if (!reminderDue(state)) return [];
    const go = h(doc, "button", { type: "button", "data-ui": "data-remind-go" }, t("data.remindGo"));
    go.addEventListener("click", () => {
      tab = "export";
      draw();
    });
    return [h(doc, "div", { class: "notice", "data-ui": "data-remind" }, t("data.remind", { n: state.changes }), " ", go)];
  };

  const draw = () => body.replaceChildren(...reminder(), subTabs(), ...(tab === "clean" ? cleanView() : tab === "stats" ? statsView() : tab === "backup" ? backupView() : exportView()));
  const subTabs = () =>
    h(doc, "div", { class: "ptabs", role: "tablist", "data-ui": "data-tabs" }, ...["export", "backup", "clean", "stats"].map((id) => {
      const b = h(doc, "button", { type: "button", class: "ptab", role: "tab", "aria-selected": String(tab === id), "data-ui": `data-tab-${id}` }, t(`data.tab.${id}`));
      b.addEventListener("click", () => {
        tab = id;
        armed = null;
        draw();
      });
      return b;
    }));

  // ---- export and import
  function exportView() {
    const boxes = BACKUP_CATEGORIES.map((c) => {
      const box = h(doc, "input", { type: "checkbox", id: `data-cat-${c}`, checked: selected[c], "data-ui": `data-cat-${c}` });
      box.addEventListener("change", () => {
        selected[c] = box.checked;
        draw();
      });
      return h(doc, "div", { class: "field checkbox data-cat" }, box, h(doc, "label", { for: `data-cat-${c}` }, h(doc, "b", {}, t(`data.cat.${c}`)), " ", h(doc, "span", { class: "hint" }, `${stats ? stats.counts[c] : "?"} · ${t(`data.catHelp.${c}`)}`)));
    });
    const password = h(doc, "input", { id: "data-pass", type: "password", autocomplete: "new-password", placeholder: t("data.passPlaceholder"), "data-ui": "data-pass" });
    const message = h(doc, "div", { "data-ui": "data-export-message", "aria-live": "polite" });
    const go = h(doc, "button", { type: "button", class: "primary", "data-ui": "data-export" }, t("data.export"));
    go.addEventListener("click", async () => {
      const chosen = BACKUP_CATEGORIES.filter((c) => selected[c]);
      if (chosen.length === 0) return message.replaceChildren(h(doc, "p", { class: "notice error" }, t("data.noneChosen")));
      if (chosen.includes("keys") && password.value === "") return message.replaceChildren(h(doc, "p", { class: "notice error", "data-ui": "data-keys-need-pass" }, t("data.keysNeedPass")));
      try {
        const file = await service.buildFile(chosen, password.value);
        const blob = new Blob([file.data], { type: file.mime });
        const url = URL.createObjectURL(blob);
        const link = h(doc, "a", { href: url, download: FILE_NAME + file.extension });
        doc.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        stamp();
        if (service.state().mode === "remind") service.markExported();
        say(t(password.value === "" ? "data.exported" : "data.exportedEncrypted", { n: chosen.length }));
        drawOverview();
      } catch {
        say(t("settings.error.storage"), true);
      }
    });
    const keysWarn = selected.keys ? [h(doc, "p", { class: "notice", "data-ui": "data-keys-warning" }, t("data.keysWarning"))] : [];
    const exportCard = h(doc, "div", { class: "data-card wide", "data-ui": "data-export-card" }, h(doc, "h3", {}, t("data.exportHeading")), h(doc, "p", {}, t("data.exportIntro")), ...boxes, ...keysWarn, h(doc, "div", { class: "field" }, h(doc, "label", { for: "data-pass" }, t("data.passLabel")), password), h(doc, "div", { class: "data-actions" }, go), message);
    return [exportCard, importCard()];
  }

  function importCard() {
    const file = h(doc, "input", { id: "data-import", type: "file", accept: "application/json,application/gzip,.json,.gz", hidden: true, "data-ui": "data-import-file" });
    const choose = h(doc, "button", { type: "button", "data-ui": "data-import-choose" }, t("settings.chooseFile"));
    choose.addEventListener("click", () => file.click());
    const pass = h(doc, "input", { id: "data-import-pass", type: "password", autocomplete: "off", "data-ui": "data-import-pass" });
    const result = h(doc, "div", { "data-ui": "data-import-result", "aria-live": "polite" });
    let text = "";
    const problem = (lines) => result.replaceChildren(h(doc, "ul", { class: "reasons", "data-ui": "data-import-problem" }, h(doc, "li", {}, t("settings.importRejected")), ...lines.slice(0, 20).map((e) => h(doc, "li", {}, e))));
    const load = async () => {
      result.replaceChildren();
      if (text === "") return;
      let plain = text;
      if (isEncryptedText(text)) {
        if (pass.value === "") return result.replaceChildren(h(doc, "p", { class: "notice", "data-ui": "data-import-need-pass" }, t("data.importNeedPass")));
        try {
          plain = await decryptText(text, pass.value);
        } catch (e) {
          return result.replaceChildren(h(doc, "p", { class: "notice error", "data-ui": "data-import-wrong" }, t(e instanceof FileCryptoError && e.code === "shape" ? "data.importBadFile" : "data.importWrongPass")));
        }
      }
      const parsed = parseBackup(plain);
      if (!parsed.ok) return problem(parsed.errors);
      return preview(parsed.backup);
    };
    file.addEventListener("change", async () => {
      text = file.files?.[0] ? await fileToText(file.files[0]) : "";
      await load();
    });
    pass.addEventListener("change", load);

    async function preview(backup) {
      const here = await dataStats({ runStore, settings, skills, storage, vaultOf, verdictStore });
      const hereRuns = new Set((await runStore.list()).map((r) => r.id));
      const hereSkills = new Set((skills ? skills.exportData().skills : []).map((s) => s.id));
      const hereProgress = new Set(exportProgress(storage));
      const hereVerdicts = new Set(Object.keys(verdictStore.exportAll()));
      const carried = backupCategories(backup);
      const inFile = { runs: backup.runs.length, settings: 1, skills: backup.skills?.skills?.length ?? 0, progress: backup.progress?.length ?? 0, verdicts: Object.keys(backup.verdicts ?? {}).length, keys: [backup.vault, backup.vaultGoogle, backup.vaultGoogleFree, ...Object.values(backup.vaultSlots ?? {})].filter(Boolean).length };
      const fresh = {
        runs: backup.runs.filter((r) => !hereRuns.has(r.id)).length,
        skills: (backup.skills?.skills ?? []).filter((s) => !hereSkills.has(s.id)).length,
        progress: (backup.progress ?? []).filter((k) => !hereProgress.has(k)).length,
        verdicts: Object.keys(backup.verdicts ?? {}).filter((k) => !hereVerdicts.has(k)).length,
      };
      const chosen = Object.fromEntries(carried.map((c) => [c, true]));
      const rows = carried.map((c) => {
        const box = h(doc, "input", { type: "checkbox", id: `data-restore-${c}`, checked: true, "data-ui": `data-restore-${c}` });
        box.addEventListener("change", () => {
          chosen[c] = box.checked;
        });
        return h(doc, "tr", {}, h(doc, "td", {}, h(doc, "div", { class: "field checkbox" }, box, h(doc, "label", { for: `data-restore-${c}` }, t(`data.cat.${c}`)))), h(doc, "td", {}, t("data.inFile", { n: inFile[c] })), h(doc, "td", {}, t("data.here", { n: here.counts[c] })), h(doc, "td", {}, c === "settings" ? t("data.settingsReplaced") : c === "keys" ? t("data.keysNote") : t("data.newOnes", { n: fresh[c] })));
      });
      const mode = h(doc, "select", { id: "data-restore-mode", "data-ui": "data-restore-mode" }, h(doc, "option", { value: "merge" }, t("data.modeKeep")), h(doc, "option", { value: "replace" }, t("data.modeReplace")));
      const apply = h(doc, "button", { type: "button", class: "primary", "data-ui": "data-restore" }, t("data.restore"));
      apply.addEventListener("click", async () => {
        const only = carried.filter((c) => chosen[c]);
        if (only.length === 0) return;
        try {
          const outcome = await applyBackup(backup, { runStore, settingsStore: settings, vault, mode: mode.value, only, skillsStore: skills, progressStorage: storage, verdictStore });
          say(t("data.restored", { added: outcome.added, skipped: outcome.skipped, failed: outcome.failed }));
          file.value = "";
          text = "";
          result.replaceChildren();
          await drawOverview();
          onChanged();
        } catch {
          say(t("settings.error.storage"), true);
        }
      });
      result.replaceChildren(h(doc, "p", { class: "hint" }, t("data.importChoose", { when: backup.exportedAt ?? "" })), h(doc, "table", { class: "detail-table", "data-ui": "data-restore-table" }, ...rows), h(doc, "div", { class: "field" }, h(doc, "label", { for: "data-restore-mode" }, t("data.modeLabel")), mode), h(doc, "div", { class: "data-actions" }, apply));
    }

    return h(doc, "div", { class: "data-card wide", "data-ui": "data-import-card" }, h(doc, "h3", {}, t("data.importHeading")), h(doc, "p", {}, t("data.importIntro")), h(doc, "div", { class: "field" }, h(doc, "label", { for: "data-import-pass" }, t("data.importPassLabel")), pass), h(doc, "div", { class: "data-actions" }, choose, file), result);
  }

  // ---- cleanup
  const clearers = {
    runs: () => runStore.clear(),
    settings: () => {
      try {
        storage?.removeItem(SETTINGS_KEY);
      } catch {
        // nothing more can be done
      }
    },
    skills: () => skills?.clearAll(),
    progress: () => clearProgress(storage),
    verdicts: () => verdictStore.clearAll(),
    keys: () => SLOT_IDS.forEach((id) => vaultOf(id).forget()),
  };
  function cleanView() {
    const button = (id) => {
      const sure = armed === id;
      const b = h(doc, "button", { type: "button", class: `danger${sure ? " sure" : ""}`, "data-ui": `data-delete-${id}`, disabled: id !== "all" && stats !== null && id !== "settings" && stats.counts[id] === 0 }, t(sure ? "data.deleteSure" : "data.delete"));
      b.addEventListener("click", async () => {
        if (armed !== id) {
          armed = id;
          draw();
          return;
        }
        armed = null;
        try {
          for (const c of id === "all" ? BACKUP_CATEGORIES : [id]) await clearers[c]();
          say(t("data.deleted"));
          await drawOverview();
          onChanged();
        } catch {
          say(t("settings.error.storage"), true);
        }
        draw();
      });
      return b;
    };
    return [
      h(doc, "div", { class: "data-card wide", "data-ui": "data-clean-card" }, h(doc, "h3", {}, t("data.cleanHeading")), h(doc, "p", {}, t("data.cleanIntro")),
        h(doc, "table", { class: "detail-table" }, ...BACKUP_CATEGORIES.map((c) => h(doc, "tr", {}, h(doc, "td", {}, h(doc, "b", {}, t(`data.cat.${c}`)), h(doc, "br", {}), h(doc, "span", { class: "hint" }, `${stats ? stats.counts[c] : "?"} · ${t(`data.catHelp.${c}`)}`)), h(doc, "td", { class: "data-delete-cell" }, button(c))))),
        h(doc, "div", { class: "danger-row", "data-ui": "data-danger" }, h(doc, "div", {}, h(doc, "h3", {}, t("data.deleteAll")), h(doc, "p", {}, t("data.deleteAllText"))), button("all"))),
    ];
  }

  drawOverview().then(draw);
  service.loadFolder().then(() => (tab === "backup" ? draw() : undefined)).catch(() => {});
  draw();
  return root;
}
