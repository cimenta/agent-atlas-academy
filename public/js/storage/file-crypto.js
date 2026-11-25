// Password protection of an export file: the whole text is encrypted with AES-GCM under a key made from the password (PBKDF2-SHA256).
// The password is never stored. A wrong password or a changed file gives the error "wrong".
export const ENCRYPTED_FORMAT = "agent-atlas-backup-encrypted";
export const ENCRYPTED_VERSION = 1;
// The text inside is gzip compressed when the wrapper says compression "gzip" (a backup is compressed before it is encrypted).
export const COMPRESSIONS = ["gzip"];
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

async function pump(bytes, stream) {
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}
export const gzip = (text) => pump(encoder.encode(text), new CompressionStream("gzip"));
export const gunzip = async (bytes) => decoder.decode(await pump(bytes, new DecompressionStream("gzip")));
export const isGzip = (bytes) => bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

// The text of a file the student chose: a gzip file is unpacked, anything else is read as text. A file object without arrayBuffer (a test) is read as text.
export async function fileToText(file) {
  if (typeof file.arrayBuffer !== "function") return file.text();
  const bytes = new Uint8Array(await file.arrayBuffer());
  return isGzip(bytes) ? gunzip(bytes) : decoder.decode(bytes);
}

// The text as an encrypted file text, compressed first when compress is true. cryptoImpl and iterations are for tests.
export async function encryptText(text, password, { cryptoImpl = globalThis.crypto, iterations = ITERATIONS, compress = false } = {}) {
  if (typeof password !== "string" || password === "") throw new FileCryptoError("password");
  const salt = cryptoImpl.getRandomValues(new Uint8Array(16));
  const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(cryptoImpl.subtle, password, salt, iterations);
  const cipher = new Uint8Array(await cryptoImpl.subtle.encrypt({ name: "AES-GCM", iv }, key, compress ? await gzip(text) : encoder.encode(text)));
  return JSON.stringify({ format: ENCRYPTED_FORMAT, version: ENCRYPTED_VERSION, kdf: "PBKDF2-SHA256", iterations, ...(compress ? { compression: "gzip" } : {}), salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(cipher) });
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
  const ok = data?.format === ENCRYPTED_FORMAT && data.version === ENCRYPTED_VERSION && Number.isInteger(data.iterations) && data.iterations > 0 && data.iterations <= 2000000 && ["salt", "iv", "ciphertext"].every((f) => typeof data[f] === "string") && (data.compression === undefined || COMPRESSIONS.includes(data.compression));
  if (!ok) throw new FileCryptoError("shape");
  if (typeof password !== "string" || password === "") throw new FileCryptoError("password");
  try {
    const key = await deriveKey(cryptoImpl.subtle, password, fromBase64(data.salt), data.iterations);
    const plain = await cryptoImpl.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(data.iv) }, key, fromBase64(data.ciphertext));
    return data.compression === "gzip" ? await gunzip(new Uint8Array(plain)) : decoder.decode(plain);
  } catch {
    throw new FileCryptoError("wrong");
  }
}
