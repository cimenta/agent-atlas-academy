// The settings page: API key handling, default limits and local data.
import { h } from "./dom.js";
import { LIMIT_MAX } from "./engine/catalog.js";
import { markUnlockAlert, needsUnlock } from "./unlock-alert.js";
import { DEFAULT_GO_KEYS } from "./shortcuts.js";
import { buildShortcutList } from "./shortcut-list.js";
import { VaultError } from "./storage/key-vault.js";
import { exportBackup, parseBackup, applyBackup } from "./storage/backup.js";

const formatSize = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`);
const PROVIDERS_SOON = ["Gemini", "OpenAI", "Mistral", "Llama"];
const LIMIT_FIELDS = [
  ["maxSteps", "settings.limitSteps"],
  ["maxTokens", "settings.limitTokens"],
  ["maxSearches", "settings.limitSearches"],
];

export function renderSettings(ctx) {
  const { doc, t, vault, settings, runStore } = ctx;
  ctx.doc.title = `${t("settings.title")} · ${t("site.name")}`;

  const field = (id, label, input) => h(doc, "div", { class: "field" }, h(doc, "label", { for: id }, label), input);
  const message = h(doc, "p", { class: "notice", role: "status", "aria-live": "polite", hidden: true });
  const say = (text, isError = false) => {
    message.textContent = text;
    message.hidden = text === "";
    message.setAttribute("role", isError ? "alert" : "status");
  };
  const errorText = (error) => t(`settings.error.${error instanceof VaultError ? error.code : "storage"}`);

  const status = h(doc, "p", { class: "key-status" });
  const refreshStatus = () => {
    const available = vault.getSessionKey() !== null;
    status.textContent = available
      ? t(vault.hasStoredKey() ? "settings.keyAvailableSaved" : "settings.keyAvailable")
      : vault.hasStoredKey()
        ? t("settings.keyLocked")
        : t("settings.keyNone");
    keyTag.hidden = !(available || vault.hasStoredKey());
    providerTag.hidden = keyTag.hidden;
    lockedTag.hidden = !needsUnlock(vault);
    markUnlockAlert(doc, vault, t);
    securityNone.hidden = vault.hasStoredKey();
    const stored = vault.hasStoredKey();
    secMark.setAttribute("class", available ? "bang ok" : "bang no");
    secMark.textContent = available ? "\u2713" : "!";
    secText.textContent = t(available ? "settings.secUnlocked" : "settings.secLocked");
    secLead.hidden = !stored;
    secSteps.hidden = !stored;
    secActions.hidden = !stored;
    unlockForm.hidden = available || !stored;
  };

  // Save the key for this tab (and optionally remember it encrypted).
  const keyInput = h(doc, "input", { id: "set-key", type: "password", autocomplete: "off", spellcheck: "false" });
  const rememberBox = h(doc, "input", { id: "set-remember", type: "checkbox" });
  const passInput = h(doc, "input", { id: "set-pass", type: "password", autocomplete: "new-password" });
  const passBlock = h(
    doc,
    "div",
    { class: "pass-block", hidden: true },
    field("set-pass", t("settings.passphraseLabel"), passInput),
    h(doc, "p", { class: "notice" }, t("settings.passphraseWarning")),
  );
  const saveButton = h(doc, "button", { type: "button", class: "primary" }, t("settings.keySave"));
  rememberBox.addEventListener("change", () => {
    passBlock.hidden = !rememberBox.checked;
    saveButton.textContent = t(rememberBox.checked ? "settings.keySaveDevice" : "settings.keySave");
  });
  saveButton.addEventListener("click", async () => {
    const key = keyInput.value.trim();
    if (key === "") return say(t("settings.error.emptyKey"), true);
    try {
      if (rememberBox.checked) await vault.remember(key, passInput.value);
      else vault.setSessionKey(key);
      keyInput.value = "";
      passInput.value = "";
      say(t(rememberBox.checked ? "settings.keyRemembered" : "settings.keySaved"));
    } catch (error) {
      vault.setSessionKey(key);
      say(errorText(error), true);
    }
    refreshStatus();
  });

  // Security: everything is inline. A note under each action says how it went.
  const inlineNote = () => h(doc, "p", { class: "sec-note", role: "status", "aria-live": "polite" });
  const setNote = (el, text, isError = false) => {
    el.textContent = text;
    el.setAttribute("class", isError ? "sec-note err" : "sec-note ok");
  };

  // Unlock a remembered key.
  const unlockInput = h(doc, "input", { id: "set-unlock", type: "password", autocomplete: "current-password" });
  const unlockButton = h(doc, "button", { type: "button", class: "primary" }, t("settings.unlock"));
  const unlockNote = inlineNote();
  const unlockForm = h(doc, "div", { class: "unlock-form", hidden: true }, h(doc, "div", { class: "sec-row" }, field("set-unlock", t("settings.unlockLabel"), unlockInput), unlockButton), unlockNote);
  const doUnlock = async () => {
    try {
      await vault.unlock(unlockInput.value);
      unlockInput.value = "";
      setNote(unlockNote, "");
      say(t("settings.unlocked"));
    } catch (error) {
      setNote(unlockNote, errorText(error), true);
    }
    refreshStatus();
  };
  unlockButton.addEventListener("click", doUnlock);
  unlockInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") doUnlock();
  });

  // Forget the remembered key and the key in memory (asks inline first).
  const forgetButton = h(doc, "button", { type: "button", class: "danger", "data-ui": "forget-key" }, t("settings.forget"));
  const forgetYes = h(doc, "button", { type: "button", class: "danger", "data-ui": "forget-yes" }, t("settings.forgetYes"));
  const forgetNo = h(doc, "button", { type: "button" }, t("settings.deleteConfirmNo"));
  const forgetPanel = h(doc, "div", { class: "sec-panel", hidden: true, "data-ui": "forget-panel" }, h(doc, "p", {}, t("settings.forgetConfirm")), h(doc, "div", { class: "sec-row" }, forgetYes, forgetNo));
  forgetButton.addEventListener("click", () => {
    forgetPanel.hidden = !forgetPanel.hidden;
    changePanel.hidden = true;
  });
  forgetNo.addEventListener("click", () => {
    forgetPanel.hidden = true;
  });
  forgetYes.addEventListener("click", () => {
    vault.forget();
    vault.clearSessionKey();
    forgetPanel.hidden = true;
    say(t("settings.forgotten"));
    refreshStatus();
  });

  // Change the passphrase: a small form that opens in place.
  const oldPass = h(doc, "input", { id: "set-old", type: "password", autocomplete: "current-password" });
  const newPass = h(doc, "input", { id: "set-new", type: "password", autocomplete: "new-password" });
  const changeOpen = h(doc, "button", { type: "button", "data-ui": "change-open" }, t("settings.changePassphrase"));
  const changeGo = h(doc, "button", { type: "button", class: "primary", "data-ui": "change-go" }, t("settings.changeGo"));
  const changeCancel = h(doc, "button", { type: "button" }, t("settings.deleteConfirmNo"));
  const changeNote = inlineNote();
  const changePanel = h(doc, "div", { class: "sec-panel", hidden: true, "data-ui": "change-panel" }, h(doc, "div", { class: "sec-row" }, field("set-old", t("settings.oldPassphrase"), oldPass), field("set-new", t("settings.newPassphrase"), newPass)), h(doc, "div", { class: "sec-row" }, changeGo, changeCancel), changeNote);
  changeOpen.addEventListener("click", () => {
    changePanel.hidden = !changePanel.hidden;
    forgetPanel.hidden = true;
  });
  changeCancel.addEventListener("click", () => {
    changePanel.hidden = true;
    setNote(changeNote, "");
  });
  changeGo.addEventListener("click", async () => {
    try {
      await vault.changePassphrase(oldPass.value, newPass.value);
      oldPass.value = "";
      newPass.value = "";
      changePanel.hidden = true;
      setNote(changeNote, "");
      say(t("settings.passphraseChanged"));
    } catch (error) {
      setNote(changeNote, errorText(error), true);
    }
  });

  // The explanation at the top of the tab.
  const secMark = h(doc, "span", { class: "bang no", "data-ui": "security-mark", "aria-hidden": "true" }, "!");
  const secText = h(doc, "span", {}, "");
  const secLead = h(doc, "p", { class: "sec-lead", "data-ui": "security-lead" }, secMark, secText);
  const secSteps = h(
    doc,
    "div",
    { class: "sec-steps", "data-ui": "security-steps" },
    ...[1, 2, 3].map((n) => h(doc, "div", { class: `sec-step s${n}` }, h(doc, "b", {}, t(`settings.secStep${n}Title`)), t(`settings.secStep${n}Text`))),
  );
  const secActions = h(doc, "div", { class: "sec-actions", "data-ui": "security-actions" }, h(doc, "div", { class: "sec-row" }, changeOpen, forgetButton), changePanel, forgetPanel);

  // Default limits.
  const current = settings.get().limits;
  const limitInputs = LIMIT_FIELDS.map(([key, labelKey]) => {
    const input = h(doc, "input", { id: `set-${key}`, type: "number", min: key === "maxSearches" ? 0 : 1, max: LIMIT_MAX[key], step: 1, value: current[key] });
    input.addEventListener("change", () => {
      settings.setLimits(Object.fromEntries(LIMIT_FIELDS.map(([k], i) => [k, Number(limitInputs[i].value)])));
      const clamped = settings.get().limits;
      limitInputs.forEach((el, i) => {
        el.value = String(clamped[LIMIT_FIELDS[i][0]]);
      });
      say(t("settings.limitsSaved"));
    });
    return { key, labelKey, input };
  }).map(({ key, labelKey, input }) => {
    input.dataset.key = key;
    input.labelKey = labelKey;
    return input;
  });

  // Tooltips.
  const tipsBox = h(doc, "input", { id: "set-tooltips", type: "checkbox" });
  tipsBox.checked = !settings.get().tooltips;
  tipsBox.addEventListener("change", () => {
    settings.setTooltips(!tipsBox.checked);
    say(t(tipsBox.checked ? "settings.tooltipsOff" : "settings.tooltipsOn"));
  });

  // Where the player buttons sit.
  const layoutSelect = h(doc, "select", { id: "set-player-layout", "data-ui": "player-layout-select" }, h(doc, "option", { value: "side" }, t("settings.playerSide")), h(doc, "option", { value: "bar" }, t("settings.playerBar")));
  layoutSelect.value = settings.get().playerLayout;
  layoutSelect.addEventListener("change", () => {
    settings.setPlayerLayout(layoutSelect.value);
    say(t("settings.playerSaved"));
  });

  // Keyboard shortcuts: an on/off box and the list of keys.
  const shortcutsBox = h(doc, "input", { id: "set-shortcuts", type: "checkbox" });
  shortcutsBox.checked = settings.get().shortcuts;
  shortcutsBox.addEventListener("change", () => {
    settings.setShortcuts(shortcutsBox.checked);
    say(t(shortcutsBox.checked ? "shortcuts.on" : "shortcuts.off"));
  });
  // The letter after g can be changed; a letter that is not valid or already used is refused.
  let shortcutList = null;
  const drawShortcuts = () => {
    const next = buildShortcutList(doc, t, settings.get().goKeys, {
      editable: true,
      onEdit: (id, value, input) => {
        const result = settings.setGoKeys({ ...settings.get().goKeys, [id]: value });
        if (!result) {
          input.value = settings.get().goKeys[id];
          say(t("shortcuts.keyRefused"), true);
          return;
        }
        say(t("shortcuts.keySaved"));
        drawShortcuts();
      },
    });
    shortcutList?.replaceWith(next);
    shortcutList = next;
  };
  drawShortcuts();
  const resetKeys = h(doc, "button", { type: "button", "data-ui": "shortcuts-reset" }, t("shortcuts.reset"));
  resetKeys.addEventListener("click", () => {
    settings.setGoKeys({ ...DEFAULT_GO_KEYS });
    say(t("shortcuts.keySaved"));
    drawShortcuts();
  });

  // Local data: how many runs and roughly how much space they take.
  const dataStat = h(doc, "p", { class: "data-stat", "data-ui": "data-stat" });
  const refreshStat = async () => {
    try {
      const items = await runStore.list();
      let bytes = 0;
      for (const item of items) bytes += JSON.stringify((await runStore.get(item.id)) ?? "").length;
      dataStat.textContent = t("settings.dataStat", { n: items.length, size: formatSize(bytes) });
    } catch {
      dataStat.textContent = "";
    }
  };
  refreshStat();
  const deleteButton = h(doc, "button", { type: "button", class: "danger" }, t("settings.deleteRuns"));
  const confirmBox = h(doc, "div", { class: "confirm", hidden: true });
  const confirmYes = h(doc, "button", { type: "button", class: "danger" }, t("settings.deleteConfirmYes"));
  const confirmNo = h(doc, "button", { type: "button" }, t("settings.deleteConfirmNo"));
  confirmBox.append(h(doc, "p", {}, t("settings.deleteConfirm")), confirmYes, confirmNo);
  deleteButton.addEventListener("click", () => {
    confirmBox.hidden = false;
  });
  confirmNo.addEventListener("click", () => {
    confirmBox.hidden = true;
  });
  confirmYes.addEventListener("click", async () => {
    try {
      await runStore.clear();
      say(t("settings.runsDeleted"));
      refreshStat();
    } catch {
      say(t("settings.error.storage"), true);
    }
    confirmBox.hidden = true;
  });

  // Backup: export and import.
  const includeKey = h(doc, "input", { id: "set-include-key", type: "checkbox" });
  const exportButton = h(doc, "button", { type: "button" }, t("settings.export"));
  exportButton.addEventListener("click", async () => {
    try {
      const items = await runStore.list();
      const runs = [];
      for (const item of items) runs.push(await runStore.get(item.id));
      const backup = exportBackup({
        runs: runs.filter(Boolean),
        settings: settings.get(),
        vaultRecord: vault.exportRecord(),
        includeKey: includeKey.checked,
        appVersion: ctx.version,
      });
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = h(doc, "a", { href: url, download: "agent-atlas-backup.json" });
      doc.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say(t("settings.exported", { n: runs.length }));
    } catch {
      say(t("settings.error.storage"), true);
    }
  });
  const importFile = h(doc, "input", { id: "set-import", type: "file", accept: "application/json,.json", hidden: true });
  const chooseFileButton = h(doc, "button", { type: "button", "data-ui": "import-choose" }, t("settings.chooseFile"));
  chooseFileButton.addEventListener("click", () => importFile.click());
  const importChoice = h(doc, "div", { class: "confirm", hidden: true });
  const importProblems = h(doc, "ul", { class: "reasons", hidden: true });
  let pending = null;
  importFile.addEventListener("change", async () => {
    importChoice.hidden = true;
    importProblems.hidden = true;
    pending = null;
    const file = importFile.files?.[0];
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      importProblems.replaceChildren(h(doc, "li", {}, t("settings.importRejected")), ...parsed.errors.slice(0, 20).map((e) => h(doc, "li", {}, e)));
      importProblems.hidden = false;
      return;
    }
    pending = parsed.backup;
    importChoice.hidden = false;
  });
  const runImport = async (mode) => {
    if (!pending) return;
    try {
      const result = await applyBackup(pending, { runStore, settingsStore: settings, vault, mode });
      say(t("settings.imported", result));
      refreshStat();
    } catch {
      say(t("settings.error.storage"), true);
    }
    pending = null;
    importChoice.hidden = true;
    importFile.value = "";
    refreshStatus();
  };
  const mergeButton = h(doc, "button", { type: "button", class: "primary" }, t("settings.importMerge"));
  const replaceButton = h(doc, "button", { type: "button", class: "danger" }, t("settings.importReplace"));
  mergeButton.addEventListener("click", () => runImport("merge"));
  replaceButton.addEventListener("click", () => runImport("replace"));
  importChoice.append(h(doc, "p", {}, t("settings.importChoose")), mergeButton, replaceButton);

  // Providers: Anthropic works; the others are greyed out until they are built.
  const providerTag = h(doc, "span", { class: "tag-saved", "data-ui": "provider-saved-tag", hidden: true }, t("settings.keySavedTag"));
  const providerTabs = h(
    doc,
    "div",
    { class: "provider-tabs", role: "tablist", "data-ui": "provider-tabs" },
    h(doc, "button", { type: "button", class: "tab", role: "tab", "aria-selected": "true", "data-ui": "provider-tab-anthropic" }, "Anthropic", providerTag),
    ...PROVIDERS_SOON.map((name) => h(doc, "button", { type: "button", class: "tab", role: "tab", disabled: true, "aria-disabled": "true", "data-ui": `provider-tab-${name.toLowerCase()}` }, name, h(doc, "span", { class: "tag-soon" }, t("settings.providerSoon")))),
  );
  const providerPanel = h(doc, "div", { class: "provider-panel", "data-ui": "provider-panel-anthropic" }, status, field("set-key", t("settings.keyLabel"), keyInput), h(doc, "div", { class: "field checkbox" }, rememberBox, h(doc, "label", { for: "set-remember" }, t("settings.rememberLabel"))), passBlock, saveButton);
  const securityNone = h(doc, "p", { class: "notice", "data-ui": "security-none" }, t("settings.securityNone"));
  const lockedTag = h(doc, "span", { class: "tag-alert", "data-ui": "security-locked-tag", title: t("settings.unlockAlert"), hidden: true }, "!");
  // The six sections, in the order they were written: keys, limits, tooltips, player, data, security.
  const written = [
    h(
      doc,
      "section",
      { class: "settings-section" },
      h(doc, "h2", {}, t("settings.tabKeys")),
      h(doc, "p", {}, t("settings.keyIntro")),
      providerTabs,
      providerPanel,
    ),
    h(
      doc,
      "section",
      { class: "settings-section" },
      h(doc, "h2", {}, t("settings.limitsHeading")),
      h(doc, "p", {}, t("settings.limitsIntro")),
      ...limitInputs.map((input) => field(input.id, t(input.labelKey), input)),
    ),
    h(
      doc,
      "section",
      { class: "settings-section" },
      h(doc, "h2", {}, t("settings.tooltipsHeading")),
      h(doc, "p", {}, t("settings.tooltipsIntro")),
      h(doc, "div", { class: "field checkbox" }, tipsBox, h(doc, "label", { for: "set-tooltips" }, t("settings.tooltipsLabel"))),
    ),
    h(doc, "section", { class: "settings-section" }, h(doc, "h2", {}, t("settings.playerHeading")), h(doc, "p", {}, t("settings.playerIntro")), field("set-player-layout", t("settings.playerLabel"), layoutSelect)),
    h(doc, "section", { class: "settings-section", "data-ui": "shortcuts-section" }, h(doc, "h2", {}, t("shortcuts.heading")), h(doc, "p", {}, t("shortcuts.intro")), h(doc, "div", { class: "field checkbox" }, shortcutsBox, h(doc, "label", { for: "set-shortcuts" }, t("shortcuts.enable"))), h(doc, "p", {}, t("shortcuts.changeHint")), shortcutList, resetKeys),
    h(
      doc,
      "section",
      { class: "settings-section" },
      h(doc, "h2", {}, t("settings.dataHeading")),
      h(doc, "p", {}, t("settings.dataIntro")),
      dataStat,
      h(
        doc,
        "div",
        { class: "data-cards", "data-ui": "data-cards" },
        h(doc, "div", { class: "data-card", "data-ui": "data-backup" }, h(doc, "h3", {}, t("settings.backupTitle")), h(doc, "p", {}, t("settings.backupText")), h(doc, "div", { class: "field checkbox" }, includeKey, h(doc, "label", { for: "set-include-key" }, t("settings.includeKey"))), h(doc, "div", { class: "data-actions" }, exportButton)),
        h(doc, "div", { class: "data-card", "data-ui": "data-restore" }, h(doc, "h3", {}, t("settings.restoreTitle")), h(doc, "p", {}, t("settings.restoreText")), importProblems, importChoice, h(doc, "div", { class: "data-actions" }, chooseFileButton, importFile)),
      ),
      h(doc, "div", { class: "danger-row", "data-ui": "data-danger" }, h(doc, "div", {}, h(doc, "h3", {}, t("settings.deleteRuns")), h(doc, "p", {}, t("settings.deleteText"))), deleteButton),
      confirmBox,
    ),
    h(doc, "section", { class: "settings-section" }, h(doc, "h2", {}, t("settings.securityHeading")), securityNone, secLead, secSteps, unlockForm, secActions),
  ];
  const [keySection, limitsSection, tooltipsSection, playerSection, shortcutsSection, dataSection, securitySection] = written;
  // Tabs down the left (a row on a phone); one section is shown at a time.
  const keyTag = h(doc, "span", { class: "tag-saved", "data-ui": "key-saved-tag", hidden: true }, t("settings.keySavedTag"));
  const panels = [
    ["key", "settings.tabKeys", keySection],
    ["limits", "settings.limitsHeading", limitsSection],
    ["player", "settings.playerHeading", playerSection],
    ["tooltips", "settings.tooltipsHeading", tooltipsSection],
    ["data", "settings.dataHeading", dataSection],
    ["shortcuts", "shortcuts.heading", shortcutsSection],
    ["security", "settings.securityHeading", securitySection],
  ];
  const tabButtons = panels.map(([id, headingKey]) => h(doc, "button", { type: "button", class: "tab", role: "tab", "data-ui": `settings-tab-${id}`, "data-tab": id }, t(headingKey), ...(id === "key" ? [keyTag] : id === "security" ? [lockedTag] : [])));
  const showTab = (id) => {
    panels.forEach(([panelId, , node]) => {
      node.hidden = panelId !== id;
    });
    tabButtons.forEach((button) => button.setAttribute("aria-selected", String(button.getAttribute("data-tab") === id)));
  };
  tabButtons.forEach((button) => button.addEventListener("click", () => showTab(button.getAttribute("data-tab"))));
  showTab(ctx.tab === "shortcuts" ? "shortcuts" : "key");
  const tabList = h(doc, "div", { class: "settings-tabs", role: "tablist", "data-ui": "settings-tabs" }, ...tabButtons);
  ctx.main.replaceChildren(h(doc, "h1", {}, t("settings.title")), message, h(doc, "div", { class: "settings-layout", "data-ui": "settings-layout" }, tabList, h(doc, "div", { class: "settings-body" }, ...panels.map(([, , node]) => node))));
  refreshStatus();
}
