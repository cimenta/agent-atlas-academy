// Password protection of an export file: the whole text is encrypted with AES-GCM under a key made from the password (PBKDF2-SHA256).
// The password is never stored. A wrong password or a changed file gives the error "wrong".
export const ENCRYPTED_FORMAT = "agent-atlas-backup-encrypted";
export const ENCRYPTED_VERSION = 1;
const ITERATIONS = 200000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class FileCryptoError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const toBase64 = (bytes) => {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
};
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function deriveKey(subtle, password, salt, iterations) {
  const base = await subtle.importKey("raw", encoder.encode(String(password)), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// The text as an encrypted file text. cryptoImpl and iterations are for tests.
export async function encryptText(text, password, { cryptoImpl = globalThis.crypto, iterations = ITERATIONS } = {}) {
  if (typeof password !== "string" || password === "") throw new FileCryptoError("password");
  const salt = cryptoImpl.getRandomValues(new Uint8Array(16));
  const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(cryptoImpl.subtle, password, salt, iterations);
  const cipher = new Uint8Array(await cryptoImpl.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(text)));
  return JSON.stringify({ format: ENCRYPTED_FORMAT, version: ENCRYPTED_VERSION, kdf: "PBKDF2-SHA256", iterations, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(cipher) });
}

// True for the text of an encrypted file (it only looks at the outer shape).
export function isEncryptedText(text) {
  try {
    const data = JSON.parse(text);
    return data !== null && typeof data === "object" && data.format === ENCRYPTED_FORMAT;
  } catch {
    return false;
  }
}

export async function decryptText(text, password, { cryptoImpl = globalThis.crypto } = {}) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new FileCryptoError("shape");
  }
  const ok = data?.format === ENCRYPTED_FORMAT && data.version === ENCRYPTED_VERSION && Number.isInteger(data.iterations) && data.iterations > 0 && data.iterations <= 2000000 && ["salt", "iv", "ciphertext"].every((f) => typeof data[f] === "string");
  if (!ok) throw new FileCryptoError("shape");
  if (typeof password !== "string" || password === "") throw new FileCryptoError("password");
  try {
    const key = await deriveKey(cryptoImpl.subtle, password, fromBase64(data.salt), data.iterations);
    const plain = await cryptoImpl.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(data.iv) }, key, fromBase64(data.ciphertext));
    return decoder.decode(plain);
  } catch {
    throw new FileCryptoError("wrong");
  }
}
