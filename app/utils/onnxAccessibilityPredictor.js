/**
 * ONNX-based Accessibility Predictor (Client-side)
 * Uses onnxruntime-web to run ML model in the browser for predicting
 * wheelchair accessibility for places based on OSM features.
 *
 * Uses the Geographic Split model for better generalization.
 */

import * as ort from "onnxruntime-web";

// Model base path (served from public folder)
const MODEL_BASE_PATH = "/models";
const MODEL_FILE = "accessibility_model.onnx";
const CONFIG_FILE = "model_config.json";

// IndexedDB configuration for model caching
const MODEL_DB_NAME = "AbilicoOnnxModels";
const MODEL_DB_VERSION = 3; // Match road predictor version
const MODEL_STORE_NAME = "models";
const PREDICTIONS_STORE_NAME = "predictions";
const ACCESSIBILITY_MODEL_KEY = "accessibility_model";

// In-memory prediction cache for fast lookups (LRU-style with max size)
const predictionCache = new Map();
const PREDICTION_CACHE_MAX_SIZE = 5000;
const PREDICTION_CACHE_PREFIX = "place_";

// Cached session and config
let session = null;
let config = null;

// Cached IndexedDB connection
let cachedDb = null;
let dbOpenPromise = null;

// Loading state
let isInitialized = false;
let initPromise = null;
let initError = null;

/**
 * Open or get cached IndexedDB database connection
 * Handles version conflicts by deleting and recreating the database
 */
function openModelDB(retryAfterDelete = false) {
  // Return cached connection if available
  if (cachedDb) {
    return Promise.resolve(cachedDb);
  }

  // Return pending promise if already opening
  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  dbOpenPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not supported"));
      return;
    }

    const request = window.indexedDB.open(MODEL_DB_NAME, MODEL_DB_VERSION);

    request.onerror = async (event) => {
      const error = event.target.error;
      console.error("[ONNX-Acc] IndexedDB error:", error);
      dbOpenPromise = null; // Clear promise on error

      // Handle version conflict: delete the database and retry
      if (!retryAfterDelete && error?.name === "VersionError") {
        console.warn(
          "[ONNX-Acc] Database version conflict detected. Deleting old database..."
        );
        try {
          cachedDb = null;
          await deleteModelDB();
          const result = await openModelDB(true);
          resolve(result);
          return;
        } catch (deleteError) {
          console.error(
            "[ONNX-Acc] Failed to delete and recreate database:",
            deleteError
          );
          reject(deleteError);
          return;
        }
      }

      reject(error);
    };

    request.onsuccess = (event) => {
      cachedDb = event.target.result;

      // Handle connection close
      cachedDb.onclose = () => {
        cachedDb = null;
        dbOpenPromise = null;
      };

      resolve(cachedDb);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(MODEL_STORE_NAME)) {
        db.createObjectStore(MODEL_STORE_NAME, { keyPath: "name" });
        console.log("🤖 [ONNX-Acc] Created IndexedDB store for models");
      }
      if (!db.objectStoreNames.contains(PREDICTIONS_STORE_NAME)) {
        const predStore = db.createObjectStore(PREDICTIONS_STORE_NAME, {
          keyPath: "id",
        });
        predStore.createIndex("cachedAt", "cachedAt", { unique: false });
        console.log("🤖 [ONNX-Acc] Created IndexedDB store for predictions");
      }
    };

    // Handle blocked event (when other tabs have the database open)
    request.onblocked = () => {
      console.warn(
        "[ONNX-Acc] Database upgrade blocked by other tabs. Please close other tabs."
      );
    };
  });

  return dbOpenPromise;
}

/**
 * Delete the IndexedDB database
 */
function deleteModelDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not supported"));
      return;
    }

    const request = window.indexedDB.deleteDatabase(MODEL_DB_NAME);

    request.onsuccess = () => {
      console.log("[ONNX-Acc] Successfully deleted old IndexedDB database");
      resolve();
    };

    request.onerror = (event) => {
      console.error(
        "[ONNX-Acc] Failed to delete database:",
        event.target.error
      );
      reject(event.target.error);
    };

    request.onblocked = () => {
      console.warn(
        "[ONNX-Acc] Database deletion blocked. Close other tabs and retry."
      );
      // Still resolve as the delete will eventually happen
      resolve();
    };
  });
}

/**
 * Generate a cache key for place predictions based on OSM ID or properties hash
 * @param {Object} place - OSM place properties
 * @returns {string} - Cache key
 */
function getPlaceCacheKey(place) {
  // Use explicitly passed place ID (from mapMain.js)
  if (place._placeId) {
    return `${PREDICTION_CACHE_PREFIX}${place._placeId}`;
  }

  // Use OSM ID if available (most reliable)
  if (place.id || place.osm_id || place["@id"]) {
    return `${PREDICTION_CACHE_PREFIX}${
      place.id || place.osm_id || place["@id"]
    }`;
  }

  // Fallback: hash key properties that affect prediction
  const keyProps = [
    place.amenity,
    place.shop,
    place.tourism,
    place.building,
    place.wheelchair,
    place.entrance,
    place.door,
    place.name,
  ].join("|");

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < keyProps.length; i++) {
    const char = keyProps.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `${PREDICTION_CACHE_PREFIX}hash_${hash}`;
}

/**
 * Get cached prediction from memory or IndexedDB
 * @param {string} cacheKey - Cache key for the place
 * @returns {Promise<Object|null>} - Cached prediction or null
 */
async function getCachedPrediction(cacheKey) {
  // Check in-memory cache first (fast path)
  if (predictionCache.has(cacheKey)) {
    return predictionCache.get(cacheKey);
  }

  // Try IndexedDB
  try {
    const db = await openModelDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([PREDICTIONS_STORE_NAME], "readonly");
      const store = transaction.objectStore(PREDICTIONS_STORE_NAME);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        if (request.result) {
          // Add to memory cache
          addToMemoryCache(cacheKey, request.result.data);
          resolve(request.result.data);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Get multiple cached predictions at once (batch)
 * @param {Array<string>} cacheKeys - Array of cache keys
 * @returns {Promise<Map<string, Object>>} - Map of cacheKey -> prediction
 */
async function getCachedPredictionsBatch(cacheKeys) {
  const results = new Map();
  const keysToFetch = [];

  // Check memory cache first
  for (const key of cacheKeys) {
    if (predictionCache.has(key)) {
      results.set(key, predictionCache.get(key));
    } else {
      keysToFetch.push(key);
    }
  }

  // Fetch remaining from IndexedDB
  if (keysToFetch.length > 0) {
    try {
      const db = await openModelDB();
      let foundInIdb = 0;
      await new Promise((resolve) => {
        const transaction = db.transaction(
          [PREDICTIONS_STORE_NAME],
          "readonly"
        );
        const store = transaction.objectStore(PREDICTIONS_STORE_NAME);
        let completed = 0;

        for (const key of keysToFetch) {
          const request = store.get(key);
          request.onsuccess = () => {
            if (request.result) {
              results.set(key, request.result.data);
              addToMemoryCache(key, request.result.data);
              foundInIdb++;
            }
            completed++;
            if (completed === keysToFetch.length) {
              resolve();
            }
          };
          request.onerror = () => {
            completed++;
            if (completed === keysToFetch.length) resolve();
          };
        }

        if (keysToFetch.length === 0) resolve();
      });
    } catch {
      // Ignore IndexedDB errors
    }
  }

  return results;
}

/**
 * Save multiple predictions to cache (batch)
 * @param {Array<{key: string, prediction: Object}>} items - Array of items to cache
 */
async function cachePredictionsBatch(items) {
  // Add all to memory cache
  for (const { key, prediction } of items) {
    addToMemoryCache(key, prediction);
  }
  console.log(
    `💾 [ONNX-Acc] Added ${items.length} to memory cache. Memory cache size: ${predictionCache.size}`
  );

  // Save to IndexedDB
  try {
    const db = await openModelDB();
    const transaction = db.transaction([PREDICTIONS_STORE_NAME], "readwrite");
    const store = transaction.objectStore(PREDICTIONS_STORE_NAME);
    const now = Date.now();

    for (const { key, prediction } of items) {
      store.put({
        id: key,
        data: prediction,
        cachedAt: now,
      });
    }

    transaction.oncomplete = () => {
      console.log(
        `💾 [ONNX-Acc] Successfully saved ${items.length} predictions to IndexedDB`
      );
    };
    transaction.onerror = (e) => {
      console.error(`💾 [ONNX-Acc] IndexedDB transaction error:`, e);
    };
  } catch (err) {
    console.error(`💾 [ONNX-Acc] Failed to save to IndexedDB:`, err);
  }
}

/**
 * Add prediction to in-memory cache with LRU eviction
 * @param {string} key - Cache key
 * @param {Object} value - Prediction data
 */
function addToMemoryCache(key, value) {
  // Evict oldest entries if cache is full
  if (predictionCache.size >= PREDICTION_CACHE_MAX_SIZE) {
    const firstKey = predictionCache.keys().next().value;
    predictionCache.delete(firstKey);
  }
  predictionCache.set(key, value);
}

/**
 * Clear all cached place predictions
 */
export async function clearPlacePredictionCache() {
  // Clear memory cache
  predictionCache.clear();

  // Clear IndexedDB predictions with place prefix
  try {
    const db = await openModelDB();
    const transaction = db.transaction([PREDICTIONS_STORE_NAME], "readwrite");
    const store = transaction.objectStore(PREDICTIONS_STORE_NAME);

    // Get all keys and delete those with place prefix
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.key.startsWith(PREDICTION_CACHE_PREFIX)) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch {
    // Ignore errors
  }
}

/**
 * Get model from IndexedDB cache
 */
async function getModelFromCache(modelName, schemaVersion) {
  try {
    const db = await openModelDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MODEL_STORE_NAME], "readonly");
      const store = transaction.objectStore(MODEL_STORE_NAME);
      const request = store.get(modelName);

      request.onsuccess = () => {
        if (request.result) {
          if (schemaVersion && request.result.version !== schemaVersion) {
            resolve(null);
          } else {
            resolve(request.result.data);
          }
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn(`[ONNX-Acc] Failed to read ${modelName} from cache:`, e);
    return null;
  }
}

/**
 * Save model to IndexedDB cache
 */
async function saveModelToCache(modelName, data, version) {
  try {
    const db = await openModelDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MODEL_STORE_NAME], "readwrite");
      const store = transaction.objectStore(MODEL_STORE_NAME);

      store.put({
        name: modelName,
        data: data,
        version: version,
        cachedAt: Date.now(),
      });

      transaction.oncomplete = () => {
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (e) {
    console.warn(`[ONNX-Acc] Failed to save ${modelName} to cache:`, e);
  }
}

/**
 * Fetch model data with caching
 */
async function fetchModelWithCache(modelPath, schemaVersion) {
  // Try cache first
  const cached = await getModelFromCache(
    ACCESSIBILITY_MODEL_KEY,
    schemaVersion
  );
  if (cached) {
    return cached;
  }

  // Fetch from network
  console.log(`🌐 [ONNX-Acc] Downloading accessibility model from network...`);

  const response = await fetch(modelPath);
  if (!response.ok) {
    throw new Error(`Failed to fetch model: ${response.status}`);
  }

  const data = await response.arrayBuffer();
  console.log(
    `🌐 [ONNX-Acc] Downloaded model (${(data.byteLength / 1024 / 1024).toFixed(
      1
    )}MB)`
  );

  // Save to cache in background
  saveModelToCache(ACCESSIBILITY_MODEL_KEY, data, schemaVersion).catch((e) =>
    console.warn("[ONNX-Acc] Background cache save failed:", e)
  );

  return data;
}

/**
 * Initialize ONNX model and load schema/config
 * @returns {Promise<boolean>} - True if initialization successful
 */
export async function initAccessibilityModel() {
  if (isInitialized) {
    return true;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      console.log("🤖 [ONNX-Acc] Loading accessibility prediction model...");

      // Load model_config.json (contains feature_columns and encoding_info)
      const configResponse = await fetch(`${MODEL_BASE_PATH}/${CONFIG_FILE}`);
      if (!configResponse.ok) {
        throw new Error(`Failed to load config: ${configResponse.status}`);
      }
      config = await configResponse.json();

      // Configure ONNX Runtime for browser - use specific version matching package.json
      ort.env.wasm.wasmPaths =
        "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/";

      // Use SIMD if available for better performance
      ort.env.wasm.numThreads = 1;
      ort.env.logLevel = "error";

      const schemaVersion = config.version || "1.0";
      const modelPath = `${MODEL_BASE_PATH}/${MODEL_FILE}`;

      // Fetch model data (from cache or network)
      const modelData = await fetchModelWithCache(modelPath, schemaVersion);

      // Create ONNX session
      session = await ort.InferenceSession.create(modelData, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });

      // Build feature structure
      buildFeatureStructure();
      console.log("✅ [ONNX-Acc] Accessibility model loaded successfully!");
      console.log(`   Model: ${config.model_name}`);
      console.log(`   Features: ${config.feature_columns.length}`);
      console.log(`   Classes: ${config.n_classes}`);
      console.log(`   Labels: ${config.labels.join(", ")}`);

      isInitialized = true;
      return true;
    } catch (error) {
      console.error("❌ [ONNX-Acc] Initialization failed:", error);
      initError = error;
      return false;
    }
  })();

  return initPromise;
}

/**
 * Check if model is ready
 */
export function isAccessibilityModelReady() {
  return isInitialized && session !== null;
}

/**
 * Get initialization error if any
 */
export function getInitError() {
  return initError;
}

/**
 * Get model config
 */
export function getConfig() {
  return config;
}

// Cached feature structure for efficient encoding
let featureStructure = null;

/**
 * Build the feature structure from model_config.json
 * Uses feature_columns and encoding_info for proper feature mapping
 */
function buildFeatureStructure() {
  if (featureStructure) return featureStructure;

  const { feature_columns, encoding_info } = config;

  // Build column index for fast lookup
  const columnIndex = {};
  feature_columns.forEach((col, idx) => {
    columnIndex[col] = idx;
  });

  featureStructure = {
    featureColumns: feature_columns,
    columnIndex,
    numFeatures: feature_columns.length,
    hasFeatures: encoding_info?.has_features || [],
    categoricalFeatures: encoding_info?.categorical_features || {},
  };

  console.log(
    `📊 [ONNX-Acc] Feature structure: ${featureStructure.numFeatures} features`
  );

  return featureStructure;
}

/**
 * Encode a single place's OSM features into a feature vector
 * Uses model_config.json encoding_info structure
 */
function encodeFeatures(place) {
  if (!config) {
    throw new Error("Model not initialized");
  }

  const struct = buildFeatureStructure();
  const features = new Float32Array(struct.numFeatures);

  // Normalize input tags - handle both "tags.X" and "X" formats
  const normalizedTags = {};
  for (const [key, value] of Object.entries(place)) {
    if (value !== null && value !== undefined && value !== "") {
      // Remove "tags." prefix if present
      const normalizedKey = key.replace(/^tags\./, "");
      // Also store value with underscores instead of spaces/hyphens for matching
      const normalizedValue = String(value)
        .replace(/ /g, "_")
        .replace(/-/g, "_");
      normalizedTags[normalizedKey] = normalizedValue;
    }
  }

  // Set binary "has_" features
  for (const hasFeature of struct.hasFeatures) {
    // Extract tag name from "tags.X" format
    const tagName = hasFeature.tag.replace(/^tags\./, "");
    if (tagName in normalizedTags) {
      const colIdx = struct.columnIndex[hasFeature.column];
      if (colIdx !== undefined) {
        features[colIdx] = 1;
      }
    }
  }

  // Set categorical (one-hot) features
  for (const [category, valueMap] of Object.entries(
    struct.categoricalFeatures
  )) {
    const tagValue = normalizedTags[category];
    if (tagValue) {
      // Try exact match first
      let columnName = valueMap[tagValue];

      // Try truncated match (some values are truncated in training)
      if (!columnName && tagValue.length > 20) {
        const truncatedValue = tagValue.substring(0, 20);
        columnName = valueMap[truncatedValue];
      }

      if (columnName && struct.columnIndex[columnName] !== undefined) {
        features[struct.columnIndex[columnName]] = 1;
      }
    }
  }

  // Handle numeric features (look for *_numeric columns)
  const numericTags = ["level", "floors", "rooms", "capacity"];
  for (const tag of numericTags) {
    const numericCol = `${tag}_numeric`;
    if (struct.columnIndex[numericCol] !== undefined && normalizedTags[tag]) {
      const numValue = parseFloat(normalizedTags[tag]);
      if (!isNaN(numValue)) {
        features[struct.columnIndex[numericCol]] = numValue;
      }
    }
  }

  return features;
}

/**
 * Encode multiple places into a batch feature matrix
 */
function encodeBatch(places) {
  const struct = buildFeatureStructure();
  const numFeatures = struct.numFeatures;
  const batchSize = places.length;
  const batchFeatures = new Float32Array(batchSize * numFeatures);

  places.forEach((place, idx) => {
    const features = encodeFeatures(place);
    batchFeatures.set(features, idx * numFeatures);
  });

  return batchFeatures;
}

/**
 * Get confidence level based on probability
 */
function getConfidence(probability) {
  const distance = Math.abs(probability - 0.5);
  if (distance > 0.35) return "high";
  if (distance > 0.15) return "medium";
  return "low";
}

/**
 * Format feature name for display
 */
function formatFeatureName(colName) {
  if (!colName) return "";

  // Handle "has_X" features
  if (colName.startsWith("has_")) {
    const tagName = colName.replace("has_", "");
    return `Has ${tagName.replace(/_/g, " ")}`;
  }

  // Handle "X_numeric" features
  if (colName.endsWith("_numeric")) {
    const tagName = colName.replace("_numeric", "");
    return `${tagName.charAt(0).toUpperCase()}${tagName.slice(1)} (value)`;
  }

  // Handle "category_value" format
  const parts = colName.split("_");
  if (parts.length >= 2) {
    const category = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    const value = parts
      .slice(1)
      .join(" ")
      .replace(/^(\w)/, (c) => c.toUpperCase());
    return `${category}: ${value}`;
  }

  return colName.replace(/_/g, " ");
}

/**
 * Get top contributing features for a place
 * Returns the active features that likely contributed to the prediction
 */
function getContributingFeatures(place, topN = 3) {
  try {
    if (!place || typeof place !== "object") {
      return [];
    }

    const struct = buildFeatureStructure();
    const features = encodeFeatures(place);
    const importances = config.feature_importances || {};

    // Collect active features (value > 0) with their importances
    const activeFeatures = [];
    struct.featureColumns.forEach((col, idx) => {
      if (features && features[idx] > 0) {
        const importance = importances[col] || 0;
        activeFeatures.push({
          feature: col,
          displayName: formatFeatureName(col),
          importance,
        });
      }
    });

    // Sort by importance and return top N
    activeFeatures.sort((a, b) => b.importance - a.importance);
    return activeFeatures.slice(0, topN);
  } catch (err) {
    console.warn("[ONNX-Acc] Error getting contributing features:", err);
    return [];
  }
}

/**
 * Run inference on the ONNX model for multiple places
 * Uses caching to avoid redundant predictions
 * @param {Array<Object>} places - Array of places with OSM features
 * @returns {Promise<Object>} - Prediction results
 */
export async function predictAccessibility(places) {
  // Generate cache keys for all places
  const cacheKeys = places.map((place) => getPlaceCacheKey(place));

  // Check cache FIRST before loading model
  const cachedPredictions = await getCachedPredictionsBatch(cacheKeys);

  // Separate cached and uncached places
  const uncachedIndices = [];
  const uncachedPlaces = [];
  const finalPredictions = new Array(places.length);

  for (let i = 0; i < places.length; i++) {
    const cached = cachedPredictions.get(cacheKeys[i]);
    if (cached) {
      finalPredictions[i] = { ...cached, _fromCache: true };
    } else {
      uncachedIndices.push(i);
      uncachedPlaces.push(places[i]);
    }
  }

  // Log cache hit rate
  const cachedCount = places.length - uncachedPlaces.length;
  if (cachedCount > 0) {
    console.log(
      `💾 [ONNX-Acc] Cache hit: ${cachedCount}/${places.length} predictions from cache`
    );
  }

  // If all predictions were cached, return early WITHOUT loading model
  if (uncachedPlaces.length === 0) {
    return {
      predictions: finalPredictions,
      model: config?.model_name || "cached",
      n_classes: config?.n_classes || 3,
      _allFromCache: true,
    };
  }

  // Only load model if we have uncached predictions to run
  if (!isInitialized || !session) {
    const ready = await initAccessibilityModel();
    if (!ready) {
      throw new Error("Failed to initialize accessibility model");
    }
  }

  const struct = buildFeatureStructure();
  const numFeatures = struct.numFeatures;
  const batchSize = uncachedPlaces.length;

  // Use config values
  const numClasses = config.n_classes || 3;
  const labels = config.labels || ["not_accessible", "limited", "accessible"];

  // Encode features only for uncached places
  const featuresArray = encodeBatch(uncachedPlaces);

  // Create ONNX tensor
  const inputTensor = new ort.Tensor("float32", featuresArray, [
    batchSize,
    numFeatures,
  ]);

  // Get input name from config or session
  const inputName = config.input_name || session.inputNames[0] || "float_input";
  const feeds = { [inputName]: inputTensor };

  // Run inference
  const results = await session.run(feeds);

  // Extract label and probability outputs
  // Note: ONNX returns labels as int64 (BigInt in JS), need to convert properly
  const labelData = results.label?.data;
  const probData = results.probabilities?.data;

  // Format results and cache new predictions
  const toCache = [];
  for (let i = 0; i < batchSize; i++) {
    // Convert BigInt to Number safely (ONNX int64 -> JS BigInt)
    let predictedClassIdx = 0;
    if (labelData) {
      const labelValue = labelData[i];
      predictedClassIdx =
        typeof labelValue === "bigint" ? Number(labelValue) : labelValue;
    }

    let maxProb = 0;
    const classProbabilities = {};

    if (probData && probData.length) {
      for (let c = 0; c < numClasses; c++) {
        const prob = probData[i * numClasses + c] ?? 0;
        classProbabilities[labels[c]] = Math.round(prob * 1000) / 1000;
        if (prob > maxProb) {
          maxProb = prob;
          if (!labelData) predictedClassIdx = c;
        }
      }
    } else {
      // Fallback if no probability output
      labels.forEach((label, idx) => {
        classProbabilities[label] = idx === predictedClassIdx ? 1.0 : 0.0;
      });
      maxProb = 1.0;
    }

    const labelName = labels[predictedClassIdx] || "unknown";

    // Safely get the place for contributing features
    const place = uncachedPlaces[i] || {};

    const prediction = {
      label: labelName,
      probability: Math.round(maxProb * 1000) / 1000,
      confidence: getConfidence(maxProb),
      probabilities: classProbabilities,
      basedOn: getContributingFeatures(place, 3),
    };

    // Store in final results at the original index
    const originalIndex = uncachedIndices[i];
    finalPredictions[originalIndex] = prediction;

    // Queue for caching
    toCache.push({
      key: cacheKeys[originalIndex],
      prediction,
    });
  }

  // Cache new predictions asynchronously (don't block return)
  if (toCache.length > 0) {
    cachePredictionsBatch(toCache);
  }

  return {
    predictions: finalPredictions,
    model: config.model_name,
    n_classes: numClasses,
    _cachedCount: places.length - uncachedPlaces.length,
    _newCount: uncachedPlaces.length,
  };
}

/**
 * Predict accessibility for a single place
 * Uses direct cache lookup for efficiency
 * @param {Object} place - OSM features of the place
 * @returns {Promise<Object>} - Single prediction result
 */
export async function predictSingle(place) {
  // Check cache first for single place (more efficient than batch for single item)
  const cacheKey = getPlaceCacheKey(place);
  const cached = await getCachedPrediction(cacheKey);
  if (cached) {
    return { ...cached, _fromCache: true };
  }

  // Run prediction
  const result = await predictAccessibility([place]);
  return result.predictions[0];
}

/**
 * Clear model cache
 */
export async function clearModelCache() {
  try {
    const db = await openModelDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MODEL_STORE_NAME], "readwrite");
      const store = transaction.objectStore(MODEL_STORE_NAME);
      const request = store.delete(ACCESSIBILITY_MODEL_KEY);

      request.onsuccess = () => {
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn("[ONNX-Acc] Failed to clear cache:", e);
  }
}

/**
 * Preload model in background (call on app startup)
 */
export function preloadAccessibilityModel() {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  return initAccessibilityModel().catch((err) => {
    console.warn("🤖 [ONNX-Acc] Background preload failed:", err);
    return false;
  });
}
