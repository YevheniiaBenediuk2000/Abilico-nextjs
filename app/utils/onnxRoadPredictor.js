/**
 * ONNX-based Road Accessibility Predictor
 * Now delegates to a Web Worker for better performance and non-blocking UI
 * The worker handles ONNX model loading and inference in a background thread
 *
 * This module maintains the same API as before but routes calls to the worker
 */

import {
  initRoadInferenceWorker,
  initOnnxModels as workerInitOnnxModels,
  isOnnxReadySync,
  getAvailableModels as workerGetAvailableModels,
  predictRoadFeatures as workerPredictRoadFeatures,
  predictRoadFeaturesBatch as workerPredictRoadFeaturesBatch,
  clearPredictionCache as workerClearPredictionCache,
  clearModelCache as workerClearModelCache,
  getModelCacheStats as workerGetModelCacheStats,
  getConfidenceColor as workerGetConfidenceColor,
} from "./roadInferenceWorkerClient.js";

// Track initialization state locally for quick checks
let localInitialized = false;
let localInitPromise = null;

/**
 * Initialize ONNX models via web worker
 * @returns {Promise<boolean>} - True if initialization successful
 */
export async function initOnnxModels() {
  if (localInitialized) {
    return true;
  }
  if (localInitPromise) {
    return localInitPromise;
  }

  localInitPromise = (async () => {
    try {
      // Initialize the worker
      await initRoadInferenceWorker();

      // Load models in worker
      const result = await workerInitOnnxModels();

      if (result.success) {
        localInitialized = true;

        return true;
      } else {
        console.warn("🤖 [ONNX] Worker model initialization failed");
        return false;
      }
    } catch (error) {
      console.error("🤖 [ONNX] Worker initialization error:", error);
      localInitPromise = null;
      return false;
    }
  })();

  return localInitPromise;
}

/**
 * Check if ONNX models are loaded (synchronous check using cached state)
 * @returns {boolean}
 */
export function isOnnxReady() {
  return localInitialized || isOnnxReadySync();
}

/**
 * Get available model names
 * @returns {string[]}
 */
export function getAvailableModels() {
  // For synchronous access, return cached value or empty array
  // The worker client maintains this state
  return workerGetAvailableModels();
}

/**
 * Predict all missing accessibility features for a road
 * Delegates to web worker for non-blocking inference
 * @param {Object} props - OSM road properties
 * @returns {Promise<Object>} - Enhanced properties with predictions
 */
export async function predictRoadFeatures(props) {
  // Ensure worker is initialized
  if (!localInitialized) {
    await initOnnxModels();
  }

  try {
    return await workerPredictRoadFeatures(props);
  } catch (error) {
    console.error("🤖 [ONNX] Prediction error:", error);
    return { ...props, _predictionError: error.message };
  }
}

/**
 * Batch predict for multiple roads (more efficient)
 * @param {Array<Object>} roadsList - Array of OSM road properties
 * @returns {Promise<Array<Object>>} - Enhanced properties with predictions
 */
export async function predictRoadFeaturesBatch(roadsList) {
  // Ensure worker is initialized
  if (!localInitialized) {
    await initOnnxModels();
  }

  try {
    return await workerPredictRoadFeaturesBatch(roadsList);
  } catch (error) {
    console.error("🤖 [ONNX] Batch prediction error:", error);
    return roadsList.map((props) => ({
      ...props,
      _predictionError: error.message,
    }));
  }
}

/**
 * Clear all cached predictions
 * @returns {Promise<void>}
 */
export async function clearPredictionCache() {
  try {
    await workerClearPredictionCache();
    console.log("🤖 [ONNX] Prediction cache cleared");
  } catch (error) {
    console.warn("🤖 [ONNX] Failed to clear prediction cache:", error);
  }
}

/**
 * Clear the ONNX model cache from IndexedDB
 * @returns {Promise<void>}
 */
export async function clearModelCache() {
  try {
    await workerClearModelCache();
    console.log("🤖 [ONNX] Model cache cleared");
  } catch (error) {
    console.warn("🤖 [ONNX] Failed to clear model cache:", error);
  }
}

/**
 * Get model cache statistics
 * @returns {Promise<Object>} - Cache stats { models, totalSizeMB }
 */
export async function getModelCacheStats() {
  try {
    return await workerGetModelCacheStats();
  } catch (error) {
    console.warn("🤖 [ONNX] Failed to get cache stats:", error);
    return { models: [], totalSizeMB: "0", count: 0 };
  }
}

/**
 * Get prediction confidence color
 * @param {number} confidence - Confidence value 0-1
 * @returns {string} - Color for visualization
 */
export function getConfidenceColor(confidence) {
  return workerGetConfidenceColor(confidence);
}

// Re-export preload and warmup functions for background initialization
export {
  preloadOnnxModelsInBackground,
  warmupWasm,
  warmupWasmOnIdle,
} from "./roadInferenceWorkerClient.js";
