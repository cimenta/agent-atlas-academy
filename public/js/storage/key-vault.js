// Holds the API key in memory, and optionally keeps it in storage encrypted with a passphrase.
// The passphrase is never stored, so a forgotten passphrase cannot be recovered.
export class VaultError extends Error {
  constructor(code) {
    super(`vault: ${code}`);
    this.name = "VaultError";
    this.code = code;
  }
}

const MIN_PASSPHRASE = 8;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (bytes) => {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

// The first provider (Anthropic) keeps its record under "aa.vault", as before; every other provider has its own
// record, "aa.vault.<provider>", with its own passphrase and its own key in memory.
export function createVault({ storage, cryptoImpl = globalThis.crypto, iterations = 600000, storageKey = "aa.vault" }) {
  const STORAGE_KEY = storageKey;
  const others = new Map();
  let sessionKey = null;
  const subtle = cryptoImpl.subtle;

  async function deriveKey(passphrase, salt, rounds) {
    const material = await subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: rounds, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  function readRecord() {
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      throw new VaultError("storage");
    }
    if (raw === null || raw === undefined) throw new VaultError("none");
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      throw new VaultError("corrupt");
    }
    const ok =
      record &&
      record.v === 1 &&
      record.kdf === "PBKDF2-SHA256" &&
      Number.isInteger(record.iterations) &&
      record.iterations > 0 &&
      ["salt", "iv", "ciphertext"].every((f) => typeof record[f] === "string");
    if (!ok) throw new VaultError("corrupt");
    return record;
  }

  async function save(key, passphrase) {
    if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE) throw new VaultError("short");
    const salt = cryptoImpl.getRandomValues(new Uint8Array(16));
    const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
    const aesKey = await deriveKey(passphrase, salt, iterations);
    const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoder.encode(key));
    const record = { v: 1, kdf: "PBKDF2-SHA256", iterations, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      throw new VaultError("storage");
    }
  }

  async function decrypt(passphrase) {
    const record = readRecord();
    try {
      const aesKey = await deriveKey(String(passphrase), fromBase64(record.salt), record.iterations);
      const plain = await subtle.decrypt({ name: "AES-GCM", iv: fromBase64(record.iv) }, aesKey, fromBase64(record.ciphertext));
      return decoder.decode(plain);
    } catch {
      throw new VaultError("wrong");
    }
  }

  const self = {
    forProvider(id) {
      if (id === "anthropic") return self;
      if (!others.has(id)) others.set(id, createVault({ storage, cryptoImpl, iterations, storageKey: `aa.vault.${id}` }));
      return others.get(id);
    },
    setSessionKey(key) {
      sessionKey = typeof key === "string" && key !== "" ? key : null;
    },
    getSessionKey: () => sessionKey,
    clearSessionKey() {
      sessionKey = null;
    },
    hasStoredKey() {
      try {
        return storage.getItem(STORAGE_KEY) !== null;
      } catch {
        return false;
      }
    },
    async remember(key, passphrase) {
      await save(key, passphrase);
      sessionKey = key;
    },
    async unlock(passphrase) {
      const key = await decrypt(passphrase);
      sessionKey = key;
      return key;
    },
    // The stored record is already encrypted. It is what a backup may carry, never the key itself.
    exportRecord() {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    importRecord(record) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(record));
      } catch {
        throw new VaultError("storage");
      }
    },
    forget() {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch {
        // nothing more can be done
      }
    },
    async changePassphrase(oldPassphrase, newPassphrase) {
      const key = await decrypt(oldPassphrase);
      await save(key, newPassphrase);
    },
  };
  return self;
}
