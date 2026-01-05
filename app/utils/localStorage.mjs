export const ls = {
  get(k) {
    return localStorage.getItem(k);
  },
  set(k, v) {
    localStorage.setItem(k, v);
  },
  remove(k) {
    localStorage.removeItem(k);
  },
  clear() {
    localStorage.clear();
  },
};

// All localStorage keys used in the application
export const LS_KEYS = {
  PLACE_TYPE_FILTER: "ui.placeType.filter",
  BASEMAP: "ui.basemap.choice",
  DRAW_HELP: "ui.drawHelp.dismissed",
  ACCESSIBILITY_FILTER: "ui.placeAccessibility.filter",
  PHOTOS_ONLY: "ui.placeList.photosOnly",
  MAP_VIEW: "ui.map.lastView",
  MAPILLARY_TOKEN: "MAPILLARY_TOKEN",
};

/**
 * Clear all application-specific localStorage items
 */
export function clearAppCache() {
  if (typeof window === "undefined") return;
  
  Object.values(LS_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });
  
  console.log("✅ Cleared application localStorage cache");
}
