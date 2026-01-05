/**
 * Road Inference Web Worker Client
 * Provides a Promise-based API for communicating with the road inference web worker
 * This allows ONNX model inference to run in a background thread
 */

// Worker instance
let worker = null;
let workerInitPromise = null;
let messageId = 0;
const pendingRequests = new Map();

// State tracking
let isWorkerInitialized = false;
let isWorkerReady = false;
let isWasmWarmedUp = false;
let availableModels = [];

/**
 * Initialize the web worker
 * @returns {Promise<boolean>} - True if worker initialized successfully
 */
export async function initRoadInferenceWorker() {
  if (worker) {
    return workerInitPromise;
  }

  // Check if we're in a browser environment
  if (globalThis.window === undefined || globalThis.Worker === undefined) {
    console.warn(
      "[RoadWorkerClient] Web Workers not supported in this environment"
    );
    return false;
  }

  workerInitPromise = new Promise((resolve, reject) => {
    try {
      // Create web worker
      worker = new Worker("/workers/roadInferenceWorker.js");

      // Handle messages from worker
      worker.onmessage = (event) => {
        const { type, id, ...data } = event.data;

        // Handle initialization result
        if (type === "initResult") {
          isWorkerReady = data.success;
          availableModels = data.models || [];
          console.log(
            "🤖 [RoadWorkerClient] Worker initialized, models:",
            availableModels
          );
        }

        // Resolve pending request
        if (id !== undefined && pendingRequests.has(id)) {
          const { resolve: res, reject: rej } = pendingRequests.get(id);
          pendingRequests.delete(id);

          if (type === "error") {
            rej(new Error(data.error));
          } else {
            res(data);
          }
        }
      };

      // Handle worker errors
      worker.onerror = (error) => {
        console.error("[RoadWorkerClient] Worker error:", error);
        reject(error);
      };

      isWorkerInitialized = true;
      console.log("🤖 [RoadWorkerClient] Worker created successfully");
      resolve(true);
    } catch (error) {
      console.error("[RoadWorkerClient] Failed to create worker:", error);
      reject(error);
    }
  });

  return workerInitPromise;
}

/**
 * Send a message to the worker and wait for response
 * @param {string} type - Message type
 * @param {Object} data - Message data
 * @returns {Promise<any>} - Response from worker
 */
function sendMessage(type, data = {}) {
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(
        new Error(
          "Worker not initialized. Call initRoadInferenceWorker() first."
        )
      );
      return;
    }

    const id = messageId++;
    pendingRequests.set(id, { resolve, reject });

    worker.postMessage({ type, id, data });
  });
}

/**
 * Initialize ONNX models in the worker
 * @returns {Promise<{success: boolean, models: string[]}>}
 */
export async function initOnnxModels() {
  const start = performance.now();
  console.log(`⏱️ [PERF-CLIENT] initOnnxModels START`);

  if (!isWorkerInitialized) {
    const initStart = performance.now();
    await initRoadInferenceWorker();
    console.log(
      `⏱️ [PERF-CLIENT] Worker creation: ${(
        performance.now() - initStart
      ).toFixed(0)}ms`
    );
  }

  const msgStart = performance.now();
  const result = await sendMessage("init");
  console.log(
    `⏱️ [PERF-CLIENT] Worker init message round-trip: ${(
      performance.now() - msgStart
    ).toFixed(0)}ms`
  );

  isWorkerReady = result.success;
  availableModels = result.models || [];
  console.log(
    `⏱️ [PERF-CLIENT] initOnnxModels TOTAL: ${(
      performance.now() - start
    ).toFixed(0)}ms, models: ${availableModels.join(", ")}`
  );
  return result;
}

/**
 * Preload ONNX models in background (non-blocking)
 * @returns {Promise<boolean>}
 */
export async function preloadOnnxModelsInBackground() {
  if (!isWorkerInitialized) {
    await initRoadInferenceWorker();
  }

  // Don't await - let it run in background
  initOnnxModels()
    .then((result) => {
      console.log(
        "🤖 [RoadWorkerClient] Background model preload complete:",
        result.models
      );
    })
    .catch((error) => {
      console.warn("🤖 [RoadWorkerClient] Background preload failed:", error);
    });

  return true;
}

/**
 * Warm up WASM compiler early (loads smallest model to trigger compilation)
 * Call this on page load or idle to improve perceived performance
 * @returns {Promise<boolean>}
 */
export async function warmupWasm() {
  if (isWasmWarmedUp) {
    console.log("🤖 [ONNX] WASM already warmed up");
    return true;
  }

  const start = performance.now();
  console.log("⏱️ [PERF-CLIENT] warmupWasm START");

  if (!isWorkerInitialized) {
    await initRoadInferenceWorker();
  }

  try {
    const result = await sendMessage("warmup");
    isWasmWarmedUp = result.success;
    console.log(
      `⏱️ [PERF-CLIENT] warmupWasm DONE: ${(performance.now() - start).toFixed(
        0
      )}ms, success: ${result.success}`
    );
    return result.success;
  } catch (error) {
    console.warn("🤖 [RoadWorkerClient] WASM warmup failed:", error);
    return false;
  }
}

/**
 * Start WASM warmup in background using requestIdleCallback
 * This runs during browser idle time for minimal UI impact
 */
export function warmupWasmOnIdle() {
  if (typeof globalThis.window === "undefined") return;
  if (isWasmWarmedUp) return;

  const doWarmup = () => {
    console.log("🤖 [ONNX] Starting WASM warmup on idle...");
    warmupWasm().catch((err) => {
      console.warn("🤖 [ONNX] Idle warmup failed:", err);
    });
  };

  if ("requestIdleCallback" in globalThis) {
    // Use requestIdleCallback with a timeout to ensure it runs
    globalThis.requestIdleCallback(doWarmup, { timeout: 3000 });
  } else {
    // Fallback: use setTimeout for browsers without requestIdleCallback
    setTimeout(doWarmup, 1000);
  }
}

/**
 * Check if ONNX models are ready
 * @returns {Promise<boolean>}
 */
export async function isOnnxReady() {
  if (!isWorkerInitialized) {
    return false;
  }

  if (isWorkerReady) {
    return true;
  }

  try {
    const result = await sendMessage("isReady");
    isWorkerReady = result.ready;
    return result.ready;
  } catch {
    return false;
  }
}

/**
 * Synchronous check if worker is ready (uses cached state)
 * @returns {boolean}
 */
export function isOnnxReadySync() {
  return isWorkerReady;
}

/**
 * Get available models
 * @returns {Promise<string[]>}
 */
export async function getAvailableModels() {
  if (!isWorkerInitialized) {
    return [];
  }

  if (availableModels.length > 0) {
    return availableModels;
  }

  try {
    const result = await sendMessage("getAvailableModels");
    availableModels = result.models || [];
    return availableModels;
  } catch {
    return [];
  }
}

/**
 * Predict road features using ONNX models
 * @param {Object} props - OSM road properties
 * @returns {Promise<Object>} - Enhanced properties with predictions
 */
export async function predictRoadFeatures(props) {
  if (!isWorkerInitialized) {
    await initRoadInferenceWorker();
  }

  const response = await sendMessage("predict", { props });
  return response.result;
}

/**
 * Batch predict road features
 * @param {Array<Object>} roadsList - Array of OSM road properties
 * @returns {Promise<Array<Object>>} - Enhanced properties with predictions
 */
export async function predictRoadFeaturesBatch(roadsList) {
  const start = performance.now();
  console.log(
    `⏱️ [PERF-CLIENT] predictRoadFeaturesBatch START: ${roadsList.length} items`
  );

  if (!isWorkerInitialized) {
    const initStart = performance.now();
    await initRoadInferenceWorker();
    console.log(
      `⏱️ [PERF-CLIENT] Worker init: ${(performance.now() - initStart).toFixed(
        0
      )}ms`
    );
  }

  const msgStart = performance.now();
  const response = await sendMessage("predictBatch", { roadsList });
  console.log(
    `⏱️ [PERF-CLIENT] Worker round-trip: ${(
      performance.now() - msgStart
    ).toFixed(0)}ms`
  );
  console.log(
    `⏱️ [PERF-CLIENT] predictRoadFeaturesBatch TOTAL: ${(
      performance.now() - start
    ).toFixed(0)}ms`
  );

  return response.results;
}

/**
 * Clear prediction cache
 * @returns {Promise<void>}
 */
export async function clearPredictionCache() {
  if (!isWorkerInitialized) {
    return;
  }

  await sendMessage("clearPredictionCache");
}

/**
 * Clear model cache
 * @returns {Promise<void>}
 */
export async function clearModelCache() {
  if (!isWorkerInitialized) {
    return;
  }

  await sendMessage("clearModelCache");
}

/**
 * Get model cache statistics
 * @returns {Promise<Object>}
 */
export async function getModelCacheStats() {
  if (!isWorkerInitialized) {
    return { models: [], totalSizeMB: "0", count: 0 };
  }

  const response = await sendMessage("getModelCacheStats");
  return response.stats;
}

/**
 * Terminate the worker
 */
export function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
    isWorkerInitialized = false;
    isWorkerReady = false;
    availableModels = [];
    pendingRequests.clear();
    workerInitPromise = null;
    console.log("🤖 [RoadWorkerClient] Worker terminated");
  }
}

/**
 * Get confidence color (utility function matching onnxRoadPredictor)
 * @param {number} confidence - Confidence value 0-1
 * @returns {string} - Color for visualization
 */
export function getConfidenceColor(confidence) {
  if (confidence >= 0.8) return "#2ecc71"; // Green - high confidence
  if (confidence >= 0.6) return "#f1c40f"; // Yellow - medium confidence
  if (confidence >= 0.4) return "#e67e22"; // Orange - low confidence
  return "#e74c3c"; // Red - very low confidence
}
