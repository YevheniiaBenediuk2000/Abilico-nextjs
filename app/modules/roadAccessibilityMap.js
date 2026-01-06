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
  predictRoadFeaturesBatch,
  isOnnxReady,
  getAvailableModels,
  warmupWasmOnIdle,
} from "../utils/onnxRoadPredictor.js";

// Layer group for road accessibility features
let roadAccessibilityLayer = null;
let roadAccessibilityEnabled = false;
let currentVizMode = "overall"; // overall, surface, incline, width, smoothness
let predictionsEnabled = true; // Toggle for ML predictions
let currentBounds = null;
let isLoadingRoadData = false;
let loadingStateCallback = null;
let predictionsLoadingCallback = null;
let currentRefreshRequestId = 0; // Track latest refresh request to handle concurrent calls

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
 * Set callback for predictions loading state changes
 * @param {Function} callback - Called with boolean indicating predictions loading state
 */
export function setPredictionsLoadingCallback(callback) {
  predictionsLoadingCallback = callback;
}

/**
 * Internal helper to update predictions loading state and notify callback
 */
function setPredictionsLoadingState(loading) {
  if (predictionsLoadingCallback) {
    predictionsLoadingCallback(loading);
  }
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

  const preloadStart = performance.now();
  console.log("⏱️ [PERF-MAIN] preloadOnnxModelsInBackground START");
  onnxLoadingPromise = initOnnxModels()
    .then(() => {
      console.log(
        `⏱️ [PERF-MAIN] preloadOnnxModelsInBackground DONE: ${(
          performance.now() - preloadStart
        ).toFixed(0)}ms`
      );
      console.log("🤖 Available models:", getAvailableModels());

      // If there are pending features waiting for predictions, apply them now
      if (
        pendingPredictionFeatures &&
        roadAccessibilityEnabled &&
        predictionsEnabled &&
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
      console.log(
        `⏱️ [PERF-MAIN] preloadOnnxModelsInBackground FAILED: ${(
          performance.now() - preloadStart
        ).toFixed(0)}ms`
      );
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

  // Start WASM warmup in background during idle time
  // This pre-compiles the WASM module so full model loading is faster later
  warmupWasmOnIdle();

  // Set up event handlers
  // Use leading: true so loading indicator shows immediately on first drag
  map.on(
    "moveend",
    debounce(
      () => {
        if (roadAccessibilityEnabled) {
          refreshRoadAccessibilityData(map);
        }
      },
      500,
      { leading: true, trailing: true }
    )
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
    // When disabling, clear pending features and reset loading states
    pendingPredictionFeatures = null;
    setPredictionsLoadingState(false);
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
  // Generate a unique request ID for this refresh call
  const requestId = ++currentRefreshRequestId;

  if (!map || !roadAccessibilityEnabled) {
    return;
  }

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

    // Check if this request is still the latest one - if not, discard results
    // This prevents older concurrent requests from overwriting newer data
    if (requestId !== currentRefreshRequestId) {
      return;
    }

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
        // Set predictions loading state to show waiting for models
        setPredictionsLoadingState(true);
      }
    }
  } catch (error) {
    console.error("🛣️ Error fetching road accessibility:", error);
    // Only set loading to false if this is still the current request
    if (requestId === currentRefreshRequestId) {
      setLoadingState(false);
    }
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

  const bgStart = performance.now();
  console.log(
    `⏱️ [PERF-MAIN] applyPredictionsInBackground START: ${features.length} features`
  );

  isApplyingPredictions = true;
  pendingPredictionFeatures = null; // Clear pending
  setPredictionsLoadingState(true); // Notify that predictions are loading

  try {
    const enrichedFeatures = await applyMlPredictions(features);

    // Update existing layers in place (keeps popups open)
    const updateStart = performance.now();
    if (roadAccessibilityEnabled && roadAccessibilityLayer) {
      updateRoadLayersInPlace(enrichedFeatures);
    }
    console.log(
      `⏱️ [PERF-MAIN] updateRoadLayersInPlace: ${(
        performance.now() - updateStart
      ).toFixed(0)}ms`
    );
    console.log(
      `⏱️ [PERF-MAIN] applyPredictionsInBackground TOTAL: ${(
        performance.now() - bgStart
      ).toFixed(0)}ms`
    );
  } catch (error) {
    console.error("🤖 [ONNX] Background prediction failed:", error);
    console.log(
      `⏱️ [PERF-MAIN] applyPredictionsInBackground FAILED: ${(
        performance.now() - bgStart
      ).toFixed(0)}ms`
    );
  } finally {
    isApplyingPredictions = false;
    setPredictionsLoadingState(false); // Notify that predictions finished
  }
}

/**
 * Apply ML predictions to features with missing accessibility data
 * Uses batch processing for efficiency (single worker round-trip instead of N)
 * @param {Array} features - GeoJSON features
 * @returns {Promise<Array>} - Enriched features with predictions
 */
async function applyMlPredictions(features) {
  const totalStart = performance.now();
  console.log(
    `⏱️ [PERF-MAIN] applyMlPredictions START: ${features.length} features`
  );

  // Separate features that need prediction from those that don't
  const filterStart = performance.now();
  const needsPredictionFeatures = [];
  const needsPredictionIndices = [];
  const enrichedFeatures = new Array(features.length);

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const props = feature.properties || {};

    const needsPrediction =
      !props.surface || !props.smoothness || !props.width || !props.incline;

    if (needsPrediction) {
      needsPredictionFeatures.push(feature);
      needsPredictionIndices.push(i);
    } else {
      // No prediction needed, keep as-is
      enrichedFeatures[i] = feature;
    }
  }

  const skippedCount = features.length - needsPredictionFeatures.length;
  console.log(
    `⏱️ [PERF-MAIN] Filter features: ${(
      performance.now() - filterStart
    ).toFixed(0)}ms, need=${
      needsPredictionFeatures.length
    }, skip=${skippedCount}`
  );

  if (needsPredictionFeatures.length === 0) {
    console.log(
      `⏱️ [PERF-MAIN] applyMlPredictions DONE (nothing to predict): ${(
        performance.now() - totalStart
      ).toFixed(0)}ms`
    );
    return features;
  }

  // Extract just the properties for batch prediction
  const propsToPredict = needsPredictionFeatures.map((f) => f.properties || {});

  // Batch predict all at once (single worker round-trip!)
  let predictedPropsList;
  try {
    const batchStart = performance.now();
    console.log(
      `⏱️ [PERF-MAIN] Calling predictRoadFeaturesBatch with ${propsToPredict.length} items...`
    );
    predictedPropsList = await predictRoadFeaturesBatch(propsToPredict);
    console.log(
      `⏱️ [PERF-MAIN] predictRoadFeaturesBatch returned: ${(
        performance.now() - batchStart
      ).toFixed(0)}ms`
    );
  } catch (error) {
    console.error("🤖 Batch prediction failed:", error);
    console.log(
      `⏱️ [PERF-MAIN] applyMlPredictions FAILED: ${(
        performance.now() - totalStart
      ).toFixed(0)}ms`
    );
    // Fall back to original features
    for (let i = 0; i < needsPredictionFeatures.length; i++) {
      enrichedFeatures[needsPredictionIndices[i]] = needsPredictionFeatures[i];
    }
    return enrichedFeatures;
  }

  // Process results and calculate scores
  let predictedCount = 0;
  let cachedCount = 0;

  for (let i = 0; i < predictedPropsList.length; i++) {
    const predictedProps = predictedPropsList[i];
    const originalFeature = needsPredictionFeatures[i];
    const targetIndex = needsPredictionIndices[i];
    const originalProps = originalFeature.properties || {};

    if (predictedProps._fromCache) {
      cachedCount++;
    }

    // Store original colors from OSM data before overwriting with ML predictions
    // These will be used when predictions are disabled
    const originalColors = {
      _originalSurfaceColor: originalProps._surfaceColor,
      _originalInclineColor: originalProps._inclineColor,
      _originalWidthColor: originalProps._widthColor,
      _originalSmoothnessColor: originalProps._smoothnessColor,
      _originalOverallColor: originalProps._overallColor,
      _originalAccessibilityScore: originalProps._accessibilityScore,
    };

    // Recalculate colors based on predicted values
    const enhancedProps = {
      ...predictedProps,
      ...originalColors,
      _surfaceColor: getSurfaceColor(predictedProps.surface),
      _inclineColor: getInclineColor(predictedProps.incline),
      _widthColor: getWidthColor(predictedProps.width),
      _smoothnessColor: getSmoothnessColor(predictedProps.smoothness),
    };

    // Recalculate scores with predicted data
    const surfaceScore = calculateSurfaceScore(enhancedProps.surface);
    const inclineScore = calculateInclineScore(enhancedProps.incline);
    const widthScore = calculateWidthScore(enhancedProps.width);
    const smoothnessScore = calculateSmoothnessScore(enhancedProps.smoothness);

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

    enrichedFeatures[targetIndex] = {
      ...originalFeature,
      properties: enhancedProps,
    };
  }

  console.log(
    `🤖 Applied ML predictions: ${predictedCount} predicted, ${cachedCount} from cache, ${skippedCount} skipped`
  );
  console.log(
    `⏱️ [PERF-MAIN] applyMlPredictions TOTAL: ${(
      performance.now() - totalStart
    ).toFixed(0)}ms`
  );

  return enrichedFeatures;
}

/**
 * Update existing road layers in place with new properties
 * This preserves open popups and avoids visual flashing
 * @param {Array} features - Enriched GeoJSON features with predictions
 */
function updateRoadLayersInPlace(features) {
  if (!roadAccessibilityLayer) return;

  // Build a map of feature ID -> enriched feature for quick lookup
  const featureMap = new Map();
  features.forEach((feature) => {
    const id = feature.properties?.["@id"] || feature.id;
    if (id) {
      featureMap.set(id, feature);
    }
  });

  // Update each existing layer
  roadAccessibilityLayer.eachLayer((layer) => {
    if (!layer.feature) return;

    const featureId = layer.feature.properties?.["@id"] || layer.feature.id;
    const enrichedFeature = featureMap.get(featureId);

    if (!enrichedFeature) return;

    // Update the layer's feature reference with enriched properties
    layer.feature = enrichedFeature;
    const properties = enrichedFeature.properties;

    // Update style based on new properties
    const color = getColorForMode(properties, currentVizMode);
    const weight = getWeightForHighway(properties.highway);
    const opacity = 0.8;

    const hasPredictions =
      properties._hasPredictions ||
      properties._surfacePredicted ||
      properties._smoothnessPredicted ||
      properties._widthPredicted ||
      properties._inclinePredicted;

    const dashArray = hasPredictions ? "5, 5" : null;

    // Update stored base styles for hover handlers
    layer._baseStyles = { weight, opacity, dashArray };

    // Apply new styles
    if (layer.setStyle) {
      layer.setStyle({
        color,
        weight,
        opacity,
        dashArray,
      });
    }

    // Update popup content if popup is open
    if (layer.isPopupOpen && layer.isPopupOpen()) {
      const popup = layer.getPopup();
      if (popup) {
        popup.setContent(createRoadPopup(properties));
      }
    }

    // Update the bound popup function for future opens
    layer.unbindPopup();
    layer.bindPopup(() => createRoadPopup(properties), {
      maxWidth: 300,
      className: "road-accessibility-popup",
    });
  });

  console.log("🔄 Updated road layers in place with ML predictions");
}

/**
 * Render road features on the map
 * @param {Array} features - GeoJSON features
 */
function renderRoadFeatures(features) {
  if (!roadAccessibilityLayer) return;

  // Save currently open popup's feature ID before clearing
  let openPopupFeatureId = null;
  roadAccessibilityLayer.eachLayer((layer) => {
    if (layer.isPopupOpen && layer.isPopupOpen() && layer.feature) {
      openPopupFeatureId =
        layer.feature.properties?.["@id"] || layer.feature.id;
    }
  });

  // Save bounds before clearing - we don't want to reset bounds during re-renders
  // (bounds should only reset when layer is disabled or zoom is too low)
  const savedBounds = currentBounds;
  clearRoadAccessibilityLayer();
  currentBounds = savedBounds;

  let layerToReopen = null;

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
      // Store base styles on the layer for hover handlers to reference
      // This allows updateRoadLayersInPlace to update these values when predictions are applied
      layer._baseStyles = { weight, opacity, dashArray };

      // Add popup - use a function so it's evaluated on each open (captures current loading state)
      layer.bindPopup(() => createRoadPopup(properties), {
        maxWidth: 300,
        className: "road-accessibility-popup",
      });

      // Add hover effect - reference stored styles so they update when predictions are applied
      layer.on("mouseover", function () {
        const base = this._baseStyles || {
          weight: 3,
          opacity: 0.8,
          dashArray: null,
        };
        this.setStyle({
          weight: base.weight + 2,
          opacity: 1,
          dashArray: base.dashArray,
        });
        this.bringToFront();
      });

      layer.on("mouseout", function () {
        const base = this._baseStyles || {
          weight: 3,
          opacity: 0.8,
          dashArray: null,
        };
        this.setStyle({
          weight: base.weight,
          opacity: base.opacity,
          dashArray: base.dashArray,
        });
      });

      // Store feature reference
      layer.feature = feature;

      roadAccessibilityLayer.addLayer(layer);

      // Check if this is the feature that had an open popup
      if (openPopupFeatureId) {
        const featureId = feature.properties?.["@id"] || feature.id;
        if (featureId === openPopupFeatureId) {
          layerToReopen = layer;
        }
      }
    }
  });

  // Restore the popup if one was open before re-rendering
  if (layerToReopen) {
    layerToReopen.openPopup();
  }
}

/**
 * Get color based on visualization mode
 * When predictions are disabled, uses original OSM colors (before ML predictions)
 */
function getColorForMode(properties, mode) {
  const GREY = "#95a5a6";

  // When predictions are disabled, use original colors from OSM data
  if (!predictionsEnabled) {
    switch (mode) {
      case "surface":
        // Use original color if available (for features that had ML predictions)
        // Otherwise use current color (for features without predictions)
        if (properties._surfacePredicted) {
          return properties._originalSurfaceColor || GREY;
        }
        return properties._surfaceColor || GREY;
      case "incline":
        if (properties._inclinePredicted) {
          return properties._originalInclineColor || GREY;
        }
        return properties._inclineColor || GREY;
      case "width":
        if (properties._widthPredicted) {
          return properties._originalWidthColor || GREY;
        }
        return properties._widthColor || GREY;
      case "smoothness":
        if (properties._smoothnessPredicted) {
          return properties._originalSmoothnessColor || GREY;
        }
        return properties._smoothnessColor || GREY;
      case "overall":
      default:
        if (properties._hasPredictions) {
          return properties._originalOverallColor || GREY;
        }
        return properties._overallColor || GREY;
    }
  }

  // When predictions are enabled, use the ML-enhanced colors
  switch (mode) {
    case "surface":
      return properties._surfaceColor || GREY;
    case "incline":
      return properties._inclineColor || GREY;
    case "width":
      return properties._widthColor || GREY;
    case "smoothness":
      return properties._smoothnessColor || GREY;
    case "overall":
    default:
      return properties._overallColor || GREY;
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

  // Check if predictions are currently loading and this feature doesn't have predictions yet
  const hasPredictions = properties._hasPredictions;
  const needsPrediction =
    !properties.surface ||
    !properties.smoothness ||
    !properties.width ||
    !properties.incline;

  // Show loading if: actively predicting, or models still loading with pending features
  const modelsStillLoading = onnxLoadingPromise !== null && !isOnnxReady();
  const showPredictionsLoading =
    predictionsEnabled &&
    needsPrediction &&
    !hasPredictions &&
    (isApplyingPredictions ||
      (modelsStillLoading && pendingPredictionFeatures));

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
  // Only show badges if predictions are enabled
  const predBadge = (isPredicted, confidence) => {
    if (!isPredicted || !predictionsEnabled) return "";
    const confBadge = getConfidenceBadge(confidence);
    return `<span class="ml-prediction-badge" title="ML Predicted">🤖</span>${confBadge}`;
  };

  // Only show surface if it exists AND (not predicted OR predictions enabled)
  if (
    properties.surface &&
    (!properties._surfacePredicted || predictionsEnabled)
  ) {
    const surfaceColor = properties._surfaceColor || "#95a5a6";
    const badge = predBadge(
      properties._surfacePredicted,
      properties._surfaceConfidence
    );
    items.push(
      `<div class="road-popup-row"><strong>Surface:</strong> <span style="color:${surfaceColor}">${properties.surface}</span>${badge}</div>`
    );
    // Show alternatives for predicted surface (only if predictions enabled)
    if (
      properties._surfacePredicted &&
      predictionsEnabled &&
      properties._surfaceAlternatives
    ) {
      items.push(formatAlternatives(properties._surfaceAlternatives));
    }
    // Show contributing features (only if predictions enabled)
    if (
      properties._surfacePredicted &&
      predictionsEnabled &&
      properties._surfaceContributors
    ) {
      items.push(
        formatContributors(properties._surfaceContributors, "surface")
      );
    }
  }

  // Only show smoothness if it exists AND (not predicted OR predictions enabled)
  if (
    properties.smoothness &&
    (!properties._smoothnessPredicted || predictionsEnabled)
  ) {
    const smoothColor = properties._smoothnessColor || "#95a5a6";
    const badge = predBadge(
      properties._smoothnessPredicted,
      properties._smoothnessConfidence
    );
    items.push(
      `<div class="road-popup-row"><strong>Smoothness:</strong> <span style="color:${smoothColor}">${properties.smoothness}</span>${badge}</div>`
    );
    // Show alternatives for predicted smoothness (only if predictions enabled)
    if (
      properties._smoothnessPredicted &&
      predictionsEnabled &&
      properties._smoothnessAlternatives
    ) {
      items.push(formatAlternatives(properties._smoothnessAlternatives));
    }
    // Show contributing features (only if predictions enabled)
    if (
      properties._smoothnessPredicted &&
      predictionsEnabled &&
      properties._smoothnessContributors
    ) {
      items.push(
        formatContributors(properties._smoothnessContributors, "smoothness")
      );
    }
  }

  // Only show width if it exists AND (not predicted OR predictions enabled)
  if (properties.width && (!properties._widthPredicted || predictionsEnabled)) {
    const widthColor = properties._widthColor || "#95a5a6";
    const isPredicted = properties._widthPredicted;
    // Only show badge and uncertainty if predictions are enabled
    const badge =
      isPredicted && predictionsEnabled
        ? `<span class="ml-prediction-badge" title="ML Predicted">🤖</span>`
        : "";
    // For regressors, show uncertainty info
    let uncertaintyInfo = "";
    if (isPredicted && predictionsEnabled && properties._widthMetrics) {
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
    if (
      properties._widthPredicted &&
      predictionsEnabled &&
      properties._widthContributors
    ) {
      items.push(formatContributors(properties._widthContributors, "width"));
    }
  }

  // Only show incline if it exists AND (not predicted OR predictions enabled)
  if (
    properties.incline &&
    (!properties._inclinePredicted || predictionsEnabled)
  ) {
    const inclineColor = properties._inclineColor || "#95a5a6";
    const isPredicted = properties._inclinePredicted;
    // Only show badge and uncertainty if predictions are enabled
    const badge =
      isPredicted && predictionsEnabled
        ? `<span class="ml-prediction-badge" title="ML Predicted">🤖</span>`
        : "";
    // For regressors, show uncertainty info
    let uncertaintyInfo = "";
    if (isPredicted && predictionsEnabled && properties._inclineMetrics) {
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
    if (
      properties._inclinePredicted &&
      predictionsEnabled &&
      properties._inclineContributors
    ) {
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

  // Show accessibility score - use original score when predictions are disabled for ML-enhanced features
  // Note: hasPredictions was already defined earlier in the function

  // Determine which score to show
  let scoreToShow = null;
  let colorToShow = "#95a5a6";

  if (!predictionsEnabled && hasPredictions) {
    // When predictions disabled and this feature had predictions, show original score if available
    if (properties._originalAccessibilityScore != null) {
      scoreToShow = properties._originalAccessibilityScore;
      colorToShow = properties._originalOverallColor || "#95a5a6";
    }
    // If no original score, don't show score at all (grey state)
  } else if (properties._accessibilityScore != null) {
    // Normal case: show current score
    scoreToShow = properties._accessibilityScore;
    colorToShow = properties._overallColor || "#95a5a6";
  }

  if (scoreToShow != null) {
    // Only show prediction label if predictions are enabled
    const predictedLabel =
      hasPredictions && predictionsEnabled
        ? `<span style="font-size:10px;color:#7f8c8d;display:block;margin-top:2px">Includes ML predictions (dashed line)</span>`
        : "";
    items.push(
      `<div class="road-popup-row road-popup-score"><strong>Accessibility Score:</strong> <span style="color:${colorToShow};font-weight:bold">${scoreToShow}/100</span>${predictedLabel}</div>`
    );
  }

  // Add prediction info section if any predictions were made OR if loading
  // Only show if predictions are enabled
  if (properties._hasPredictions && predictionsEnabled) {
    items.push(`<div class="prediction-info-section" style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;font-size:10px;color:#7f8c8d">
      <div>🤖 = ML predicted value</div>
      <div style="margin-top:2px">Confidence badge shows model certainty</div>
    </div>`);
  } else if (showPredictionsLoading) {
    const loadingMessage = modelsStillLoading
      ? "Loading ML models..."
      : "Loading ML predictions...";
    items.push(`<div class="prediction-info-section" style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;font-size:10px;color:#7f8c8d">
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="prediction-loading-spinner" style="display:inline-block;width:12px;height:12px;border:2px solid #2196f3;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;"></span>
        <span style="color:#1565c0;">${loadingMessage}</span>
      </div>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
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
  const wasEnabled = predictionsEnabled;
  predictionsEnabled = enabled;
  console.log(`🤖 ML predictions ${enabled ? "enabled" : "disabled"}`);

  // Update visual representation of existing layers when toggling predictions
  if (roadAccessibilityLayer && wasEnabled !== enabled) {
    updateLayerVisualsForPredictionsToggle();

    // When re-enabling predictions, apply ML predictions to features that don't have them
    if (enabled && roadAccessibilityEnabled) {
      const featuresNeedingPredictions = [];
      roadAccessibilityLayer.eachLayer((layer) => {
        if (!layer.feature) return;
        const props = layer.feature.properties || {};
        // Check if this feature needs predictions (missing any accessibility data AND not already predicted)
        const needsPrediction =
          (!props.surface && !props._surfacePredicted) ||
          (!props.smoothness && !props._smoothnessPredicted) ||
          (!props.width && !props._widthPredicted) ||
          (!props.incline && !props._inclinePredicted);
        if (needsPrediction) {
          featuresNeedingPredictions.push(layer.feature);
        }
      });

      if (featuresNeedingPredictions.length > 0) {
        console.log(
          `🤖 Re-enabling predictions: ${featuresNeedingPredictions.length} features need ML predictions`
        );
        // Start ONNX loading if not ready
        if (!isOnnxReady() && !onnxLoadingPromise) {
          preloadOnnxModelsInBackground();
        }
        // Apply predictions in background
        if (isOnnxReady()) {
          applyPredictionsInBackground(featuresNeedingPredictions);
        } else {
          // Store for later when models are ready
          pendingPredictionFeatures = featuresNeedingPredictions;
          setPredictionsLoadingState(true);
        }
      }
    }
  }
}

/**
 * Update layer visuals when predictions toggle changes
 * Removes or restores dashed lines based on predictions enabled state
 */
function updateLayerVisualsForPredictionsToggle() {
  if (!roadAccessibilityLayer) return;

  roadAccessibilityLayer.eachLayer((layer) => {
    if (!layer.feature) return;

    const properties = layer.feature.properties;
    const weight = getWeightForHighway(properties.highway);
    const opacity = 0.8;
    const color = getColorForMode(properties, currentVizMode);

    // Only show dashed lines if predictions are enabled AND feature has predictions
    const hasPredictions =
      properties._hasPredictions ||
      properties._surfacePredicted ||
      properties._smoothnessPredicted ||
      properties._widthPredicted ||
      properties._inclinePredicted;

    const dashArray = predictionsEnabled && hasPredictions ? "5, 5" : null;

    // Update stored base styles for hover handlers
    layer._baseStyles = { weight, opacity, dashArray };

    // Apply updated styles
    if (layer.setStyle) {
      layer.setStyle({
        color,
        weight,
        opacity,
        dashArray,
      });
    }

    // Update popup content if popup is open
    if (layer.isPopupOpen && layer.isPopupOpen()) {
      const popup = layer.getPopup();
      if (popup) {
        popup.setContent(createRoadPopup(properties));
      }
    }

    // Update the bound popup function for future opens
    layer.unbindPopup();
    layer.bindPopup(() => createRoadPopup(properties), {
      maxWidth: 300,
      className: "road-accessibility-popup",
    });
  });

  console.log(
    `🔄 Updated road layer visuals for predictions ${
      predictionsEnabled ? "enabled" : "disabled"
    }`
  );
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
  setPredictionsLoadingCallback,
};
export default roadAccessibilityModule;