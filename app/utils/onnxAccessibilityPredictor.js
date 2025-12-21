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
const VOCAB_FILE = "vocab.json";
const SCHEMA_FILE = "schema.json";

// Numeric features used by the model (from schema.json numericStats)
const NUMERIC_FEATURES = ["width", "step_count", "incline", "level"];
const NUMERIC_STATS = {
  width: { mean: 1.6304554847036885, std: 5.311411598026541 },
  step_count: { mean: 2.51114450288004, std: 7.976619050334383 },
  incline: { mean: 0.43081212121212137, std: 3.7809555379098367 },
  level: { mean: 0.2325153289823457, std: 1.322813154280609 },
};

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

      // Load vocab.json for feature encoding (this matches how the model was trained)
      const vocabResponse = await fetch(`${MODEL_BASE_PATH}/${VOCAB_FILE}`);
      if (!vocabResponse.ok) {
        throw new Error(`Failed to load vocab: ${vocabResponse.status}`);
      }
      const vocab = await vocabResponse.json();

      // Store config with vocab
      config = {
        vocab,
        numericFeatures: NUMERIC_FEATURES,
        numericStats: NUMERIC_STATS,
        version: "1.0",
      };

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

      // Build feature structure and log info
      const struct = buildFeatureStructure();
      console.log("✅ [ONNX-Acc] Accessibility model loaded successfully!");
      console.log(`   Vocab keys: ${Object.keys(vocab).length}`);
      console.log(`   Numeric features: ${NUMERIC_FEATURES.length}`);
      console.log(`   Total features: ${struct.numFeatures}`);
      console.log(`   Input names: ${session.inputNames}`);
      console.log(`   Output names: ${session.outputNames}`);

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

// Cached feature structure for efficient encoding
let featureStructure = null;

/**
 * Build the feature structure from vocab.json
 * Model expects: 794 categorical features (all vocab values + __OTHER__ per non-empty key) + 4 numerics = 798
 * Note: Numeric keys (width, step_count, incline, level) are BOTH one-hot encoded AND have continuous values
 */
function buildFeatureStructure() {
  if (featureStructure) return featureStructure;

  const { vocab, numericFeatures, numericStats } = config;

  // Build feature columns in the same order as training
  const featureColumns = [];
  const columnIndex = {};
  const vocabKeys = Object.keys(vocab);

  // First: categorical features (one-hot encoded)
  // All keys in vocab are treated as categorical, including numeric keys
  for (const key of vocabKeys) {
    const values = vocab[key] || [];

    // Add each value from vocab
    for (const value of values) {
      const colName = `${key}_${value}`;
      columnIndex[colName] = featureColumns.length;
      featureColumns.push({ type: "categorical", key, value, name: colName });
    }

    // Add __OTHER__ for non-empty keys (to handle unknown values)
    if (values.length > 0) {
      const otherColName = `${key}___OTHER__`;
      columnIndex[otherColName] = featureColumns.length;
      featureColumns.push({
        type: "categorical",
        key,
        value: "__OTHER__",
        name: otherColName,
      });
    }
  }

  // Then: 4 numeric features (continuous values for width, step_count, incline, level)
  for (const key of numericFeatures) {
    const stats = numericStats[key] || { mean: 0, std: 1 };
    const numColName = `${key}_numeric`;
    columnIndex[numColName] = featureColumns.length;
    featureColumns.push({
      type: "numeric",
      key,
      name: numColName,
      mean: stats.mean,
      std: stats.std,
    });
  }

  featureStructure = {
    featureColumns,
    columnIndex,
    numFeatures: featureColumns.length,
    vocabKeys,
    numericFeatures,
    vocab,
  };

  console.log(
    `📊 [ONNX-Acc] Feature structure: ${featureStructure.numFeatures} features`
  );

  return featureStructure;
}

/**
 * Encode a single place's OSM features into a feature vector
 * Uses the schema format with categoricalKeys, numericKeys, and vocab
 */
function encodeFeatures(place) {
  if (!config) {
    throw new Error("Model not initialized");
  }

  const struct = buildFeatureStructure();
  const features = new Float32Array(struct.numFeatures);

  // Normalize input tags
  const normalizedTags = {};
  for (const [key, value] of Object.entries(place)) {
    if (value !== null && value !== undefined && value !== "") {
      const normalizedKey = normalizeTagKey(key);
      normalizedTags[normalizedKey] = String(value);
    }
  }

  // Process each feature column
  struct.featureColumns.forEach((col, idx) => {
    if (col.type === "categorical") {
      // One-hot encoding: set to 1 if the tag value matches
      const tagValue = normalizedTags[col.key];
      if (tagValue === col.value) {
        features[idx] = 1;
      } else if (!tagValue && col.value === "__MISSING__") {
        // Mark as missing if tag is not present
        features[idx] = 1;
      } else if (tagValue && col.value === "__OTHER__") {
        // Check if value is not in vocabulary, mark as OTHER
        const vocabValues = struct.vocab[col.key] || [];
        if (!vocabValues.includes(tagValue)) {
          features[idx] = 1;
        }
      }
    } else if (col.type === "numeric") {
      // Numeric: normalize using mean/std
      const rawValue = normalizedTags[col.key];
      if (rawValue !== undefined) {
        const numValue = parseFloat(rawValue);
        if (!isNaN(numValue)) {
          // Z-score normalization
          features[idx] = (numValue - col.mean) / (col.std || 1);
        }
      }
      // Missing numerics stay as 0 (which is the mean after normalization)
    }
  });

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
function formatFeatureName(key, value) {
  if (value) {
    const formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
    const formattedValue = value.replace(/_/g, " ");
    return `${formattedKey}: ${formattedValue}`;
  }

  // Fallback for old format
  const feature = key;
  if (feature.startsWith("has_")) {
    const tagName = feature.replace("has_", "");
    return `Has ${tagName.replace(/_/g, " ")}`;
  }

  const parts = feature.split("_");
  if (parts.length >= 2) {
    const category = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    const val = parts
      .slice(1)
      .join(" ")
      .replace(/^(\w)/, (c) => c.toUpperCase());
    return `${category}: ${val}`;
  }

  return feature.replace(/_/g, " ");
}

/**
 * Get top contributing features for a place
 * Returns the active features that likely contributed to the prediction
 */
function getContributingFeatures(place, topN = 3) {
  const struct = buildFeatureStructure();
  const features = encodeFeatures(place);

  // Collect active categorical features (value = 1)
  const activeFeatures = [];
  struct.featureColumns.forEach((col, idx) => {
    if (col.type === "categorical" && features[idx] === 1) {
      // Skip __MISSING__ and __OTHER__ unless they're the only ones
      if (col.value !== "__MISSING__" && col.value !== "__OTHER__") {
        activeFeatures.push({
          feature: col.name,
          displayName: formatFeatureName(col.key, col.value),
          key: col.key,
          value: col.value,
        });
      }
    }
  });

  // Return top N (just take first N since we don't have importance weights)
  return activeFeatures.slice(0, topN);
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

  const struct = buildFeatureStructure();
  const numFeatures = struct.numFeatures;
  const batchSize = places.length;

  // Fixed: 3 classes for wheelchair accessibility (no, limited, yes)
  const numClasses = 3;
  const labels = ["no", "limited", "yes"];

  // Encode features
  const featuresArray = encodeBatch(places);

  // Create ONNX tensor
  const inputTensor = new ort.Tensor("float32", featuresArray, [
    batchSize,
    numFeatures,
  ]);

  // Get input name from session
  const inputNames = session.inputNames;
  const inputName = inputNames[0] || "input";
  const feeds = { [inputName]: inputTensor };

  // Run inference
  const results = await session.run(feeds);

  // Get output names
  const outputNames = session.outputNames;

  // Extract probabilities from first available output
  let probData = null;
  for (const name of outputNames) {
    if (results[name] && results[name].data) {
      probData = results[name].data;
      break;
    }
  }

  // Format results
  const predictions = [];
  for (let i = 0; i < batchSize; i++) {
    let predictedClassIdx = 0;
    let maxProb = 0;
    const classProbabilities = {};

    if (probData && probData.length) {
      for (let c = 0; c < numClasses; c++) {
        const prob = probData[i * numClasses + c] ?? 0;
        classProbabilities[labels[c]] = Math.round(prob * 1000) / 1000;
        if (prob > maxProb) {
          maxProb = prob;
          predictedClassIdx = c;
        }
      }
    } else {
      // Fallback if no probability output
      labels.forEach((label, idx) => {
        classProbabilities[label] = idx === 0 ? 1.0 : 0.0;
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
    model: "accessibility_model",
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
