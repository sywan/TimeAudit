import type { AuditState } from './types';

const DB_NAME = 'time-audit-v1';
const STORE = 'profiles';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadProfile(sub: string): Promise<AuditState | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(sub);
    request.onsuccess = () => resolve((request.result as AuditState | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function saveProfile(sub: string, state: AuditState): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(state, sub);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
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
