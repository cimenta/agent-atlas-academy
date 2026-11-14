// A Gemini key used to be kept in one place, with a "free tier" checkbox in the settings. Now a free key and a
// paid key each have their own slot ("aa.vault.google-free" and "aa.vault.google"). A key saved on this device
// while the checkbox was ticked is moved to the free slot, once, so nobody loses a key.
export function migrateGeminiKey({ storage, settings }) {
  try {
    if (settings.get().freeTier.google !== true) return false;
    const raw = storage.getItem("aa.vault.google");
    if (raw !== null && storage.getItem("aa.vault.google-free") === null) {
      storage.setItem("aa.vault.google-free", raw);
      storage.removeItem("aa.vault.google");
    }
    settings.setFreeTier("google", false);
    return raw !== null;
  } catch {
    return false;
  }
}
