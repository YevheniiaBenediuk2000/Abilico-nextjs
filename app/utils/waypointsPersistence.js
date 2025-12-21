/**
 * IndexedDB-based caching for waypoints (roads/paths) data.
 * Allows persisting and retrieving waypoints across sessions for faster loading.
 */

const DB_NAME = "AbilicoDB";
const DB_VERSION = 2; // Bumped version to add waypoints store
const WAYPOINTS_STORE_NAME = "waypoints";
const PLACES_STORE_NAME = "places"; // Keep existing places store

/**
 * Open or create the IndexedDB database
 * Handles migration from v1 (places only) to v2 (places + waypoints)
 */
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

      // Create places store if it doesn't exist (from v1)
      if (!db.objectStoreNames.contains(PLACES_STORE_NAME)) {
        db.createObjectStore(PLACES_STORE_NAME, { keyPath: "id" });
      }

      // Create waypoints store (new in v2)
      if (!db.objectStoreNames.contains(WAYPOINTS_STORE_NAME)) {
        db.createObjectStore(WAYPOINTS_STORE_NAME, { keyPath: "id" });
        console.log("🛣️ [waypointsPersistence] Created waypoints store");
      }
    };
  });
};

/**
 * Save waypoints to IndexedDB cache.
 * @param {Array<{id: string, feature: object}>} waypoints - Array of waypoint objects with id and feature
 */
export const saveWaypointsToCache = async (waypoints) => {
  if (!waypoints || waypoints.length === 0) return;

  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([WAYPOINTS_STORE_NAME], "readwrite");
      const store = transaction.objectStore(WAYPOINTS_STORE_NAME);

      transaction.oncomplete = () => {
        resolve();
      };
      transaction.onerror = (event) => {
        reject(event.target.error);
      };

      waypoints.forEach((item) => {
        // item should be { id: key, feature: feature }
        store.put(item);
      });
    });
  } catch (e) {
    console.warn("Failed to save waypoints to cache", e);
  }
};

/**
 * Load all waypoints from IndexedDB cache.
 * @returns {Promise<Array<{id: string, feature: object}>>} Array of cached waypoints
 */
export const loadWaypointsFromCache = async () => {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([WAYPOINTS_STORE_NAME], "readonly");
      const store = transaction.objectStore(WAYPOINTS_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (e) {
    console.warn("Failed to load waypoints from cache", e);
    return [];
  }
};

/**
 * Clear all waypoints from IndexedDB cache.
 */
export const clearWaypointsCache = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([WAYPOINTS_STORE_NAME], "readwrite");
      const store = transaction.objectStore(WAYPOINTS_STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log("🗑️ [waypointsPersistence] Waypoints cache cleared");
        resolve();
      };
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (e) {
    console.warn("Failed to clear waypoints cache", e);
  }
};

/**
 * Get specific waypoints by their IDs from cache.
 * @param {Array<string>} ids - Array of waypoint IDs to retrieve
 * @returns {Promise<Map<string, object>>} Map of id -> feature
 */
export const getWaypointsByIds = async (ids) => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([WAYPOINTS_STORE_NAME], "readonly");
      const store = transaction.objectStore(WAYPOINTS_STORE_NAME);
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
    console.warn("Failed to get waypoints by IDs from cache", e);
    return new Map();
  }
};

/**
 * Get the count of cached waypoints
 * @returns {Promise<number>} Number of cached waypoints
 */
export const getWaypointsCacheCount = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([WAYPOINTS_STORE_NAME], "readonly");
      const store = transaction.objectStore(WAYPOINTS_STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
};
