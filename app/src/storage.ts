import type { AuditState } from './types';

const DB_NAME = 'time-audit-v1';
const STORE = 'profiles';
const pendingSaves = new Map<string, Promise<void>>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadProfile(sub: string): Promise<AuditState | null> {
  // Sign-out followed by a quick sign-in must not read before the final save.
  await pendingSaves.get(sub)?.catch(() => undefined);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(sub);
    request.onsuccess = () => resolve((request.result as AuditState | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function writeProfile(sub: string, state: AuditState): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(state, sub);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

export function saveProfile(sub: string, state: AuditState): Promise<void> {
  // IndexedDB opens asynchronously; serialize saves so an older snapshot can
  // never finish after and overwrite a newer state from the same device.
  const save = (pendingSaves.get(sub) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => writeProfile(sub, state));
  pendingSaves.set(sub, save);
  const clear = () => { if (pendingSaves.get(sub) === save) pendingSaves.delete(sub); };
  void save.then(clear, clear);
  return save;
}

export async function clearProfile(sub: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(sub);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}
