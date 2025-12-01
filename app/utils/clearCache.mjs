import { clearAppCache, LS_KEYS } from "./localStorage.mjs";
import { queryClient } from "../queryClient.js";

/**
 * Clear all application caches including:
 * - localStorage items
 * - React Query cache
 * - In-memory caches (places, user preferences)
 */
export async function clearAllCaches() {
  if (typeof window === "undefined") return;

  console.log("🧹 Clearing all application caches...");

  // 1. Clear localStorage cache
  clearAppCache();

  // 2. Clear React Query cache
  queryClient.clear();
  queryClient.invalidateQueries();
  console.log("✅ Cleared React Query cache");

  // 3. Clear in-memory caches from mapMain.js if available
  if (typeof window !== "undefined") {
    if (typeof window.clearMapCaches === "function") {
      window.clearMapCaches();
      console.log("✅ Cleared in-memory map caches");
    }
  }

  console.log("🎉 All caches cleared successfully!");
}

/**
 * Clear only localStorage cache (keeps React Query and in-memory caches)
 */
export function clearLocalStorageCache() {
  clearAppCache();
}

/**
 * Clear only React Query cache
 */
export function clearReactQueryCache() {
  queryClient.clear();
  queryClient.invalidateQueries();
  console.log("✅ Cleared React Query cache");
}

// Expose globally for easy access from browser console
if (typeof window !== "undefined") {
  window.clearAllCaches = clearAllCaches;
  window.clearLocalStorageCache = clearLocalStorageCache;
  window.clearReactQueryCache = clearReactQueryCache;
}
