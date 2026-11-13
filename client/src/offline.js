import { apiRequest } from './api';

const DB_NAME = 'pos-offline';
const DB_VERSION = 1;
const STORE_NAME = 'checkout-outbox';
const OUTBOX_EVENT = 'pos-outbox-changed';

let syncPromise = null;

function hasIndexedDb() {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB tidak tersedia pada peramban ini'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'idempotency_key'
        });
        store.createIndex('status', 'status', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Gagal membuka IndexedDB'));
  });
}

async function withStore(mode, callback) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;

      try {
        result = callback(store);
      } catch (error) {
        reject(error);
        return;
      }

      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error('Transaksi IndexedDB gagal'));
      transaction.onabort = () => reject(transaction.error || new Error('Transaksi IndexedDB dibatalkan'));
    });
  } finally {
    database.close();
  }
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueCheckout(payload, idempotencyKey) {
  const item = {
    idempotency_key: idempotencyKey,
    payload,
    status: 'pending',
    attempts: 0,
    last_error: null,
    created_at: new Date().toISOString()
  };

  await withStore('readwrite', (store) => store.put(item));
  await notifyOutboxChanged();
  return item;
}

export async function listOutbox() {
  if (!hasIndexedDb()) return [];

  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const rows = await requestToPromise(store.getAll());
    return (rows || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  } finally {
    database.close();
  }
}

export async function getOutboxCount() {
  try {
    const rows = await listOutbox();
    return rows.length;
  } catch (_error) {
    return 0;
  }
}

async function removeOutboxItem(idempotencyKey) {
  await withStore('readwrite', (store) => store.delete(idempotencyKey));
}

async function saveOutboxItem(item) {
  await withStore('readwrite', (store) => store.put(item));
}

async function notifyOutboxChanged() {
  if (typeof window === 'undefined') return;
  const count = await getOutboxCount().catch(() => 0);
  window.dispatchEvent(new CustomEvent(OUTBOX_EVENT, { detail: { count } }));
}

export async function syncOutbox() {
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { synced: 0, failed: 0, remaining: await getOutboxCount() };
    }

    const items = await listOutbox();
    let synced = 0;
    let failed = 0;

    for (const item of items) {
      if (item.status === 'failed') continue;

      try {
        await apiRequest('/orders', {
          method: 'POST',
          headers: { 'X-Idempotency-Key': item.idempotency_key },
          body: JSON.stringify(item.payload)
        });

        await removeOutboxItem(item.idempotency_key);
        synced += 1;

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pos-checkout-synced', {
            detail: { idempotency_key: item.idempotency_key }
          }));
        }
      } catch (error) {
        const updated = {
          ...item,
          attempts: (item.attempts || 0) + 1,
          last_error: error.message || 'Sinkronisasi gagal'
        };

        if (error.status >= 400 && error.status < 500) {
          updated.status = 'failed';
          failed += 1;
          await saveOutboxItem(updated);
        } else {
          await saveOutboxItem(updated);
          break;
        }
      }
    }

    await notifyOutboxChanged();
    return { synced, failed, remaining: await getOutboxCount() };
  })().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}

export { OUTBOX_EVENT };
