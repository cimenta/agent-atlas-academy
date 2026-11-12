// A key saved on this device is locked until the passphrase is typed. While it is, the Settings
// cog in the menu shows an exclamation mark (and so does the Security tab), so the visitor knows where to go.
export function needsUnlock(vault) {
  return vault.hasStoredKey() && vault.getSessionKey() === null;
}

const CLASS = "menu-alert";

// Puts the mark on the Settings link of the menu, or takes it off. Safe to call at any time.
export function markUnlockAlert(doc, vault, t) {
  const link = doc.querySelector?.('.menu a[href="#/settings"]');
  if (!link) return;
  const existing = link.querySelector?.(`.${CLASS}`);
  if (!needsUnlock(vault)) {
    existing?.remove();
    return;
  }
  const text = t("settings.unlockAlert");
  link.setAttribute("title", text);
  link.setAttribute("aria-label", text);
  if (existing) return;
  const mark = doc.createElement("span");
  mark.setAttribute("class", CLASS);
  mark.setAttribute("data-ui", "unlock-alert");
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "!";
  link.append(mark);
}
