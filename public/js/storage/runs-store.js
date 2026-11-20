// Every run the visitor makes is kept in this browser (IndexedDB). Nothing here is sent anywhere.
import { validateRun } from "../run-schema.js";
import { RUN_STORE_MAX_BYTES as MAX_BYTES } from "../engine/catalog.js";
import { withoutBodies } from "../engine/api-log.js";

const DB_NAME = "aa";
const STORE = "runs";

export function createMemoryBackend() {
  const map = new Map();
  return {
    async put(record) {
      map.set(record.id, structuredClone(record));
    },
    async get(id) {
      return map.has(id) ? structuredClone(map.get(id)) : undefined;
    },
    async getAll() {
      return [...map.values()].map((r) => structuredClone(r));
    },
    async delete(id) {
      map.delete(id);
    },
    async clear() {
      map.clear();
    },
  };
}

export function createIndexedDbBackend(indexedDB = globalThis.indexedDB) {
  let opened = null;
  const open = () => {
    opened ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return opened;
  };
  const run = async (mode, action) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    put: (record) => run("readwrite", (s) => s.put(record)),
    get: (id) => run("readonly", (s) => s.get(id)),
    getAll: () => run("readonly", (s) => s.getAll()),
    delete: (id) => run("readwrite", (s) => s.delete(id)),
    clear: () => run("readwrite", (s) => s.clear()),
  };
}

export function createRunStore(backend, { now = Date.now } = {}) {
  return {
    async save(run) {
      try {
        let record = run;
        // A log that is not valid (an oversize header of a strange answer) must not cost the run: it is saved without the log.
        if (!validateRun(run).ok) {
          if (!Array.isArray(run.apiCalls)) return { ok: false, reason: "invalid" };
          const { apiCalls, ...rest } = run;
          record = { ...rest, apiCallsDropped: true };
          if (!validateRun(record).ok) return { ok: false, reason: "invalid" };
        }
        // The log of the calls to the provider is the biggest part of a run. When it makes the run too large, the run is saved without it
        // (and says so), so a long run is never lost because of the log.
        // First the bodies of the calls that worked go (the failures are what a student needs to read), then the whole log.
        if (JSON.stringify(record).length > MAX_BYTES && Array.isArray(record.apiCalls)) {
          record = { ...record, apiCalls: record.apiCalls.map((c) => (c.response && c.response.status < 400 ? withoutBodies(c) : c)) };
        }
        if (JSON.stringify(record).length > MAX_BYTES && Array.isArray(record.apiCalls)) {
          const { apiCalls, ...rest } = record;
          record = { ...rest, apiCallsDropped: true };
        }
        if (JSON.stringify(record).length > MAX_BYTES) return { ok: false, reason: "too_large" };
        const existing = await backend.get(run.id);
        await backend.put({ id: run.id, createdAt: existing?.createdAt ?? now(), run: record });
        return { ok: true };
      } catch {
        return { ok: false, reason: "storage" };
      }
    },
    async list() {
      const all = await backend.getAll();
      return all
        .map(({ id, createdAt, run }) => ({ id, title: run.title, pattern: run.pattern, outcome: run.outcome ?? "finished", provider: run.recordedWith?.provider, createdAt }))
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    async get(id) {
      return (await backend.get(id))?.run;
    },
    remove: (id) => backend.delete(id),
    clear: () => backend.clear(),
  };
}

// Writes the latest version of a growing run at most once per interval; flush writes it at once.
export function createBatchedSaver(store, { intervalMs = 2000, clock = globalThis } = {}) {
  let latest = null;
  let timer = null;
  const write = async () => {
    timer = null;
    if (latest) {
      const run = latest;
      latest = null;
      await store.save(run);
    }
  };
  return {
    update(run) {
      latest = run;
      if (timer === null) timer = clock.setTimeout(write, intervalMs);
    },
    async flush() {
      if (timer !== null) {
        clock.clearTimeout(timer);
        timer = null;
      }
      await write();
    },
  };
}
