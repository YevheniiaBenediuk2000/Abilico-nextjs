/**
 * Road Accessibility Map Module
 * Handles rendering of road/path accessibility features on the Leaflet map
 * Uses IndexedDB caching for efficient data loading
 */

import debounce from "lodash.debounce";
import {
  fetchRoadIds,
  fetchRoadsByIds,
} from "../api/fetchRoadAccessibility.js";
import {
  loadWaypointsFromCache,
  saveWaypointsToCache,
} from "../utils/waypointsPersistence.js";

// Layer group for road accessibility features
let roadAccessibilityLayer = null;
let roadAccessibilityEnabled = false;
let currentVizMode = "overall"; // overall, surface, incline, width, smoothness
let currentBounds = null;

// IndexedDB cache state for waypoints
let indexedDBWaypointsCacheLoaded = false;
let indexedDBWaypointsMap = new Map(); // id -> feature

// Min zoom level to show road accessibility
const MIN_ZOOM_FOR_ROADS = 14;

/**
 * Ensure the IndexedDB waypoints cache is loaded into memory
 */
async function ensureWaypointsCacheLoaded() {
  if (indexedDBWaypointsCacheLoaded) return;
  try {
    const cached = await loadWaypointsFromCache();
    cached.forEach((item) => {
      if (item.id && item.feature) {
        indexedDBWaypointsMap.set(item.id, item.feature);
      }
    });
    console.log(
      `📂 [IndexedDB] Loaded ${indexedDBWaypointsMap.size} waypoints from persistent cache`
    );
    indexedDBWaypointsCacheLoaded = true;
  } catch (e) {
    console.warn("Failed to load IndexedDB waypoints cache:", e);
    indexedDBWaypointsCacheLoaded = true; // Don't retry on error
  }
}

/**
 * Initialize the road accessibility layer
 * @param {L.Map} map - Leaflet map instance
 */
export function initRoadAccessibilityLayer(map) {
  if (!map) return;

  // Create a pane for road accessibility (below markers but above base tiles)
  if (!map.getPane("roadAccessibilityPane")) {
    map.createPane("roadAccessibilityPane");
    map.getPane("roadAccessibilityPane").style.zIndex = 350;
  }

  // Create layer group
  roadAccessibilityLayer = L.layerGroup([], { pane: "roadAccessibilityPane" });

  // Set up event handlers
  map.on(
    "moveend",
    debounce(() => {
      if (roadAccessibilityEnabled) {
        refreshRoadAccessibilityData(map);
      }
    }, 500)
  );

  map.on("zoomend", () => {
    if (roadAccessibilityEnabled) {
      const zoom = map.getZoom();
      if (zoom < MIN_ZOOM_FOR_ROADS) {
        clearRoadAccessibilityLayer();
        console.log("📍 Zoom too low for road accessibility layer");
      }
    }
  });

  console.log("🛣️ Road accessibility layer initialized");
  return roadAccessibilityLayer;
}

/**
 * Enable/disable road accessibility visualization
 * @param {L.Map} map - Leaflet map instance
 * @param {boolean} enabled - Whether to enable the layer
 */
export function setRoadAccessibilityEnabled(map, enabled) {
  roadAccessibilityEnabled = enabled;

  if (enabled) {
    if (!roadAccessibilityLayer) {
      initRoadAccessibilityLayer(map);
    }
    roadAccessibilityLayer.addTo(map);
    refreshRoadAccessibilityData(map);
  } else {
    if (roadAccessibilityLayer) {
      roadAccessibilityLayer.remove();
      clearRoadAccessibilityLayer();
    }
  }
}

/**
 * Set visualization mode
 * @param {string} mode - "overall", "surface", "incline", "width", "smoothness"
 */
export function setVisualizationMode(mode) {
  currentVizMode = mode;
  if (roadAccessibilityEnabled && roadAccessibilityLayer) {
    updateLayerStyles();
  }
}

/**
 * Get current visualization mode
 */
export function getVisualizationMode() {
  return currentVizMode;
}

/**
 * Check if road accessibility is enabled
 */
export function isRoadAccessibilityEnabled() {
  return roadAccessibilityEnabled;
}

/**
 * Smart fetch that uses ID-first strategy with IndexedDB caching.
 * 1. Fetch only IDs from Overpass (lightweight)
 * 2. Check which IDs are already in IndexedDB cache
 * 3. Fetch full data only for missing IDs
 * 4. Save new waypoints to IndexedDB
 * @param {Object} bounds - { south, west, north, east }
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
async function fetchWaypointsWithCache(bounds) {
  await ensureWaypointsCacheLoaded();

  // Step 1: Fetch IDs for current viewport
  const ids = await fetchRoadIds(bounds);

  if (!ids || ids.length === 0) {
    console.log("🆔 [fetchWaypointsWithCache] No road IDs returned");
    return { type: "FeatureCollection", features: [] };
  }

  console.log(
    `🆔 [fetchWaypointsWithCache] Got ${ids.length} road IDs from Overpass`
  );

  // Step 2: Separate cached vs missing IDs
  const cachedFeatures = [];
  const missingIds = [];

  for (const idObj of ids) {
    const key = `${idObj.type}/${idObj.id}`;
    const cached = indexedDBWaypointsMap.get(key);
    if (cached) {
      cachedFeatures.push(cached);
    } else {
      missingIds.push(idObj);
    }
  }

  console.log(
    `💾 [fetchWaypointsWithCache] ${cachedFeatures.length} from cache, ${missingIds.length} need fetching`
  );

  // Step 3: Fetch only missing waypoints
  let newFeatures = [];
  if (missingIds.length > 0) {
    const fetched = await fetchRoadsByIds(missingIds);
    newFeatures = fetched?.features || [];

    // Step 4: Save new waypoints to IndexedDB
    if (newFeatures.length > 0) {
      const toSave = newFeatures
        .map((f) => {
          // osmtogeojson sets feature.id as "way/123", etc.
          let key = null;
          if (typeof f.id === "string" && f.id.includes("/")) {
            key = f.id;
          } else {
            // Fallback: try to extract from properties
            const p = f.properties || {};
            const osmType = p.type || p.osm_type || "way";
            const osmId = p.id || p.osm_id;
            if (osmId) {
              key = `${osmType}/${osmId}`;
            }
          }

          if (key) {
            indexedDBWaypointsMap.set(key, f); // Also update in-memory cache
            return { id: key, feature: f };
          }
          return null;
        })
        .filter(Boolean);

      if (toSave.length > 0) {
        console.log(
          `💾 [fetchWaypointsWithCache] Saving ${toSave.length} new waypoints to IndexedDB`
        );
        saveWaypointsToCache(toSave).catch((e) =>
          console.warn("Failed to save waypoints to IndexedDB:", e)
        );
      }
    }
  }

  // Combine cached + new features
  const allFeatures = [...cachedFeatures, ...newFeatures];
  console.log(
    `✅ [fetchWaypointsWithCache] Returning ${allFeatures.length} total waypoint features`
  );

  return { type: "FeatureCollection", features: allFeatures };
}

/**
 * Refresh road accessibility data for current map bounds
 * Uses IndexedDB caching for faster subsequent loads
 * @param {L.Map} map - Leaflet map instance
 */
async function refreshRoadAccessibilityData(map) {
  if (!map || !roadAccessibilityEnabled) return;

  const zoom = map.getZoom();
  if (zoom < MIN_ZOOM_FOR_ROADS) {
    console.log(`🛣️ Zoom ${zoom} < ${MIN_ZOOM_FOR_ROADS}, skipping road fetch`);
    return;
  }

  const bounds = map.getBounds();
  const boundsKey = `${bounds.getSouth().toFixed(4)},${bounds
    .getWest()
    .toFixed(4)},${bounds.getNorth().toFixed(4)},${bounds
    .getEast()
    .toFixed(4)}`;

  // Skip if bounds haven't changed significantly
  if (currentBounds === boundsKey) {
    return;
  }
  currentBounds = boundsKey;

  console.log("🛣️ Fetching road accessibility data with caching...");

  try {
    // Use the caching-enabled fetch
    const geojson = await fetchWaypointsWithCache({
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
    });

    if (!geojson || !geojson.features) {
      console.log("🛣️ No road data received");
      return;
    }

    console.log(`🛣️ Received ${geojson.features.length} road features`);
    renderRoadFeatures(geojson.features);
  } catch (error) {
    console.error("🛣️ Error fetching road accessibility:", error);
  }
}

/**
 * Render road features on the map
 * @param {Array} features - GeoJSON features
 */
function renderRoadFeatures(features) {
  if (!roadAccessibilityLayer) return;

  clearRoadAccessibilityLayer();

  features.forEach((feature) => {
    if (!feature.geometry) return;

    const { geometry, properties } = feature;
    const color = getColorForMode(properties, currentVizMode);
    const weight = getWeightForHighway(properties.highway);
    const opacity = 0.8;

    let layer;

    if (geometry.type === "LineString") {
      layer = L.polyline(
        geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        {
          color,
          weight,
          opacity,
          lineCap: "round",
          lineJoin: "round",
        }
      );
    } else if (geometry.type === "MultiLineString") {
      layer = L.polyline(
        geometry.coordinates.map((line) =>
          line.map(([lng, lat]) => [lat, lng])
        ),
        {
          color,
          weight,
          opacity,
          lineCap: "round",
          lineJoin: "round",
        }
      );
    } else if (geometry.type === "Polygon") {
      layer = L.polygon(
        geometry.coordinates.map((ring) =>
          ring.map(([lng, lat]) => [lat, lng])
        ),
        {
          color,
          weight: 2,
          opacity,
          fillColor: color,
          fillOpacity: 0.3,
        }
      );
    }

    if (layer) {
      // Add popup
      layer.bindPopup(createRoadPopup(properties), {
        maxWidth: 300,
        className: "road-accessibility-popup",
      });

      // Add hover effect
      layer.on("mouseover", function () {
        this.setStyle({ weight: weight + 2, opacity: 1 });
        this.bringToFront();
      });

      layer.on("mouseout", function () {
        this.setStyle({ weight, opacity });
      });

      // Store feature reference
      layer.feature = feature;

      roadAccessibilityLayer.addLayer(layer);
    }
  });
}

/**
 * Get color based on visualization mode
 */
function getColorForMode(properties, mode) {
  switch (mode) {
    case "surface":
      return properties._surfaceColor || "#95a5a6";
    case "incline":
      return properties._inclineColor || "#95a5a6";
    case "width":
      return properties._widthColor || "#95a5a6";
    case "smoothness":
      return properties._smoothnessColor || "#95a5a6";
    case "overall":
    default:
      return properties._overallColor || "#95a5a6";
  }
}

/**
 * Get line weight based on highway type
 */
function getWeightForHighway(highway) {
  const weights = {
    primary: 6,
    secondary: 5,
    tertiary: 4,
    residential: 4,
    living_street: 4,
    pedestrian: 5,
    footway: 3,
    path: 3,
    cycleway: 3,
    steps: 4,
    corridor: 2,
    crossing: 3,
    service: 3,
    track: 3,
  };
  return weights[highway] || 3;
}

/**
 * Create popup content for a road feature
 */
function createRoadPopup(properties) {
  const items = [];

  if (properties.name) {
    items.push(
      `<div class="road-popup-title">${escapeHtml(properties.name)}</div>`
    );
  }

  items.push('<div class="road-popup-content">');

  if (properties.highway) {
    items.push(
      `<div class="road-popup-row"><strong>Type:</strong> ${formatHighway(
        properties.highway
      )}</div>`
    );
  }

  if (properties.surface) {
    const surfaceColor = properties._surfaceColor || "#95a5a6";
    items.push(
      `<div class="road-popup-row"><strong>Surface:</strong> <span style="color:${surfaceColor}">${properties.surface}</span></div>`
    );
  }

  if (properties.incline) {
    const inclineColor = properties._inclineColor || "#95a5a6";
    items.push(
      `<div class="road-popup-row"><strong>Incline:</strong> <span style="color:${inclineColor}">${properties.incline}</span></div>`
    );
  }

  if (properties.width) {
    const widthColor = properties._widthColor || "#95a5a6";
    items.push(
      `<div class="road-popup-row"><strong>Width:</strong> <span style="color:${widthColor}">${properties.width}</span></div>`
    );
  }

  if (properties.smoothness) {
    const smoothColor = properties._smoothnessColor || "#95a5a6";
    items.push(
      `<div class="road-popup-row"><strong>Smoothness:</strong> <span style="color:${smoothColor}">${properties.smoothness}</span></div>`
    );
  }

  if (properties.lit) {
    const litIcon = properties.lit === "yes" ? "✓" : "✗";
    items.push(
      `<div class="road-popup-row"><strong>Lit:</strong> ${litIcon} ${properties.lit}</div>`
    );
  }

  if (properties.tactile_paving) {
    const tactileIcon = properties.tactile_paving === "yes" ? "✓" : "✗";
    items.push(
      `<div class="road-popup-row"><strong>Tactile Paving:</strong> ${tactileIcon}</div>`
    );
  }

  if (properties.kerb) {
    items.push(
      `<div class="road-popup-row"><strong>Kerb:</strong> ${formatKerb(
        properties.kerb
      )}</div>`
    );
  }

  if (properties._accessibilityScore != null) {
    const score = properties._accessibilityScore;
    const color = properties._overallColor || "#95a5a6";
    items.push(
      `<div class="road-popup-row road-popup-score"><strong>Accessibility Score:</strong> <span style="color:${color};font-weight:bold">${score}/100</span></div>`
    );
  }

  items.push("</div>");

  return items.join("");
}

/**
 * Format highway type for display
 */
function formatHighway(highway) {
  const labels = {
    footway: "Footway",
    path: "Path",
    pedestrian: "Pedestrian Area",
    cycleway: "Cycleway",
    steps: "Steps",
    corridor: "Corridor",
    crossing: "Crossing",
    living_street: "Living Street",
    residential: "Residential Road",
    service: "Service Road",
    track: "Track",
    primary: "Primary Road",
    secondary: "Secondary Road",
    tertiary: "Tertiary Road",
    unclassified: "Road",
  };
  return labels[highway] || highway;
}

/**
 * Format kerb type for display
 */
function formatKerb(kerb) {
  const labels = {
    flush: "Flush (level)",
    lowered: "Lowered",
    raised: "Raised",
    rolled: "Rolled",
    no: "None",
    yes: "Present",
  };
  return labels[kerb?.toLowerCase()] || kerb;
}

/**
 * Escape HTML for popup content
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Update styles of existing layers based on current viz mode
 */
function updateLayerStyles() {
  if (!roadAccessibilityLayer) return;

  roadAccessibilityLayer.eachLayer((layer) => {
    if (layer.feature && layer.feature.properties) {
      const color = getColorForMode(layer.feature.properties, currentVizMode);
      const weight = getWeightForHighway(layer.feature.properties.highway);
      layer.setStyle({ color, weight });
    }
  });
}

/**
 * Clear road accessibility layer
 */
function clearRoadAccessibilityLayer() {
  if (roadAccessibilityLayer) {
    roadAccessibilityLayer.clearLayers();
  }
  currentBounds = null;
}

/**
 * Force refresh of road data
 * @param {L.Map} map - Leaflet map instance
 */
export function forceRefreshRoads(map) {
  currentBounds = null;
  refreshRoadAccessibilityData(map);
}

/**
 * Get waypoints cache statistics
 * @returns {Object} Cache stats { memoryCount, message }
 */
export function getWaypointsCacheStats() {
  return {
    memoryCount: indexedDBWaypointsMap.size,
    cacheLoaded: indexedDBWaypointsCacheLoaded,
    message: `${indexedDBWaypointsMap.size} waypoints in memory cache`,
  };
}

/**
 * Clear the in-memory waypoints cache (not IndexedDB)
 * Useful for forcing a fresh load from IndexedDB
 */
export function clearInMemoryWaypointsCache() {
  indexedDBWaypointsMap.clear();
  indexedDBWaypointsCacheLoaded = false;
  console.log("🗑️ Cleared in-memory waypoints cache");
}

// Export for use in MapContainer
const roadAccessibilityModule = {
  initRoadAccessibilityLayer,
  setRoadAccessibilityEnabled,
  setVisualizationMode,
  getVisualizationMode,
  isRoadAccessibilityEnabled,
  forceRefreshRoads,
  getWaypointsCacheStats,
  clearInMemoryWaypointsCache,
};
export default roadAccessibilityModule;
