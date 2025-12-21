/**
 * ONNX-based Road Accessibility Predictor
 * Uses onnxruntime-web to run ML models in the browser for predicting
 * missing road accessibility features (surface, smoothness, width, incline)
 */

import * as ort from "onnxruntime-web";

// Model base path
const MODEL_BASE_PATH = "/models/road_accessibility";

// Cached sessions and schema
let schema = null;
let sessions = {
  surface: null,
  smoothness: null,
  width: null,
  incline: null,
};

// Loading state
let isInitialized = false;
let initPromise = null;

// Inference queue to prevent concurrent session access
const inferenceQueues = {
  surface: Promise.resolve(),
  smoothness: Promise.resolve(),
  width: Promise.resolve(),
  incline: Promise.resolve(),
};

/**
 * Initialize ONNX models and load schema
 * @returns {Promise<boolean>} - True if initialization successful
 */
export async function initOnnxModels() {
  if (isInitialized) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log("🤖 [ONNX] Loading road accessibility models...");

      // Load schema first
      const schemaResponse = await fetch(`${MODEL_BASE_PATH}/schema.json`);
      if (!schemaResponse.ok) {
        throw new Error(`Failed to load schema: ${schemaResponse.status}`);
      }
      schema = await schemaResponse.json();
      console.log("📄 [ONNX] Schema loaded:", Object.keys(schema.models || {}));

      // Configure ONNX Runtime for browser
      ort.env.wasm.wasmPaths =
        "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";

      // Load available models
      for (const [modelName, modelInfo] of Object.entries(
        schema.models || {}
      )) {
        try {
          const modelPath = `${MODEL_BASE_PATH}/${modelInfo.file}`;
          sessions[modelName] = await ort.InferenceSession.create(modelPath, {
            executionProviders: ["wasm"],
            graphOptimizationLevel: "all",
          });
          console.log(`✅ [ONNX] Loaded ${modelName} model`);
        } catch (error) {
          console.warn(`⚠️ [ONNX] Failed to load ${modelName}:`, error.message);
        }
      }

      isInitialized = true;
      return true;
    } catch (error) {
      console.error("❌ [ONNX] Initialization failed:", error);
      return false;
    }
  })();

  return initPromise;
}

/**
 * Check if ONNX models are loaded
 */
export function isOnnxReady() {
  return isInitialized;
}

/**
 * Get available model names
 */
export function getAvailableModels() {
  if (!schema) return [];
  return Object.keys(schema.models || {}).filter(
    (name) => sessions[name] !== null
  );
}

/**
 * Create feature vector from OSM road properties
 * @param {Object} props - OSM road properties
 * @param {Array} featureColumns - Expected feature column names
 * @returns {Float32Array} - Feature vector for model input
 */
function createFeatureVector(props, featureColumns) {
  const vector = new Float32Array(featureColumns.length);

  for (let i = 0; i < featureColumns.length; i++) {
    const col = featureColumns[i];

    if (col.startsWith("hw_")) {
      // Highway type one-hot encoding
      const hwType = col.replace("hw_", "");
      vector[i] = props.highway === hwType ? 1 : 0;
    } else if (col.startsWith("surf_")) {
      // Surface type one-hot encoding
      const surfType = col.replace("surf_", "");
      vector[i] = standardizeSurface(props.surface) === surfType ? 1 : 0;
    } else if (col.startsWith("smooth_")) {
      // Smoothness one-hot encoding
      const smoothType = col.replace("smooth_", "");
      vector[i] = props.smoothness === smoothType ? 1 : 0;
    } else if (col.endsWith("_binary")) {
      // Binary features (lit, tactile_paving, oneway)
      const key = col.replace("_binary", "");
      const val = props[key];
      vector[i] = val === "yes" ? 1 : val === "no" ? 0 : -1;
    } else if (col.startsWith("has_")) {
      // Presence features
      const key = col.replace("has_", "");
      vector[i] = props[key] != null && props[key] !== "" ? 1 : 0;
    } else if (col === "width_m") {
      // Width in meters
      vector[i] = parseWidth(props.width) || 0;
    } else if (col === "incline_pct") {
      // Incline percentage
      vector[i] = parseIncline(props.incline) || 0;
    } else {
      // Unknown column
      vector[i] = 0;
    }
  }

  return vector;
}

/**
 * Standardize surface type to match training data
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

  // Percentage: "5%"
  const pctMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*%?$/);
  if (pctMatch) return parseFloat(pctMatch[1]);

  // Ratio: "1:12"
  const ratioMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (ratioMatch) {
    const a = parseFloat(ratioMatch[1]);
    const b = parseFloat(ratioMatch[2]);
    if (b !== 0) return (a / b) * 100;
  }

  return null;
}

/**
 * Run inference for a single model (internal, not queued)
 * @param {string} modelName - Model name (surface, smoothness, width, incline)
 * @param {Object} props - OSM road properties
 * @returns {Promise<Object>} - Prediction result
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

    // Get the actual input name from the session
    const inputName = session.inputNames[0] || "features";
    const feeds = { [inputName]: inputTensor };

    const outputs = await session.run(feeds);
    const outputNames = Object.keys(outputs);

    // Get contributing features (non-zero features)
    const contributingFeatures = getContributingFeatures(
      featureVector,
      modelInfo.feature_columns,
      props
    );

    // Get model metrics from schema
    const modelMetrics = modelInfo.metrics || {};

    if (modelInfo.type === "classifier") {
      // For classifiers, output contains class probabilities
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

      // Get top 3 alternatives
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
      // For regressors, output is the predicted value
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
    console.error(`[ONNX] Inference error for ${modelName}:`, error);
    return { prediction: null, error: error.message };
  }
}

/**
 * Get top N alternative predictions (for classifiers)
 * @param {Object} probabilities - Class probabilities
 * @param {string} prediction - Top prediction
 * @param {number} n - Number of alternatives
 * @returns {Array} - Array of {class, probability}
 */
function getTopAlternatives(probabilities, prediction, n = 3) {
  if (!probabilities) return [];

  return Object.entries(probabilities)
    .filter(([cls]) => cls !== prediction)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .filter(([, prob]) => prob >= 0.05) // Only show if >= 5% probability
    .map(([cls, prob]) => ({ class: cls, probability: prob }));
}

/**
 * Get features that contributed to the prediction
 * @param {Float32Array} featureVector - Feature values
 * @param {Array} featureColumns - Feature column names
 * @param {Object} props - Original OSM properties
 * @returns {Array} - Array of {feature, value, description}
 */
function getContributingFeatures(featureVector, featureColumns, props) {
  const contributing = [];

  for (let i = 0; i < featureColumns.length; i++) {
    const col = featureColumns[i];
    const val = featureVector[i];

    // Skip zero/missing values
    if (val === 0 || val === -1) continue;

    let description = "";
    let displayValue = val;

    if (col.startsWith("hw_")) {
      const hwType = col.replace("hw_", "");
      description = `Highway type: ${formatHighwayType(hwType)}`;
      displayValue = "✓";
    } else if (col.startsWith("surf_")) {
      const surfType = col.replace("surf_", "");
      description = `Surface: ${surfType}`;
      displayValue = "✓";
    } else if (col.startsWith("smooth_")) {
      const smoothType = col.replace("smooth_", "");
      description = `Smoothness: ${smoothType}`;
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
      const key = col.replace("has_", "");
      description = `Has ${key.replace(/_/g, " ")} tag`;
      displayValue = "✓";
    } else if (col === "width_m" && val > 0) {
      description = `Width: ${val.toFixed(1)}m`;
      displayValue = `${val.toFixed(1)}m`;
    } else if (col === "incline_pct" && val !== 0) {
      description = `Incline: ${val.toFixed(1)}%`;
      displayValue = `${val.toFixed(1)}%`;
    } else {
      continue; // Skip unknown features
    }

    contributing.push({
      feature: col,
      value: displayValue,
      description,
    });
  }

  // Sort by importance (highway type first, then others)
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
    .slice(0, 5); // Top 5 contributors
}

/**
 * Format highway type for display
 */
function formatHighwayType(type) {
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
}

/**
 * Run inference with queue to prevent concurrent session access
 * ONNX WASM backend doesn't support concurrent inference on the same session
 * @param {string} modelName - Model name
 * @param {Object} props - OSM road properties
 * @returns {Promise<Object>} - Prediction result
 */
async function runInference(modelName, props) {
  // Chain this inference to the queue for this model
  const previousPromise = inferenceQueues[modelName] || Promise.resolve();

  let resolveResult;
  const resultPromise = new Promise((resolve) => {
    resolveResult = resolve;
  });

  // Update queue to include this inference
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
 * Predict all missing accessibility features for a road
 * @param {Object} props - OSM road properties
 * @returns {Promise<Object>} - Enhanced properties with predictions
 */
export async function predictRoadFeatures(props) {
  if (!isInitialized) {
    await initOnnxModels();
  }

  const result = { ...props };
  const predictions = {};

  // Predict surface if missing
  if (!props.surface && sessions.surface) {
    const surfacePred = await runInference("surface", props);
    if (surfacePred.prediction) {
      result.surface = surfacePred.prediction;
      result._surfacePredicted = true;
      result._surfaceConfidence = surfacePred.confidence;
      result._surfaceAlternatives = surfacePred.topAlternatives;
      result._surfaceContributors = surfacePred.contributingFeatures;
      result._surfaceMetrics = surfacePred.modelMetrics;
      predictions.surface = surfacePred;
    }
  }

  // Predict smoothness if missing
  if (!props.smoothness && sessions.smoothness) {
    const smoothnessPred = await runInference("smoothness", props);
    if (smoothnessPred.prediction) {
      result.smoothness = smoothnessPred.prediction;
      result._smoothnessPredicted = true;
      result._smoothnessConfidence = smoothnessPred.confidence;
      result._smoothnessAlternatives = smoothnessPred.topAlternatives;
      result._smoothnessContributors = smoothnessPred.contributingFeatures;
      result._smoothnessMetrics = smoothnessPred.modelMetrics;
      predictions.smoothness = smoothnessPred;
    }
  }

  // Predict width if missing
  if (!props.width && sessions.width) {
    const widthPred = await runInference("width", props);
    if (widthPred.prediction != null && widthPred.prediction > 0) {
      result.width = `${widthPred.prediction.toFixed(1)} m`;
      result._widthPredicted = true;
      result._widthValue = widthPred.prediction;
      result._widthContributors = widthPred.contributingFeatures;
      result._widthMetrics = widthPred.modelMetrics;
      predictions.width = widthPred;
    }
  }

  // Predict incline if missing
  if (!props.incline && sessions.incline) {
    const inclinePred = await runInference("incline", props);
    if (inclinePred.prediction != null) {
      result.incline = `${inclinePred.prediction.toFixed(1)}%`;
      result._inclinePredicted = true;
      result._inclineValue = inclinePred.prediction;
      result._inclineContributors = inclinePred.contributingFeatures;
      result._inclineMetrics = inclinePred.modelMetrics;
      predictions.incline = inclinePred;
    }
  }

  result._predictions = predictions;
  result._hasPredictions = Object.keys(predictions).length > 0;

  return result;
}

/**
 * Batch predict for multiple roads (more efficient)
 * @param {Array<Object>} roadsList - Array of OSM road properties
 * @returns {Promise<Array<Object>>} - Enhanced properties with predictions
 */
export async function predictRoadFeaturesBatch(roadsList) {
  if (!isInitialized) {
    await initOnnxModels();
  }

  // Process in parallel with concurrency limit
  const BATCH_SIZE = 50;
  const results = [];

  for (let i = 0; i < roadsList.length; i += BATCH_SIZE) {
    const batch = roadsList.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((props) => predictRoadFeatures(props))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Get prediction confidence color
 * @param {number} confidence - Confidence value 0-1
 * @returns {string} - Color for visualization
 */
export function getConfidenceColor(confidence) {
  if (confidence >= 0.8) return "#2ecc71"; // Green - high confidence
  if (confidence >= 0.6) return "#f1c40f"; // Yellow - medium confidence
  if (confidence >= 0.4) return "#e67e22"; // Orange - low confidence
  return "#e74c3c"; // Red - very low confidence
}
