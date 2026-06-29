(function () {
  'use strict';

  const DB_NAME = 'bent-auth-storage';
  const DB_VERSION = 1;
  const STORE_NAME = 'sessions';
  let dbPromise = null;

  function safeLocalGet(key) {
    try { return window.localStorage.getItem(key); }
    catch (_) { return null; }
  }

  function safeLocalSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function safeLocalRemove(key) {
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (_) {
      return false;
    }
  }

  function openDatabase() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('INDEXEDDB_UNAVAILABLE'));
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('INDEXEDDB_OPEN_FAILED'));
      request.onblocked = () => reject(new Error('INDEXEDDB_BLOCKED'));
    }).catch(error => {
      dbPromise = null;
      throw error;
    });

    return dbPromise;
  }

  async function idbGet(key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
      request.onerror = () => reject(request.error || new Error('INDEXEDDB_READ_FAILED'));
    });
  }

  async function idbSet(key, value) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(value, key);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error('INDEXEDDB_WRITE_FAILED'));
      transaction.onabort = () => reject(transaction.error || new Error('INDEXEDDB_WRITE_ABORTED'));
    });
  }

  async function idbRemove(key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error('INDEXEDDB_DELETE_FAILED'));
      transaction.onabort = () => reject(transaction.error || new Error('INDEXEDDB_DELETE_ABORTED'));
    });
  }

  function sessionFreshness(value) {
    if (!value || typeof value !== 'string') return 0;
    try {
      const parsed = JSON.parse(value);
      const current = parsed?.currentSession || parsed;
      const expiresAt = Number(current?.expires_at || 0);
      return Number.isFinite(expiresAt) ? expiresAt : 0;
    } catch (_) {
      return 0;
    }
  }

  function chooseNewest(localValue, idbValue) {
    if (localValue == null) return idbValue;
    if (idbValue == null) return localValue;
    if (localValue === idbValue) return localValue;

    const localFreshness = sessionFreshness(localValue);
    const idbFreshness = sessionFreshness(idbValue);
    if (idbFreshness > localFreshness) return idbValue;
    return localValue;
  }

  function createDurableStorage() {
    return {
      async getItem(key) {
        const localValue = safeLocalGet(key);
        let indexedValue = null;
        try { indexedValue = await idbGet(key); } catch (_) {}

        const selected = chooseNewest(localValue, indexedValue);
        if (selected == null) return null;

        if (localValue !== selected) safeLocalSet(key, selected);
        if (indexedValue !== selected) {
          try { await idbSet(key, selected); } catch (_) {}
        }
        return selected;
      },

      async setItem(key, value) {
        const text = String(value);
        const localSaved = safeLocalSet(key, text);
        let indexedSaved = false;
        try { indexedSaved = await idbSet(key, text); } catch (_) {}
        if (!localSaved && !indexedSaved) throw new Error('BENT_SESSION_STORAGE_UNAVAILABLE');
      },

      async removeItem(key) {
        const localRemoved = safeLocalRemove(key);
        let indexedRemoved = false;
        try { indexedRemoved = await idbRemove(key); } catch (_) {}
        if (!localRemoved && !indexedRemoved) throw new Error('BENT_SESSION_STORAGE_UNAVAILABLE');
      }
    };
  }

  function storageKeyForUrl(supabaseUrl) {
    try {
      const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
      return projectRef ? `sb-${projectRef}-auth-token` : 'bent-auth-token';
    } catch (_) {
      return 'bent-auth-token';
    }
  }

  async function requestPersistence() {
    try {
      if (!navigator.storage?.persist) return false;
      return await navigator.storage.persist();
    } catch (_) {
      return false;
    }
  }

  window.BENT_AUTH_STORAGE = {
    createDurableStorage,
    storageKeyForUrl,
    requestPersistence
  };
})();
