// What the dot of a provider says: green = the key is loaded and can be used, yellow = a key is saved but locked
// (it needs its passphrase), no dot = there is no key.
export function keyState(vault) {
  if (vault.getSessionKey() !== null) return "loaded";
  return vault.hasStoredKey() ? "locked" : "none";
}

// One state for several providers: a key that needs unlocking wins, so the visitor sees there is something to do.
export function overallKeyState(states) {
  if (states.includes("locked")) return "locked";
  return states.includes("loaded") ? "loaded" : "none";
}
