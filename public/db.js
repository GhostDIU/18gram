/**
 * 18gram Client Storage - IndexedDB for Saved Bookmarks
 * Guarantees saved reels survive server-side 7-day discovery cleanup.
 */
(function (global) {
  'use strict';

  const DB_NAME = '18gram_bookmarks_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'bookmarks';

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in global)) {
        console.warn('[db] IndexedDB not supported, falling back to localStorage');
        resolve(null);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('savedAt', 'savedAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.error('[db] IndexedDB open error:', event.target.error);
        resolve(null);
      };
    });

    return dbPromise;
  }

  const BookmarkDB = {
    async getAll() {
      const db = await openDB();
      if (!db) {
        return JSON.parse(localStorage.getItem('18gram_saved_reels') || '[]');
      }

      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          const list = request.result || [];
          // Sort descending by savedAt
          list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
          resolve(list);
        };

        request.onerror = () => {
          resolve(JSON.parse(localStorage.getItem('18gram_saved_reels') || '[]'));
        };
      });
    },

    async save(reel) {
      if (!reel || !reel.id) return false;
      const record = { ...reel, savedAt: Date.now() };

      // Also keep in localStorage as redundant backup
      try {
        const local = JSON.parse(localStorage.getItem('18gram_saved_reels') || '[]');
        if (!local.some(r => r.id === reel.id)) {
          local.unshift(record);
          localStorage.setItem('18gram_saved_reels', JSON.stringify(local));
        }
      } catch (e) {}

      const db = await openDB();
      if (!db) return true;

      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    },

    async delete(id) {
      if (!id) return false;

      try {
        const local = JSON.parse(localStorage.getItem('18gram_saved_reels') || '[]');
        const filtered = local.filter(r => r.id !== id);
        localStorage.setItem('18gram_saved_reels', JSON.stringify(filtered));
      } catch (e) {}

      const db = await openDB();
      if (!db) return true;

      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    },

    async toggle(reel) {
      const all = await this.getAll();
      const exists = all.some(r => r.id === reel.id);
      if (exists) {
        await this.delete(reel.id);
        return false; // Not saved
      } else {
        await this.save(reel);
        return true; // Saved
      }
    },

    async migrateFromLocalStorage() {
      try {
        const local = JSON.parse(localStorage.getItem('18gram_saved_reels') || '[]');
        if (local.length > 0) {
          const db = await openDB();
          if (db) {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            for (const r of local) {
              store.put({ ...r, savedAt: r.savedAt || Date.now() });
            }
          }
        }
      } catch (e) {}
    }
  };

  // Auto-migrate on load
  BookmarkDB.migrateFromLocalStorage();

  global.BookmarkDB = BookmarkDB;
})(window);
