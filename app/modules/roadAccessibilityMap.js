/**
 * Road Accessibility Map Module
 * Handles rendering of road/path accessibility features on the Leaflet map
 * Uses IndexedDB caching for efficient data loading
 * Now supports ONNX ML predictions for missing accessibility data
 */

import debounce from "lodash.debounce";
import {
  fetchRoadIds,
  fetchRoadsByIds,
  getSurfaceColor,
  getInclineColor,
  getWidthColor,
  getSmoothnessColor,
  getOverallColor,
  calculateSurfaceScore,
  calculateInclineScore,
  calculateWidthScore,
  calculateSmoothnessScore,
  calculateOverallScore,
} from "../api/fetchRoadAccessibility.js";
import {
  loadWaypointsFromCache,
  saveWaypointsToCache,
} from "../utils/waypointsPersistence.js";
import {
  initOnnxModels,
  predictRoadFeatures,
  isOnnxReady,
  getAvailableModels,
} from "../utils/onnxRoadPredictor.js";

// Layer group for road accessibility features
let roadAccessibilityLayer = null;
let roadAccessibilityEnabled = false;
let currentVizMode = "overall"; // overall, surface, incline, width, smoothness
let predictionsEnabled = true; // Toggle for ML predictions
let currentBounds = null;
let isLoadingRoadData = false;
let loadingStateCallback = null;

// Background ONNX loading state
let onnxLoadingPromise = null;
let isApplyingPredictions = false;
let pendingPredictionFeatures = null; // Features waiting for predictions
let currentMapRef = null; // Reference to map for background updates

/**
 * Set callback for loading state changes
 * @param {Function} callback - Called with boolean indicating loading state
 */
export function setRoadLoadingCallback(callback) {
  loadingStateCallback = callback;
}

/**
 * Preload ONNX models in the background (call on app startup)
 * This allows models to be ready when user enables road accessibility
 */
export function preloadOnnxModelsInBackground() {
  if (onnxLoadingPromise || isOnnxReady()) {
    console.log("🤖 [ONNX] Models already loading or loaded");
    return onnxLoadingPromise || Promise.resolve();
  }

  console.log("🤖 [ONNX] Starting background preload of models...");
  onnxLoadingPromise = initOnnxModels()
    .then(() => {
      console.log("🤖 [ONNX] Background preload complete!");
      console.log("🤖 Available models:", getAvailableModels());

      // If there are pending features waiting for predictions, apply them now
      if (
        pendingPredictionFeatures &&
        roadAccessibilityEnabled &&
        currentMapRef
      ) {
        console.log(
          "🤖 [ONNX] Applying pending predictions to",
          pendingPredictionFeatures.length,
          "features"
        );
        applyPredictionsInBackground(pendingPredictionFeatures);
      }
      return true;
    })
    .catch((err) => {
      console.warn("🤖 [ONNX] Background preload failed:", err);
      onnxLoadingPromise = null;
      return false;
    });

  return onnxLoadingPromise;
}

/**
 * Get current loading state
 */
export function isRoadAccessibilityLoading() {
  return isLoadingRoadData;
}

/**
 * Internal helper to update loading state and notify callback
 */
function setLoadingState(loading) {
  isLoadingRoadData = loading;
  console.log(
    `🛣️ Road accessibility loading state: ${loading}, callback: ${!!loadingStateCallback}`
  );
  if (loadingStateCallback) {
    loadingStateCallback(loading);
  }
}

// IndexedDB cache state for waypoints
let indexedDBWaypointsCacheLoaded = false;
let indexedDBWaypointsMap = new Map(); // id -> feature

// Min zoom level to show road accessibility
const MIN_ZOOM_FOR_ROADS = 14;

/**
 * Ensure the IndexedDB waypoints cache is loaded into memory
 */
async function ensureWaypointsCacheLoaded() {
  if (indexedDBWaypointsCacheLoaded) {
    return;
  }
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
    return { type: "FeatureCollection", features: [] };
  }

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
        saveWaypointsToCache(toSave).catch((e) => {
          console.warn("Failed to save waypoints to IndexedDB:", e);
        });
      }
    }
  }

  // Combine cached + new features
  const allFeatures = [...cachedFeatures, ...newFeatures];

  return { type: "FeatureCollection", features: allFeatures };
}

/**
 * Refresh road accessibility data for current map bounds
 * Uses IndexedDB caching for faster subsequent loads
 * Applies ONNX ML predictions for missing accessibility data
 * @param {L.Map} map - Leaflet map instance
 */
async function refreshRoadAccessibilityData(map) {
  if (!map || !roadAccessibilityEnabled) return;

  // Store map reference for background prediction updates
  currentMapRef = map;

  const zoom = map.getZoom();
  if (zoom < MIN_ZOOM_FOR_ROADS) {
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

  setLoadingState(true);

  try {
    // Start ONNX loading in background if not already loading (don't wait for it)
    if (predictionsEnabled && !isOnnxReady() && !onnxLoadingPromise) {
      preloadOnnxModelsInBackground();
    }

    // Use the caching-enabled fetch
    const geojson = await fetchWaypointsWithCache({
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
    });

    if (!geojson || !geojson.features) {
      setLoadingState(false);
      return;
    }

    // RENDER ROADS IMMEDIATELY (without predictions)
    renderRoadFeatures(geojson.features);

    // Mark loading as done - roads are visible now!
    setLoadingState(false);

    // Apply ML predictions in background (if models are ready or when they become ready)
    if (predictionsEnabled) {
      if (isOnnxReady()) {
        // Models are ready, apply predictions in background
        applyPredictionsInBackground(geojson.features);
      } else {
        // Store features for later when models are loaded
        pendingPredictionFeatures = geojson.features;
      }
    }
  } catch (error) {
    console.error("🛣️ Error fetching road accessibility:", error);
    setLoadingState(false);
  }
}

/**
 * Apply ML predictions in the background and update the map
 * This runs after roads are already visible
 * @param {Array} features - GeoJSON features to enrich
 */
async function applyPredictionsInBackground(features) {
  if (isApplyingPredictions) {
    return;
  }

  if (!isOnnxReady()) {
    return;
  }

  isApplyingPredictions = true;
  pendingPredictionFeatures = null; // Clear pending

  try {
    const enrichedFeatures = await applyMlPredictions(features);

    // Re-render with predictions if road layer is still enabled
    if (roadAccessibilityEnabled && roadAccessibilityLayer) {
      renderRoadFeatures(enrichedFeatures);
    }
  } catch (error) {
    console.error("🤖 [ONNX] Background prediction failed:", error);
  } finally {
    isApplyingPredictions = false;
  }
}

/**
 * Apply ML predictions to features with missing accessibility data
 * @param {Array} features - GeoJSON features
 * @returns {Promise<Array>} - Enriched features with predictions
 */
async function applyMlPredictions(features) {
  const enrichedFeatures = [];
  let predictedCount = 0;

  // Process features sequentially to avoid ONNX session conflicts
  // The inference queue handles per-model concurrency, but we still
  // serialize feature processing to avoid overwhelming the system
  for (const feature of features) {
    const props = feature.properties || {};

    // Check if any accessibility data is missing
    const needsPrediction =
      !props.surface || !props.smoothness || !props.width || !props.incline;

    if (!needsPrediction) {
      enrichedFeatures.push(feature);
      continue;
    }

    try {
      // Run ONNX prediction
      const predictedProps = await predictRoadFeatures(props);

      // Recalculate colors based on predicted values
      const enhancedProps = {
        ...predictedProps,
        _surfaceColor: getSurfaceColor(predictedProps.surface),
        _inclineColor: getInclineColor(predictedProps.incline),
        _widthColor: getWidthColor(predictedProps.width),
        _smoothnessColor: getSmoothnessColor(predictedProps.smoothness),
      };

      // Recalculate scores with predicted data
      const surfaceScore = calculateSurfaceScore(enhancedProps.surface);
      const inclineScore = calculateInclineScore(enhancedProps.incline);
      const widthScore = calculateWidthScore(enhancedProps.width);
      const smoothnessScore = calculateSmoothnessScore(
        enhancedProps.smoothness
      );

      const overallScore = calculateOverallScore({
        surfaceScore,
        inclineScore,
        widthScore,
        smoothnessScore,
        hasLighting: enhancedProps.lit === "yes",
        hasTactilePaving: enhancedProps.tactile_paving === "yes",
        hasKerb: enhancedProps.kerb && enhancedProps.kerb !== "no",
        hasRamp: enhancedProps.ramp && enhancedProps.ramp !== "no",
        isSteps: enhancedProps.highway === "steps",
      });

      enhancedProps._accessibilityScore = overallScore;
      enhancedProps._overallColor = getOverallColor(overallScore);
      enhancedProps._surfaceScore = surfaceScore;
      enhancedProps._inclineScore = inclineScore;
      enhancedProps._widthScore = widthScore;
      enhancedProps._smoothnessScore = smoothnessScore;

      if (predictedProps._hasPredictions) {
        predictedCount++;
      }

      enrichedFeatures.push({
        ...feature,
        properties: enhancedProps,
      });
    } catch (error) {
      console.warn("ML prediction failed for feature:", error);
      enrichedFeatures.push(feature);
    }
  }

  console.log(`🤖 Applied ML predictions to ${predictedCount} features`);
  return enrichedFeatures;
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

    // Check if this feature has ML predictions
    const hasPredictions =
      properties._hasPredictions ||
      properties._surfacePredicted ||
      properties._smoothnessPredicted ||
      properties._widthPredicted ||
      properties._inclinePredicted;

    // Use dashed lines for predicted data
    const dashArray = hasPredictions ? "5, 5" : null;

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
          dashArray,
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
          dashArray,
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
          dashArray,
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
        this.setStyle({ weight, opacity, dashArray });
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

  // Helper to format confidence as colored badge
  const getConfidenceBadge = (confidence) => {
    if (confidence === undefined || confidence === null) return "";
    const pct = Math.round(confidence * 100);
    let color, label;
    if (confidence >= 0.7) {
      color = "#27ae60";
      label = "High";
    } else if (confidence >= 0.4) {
      color = "#f39c12";
      label = "Medium";
    } else {
      color = "#e74c3c";
      label = "Low";
    }
    return `<span class="confidence-badge" style="background:${color};color:white;padding:1px 4px;border-radius:3px;font-size:10px;margin-left:4px" title="Model confidence: ${pct}%">${pct}%</span>`;
  };

  // Helper to format alternatives
  const formatAlternatives = (alternatives) => {
    if (!alternatives || alternatives.length === 0) return "";
    const altText = alternatives
      .map((a) => `${a.class} (${Math.round(a.probability * 100)}%)`)
      .join(", ");
    return `<div class="prediction-alternatives" style="font-size:11px;color:#7f8c8d;margin-left:12px;margin-top:2px">Also possible: ${altText}</div>`;
  };

  // Helper to format contributing features
  const formatContributors = (contributors, label) => {
    if (!contributors || contributors.length === 0) return "";
    const contribList = contributors
      .slice(0, 3)
      .map((c) => c.description)
      .join(", ");
    return `<div class="prediction-contributors" style="font-size:10px;color:#95a5a6;margin-left:12px;margin-top:2px" title="Features used for prediction">Based on: ${contribList}</div>`;
  };

  // Helper to add prediction indicator with confidence
  const predBadge = (isPredicted, confidence) => {
    if (!isPredicted) return "";
    const confBadge = getConfidenceBadge(confidence);
    return `<span class="ml-prediction-badge" title="ML Predicted">🤖</span>${confBadge}`;
  };

  if (properties.surface) {
    const surfaceColor = properties._surfaceColor || "#95a5a6";
    const badge = predBadge(
      properties._surfacePredicted,
      properties._surfaceConfidence
    );
    items.push(
      `<div class="road-popup-row"><strong>Surface:</strong> <span style="color:${surfaceColor}">${properties.surface}</span>${badge}</div>`
    );
    // Show alternatives for predicted surface
    if (properties._surfacePredicted && properties._surfaceAlternatives) {
      items.push(formatAlternatives(properties._surfaceAlternatives));
    }
    // Show contributing features
    if (properties._surfacePredicted && properties._surfaceContributors) {
      items.push(
        formatContributors(properties._surfaceContributors, "surface")
      );
    }
  }

  if (properties.smoothness) {
    const smoothColor = properties._smoothnessColor || "#95a5a6";
    const badge = predBadge(
      properties._smoothnessPredicted,
      properties._smoothnessConfidence
    );
    items.push(
      `<div class="road-popup-row"><strong>Smoothness:</strong> <span style="color:${smoothColor}">${properties.smoothness}</span>${badge}</div>`
    );
    // Show alternatives for predicted smoothness
    if (properties._smoothnessPredicted && properties._smoothnessAlternatives) {
      items.push(formatAlternatives(properties._smoothnessAlternatives));
    }
    // Show contributing features
    if (properties._smoothnessPredicted && properties._smoothnessContributors) {
      items.push(
        formatContributors(properties._smoothnessContributors, "smoothness")
      );
    }
  }

  if (properties.width) {
    const widthColor = properties._widthColor || "#95a5a6";
    const isPredicted = properties._widthPredicted;
    const badge = isPredicted
      ? `<span class="ml-prediction-badge" title="ML Predicted">🤖</span>`
      : "";
    // For regressors, show uncertainty info
    let uncertaintyInfo = "";
    if (isPredicted && properties._widthMetrics) {
      const rmse = properties._widthMetrics.rmse;
      if (rmse) {
        uncertaintyInfo = `<span style="font-size:10px;color:#7f8c8d;margin-left:4px" title="Expected error: ±${rmse.toFixed(
          1
        )}m">(±${rmse.toFixed(1)}m)</span>`;
      }
    }
    items.push(
      `<div class="road-popup-row"><strong>Width:</strong> <span style="color:${widthColor}">${properties.width}</span>${badge}${uncertaintyInfo}</div>`
    );
    if (properties._widthPredicted && properties._widthContributors) {
      items.push(formatContributors(properties._widthContributors, "width"));
    }
  }

  if (properties.incline) {
    const inclineColor = properties._inclineColor || "#95a5a6";
    const isPredicted = properties._inclinePredicted;
    const badge = isPredicted
      ? `<span class="ml-prediction-badge" title="ML Predicted">🤖</span>`
      : "";
    // For regressors, show uncertainty info
    let uncertaintyInfo = "";
    if (isPredicted && properties._inclineMetrics) {
      const rmse = properties._inclineMetrics.rmse;
      if (rmse) {
        uncertaintyInfo = `<span style="font-size:10px;color:#7f8c8d;margin-left:4px" title="Expected error: ±${rmse.toFixed(
          1
        )}%">(±${rmse.toFixed(1)}%)</span>`;
      }
    }
    items.push(
      `<div class="road-popup-row"><strong>Incline:</strong> <span style="color:${inclineColor}">${properties.incline}</span>${badge}${uncertaintyInfo}</div>`
    );
    if (properties._inclinePredicted && properties._inclineContributors) {
      items.push(
        formatContributors(properties._inclineContributors, "incline")
      );
    }
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
    const hasPredictions = properties._hasPredictions;
    const predictedLabel = hasPredictions
      ? `<span style="font-size:10px;color:#7f8c8d;display:block;margin-top:2px">Includes ML predictions (dashed line)</span>`
      : "";
    items.push(
      `<div class="road-popup-row road-popup-score"><strong>Accessibility Score:</strong> <span style="color:${color};font-weight:bold">${score}/100</span>${predictedLabel}</div>`
    );
  }

  // Add prediction info section if any predictions were made
  if (properties._hasPredictions) {
    items.push(`<div class="prediction-info-section" style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;font-size:10px;color:#7f8c8d">
      <div>🤖 = ML predicted value</div>
      <div style="margin-top:2px">Confidence badge shows model certainty</div>
    </div>`);
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

/**
 * Enable/disable ML predictions for missing accessibility data
 * @param {boolean} enabled - Whether to enable predictions
 */
export function setPredictionsEnabled(enabled) {
  predictionsEnabled = enabled;
  console.log(`🤖 ML predictions ${enabled ? "enabled" : "disabled"}`);
}

/**
 * Check if ML predictions are enabled
 */
export function isPredictionsEnabled() {
  return predictionsEnabled;
}

/**
 * Check if ONNX models are loaded and ready
 */
export function isOnnxModelsReady() {
  return isOnnxReady();
}

/**
 * Check if predictions are currently being applied in background
 */
export function isPredictionsLoading() {
  return (
    isApplyingPredictions || (onnxLoadingPromise !== null && !isOnnxReady())
  );
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
  setPredictionsEnabled,
  isPredictionsEnabled,
  isOnnxModelsReady,
  preloadOnnxModelsInBackground,
  isPredictionsLoading,
};
export default roadAccessibilityModule;
