/**
 * ONNX-based Accessibility Predictor (Client-side)
 * Uses onnxruntime-web to run ML model in the browser for predicting
 * wheelchair accessibility for places based on OSM features.
 *
 * Similar to onnxRoadPredictor.js but for place accessibility predictions.
 */

import * as ort from "onnxruntime-web";

// Model base path (served from public folder)
const MODEL_BASE_PATH = "/models";
const MODEL_FILE = "accessibility_model.onnx";
const SCHEMA_FILE = "schema.json";

// IndexedDB configuration for model caching
const MODEL_DB_NAME = "AbilicoOnnxModels";
const MODEL_DB_VERSION = 2;
const MODEL_STORE_NAME = "models";
const ACCESSIBILITY_MODEL_KEY = "accessibility_model";

// Cached session and config
let session = null;
let config = null;

// Loading state
let isInitialized = false;
let initPromise = null;
let initError = null;

/**
 * Open or create the IndexedDB database for model caching
 */
function openModelDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not supported"));
      return;
    }

    const request = window.indexedDB.open(MODEL_DB_NAME, MODEL_DB_VERSION);

    request.onerror = (event) => {
      console.error("[ONNX-Acc] IndexedDB error:", event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(MODEL_STORE_NAME)) {
        db.createObjectStore(MODEL_STORE_NAME, { keyPath: "name" });
        console.log("🤖 [ONNX-Acc] Created IndexedDB store for models");
      }
    };
  });
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
            console.log(
              `⚠️ [ONNX-Acc] Cache version mismatch for ${modelName}. Re-downloading...`
            );
            resolve(null);
          } else {
            console.log(`💾 [ONNX-Acc] Found ${modelName} in IndexedDB cache`);
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
        console.log(`💾 [ONNX-Acc] Saved ${modelName} to IndexedDB cache`);
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
  const cached = await getModelFromCache(ACCESSIBILITY_MODEL_KEY, schemaVersion);
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
    `🌐 [ONNX-Acc] Downloaded model (${(data.byteLength / 1024 / 1024).toFixed(1)}MB)`
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

      // Load schema/config first
      const schemaResponse = await fetch(`${MODEL_BASE_PATH}/${SCHEMA_FILE}`);
      if (!schemaResponse.ok) {
        throw new Error(`Failed to load schema: ${schemaResponse.status}`);
      }
      config = await schemaResponse.json();

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

      console.log("✅ [ONNX-Acc] Accessibility model loaded successfully!");
      console.log(`   Model: ${config.model_name}`);
      console.log(`   Features: ${config.feature_columns?.length || 0}`);
      console.log(`   Classes: ${config.n_classes || 0}`);

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

/**
 * Normalize tag key to match training format
 */
function normalizeTagKey(key) {
  return key.replace(/^tags\./, "");
}

/**
 * Encode a single place's OSM features into a feature vector
 */
function encodeFeatures(place) {
  if (!config) {
    throw new Error("Model not initialized");
  }

  const { feature_columns, encoding_info } = config;
  const features = new Float32Array(feature_columns.length);

  // Create lookup for feature column indices
  const columnIndex = {};
  feature_columns.forEach((col, idx) => {
    columnIndex[col] = idx;
  });

  // Normalize input
  const normalizedTags = {};
  for (const [key, value] of Object.entries(place)) {
    if (value !== null && value !== undefined && value !== "") {
      const normalizedKey = normalizeTagKey(key);
      normalizedTags[normalizedKey] = String(value)
        .replace(/ /g, "_")
        .replace(/-/g, "_");
    }
  }

  // Set binary "has_" features
  for (const hasFeature of encoding_info.has_features || []) {
    const tagName = normalizeTagKey(hasFeature.tag);
    if (tagName in normalizedTags) {
      const colIdx = columnIndex[hasFeature.column];
      if (colIdx !== undefined) {
        features[colIdx] = 1;
      }
    }
  }

  // Set categorical (one-hot) features
  for (const [category, valueMap] of Object.entries(
    encoding_info.categorical_features || {}
  )) {
    const tagValue = normalizedTags[category];
    if (tagValue) {
      const truncatedValue = tagValue.substring(0, 20);
      const columnName = valueMap[truncatedValue];
      if (columnName && columnIndex[columnName] !== undefined) {
        features[columnIndex[columnName]] = 1;
      }
    }
  }

  return features;
}

/**
 * Encode multiple places into a batch feature matrix
 */
function encodeBatch(places) {
  const numFeatures = config.feature_columns.length;
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
function formatFeatureName(feature) {
  if (feature.startsWith("has_")) {
    const tagName = feature.replace("has_", "");
    return `Has ${tagName.replace(/_/g, " ")}`;
  }

  const parts = feature.split("_");
  if (parts.length >= 2) {
    const category = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    const value = parts
      .slice(1)
      .join(" ")
      .replace(/^(\w)/, (c) => c.toUpperCase());
    return `${category}: ${value}`;
  }

  return feature.replace(/_/g, " ");
}

/**
 * Get top contributing features for a place
 */
function getContributingFeatures(place, topN = 3) {
  const features = encodeFeatures(place);
  const importances = config.feature_importances || {};

  const activeWithImportance = [];
  config.feature_columns.forEach((col, idx) => {
    if (features[idx] > 0 && importances[col]) {
      activeWithImportance.push({
        feature: col,
        importance: importances[col],
        displayName: formatFeatureName(col),
      });
    }
  });

  activeWithImportance.sort((a, b) => b.importance - a.importance);
  return activeWithImportance.slice(0, topN);
}

/**
 * Run inference on the ONNX model for multiple places
 * @param {Array<Object>} places - Array of places with OSM features
 * @returns {Promise<Object>} - Prediction results
 */
export async function predictAccessibility(places) {
  if (!isInitialized || !session) {
    const ready = await initAccessibilityModel();
    if (!ready) {
      throw new Error("Failed to initialize accessibility model");
    }
  }

  const numFeatures = config.feature_columns.length;
  const batchSize = places.length;
  const numClasses = config.n_classes || 3;
  const labels = config.labels || ["not_accessible", "limited", "accessible"];

  // Encode features
  const featuresArray = encodeBatch(places);

  // Create ONNX tensor
  const inputTensor = new ort.Tensor("float32", featuresArray, [
    batchSize,
    numFeatures,
  ]);

  // Run inference
  const inputName = config.input_name || "input";
  const feeds = { [inputName]: inputTensor };
  const results = await session.run(feeds);

  // Extract predictions
  const labelData = results.output_label?.data || results.label?.data;
  const probData =
    results.output_probability?.data || results.probabilities?.data;

  // Format results
  const predictions = [];
  for (let i = 0; i < batchSize; i++) {
    const predictedClassIdx = labelData ? Number(labelData[i]) : 0;

    const classProbabilities = {};
    let maxProb = 0;

    if (probData && probData.length) {
      for (let c = 0; c < numClasses; c++) {
        const prob = probData[i * numClasses + c] ?? 0;
        classProbabilities[labels[c]] = Math.round(prob * 1000) / 1000;
        if (prob > maxProb) maxProb = prob;
      }
    } else {
      labels.forEach((label, idx) => {
        classProbabilities[label] = idx === predictedClassIdx ? 1.0 : 0.0;
      });
      maxProb = 1.0;
    }

    const labelName = labels[predictedClassIdx] || "unknown";

    predictions.push({
      label: labelName,
      probability: Math.round(maxProb * 1000) / 1000,
      confidence: getConfidence(maxProb),
      probabilities: classProbabilities,
      basedOn: getContributingFeatures(places[i], 3),
    });
  }

  return {
    predictions,
    model: config.model_name,
    n_classes: numClasses,
  };
}

/**
 * Predict accessibility for a single place
 * @param {Object} place - OSM features of the place
 * @returns {Promise<Object>} - Single prediction result
 */
export async function predictSingle(place) {
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
        console.log("🗑️ [ONNX-Acc] Cleared accessibility model from cache");
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
