// The settings page: API key handling, default limits and local data.
import { h } from "./dom.js";
import { LIMIT_MAX } from "./engine/catalog.js";
import { markUnlockAlert, needsUnlock } from "./unlock-alert.js";
import { VaultError } from "./storage/key-vault.js";
import { exportBackup, parseBackup, applyBackup } from "./storage/backup.js";

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
    unlockForm.hidden = available || !vault.hasStoredKey();
    forgetButton.hidden = !vault.hasStoredKey();
    changeForm.hidden = !vault.hasStoredKey();
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

  // Unlock a remembered key.
  const unlockInput = h(doc, "input", { id: "set-unlock", type: "password", autocomplete: "current-password" });
  const unlockButton = h(doc, "button", { type: "button", class: "primary" }, t("settings.unlock"));
  const unlockForm = h(doc, "div", { class: "unlock-form", hidden: true }, field("set-unlock", t("settings.unlockLabel"), unlockInput), unlockButton);
  unlockButton.addEventListener("click", async () => {
    try {
      await vault.unlock(unlockInput.value);
      unlockInput.value = "";
      say(t("settings.unlocked"));
    } catch (error) {
      say(errorText(error), true);
    }
    refreshStatus();
  });

  // Forget the remembered key and the key in memory.
  const forgetButton = h(doc, "button", { type: "button" }, t("settings.forget"));
  forgetButton.addEventListener("click", () => {
    if (!doc.defaultView.confirm(t("settings.forgetConfirm"))) return;
    vault.forget();
    vault.clearSessionKey();
    say(t("settings.forgotten"));
    refreshStatus();
  });

  // Change the passphrase.
  const oldPass = h(doc, "input", { id: "set-old", type: "password", autocomplete: "current-password" });
  const newPass = h(doc, "input", { id: "set-new", type: "password", autocomplete: "new-password" });
  const changeButton = h(doc, "button", { type: "button" }, t("settings.changePassphrase"));
  const changeForm = h(doc, "div", { class: "change-form", hidden: true }, field("set-old", t("settings.oldPassphrase"), oldPass), field("set-new", t("settings.newPassphrase"), newPass), changeButton);
  changeButton.addEventListener("click", async () => {
    try {
      await vault.changePassphrase(oldPass.value, newPass.value);
      oldPass.value = "";
      newPass.value = "";
      say(t("settings.passphraseChanged"));
    } catch (error) {
      say(errorText(error), true);
    }
  });

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

  // Local data.
  const deleteButton = h(doc, "button", { type: "button" }, t("settings.deleteRuns"));
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
  const importFile = h(doc, "input", { id: "set-import", type: "file", accept: "application/json,.json" });
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
    h(doc, "section", { class: "settings-section" }, h(doc, "h2", {}, t("settings.dataHeading")), h(doc, "p", {}, t("settings.dataIntro")), deleteButton, confirmBox, h(doc, "h3", {}, t("settings.backupHeading")), h(doc, "p", {}, t("settings.backupIntro")), h(doc, "div", { class: "field checkbox" }, includeKey, h(doc, "label", { for: "set-include-key" }, t("settings.includeKey"))), exportButton, field("set-import", t("settings.importLabel"), importFile), importProblems, importChoice),
    h(doc, "section", { class: "settings-section" }, h(doc, "h2", {}, t("settings.securityHeading")), h(doc, "p", {}, t("settings.securityIntro")), securityNone, unlockForm, changeForm, forgetButton),
  ];
  const [keySection, limitsSection, tooltipsSection, playerSection, dataSection, securitySection] = written;
  // Tabs down the left (a row on a phone); one section is shown at a time.
  const keyTag = h(doc, "span", { class: "tag-saved", "data-ui": "key-saved-tag", hidden: true }, t("settings.keySavedTag"));
  const panels = [
    ["key", "settings.tabKeys", keySection],
    ["limits", "settings.limitsHeading", limitsSection],
    ["player", "settings.playerHeading", playerSection],
    ["tooltips", "settings.tooltipsHeading", tooltipsSection],
    ["data", "settings.dataHeading", dataSection],
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
  showTab("key");
  const tabList = h(doc, "div", { class: "settings-tabs", role: "tablist", "data-ui": "settings-tabs" }, ...tabButtons);
  ctx.main.replaceChildren(h(doc, "h1", {}, t("settings.title")), message, h(doc, "div", { class: "settings-layout", "data-ui": "settings-layout" }, tabList, h(doc, "div", { class: "settings-body" }, ...panels.map(([, , node]) => node))));
  refreshStatus();
}
