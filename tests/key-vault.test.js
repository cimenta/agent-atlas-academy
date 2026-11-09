import { test } from "node:test";
import assert from "node:assert/strict";
import { createVault, VaultError } from "../public/js/storage/key-vault.js";

const KEY = "sk-ant-api03-VAULTTESTKEY1234567890";
const PASS = "correct horse battery";

function memoryStorage({ failSet = false } = {}) {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (failSet) throw new Error("quota");
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
  };
}

const vault = (storage, extra = {}) => createVault({ storage, iterations: 1000, ...extra });
const rejectsWith = (promise, code) =>
  assert.rejects(promise, (e) => e instanceof VaultError && e.code === code, `expected VaultError ${code}`);

test("remember then a new vault on the same storage unlocks with the right passphrase", async () => {
  const storage = memoryStorage();
  await vault(storage).remember(KEY, PASS);
  const other = vault(storage);
  assert.equal(other.hasStoredKey(), true);
  assert.equal(await other.unlock(PASS), KEY);
  assert.equal(other.getSessionKey(), KEY);
});

test("a wrong passphrase rejects with wrong", async () => {
  const storage = memoryStorage();
  await vault(storage).remember(KEY, PASS);
  await rejectsWith(vault(storage).unlock("not the passphrase"), "wrong");
});

test("a passphrase of 7 characters rejects with short and stores nothing", async () => {
  const storage = memoryStorage();
  const v = vault(storage);
  await rejectsWith(v.remember(KEY, "1234567"), "short");
  assert.equal(storage.getItem("aa.vault"), null);
  assert.equal(v.hasStoredKey(), false);
});

test("the stored value contains neither the key nor the passphrase", async () => {
  const storage = memoryStorage();
  await vault(storage).remember(KEY, PASS);
  const raw = storage.getItem("aa.vault");
  assert.ok(!raw.includes("VAULTTESTKEY"));
  assert.ok(!raw.includes(PASS));
  const stored = JSON.parse(raw);
  assert.equal(stored.v, 1);
  assert.equal(stored.kdf, "PBKDF2-SHA256");
  assert.equal(stored.iterations, 1000);
});

test("two saves of the same key differ in salt, iv and ciphertext", async () => {
  const a = memoryStorage();
  const b = memoryStorage();
  await vault(a).remember(KEY, PASS);
  await vault(b).remember(KEY, PASS);
  const x = JSON.parse(a.getItem("aa.vault"));
  const y = JSON.parse(b.getItem("aa.vault"));
  assert.notEqual(x.salt, y.salt);
  assert.notEqual(x.iv, y.iv);
  assert.notEqual(x.ciphertext, y.ciphertext);
});

test("a tampered ciphertext rejects with wrong", async () => {
  const storage = memoryStorage();
  await vault(storage).remember(KEY, PASS);
  const stored = JSON.parse(storage.getItem("aa.vault"));
  const bytes = Buffer.from(stored.ciphertext, "base64");
  bytes[0] ^= 0xff;
  stored.ciphertext = bytes.toString("base64");
  storage.setItem("aa.vault", JSON.stringify(stored));
  await rejectsWith(vault(storage).unlock(PASS), "wrong");
});

test("a malformed stored value rejects with corrupt", async () => {
  for (const bad of ["not json", JSON.stringify({ v: 1 }), JSON.stringify({ v: 2, kdf: "x" })]) {
    const storage = memoryStorage();
    storage.setItem("aa.vault", bad);
    await rejectsWith(vault(storage).unlock(PASS), "corrupt");
  }
});

test("unlock with nothing stored rejects with none", async () => {
  await rejectsWith(vault(memoryStorage()).unlock(PASS), "none");
});

test("forget removes the record", async () => {
  const storage = memoryStorage();
  const v = vault(storage);
  await v.remember(KEY, PASS);
  v.forget();
  assert.equal(v.hasStoredKey(), false);
  assert.equal(storage.getItem("aa.vault"), null);
});

test("changePassphrase re-encrypts: the old one fails afterwards, the new one works", async () => {
  const storage = memoryStorage();
  const v = vault(storage);
  await v.remember(KEY, PASS);
  await v.changePassphrase(PASS, "a brand new passphrase");
  await rejectsWith(vault(storage).unlock(PASS), "wrong");
  assert.equal(await vault(storage).unlock("a brand new passphrase"), KEY);
  await rejectsWith(v.changePassphrase("wrong one here", "another long one"), "wrong");
});

test("when storage throws, remember rejects with storage but the session key still works", async () => {
  const v = vault(memoryStorage({ failSet: true }));
  v.setSessionKey(KEY);
  await rejectsWith(v.remember(KEY, PASS), "storage");
  assert.equal(v.getSessionKey(), KEY);
});

test("the session key is null at first and after clearSessionKey", () => {
  const v = vault(memoryStorage());
  assert.equal(v.getSessionKey(), null);
  v.setSessionKey(KEY);
  assert.equal(v.getSessionKey(), KEY);
  v.clearSessionKey();
  assert.equal(v.getSessionKey(), null);
});
