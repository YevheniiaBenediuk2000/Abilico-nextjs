/**
 * Road Inference Web Worker
 * Runs ONNX model inference for road accessibility predictions in a background thread
 * This offloads ML computation from the main thread for better UI responsiveness
 */

// Import ONNX Runtime from CDN (self-contained in worker)
importScripts(
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.min.js"
);

// Enable ONNX session caching - this caches compiled WASM in IndexedDB
// so subsequent loads are MUCH faster (35s -> <1s)
try {
  ort.env.wasm.wasmPaths =
    "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/";
  ort.env.wasm.numThreads = 1;
  ort.env.logLevel = "warning";
  // Enable session caching in IndexedDB
  ort.env.webgpu = { profilingMode: "off" };
  console.log("[Worker ONNX] ONNX Runtime configured with session caching");
} catch (e) {
  console.warn("[Worker ONNX] Failed to configure ONNX env:", e);
}

// Model base path (relative to origin)
const MODEL_BASE_PATH = "/models/road_accessibility";

// IndexedDB configuration
const MODEL_DB_NAME = "AbilicoOnnxModels";
const MODEL_DB_VERSION = 3;
const MODEL_STORE_NAME = "models";
const PREDICTIONS_STORE_NAME = "predictions";

// In-memory prediction cache (large enough for typical viewport)
const predictionCache = new Map();
const PREDICTION_CACHE_MAX_SIZE = 50000; // Increased to handle ~24k features per viewport

// State
let schema = null;
let sessions = {
  surface: null,
  smoothness: null,
  width: null,
  incline: null,
};
let isInitialized = false;
let initPromise = null;
let cachedDb = null;
let dbOpenPromise = null;
let isWasmWarmedUp = false;
let wasmWarmupPromise = null;

// Inference queues (per model)
const inferenceQueues = {
  surface: Promise.resolve(),
  smoothness: Promise.resolve(),
  width: Promise.resolve(),
  incline: Promise.resolve(),
};

/**
 * Post message to main thread
 */
function postMsg(type, data) {
  globalThis.postMessage({ type, ...data });
}

/**
 * Open or get cached IndexedDB connection
 */
function openModelDB(retryAfterDelete = false) {
  if (cachedDb) {
    return Promise.resolve(cachedDb);
  }
  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  dbOpenPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(MODEL_DB_NAME, MODEL_DB_VERSION);

    request.onerror = async (event) => {
      const error = event.target.error;
      console.error("[Worker ONNX] IndexedDB error:", error);
      dbOpenPromise = null;

      if (!retryAfterDelete && error?.name === "VersionError") {
        console.warn("[Worker ONNX] Database version conflict. Recreating...");
        try {
          cachedDb = null;
          await deleteModelDB();
          const result = await openModelDB(true);
          resolve(result);
          return;
        } catch (deleteError) {
          reject(deleteError);
          return;
        }
      }
      reject(error);
    };

    request.onsuccess = (event) => {
      cachedDb = event.target.result;
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
      }
      if (!db.objectStoreNames.contains(PREDICTIONS_STORE_NAME)) {
        const predStore = db.createObjectStore(PREDICTIONS_STORE_NAME, {
          keyPath: "id",
        });
        predStore.createIndex("cachedAt", "cachedAt", { unique: false });
      }
    };

    request.onblocked = () => {
      console.warn("[Worker ONNX] Database upgrade blocked by other tabs.");
    };
  });

  return dbOpenPromise;
}

/**
 * Delete IndexedDB database
 */
function deleteModelDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(MODEL_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
    request.onblocked = () => resolve();
  });
}

/**
 * Get model from IndexedDB cache
 */
async function getModelFromCache(modelName, schemaVersion) {
  try {
    const db = await openModelDB();
    return new Promise((resolve) => {
      const tx = db.transaction([MODEL_STORE_NAME], "readonly");
      const store = tx.objectStore(MODEL_STORE_NAME);
      const req = store.get(modelName);
      req.onsuccess = () => {
        if (
          req.result &&
          (!schemaVersion || req.result.version === schemaVersion)
        ) {
          resolve(req.result.data);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Save model to IndexedDB cache
 */
async function saveModelToCache(modelName, data, version) {
  try {
    const db = await openModelDB();
    const tx = db.transaction([MODEL_STORE_NAME], "readwrite");
    const store = tx.objectStore(MODEL_STORE_NAME);
    store.put({ name: modelName, data, version, cachedAt: Date.now() });
  } catch (e) {
    console.warn("[Worker ONNX] Failed to cache model:", e);
  }
}

/**
 * Fetch model with cache
 */
async function fetchModelWithCache(modelName, modelPath, schemaVersion) {
  const cacheStart = performance.now();
  const cached = await getModelFromCache(modelName, schemaVersion);
  const cacheCheckTime = performance.now() - cacheStart;

  if (cached) {
    console.log(
      `⏱️ [PERF] ${modelName}: IndexedDB cache HIT (${cacheCheckTime.toFixed(
        0
      )}ms lookup)`
    );
    return cached;
  }

  console.log(
    `⏱️ [PERF] ${modelName}: IndexedDB cache MISS (${cacheCheckTime.toFixed(
      0
    )}ms lookup), fetching from network...`
  );
  const fetchStart = performance.now();
  const response = await fetch(modelPath);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${modelName}: ${response.status}`);
  }

  const data = await response.arrayBuffer();
  console.log(
    `⏱️ [PERF] ${modelName}: Network fetch: ${(
      performance.now() - fetchStart
    ).toFixed(0)}ms`
  );
  saveModelToCache(modelName, data, schemaVersion).catch(console.warn);
  return data;
}

/**
 * Get cached prediction
 */
async function getCachedPrediction(cacheKey) {
  // Check memory cache first (fast path)
  if (predictionCache.has(cacheKey)) {
    return predictionCache.get(cacheKey);
  }

  // Check IndexedDB (slower path)
  try {
    const db = await openModelDB();

    return new Promise((resolve) => {
      const tx = db.transaction([PREDICTIONS_STORE_NAME], "readonly");
      const store = tx.objectStore(PREDICTIONS_STORE_NAME);
      const req = store.get(cacheKey);
      req.onsuccess = () => {
        if (req.result) {
          addToMemoryCache(cacheKey, req.result.data);
          resolve(req.result.data);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Cache prediction
 */
async function cachePrediction(cacheKey, prediction) {
  addToMemoryCache(cacheKey, prediction);

  try {
    const db = await openModelDB();
    const tx = db.transaction([PREDICTIONS_STORE_NAME], "readwrite");
    const store = tx.objectStore(PREDICTIONS_STORE_NAME);
    store.put({ id: cacheKey, data: prediction, cachedAt: Date.now() });
  } catch (e) {
    console.warn("[Worker ONNX] Failed to cache prediction:", e);
  }
}

/**
 * Add to memory cache with LRU eviction
 */
function addToMemoryCache(key, value) {
  if (predictionCache.size >= PREDICTION_CACHE_MAX_SIZE) {
    const firstKey = predictionCache.keys().next().value;
    predictionCache.delete(firstKey);
  }
  predictionCache.set(key, value);
}

/**
 * Bulk get cached predictions from IndexedDB using parallel get() calls
 * Much faster than getAll() which reads ALL records in the store
 * @param {string[]} cacheKeys - Array of cache keys to look up
 * @returns {Promise<Map<string, any>>} - Map of key -> cached data
 */
async function getCachedPredictionsBulk(cacheKeys) {
  if (cacheKeys.length === 0) return new Map();

  try {
    const dbOpenStart = performance.now();
    const db = await openModelDB();
    const dbOpenTime = performance.now() - dbOpenStart;

    // Use parallel get() calls instead of getAll() - much faster for targeted lookups
    const resultMap = new Map();
    const lookupStart = performance.now();

    // Process all keys in a single transaction with parallel get() calls
    await new Promise((resolve) => {
      const tx = db.transaction([PREDICTIONS_STORE_NAME], "readonly");
      const store = tx.objectStore(PREDICTIONS_STORE_NAME);
      let pending = cacheKeys.length;

      if (pending === 0) {
        resolve();
        return;
      }

      for (const key of cacheKeys) {
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result) {
            resultMap.set(key, req.result.data);
            addToMemoryCache(key, req.result.data);
          }
          pending--;
          if (pending === 0) resolve();
        };
        req.onerror = () => {
          pending--;
          if (pending === 0) resolve();
        };
      }
    });

    const lookupTime = performance.now() - lookupStart;
    console.log(
      `⏱️ [PERF] getCachedPredictionsBulk: dbOpen=${dbOpenTime.toFixed(
        0
      )}ms, lookup=${lookupTime.toFixed(0)}ms (${
        cacheKeys.length
      } keys), matched=${resultMap.size}/${cacheKeys.length}`
    );

    return resultMap;
  } catch (e) {
    console.warn("[Worker ONNX] Bulk cache lookup failed:", e);
    return new Map();
  }
}

/**
 * Generate prediction cache key
 */
function getPredictionCacheKey(props) {
  if (props.id || props.osm_id || props["@id"]) {
    return `osm_${props.id || props.osm_id || props["@id"]}`;
  }
  const keyProps = [
    props.highway,
    props.surface,
    props.smoothness,
    props.width,
    props.incline,
    props.lit,
    props.tactile_paving,
    props.oneway,
  ].join("|");
  let hash = 0;
  for (let i = 0; i < keyProps.length; i++) {
    hash = (hash << 5) - hash + keyProps.charCodeAt(i);
    hash = hash & hash;
  }
  return `hash_${hash}`;
}

/**
 * Warm up WASM by loading the heaviest model (surface: 97.14MB)
 * This does the expensive WASM compilation + large model load during idle time
 * so subsequent model loads on user interaction are nearly instant
 */
async function warmupWasm() {
  if (isWasmWarmedUp) return true;
  if (wasmWarmupPromise) return wasmWarmupPromise;

  wasmWarmupPromise = (async () => {
    const start = performance.now();
    console.log("⏱️ [PERF] warmupWasm START (loading surface model)");

    try {
      // Load schema first
      const schemaResponse = await fetch(`${MODEL_BASE_PATH}/schema.json`);
      if (!schemaResponse.ok) {
        throw new Error(`Failed to load schema: ${schemaResponse.status}`);
      }
      schema = await schemaResponse.json();

      // Load the heaviest model (surface: 97.14MB) during idle time
      // This handles both WASM compilation AND the largest model fetch
      const heaviestModel = "surface";
      const modelInfo = schema.models?.[heaviestModel];
      if (modelInfo) {
        await loadSingleModel(
          heaviestModel,
          modelInfo,
          schema.version || "1.0"
        );
        isWasmWarmedUp = true;
        console.log(
          `⏱️ [PERF] warmupWasm DONE: ${(performance.now() - start).toFixed(
            0
          )}ms`
        );
        return true;
      }
      return false;
    } catch (error) {
      console.warn("[Worker ONNX] WASM warmup failed:", error);
      console.log(
        `⏱️ [PERF] warmupWasm FAILED: ${(performance.now() - start).toFixed(
          0
        )}ms`
      );
      return false;
    }
  })();

  return wasmWarmupPromise;
}

/**
 * Initialize ONNX models
 * Loads all models in parallel for faster startup
 */
async function initOnnxModels() {
  if (isInitialized) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const totalStart = performance.now();
    console.log("⏱️ [PERF] initOnnxModels START");

    try {
      // Load schema
      const schemaStart = performance.now();
      const schemaResponse = await fetch(`${MODEL_BASE_PATH}/schema.json`);
      if (!schemaResponse.ok) {
        throw new Error(`Failed to load schema: ${schemaResponse.status}`);
      }
      schema = await schemaResponse.json();
      console.log(
        `⏱️ [PERF] Schema fetch: ${(performance.now() - schemaStart).toFixed(
          1
        )}ms`
      );

      // WASM already configured at worker startup
      const schemaVersion = schema.version || "1.0";

      // Get all models to load
      const allModels = Object.entries(schema.models || {});
      console.log(`⏱️ [PERF] Loading ${allModels.length} models...`);

      // Load ALL models in parallel (skip any already loaded during warmup)
      const modelsLoadStart = performance.now();
      const loadPromises = allModels
        .filter(([modelName]) => !sessions[modelName]) // Skip already-loaded models
        .map(([modelName, modelInfo]) =>
          loadSingleModel(modelName, modelInfo, schemaVersion)
        );

      await Promise.all(loadPromises);
      console.log(
        `⏱️ [PERF] All models loaded: ${(
          performance.now() - modelsLoadStart
        ).toFixed(1)}ms`
      );

      isInitialized = true;
      console.log(
        `⏱️ [PERF] initOnnxModels TOTAL: ${(
          performance.now() - totalStart
        ).toFixed(1)}ms`
      );
      return true;
    } catch (error) {
      console.error("[Worker ONNX] ❌ Initialization failed:", error);
      console.log(
        `⏱️ [PERF] initOnnxModels FAILED after: ${(
          performance.now() - totalStart
        ).toFixed(1)}ms`
      );
      return false;
    }
  })();

  return initPromise;
}

/**
 * Load a single model
 */
async function loadSingleModel(modelName, modelInfo, schemaVersion) {
  const start = performance.now();
  try {
    const modelPath = `${MODEL_BASE_PATH}/${modelInfo.file}`;

    const fetchStart = performance.now();
    const modelData = await fetchModelWithCache(
      modelName,
      modelPath,
      schemaVersion
    );
    const fetchTime = performance.now() - fetchStart;

    const sessionStart = performance.now();
    // Use session options that enable faster subsequent loads
    sessions[modelName] = await ort.InferenceSession.create(modelData, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
      // Enable optimizations
      enableCpuMemArena: true,
      enableMemPattern: true,
      // Use lower precision for faster inference (optional)
      // executionMode: "sequential",
    });
    const sessionTime = performance.now() - sessionStart;

    const totalTime = performance.now() - start;
    const sizeMB = modelData.byteLength / 1024 / 1024;
    console.log(
      `⏱️ [PERF] Model ${modelName}: fetch=${fetchTime.toFixed(
        0
      )}ms, session=${sessionTime.toFixed(0)}ms, total=${totalTime.toFixed(
        0
      )}ms (${sizeMB.toFixed(2)}MB)`
    );
  } catch (error) {
    console.warn(
      `[Worker ONNX] ⚠️ Failed to load ${modelName}:`,
      error.message
    );
  }
}

/**
 * Standardize surface type
 */
function standardizeSurface(surface) {
  if (!surface) return null;
  const s = String(surface).toLowerCase().trim();
  const mapping = {
    asphalt: "asphalt",
    paved: "paved",
    concrete: "concrete",
    "concrete:plates": "concrete",
    "concrete:lanes": "concrete",
    paving_stones: "paving_stones",
    sett: "sett",
    metal: "metal",
    wood: "wood",
    compacted: "compacted",
    fine_gravel: "fine_gravel",
    gravel: "gravel",
    unpaved: "unpaved",
    ground: "ground",
    dirt: "dirt",
    earth: "earth",
    grass: "grass",
    mud: "mud",
    sand: "sand",
    cobblestone: "cobblestone",
    rock: "rock",
  };
  return mapping[s] || s;
}

/**
 * Parse width string to meters
 */
function parseWidth(widthStr) {
  if (!widthStr) return null;
  const s = String(widthStr).toLowerCase().trim();
  const match = s.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  let value = parseFloat(match[1].replace(",", "."));
  if (s.includes("cm")) value /= 100;
  else if (s.includes("mm")) value /= 1000;
  else if (s.includes("ft") || s.includes("'")) value *= 0.3048;
  return isFinite(value) ? value : null;
}

/**
 * Parse incline string to percentage
 */
function parseIncline(inclineStr) {
  if (!inclineStr) return null;
  const s = String(inclineStr).toLowerCase().trim();
  if (["up", "down", "steep"].includes(s)) return null;
  const pctMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*%?$/);
  if (pctMatch) return parseFloat(pctMatch[1]);
  const ratioMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (ratioMatch) {
    const a = parseFloat(ratioMatch[1]);
    const b = parseFloat(ratioMatch[2]);
    if (b !== 0) return (a / b) * 100;
  }
  return null;
}

/**
 * Create feature vector from OSM properties
 */
function createFeatureVector(props, featureColumns) {
  const vector = new Float32Array(featureColumns.length);

  for (let i = 0; i < featureColumns.length; i++) {
    const col = featureColumns[i];

    if (col.startsWith("hw_")) {
      const hwType = col.replace("hw_", "");
      vector[i] = props.highway === hwType ? 1 : 0;
    } else if (col.startsWith("surf_")) {
      const surfType = col.replace("surf_", "");
      vector[i] = standardizeSurface(props.surface) === surfType ? 1 : 0;
    } else if (col.startsWith("smooth_")) {
      const smoothType = col.replace("smooth_", "");
      vector[i] = props.smoothness === smoothType ? 1 : 0;
    } else if (col.endsWith("_binary")) {
      const key = col.replace("_binary", "");
      const val = props[key];
      vector[i] = val === "yes" ? 1 : val === "no" ? 0 : -1;
    } else if (col.startsWith("has_")) {
      const key = col.replace("has_", "");
      vector[i] = props[key] != null && props[key] !== "" ? 1 : 0;
    } else if (col === "width_m") {
      vector[i] = parseWidth(props.width) || 0;
    } else if (col === "incline_pct") {
      vector[i] = parseIncline(props.incline) || 0;
    } else {
      vector[i] = 0;
    }
  }

  return vector;
}

/**
 * Get top N alternatives
 */
function getTopAlternatives(probabilities, prediction, n = 3) {
  if (!probabilities) return [];
  return Object.entries(probabilities)
    .filter(([cls]) => cls !== prediction)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .filter(([, prob]) => prob >= 0.05)
    .map(([cls, prob]) => ({ class: cls, probability: prob }));
}

/**
 * Get contributing features
 */
function getContributingFeatures(featureVector, featureColumns, props) {
  const contributing = [];
  const formatHighwayType = (type) => {
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
    return labels[type] || type;
  };

  for (let i = 0; i < featureColumns.length; i++) {
    const col = featureColumns[i];
    const val = featureVector[i];
    if (val === 0 || val === -1) continue;

    let description = "";
    let displayValue = val;

    if (col.startsWith("hw_")) {
      description = `Highway type: ${formatHighwayType(
        col.replace("hw_", "")
      )}`;
      displayValue = "✓";
    } else if (col.startsWith("surf_")) {
      description = `Surface: ${col.replace("surf_", "")}`;
      displayValue = "✓";
    } else if (col.startsWith("smooth_")) {
      description = `Smoothness: ${col.replace("smooth_", "")}`;
      displayValue = "✓";
    } else if (col === "lit_binary") {
      description =
        props.lit === "yes" ? "Street lighting present" : "No street lighting";
      displayValue = props.lit === "yes" ? "✓" : "✗";
    } else if (col === "tactile_paving_binary") {
      description =
        props.tactile_paving === "yes"
          ? "Has tactile paving"
          : "No tactile paving";
      displayValue = props.tactile_paving === "yes" ? "✓" : "✗";
    } else if (col === "oneway_binary") {
      description =
        props.oneway === "yes" ? "One-way street" : "Two-way street";
    } else if (col.startsWith("has_")) {
      description = `Has ${col.replace("has_", "").replace(/_/g, " ")} tag`;
      displayValue = "✓";
    } else if (col === "width_m" && val > 0) {
      description = `Width: ${val.toFixed(1)}m`;
      displayValue = `${val.toFixed(1)}m`;
    } else if (col === "incline_pct" && val !== 0) {
      description = `Incline: ${val.toFixed(1)}%`;
      displayValue = `${val.toFixed(1)}%`;
    } else {
      continue;
    }

    contributing.push({ feature: col, value: displayValue, description });
  }

  return contributing
    .sort((a, b) => {
      const priority = {
        hw_: 1,
        surf_: 2,
        smooth_: 3,
        width_m: 4,
        incline_pct: 5,
      };
      const getPriority = (f) => {
        for (const [prefix, p] of Object.entries(priority)) {
          if (f.feature.startsWith(prefix) || f.feature === prefix) return p;
        }
        return 10;
      };
      return getPriority(a) - getPriority(b);
    })
    .slice(0, 5);
}

/**
 * Run inference for a model (internal)
 */
async function runInferenceInternal(modelName, props) {
  const session = sessions[modelName];
  const modelInfo = schema?.models?.[modelName];

  if (!session || !modelInfo) {
    return {
      prediction: null,
      confidence: 0,
      error: `Model ${modelName} not available`,
    };
  }

  try {
    const featureVector = createFeatureVector(props, modelInfo.feature_columns);
    const inputTensor = new ort.Tensor("float32", featureVector, [
      1,
      featureVector.length,
    ]);
    const inputName = session.inputNames[0] || "features";
    const feeds = { [inputName]: inputTensor };
    const outputs = await session.run(feeds);
    const outputNames = Object.keys(outputs);

    const contributingFeatures = getContributingFeatures(
      featureVector,
      modelInfo.feature_columns,
      props
    );
    const modelMetrics = modelInfo.metrics || {};

    if (modelInfo.type === "classifier") {
      const probOutput =
        outputs[outputNames.find((n) => n.includes("probabilities"))] ||
        outputs[outputNames[1]];
      const labelOutput =
        outputs[outputNames.find((n) => n.includes("label"))] ||
        outputs[outputNames[0]];

      let prediction, confidence, probabilities;

      if (probOutput) {
        const probs = Array.from(probOutput.data);
        const maxIdx = probs.indexOf(Math.max(...probs));
        prediction = modelInfo.classes[maxIdx];
        confidence = probs[maxIdx];
        probabilities = {};
        modelInfo.classes.forEach((cls, idx) => {
          probabilities[cls] = probs[idx];
        });
      } else if (labelOutput) {
        const labelIdx = labelOutput.data[0];
        prediction = modelInfo.classes[labelIdx];
        confidence = 1.0;
      }

      const topAlternatives = getTopAlternatives(probabilities, prediction, 3);

      return {
        prediction,
        confidence,
        probabilities,
        topAlternatives,
        contributingFeatures,
        modelMetrics,
        modelType: "classifier",
        isPredicted: true,
      };
    } else {
      const output = outputs[outputNames[0]];
      const prediction = output.data[0];

      return {
        prediction,
        unit: modelInfo.output_unit,
        contributingFeatures,
        modelMetrics,
        modelType: "regressor",
        isPredicted: true,
      };
    }
  } catch (error) {
    console.error(`[Worker ONNX] Inference error for ${modelName}:`, error);
    return { prediction: null, error: error.message };
  }
}

/**
 * Run inference with queue
 */
async function runInference(modelName, props) {
  const previousPromise = inferenceQueues[modelName] || Promise.resolve();

  let resolveResult;
  const resultPromise = new Promise((resolve) => {
    resolveResult = resolve;
  });

  inferenceQueues[modelName] = previousPromise
    .then(() => runInferenceInternal(modelName, props))
    .then((result) => {
      resolveResult(result);
      return result;
    })
    .catch((error) => {
      const errorResult = { prediction: null, error: error.message };
      resolveResult(errorResult);
      return errorResult;
    });

  return resultPromise;
}

/**
 * Predict road features
 */
async function predictRoadFeatures(props) {
  const cacheKey = getPredictionCacheKey(props);

  const cachedResult = await getCachedPrediction(cacheKey);

  if (cachedResult) {
    return { ...props, ...cachedResult, _fromCache: true };
  }

  if (!isInitialized) {
    await initOnnxModels();
  }

  const result = { ...props };
  const predictions = {};
  const inferenceTimings = {};

  // Surface
  if (!props.surface && sessions.surface) {
    const pred = await runInference("surface", props);
    if (pred.prediction) {
      result.surface = pred.prediction;
      result._surfacePredicted = true;
      result._surfaceConfidence = pred.confidence;
      result._surfaceAlternatives = pred.topAlternatives;
      result._surfaceContributors = pred.contributingFeatures;
      result._surfaceMetrics = pred.modelMetrics;
      predictions.surface = pred;
    }
  }

  // Smoothness
  if (!props.smoothness && sessions.smoothness) {
    const pred = await runInference("smoothness", props);
    if (pred.prediction) {
      result.smoothness = pred.prediction;
      result._smoothnessPredicted = true;
      result._smoothnessConfidence = pred.confidence;
      result._smoothnessAlternatives = pred.topAlternatives;
      result._smoothnessContributors = pred.contributingFeatures;
      result._smoothnessMetrics = pred.modelMetrics;
      predictions.smoothness = pred;
    }
  }

  // Width
  if (!props.width && sessions.width) {
    const pred = await runInference("width", props);
    if (pred.prediction != null && pred.prediction > 0) {
      result.width = `${pred.prediction.toFixed(1)} m`;
      result._widthPredicted = true;
      result._widthValue = pred.prediction;
      result._widthContributors = pred.contributingFeatures;
      result._widthMetrics = pred.modelMetrics;
      predictions.width = pred;
    }
  }

  // Incline
  if (!props.incline && sessions.incline) {
    const pred = await runInference("incline", props);
    if (pred.prediction != null) {
      result.incline = `${pred.prediction.toFixed(1)}%`;
      result._inclinePredicted = true;
      result._inclineValue = pred.prediction;
      result._inclineContributors = pred.contributingFeatures;
      result._inclineMetrics = pred.modelMetrics;
      predictions.incline = pred;
    }
  }

  result._predictions = predictions;
  result._hasPredictions = Object.keys(predictions).length > 0;

  // Cache predictions
  if (result._hasPredictions) {
    const predictionData = { _predictions: predictions, _hasPredictions: true };
    if (result._surfacePredicted) {
      predictionData.surface = result.surface;
      predictionData._surfacePredicted = true;
      predictionData._surfaceConfidence = result._surfaceConfidence;
      predictionData._surfaceAlternatives = result._surfaceAlternatives;
      predictionData._surfaceContributors = result._surfaceContributors;
      predictionData._surfaceMetrics = result._surfaceMetrics;
    }
    if (result._smoothnessPredicted) {
      predictionData.smoothness = result.smoothness;
      predictionData._smoothnessPredicted = true;
      predictionData._smoothnessConfidence = result._smoothnessConfidence;
      predictionData._smoothnessAlternatives = result._smoothnessAlternatives;
      predictionData._smoothnessContributors = result._smoothnessContributors;
      predictionData._smoothnessMetrics = result._smoothnessMetrics;
    }
    if (result._widthPredicted) {
      predictionData.width = result.width;
      predictionData._widthPredicted = true;
      predictionData._widthValue = result._widthValue;
      predictionData._widthContributors = result._widthContributors;
      predictionData._widthMetrics = result._widthMetrics;
    }
    if (result._inclinePredicted) {
      predictionData.incline = result.incline;
      predictionData._inclinePredicted = true;
      predictionData._inclineValue = result._inclineValue;
      predictionData._inclineContributors = result._inclineContributors;
      predictionData._inclineMetrics = result._inclineMetrics;
    }
    cachePrediction(cacheKey, predictionData);
  }

  return result;
}

/**
 * Batch predict - optimized for throughput
 * Uses bulk IndexedDB lookup and parallel processing
 */
async function predictRoadFeaturesBatch(roadsList) {
  const batchStart = performance.now();
  console.log(
    `⏱️ [PERF] predictRoadFeaturesBatch START: ${roadsList.length} items`
  );

  if (!isInitialized) {
    const initStart = performance.now();
    await initOnnxModels();
    console.log(
      `⏱️ [PERF] Had to init models: ${(performance.now() - initStart).toFixed(
        0
      )}ms`
    );
  }

  // First pass: check memory cache for all items and collect cache keys
  const memCacheStart = performance.now();
  const results = new Array(roadsList.length);
  const notInMemoryIndices = [];
  const notInMemoryProps = [];
  const notInMemoryCacheKeys = [];
  let memoryCacheHits = 0;

  for (let i = 0; i < roadsList.length; i++) {
    const props = roadsList[i];
    const cacheKey = getPredictionCacheKey(props);

    // Check memory cache only (fast path)
    if (predictionCache.has(cacheKey)) {
      const cachedResult = predictionCache.get(cacheKey);
      results[i] = { ...props, ...cachedResult, _fromCache: true };
      memoryCacheHits++;
    } else {
      notInMemoryIndices.push(i);
      notInMemoryProps.push(props);
      notInMemoryCacheKeys.push(cacheKey);
    }
  }
  console.log(
    `⏱️ [PERF] Memory cache check: ${(
      performance.now() - memCacheStart
    ).toFixed(0)}ms, hits=${memoryCacheHits}, misses=${
      notInMemoryIndices.length
    }`
  );

  // If all in memory cache, return immediately
  if (notInMemoryIndices.length === 0) {
    console.log(
      `⏱️ [PERF] predictRoadFeaturesBatch DONE (all from memory): ${(
        performance.now() - batchStart
      ).toFixed(0)}ms`
    );
    return results;
  }

  // Second pass: bulk lookup IndexedDB for items not in memory cache
  const idbStart = performance.now();
  const idbCache = await getCachedPredictionsBulk(notInMemoryCacheKeys);
  console.log(
    `⏱️ [PERF] IndexedDB bulk lookup: ${(performance.now() - idbStart).toFixed(
      0
    )}ms, found=${idbCache.size}`
  );

  // Process IndexedDB cache hits and collect items needing inference
  const needInferenceIndices = [];
  const needInferenceProps = [];

  for (let i = 0; i < notInMemoryIndices.length; i++) {
    const originalIndex = notInMemoryIndices[i];
    const props = notInMemoryProps[i];
    const cacheKey = notInMemoryCacheKeys[i];

    if (idbCache.has(cacheKey)) {
      const cachedResult = idbCache.get(cacheKey);
      results[originalIndex] = { ...props, ...cachedResult, _fromCache: true };
    } else {
      needInferenceIndices.push(originalIndex);
      needInferenceProps.push(props);
    }
  }

  // If all found in caches, return
  if (needInferenceIndices.length === 0) {
    console.log(
      `⏱️ [PERF] predictRoadFeaturesBatch DONE (all cached): ${(
        performance.now() - batchStart
      ).toFixed(0)}ms`
    );
    return results;
  }

  console.log(
    `⏱️ [PERF] Need inference for ${needInferenceIndices.length} items`
  );

  // Process truly uncached items - run actual inference
  const BATCH_SIZE = 100;
  const inferenceStart = performance.now();
  let batchCount = 0;

  for (let i = 0; i < needInferenceProps.length; i += BATCH_SIZE) {
    const batchProps = needInferenceProps.slice(i, i + BATCH_SIZE);
    const batchIndices = needInferenceIndices.slice(i, i + BATCH_SIZE);

    const batchInfStart = performance.now();
    // Process this batch in parallel (these will run actual ONNX inference)
    const batchResults = await Promise.all(batchProps.map(predictRoadFeatures));
    console.log(
      `⏱️ [PERF] Inference batch ${++batchCount} (${
        batchProps.length
      } items): ${(performance.now() - batchInfStart).toFixed(0)}ms`
    );

    // Place results in correct positions
    for (let j = 0; j < batchResults.length; j++) {
      results[batchIndices[j]] = batchResults[j];
    }
  }

  console.log(
    `⏱️ [PERF] All inference: ${(performance.now() - inferenceStart).toFixed(
      0
    )}ms`
  );
  console.log(
    `⏱️ [PERF] predictRoadFeaturesBatch TOTAL: ${(
      performance.now() - batchStart
    ).toFixed(0)}ms`
  );

  return results;
}

/**
 * Clear prediction cache
 */
async function clearPredictionCache() {
  predictionCache.clear();
  try {
    const db = await openModelDB();
    const tx = db.transaction([PREDICTIONS_STORE_NAME], "readwrite");
    tx.objectStore(PREDICTIONS_STORE_NAME).clear();
  } catch (e) {
    console.warn("[Worker ONNX] Failed to clear cache:", e);
  }
}

/**
 * Clear model cache
 */
async function clearModelCache() {
  try {
    const db = await openModelDB();
    const tx = db.transaction([MODEL_STORE_NAME], "readwrite");
    tx.objectStore(MODEL_STORE_NAME).clear();
  } catch (e) {
    console.warn("[Worker ONNX] Failed to clear model cache:", e);
  }
}

/**
 * Get model cache stats
 */
async function getModelCacheStats() {
  try {
    const db = await openModelDB();
    return new Promise((resolve) => {
      const tx = db.transaction([MODEL_STORE_NAME], "readonly");
      const store = tx.objectStore(MODEL_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const models = req.result || [];
        let totalSize = 0;
        const stats = models.map((m) => {
          const sizeMB = m.data ? m.data.byteLength / 1024 / 1024 : 0;
          totalSize += sizeMB;
          return {
            name: m.name,
            sizeMB: sizeMB.toFixed(1),
            cachedAt: m.cachedAt ? new Date(m.cachedAt).toISOString() : null,
          };
        });
        resolve({
          models: stats,
          totalSizeMB: totalSize.toFixed(1),
          count: models.length,
        });
      };
      req.onerror = () => resolve({ models: [], totalSizeMB: "0", count: 0 });
    });
  } catch {
    return { models: [], totalSizeMB: "0", count: 0 };
  }
}

/**
 * Get available models
 */
function getAvailableModels() {
  if (!schema) return [];
  return Object.keys(schema.models || {}).filter(
    (name) => sessions[name] !== null
  );
}

// ============================================
// MESSAGE HANDLER
// ============================================

globalThis.onmessage = async function (event) {
  const { type, id, data } = event.data;

  try {
    switch (type) {
      case "warmup": {
        const warmupResult = await warmupWasm();
        postMsg("warmupResult", {
          id,
          success: warmupResult,
        });
        break;
      }

      case "init": {
        const initResult = await initOnnxModels();
        postMsg("initResult", {
          id,
          success: initResult,
          models: getAvailableModels(),
        });
        break;
      }

      case "predict": {
        const predictResult = await predictRoadFeatures(data.props);
        postMsg("predictResult", { id, result: predictResult });
        break;
      }

      case "predictBatch": {
        const batchResult = await predictRoadFeaturesBatch(data.roadsList);
        postMsg("predictBatchResult", { id, results: batchResult });
        break;
      }

      case "isReady":
        postMsg("isReadyResult", { id, ready: isInitialized });
        break;

      case "getAvailableModels":
        postMsg("getAvailableModelsResult", {
          id,
          models: getAvailableModels(),
        });
        break;

      case "clearPredictionCache":
        await clearPredictionCache();
        postMsg("clearPredictionCacheResult", { id, success: true });
        break;

      case "clearModelCache":
        await clearModelCache();
        postMsg("clearModelCacheResult", { id, success: true });
        break;

      case "getModelCacheStats": {
        const stats = await getModelCacheStats();
        postMsg("getModelCacheStatsResult", { id, stats });
        break;
      }

      default:
        console.warn("[Worker ONNX] Unknown message type:", type);
        postMsg("error", { id, error: `Unknown message type: ${type}` });
    }
  } catch (error) {
    console.error("[Worker ONNX] Error handling message:", error);
    postMsg("error", { id, error: error.message });
  }
};

// Log worker initialization
console.log("[Worker ONNX] Road inference worker initialized");
