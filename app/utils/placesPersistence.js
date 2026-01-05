/**
 * IndexedDB-based caching for places data.
 * Allows persisting and retrieving places across sessions for faster loading.
 */

const DB_NAME = "AbilicoDB";
const DB_VERSION = 2; // Updated to v2 to include waypoints store
const STORE_NAME = "places";
const WAYPOINTS_STORE_NAME = "waypoints"; // For cross-compatibility

export const openDB = () => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      // Also create waypoints store if it doesn't exist (v2)
      if (!db.objectStoreNames.contains(WAYPOINTS_STORE_NAME)) {
        db.createObjectStore(WAYPOINTS_STORE_NAME, { keyPath: "id" });
      }
    };
  });
};

/**
 * Save places to IndexedDB cache.
 * @param {Array<{id: string, feature: object}>} places - Array of place objects with id and feature
 */
export const savePlacesToCache = async (places) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      transaction.oncomplete = () => {
        console.log(
          `💾 [placesPersistence] Saved ${places.length} places to cache`
        );
        resolve();
      };
      transaction.onerror = (event) => reject(event.target.error);

      places.forEach((item) => {
        // item should be { id: key, feature: feature }
        store.put(item);
      });
    });
  } catch (e) {
    console.warn("Failed to save places to cache", e);
  }
};

/**
 * Load all places from IndexedDB cache.
 * @returns {Promise<Array<{id: string, feature: object}>>} Array of cached places
 */
export const loadPlacesFromCache = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        console.log(
          `📂 [placesPersistence] Loaded ${request.result.length} places from cache`
        );
        resolve(request.result);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (e) {
    console.warn("Failed to load places from cache", e);
    return [];
  }
};

/**
 * Clear all places from IndexedDB cache.
 */
export const clearPlacesCache = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log("🗑️ [placesPersistence] Cache cleared");
        resolve();
      };
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (e) {
    console.warn("Failed to clear places cache", e);
  }
};

/**
 * Get specific places by their IDs from cache.
 * @param {Array<string>} ids - Array of place IDs to retrieve
 * @returns {Promise<Map<string, object>>} Map of id -> feature
 */
export const getPlacesByIds = async (ids) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const result = new Map();
      let pending = ids.length;

      if (pending === 0) {
        resolve(result);
        return;
      }

      ids.forEach((id) => {
        const request = store.get(id);
        request.onsuccess = () => {
          if (request.result) {
            result.set(id, request.result.feature);
          }
          pending--;
          if (pending === 0) {
            resolve(result);
          }
        };
        request.onerror = () => {
          pending--;
          if (pending === 0) {
            resolve(result);
          }
        };
      });
    });
  } catch (e) {
    console.warn("Failed to get places by IDs from cache", e);
    return new Map();
  }
};
