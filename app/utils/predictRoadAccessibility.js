/**
 * Road Accessibility Prediction Utilities
 * Uses trained ML models to predict missing accessibility features
 */

import * as tf from "@tensorflow/tfjs";

// Model and schema cache
let surfaceModel = null;
let wheelchairModel = null;
let schema = null;

const MODEL_BASE_PATH = "/models";

/**
 * Load the trained models and schema
 */
async function loadModels() {
  if (!schema) {
    try {
      const schemaResponse = await fetch(`${MODEL_BASE_PATH}/schema.json`);
      schema = await schemaResponse.json();
      console.log("📊 Accessibility schema loaded");
    } catch (error) {
      console.warn("Failed to load accessibility schema:", error);
    }
  }

  if (!wheelchairModel) {
    try {
      wheelchairModel = await tf.loadLayersModel(
        `${MODEL_BASE_PATH}/accessibility_model/model.json`
      );
      console.log("🤖 Wheelchair model loaded");
    } catch (error) {
      console.warn("Failed to load wheelchair model:", error);
    }
  }

  return { schema, wheelchairModel, surfaceModel };
}

/**
 * Parse numeric OSM values (width, incline, etc.)
 */
export function parseNumber(raw, key) {
  if (raw == null) return null;
  const s0 = String(raw).trim();
  const s = s0.toLowerCase();

  // Handle incline special cases
  if (key === "incline") {
    if (s === "up" || s === "down" || s === "steep") return null;

    // Ratio formats like "1:12" => 1/12
    const ratio = s.match(/^\s*(-?\d+(\.\d+)?)\s*:\s*(\d+(\.\d+)?)\s*$/);
    if (ratio) {
      const a = parseFloat(ratio[1]);
      const b = parseFloat(ratio[3]);
      if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b;
      return null;
    }
  }

  // Lists like "0.9;1.0" or "3-5" -> pick a sensible aggregate
  const nums = (s.match(/-?\d+(\.\d+)?/g) || [])
    .map(Number)
    .filter(Number.isFinite);
  if (!nums.length) return null;

  let x;
  if (key === "step_count") x = Math.min(...nums);
  else if (key === "width") x = Math.min(...nums);
  else x = nums[0];

  // Unit handling
  if (s.includes("mm")) x /= 1000;
  else if (s.includes("cm")) x /= 100;

  // Incline percent
  if (key === "incline" && s.includes("%")) x /= 100;

  return Number.isFinite(x) ? x : null;
}

/**
 * Encode OSM properties for ML prediction
 */
function encodeProps(props, schema) {
  if (!schema) return null;

  const vector = [];

  // Numeric features: [z, missing] per key
  for (const key of schema.numericKeys || []) {
    const x = parseNumber(props[key], key);
    const stats = schema.numericStats?.[key] || { mean: 0, std: 1 };
    const missing = x == null ? 1 : 0;
    let z = x == null ? 0 : (x - stats.mean) / stats.std;
    z = Math.max(-5, Math.min(5, z)); // Clip
    vector.push(z, missing);
  }

  // Categorical features: one-hot encoding
  for (const key of schema.categoricalKeys || []) {
    const keyVocab = schema.vocab?.[key] || [];
    const raw = props[key];
    const s = raw == null || raw === "" ? null : String(raw);

    let token = "__MISSING__";
    if (s) token = keyVocab.includes(s) ? s : "__OTHER__";

    for (const v of keyVocab) {
      vector.push(token === v ? 1 : 0);
    }
  }

  return vector;
}

/**
 * Predict wheelchair accessibility for a feature
 * @param {Object} props - OSM properties/tags
 * @returns {Object} - { prediction, confidence, probabilities }
 */
export async function predictWheelchairAccessibility(props) {
  await loadModels();

  if (!wheelchairModel || !schema) {
    return { prediction: null, confidence: 0, error: "Model not loaded" };
  }

  try {
    const vector = encodeProps(props, schema);
    if (!vector) {
      return { prediction: null, confidence: 0, error: "Failed to encode" };
    }

    const input = tf.tensor2d([vector]);
    const output = wheelchairModel.predict(input);
    const probs = await output.data();
    const predIndex = probs.indexOf(Math.max(...probs));

    input.dispose();
    output.dispose();

    const labels = ["no", "limited", "yes"];
    return {
      prediction: labels[predIndex],
      confidence: probs[predIndex],
      probabilities: {
        no: probs[0],
        limited: probs[1],
        yes: probs[2],
      },
    };
  } catch (error) {
    console.error("Prediction error:", error);
    return { prediction: null, confidence: 0, error: error.message };
  }
}

/**
 * Predict surface type for a road/path
 * Uses rule-based estimation when ML model not available
 * @param {Object} props - OSM properties
 * @returns {Object} - { prediction, confidence }
 */
export function predictSurface(props) {
  // Rule-based surface prediction
  const highway = props.highway;
  const smoothness = props.smoothness;
  const lit = props.lit;

  // Use smoothness as a strong indicator
  if (smoothness) {
    if (["excellent", "good"].includes(smoothness)) {
      return { prediction: "asphalt", confidence: 0.8 };
    }
    if (smoothness === "intermediate") {
      return { prediction: "paving_stones", confidence: 0.6 };
    }
    if (["bad", "very_bad"].includes(smoothness)) {
      return { prediction: "gravel", confidence: 0.5 };
    }
    if (["horrible", "very_horrible", "impassable"].includes(smoothness)) {
      return { prediction: "ground", confidence: 0.5 };
    }
  }

  // Highway type patterns
  const surfaceByHighway = {
    primary: { prediction: "asphalt", confidence: 0.9 },
    secondary: { prediction: "asphalt", confidence: 0.85 },
    tertiary: { prediction: "asphalt", confidence: 0.8 },
    residential: { prediction: "asphalt", confidence: 0.75 },
    living_street: { prediction: "paving_stones", confidence: 0.6 },
    pedestrian: { prediction: "paving_stones", confidence: 0.7 },
    footway: { prediction: "asphalt", confidence: 0.5 },
    path: { prediction: "ground", confidence: 0.4 },
    cycleway: { prediction: "asphalt", confidence: 0.6 },
    steps: { prediction: "concrete", confidence: 0.6 },
    track: { prediction: "gravel", confidence: 0.5 },
    service: { prediction: "asphalt", confidence: 0.6 },
  };

  if (highway && surfaceByHighway[highway]) {
    return surfaceByHighway[highway];
  }

  // Lit paths are more likely to be paved
  if (lit === "yes") {
    return { prediction: "asphalt", confidence: 0.5 };
  }

  return { prediction: "unknown", confidence: 0.2 };
}

/**
 * Predict incline category for a path
 * @param {Object} props - OSM properties
 * @returns {Object} - { category, estimatedPercent, confidence }
 */
export function predictInclineCategory(props) {
  const highway = props.highway;

  // Steps are always steep
  if (highway === "steps") {
    const stepCount = parseNumber(props.step_count, "step_count");
    if (stepCount && stepCount > 10) {
      return { category: "very_steep", estimatedPercent: 30, confidence: 0.8 };
    }
    return { category: "steep", estimatedPercent: 15, confidence: 0.7 };
  }

  // Footways and paths in urban areas tend to be relatively flat
  if (["footway", "pedestrian", "living_street"].includes(highway)) {
    return { category: "gentle", estimatedPercent: 3, confidence: 0.4 };
  }

  // Tracks can be steeper
  if (highway === "track" || highway === "path") {
    return { category: "moderate", estimatedPercent: 6, confidence: 0.3 };
  }

  // Default for roads
  return { category: "flat", estimatedPercent: 1, confidence: 0.3 };
}

/**
 * Predict path width category
 * @param {Object} props - OSM properties
 * @returns {Object} - { category, estimatedWidth, confidence }
 */
export function predictWidthCategory(props) {
  const highway = props.highway;

  // Width estimates by highway type
  const widthByHighway = {
    primary: { category: "wide", estimatedWidth: 3.5, confidence: 0.7 },
    secondary: { category: "wide", estimatedWidth: 3.0, confidence: 0.7 },
    tertiary: { category: "wide", estimatedWidth: 2.5, confidence: 0.6 },
    residential: { category: "adequate", estimatedWidth: 2.0, confidence: 0.6 },
    living_street: {
      category: "adequate",
      estimatedWidth: 2.0,
      confidence: 0.5,
    },
    pedestrian: { category: "wide", estimatedWidth: 3.0, confidence: 0.6 },
    footway: { category: "adequate", estimatedWidth: 1.5, confidence: 0.5 },
    path: { category: "narrow", estimatedWidth: 1.0, confidence: 0.4 },
    cycleway: { category: "adequate", estimatedWidth: 1.8, confidence: 0.5 },
    steps: { category: "adequate", estimatedWidth: 1.5, confidence: 0.5 },
    track: { category: "adequate", estimatedWidth: 2.0, confidence: 0.4 },
    corridor: { category: "adequate", estimatedWidth: 1.5, confidence: 0.5 },
  };

  if (highway && widthByHighway[highway]) {
    return widthByHighway[highway];
  }

  return { category: "unknown", estimatedWidth: null, confidence: 0.2 };
}

/**
 * Fill in missing accessibility data for a feature
 * @param {Object} feature - GeoJSON feature
 * @returns {Object} - Feature with predictions added
 */
export async function fillMissingAccessibilityData(feature) {
  const props = feature.properties || {};
  const predictions = {};

  // Predict surface if missing
  if (!props.surface) {
    const surfacePred = predictSurface(props);
    if (surfacePred.confidence >= 0.4) {
      predictions.predicted_surface = surfacePred.prediction;
      predictions.predicted_surface_confidence = surfacePred.confidence;
    }
  }

  // Predict incline category if missing
  if (!props.incline) {
    const inclinePred = predictInclineCategory(props);
    predictions.predicted_incline_category = inclinePred.category;
    predictions.predicted_incline_percent = inclinePred.estimatedPercent;
    predictions.predicted_incline_confidence = inclinePred.confidence;
  }

  // Predict width category if missing
  if (!props.width) {
    const widthPred = predictWidthCategory(props);
    predictions.predicted_width_category = widthPred.category;
    predictions.predicted_width_meters = widthPred.estimatedWidth;
    predictions.predicted_width_confidence = widthPred.confidence;
  }

  // Predict wheelchair accessibility if missing
  if (!props.wheelchair) {
    const wheelchairPred = await predictWheelchairAccessibility(props);
    if (wheelchairPred.prediction && wheelchairPred.confidence >= 0.5) {
      predictions.predicted_wheelchair = wheelchairPred.prediction;
      predictions.predicted_wheelchair_confidence = wheelchairPred.confidence;
    }
  }

  return {
    ...feature,
    properties: {
      ...props,
      ...predictions,
      _hasPredictions: Object.keys(predictions).length > 0,
    },
  };
}

/**
 * Calculate overall accessibility score with predictions
 * @param {Object} props - Feature properties (may include predictions)
 * @returns {number} - Score from 0-100
 */
export function calculateAccessibilityScoreWithPredictions(props) {
  let score = 50; // Base score
  let factors = 0;

  // Surface score
  const surface = props.surface || props.predicted_surface;
  if (surface) {
    const surfaceScores = {
      asphalt: 100,
      paved: 95,
      concrete: 95,
      paving_stones: 80,
      compacted: 60,
      gravel: 40,
      ground: 25,
      dirt: 20,
      grass: 15,
      mud: 10,
    };
    const surfaceScore = surfaceScores[surface.toLowerCase()] || 50;
    const confidence = props.surface
      ? 1
      : props.predicted_surface_confidence || 0.5;
    score += surfaceScore * 0.3 * confidence;
    factors += 0.3 * confidence;
  }

  // Incline score (lower is better)
  const incline = props.incline;
  if (incline) {
    const percent = Math.abs(parseNumber(incline, "incline") || 0) * 100;
    let inclineScore = 100;
    if (percent > 12) inclineScore = 10;
    else if (percent > 8) inclineScore = 30;
    else if (percent > 5) inclineScore = 60;
    else if (percent > 2) inclineScore = 85;
    score += inclineScore * 0.35;
    factors += 0.35;
  } else if (props.predicted_incline_category) {
    const categoryScores = {
      flat: 100,
      gentle: 85,
      moderate: 55,
      steep: 25,
      very_steep: 10,
    };
    const inclineScore = categoryScores[props.predicted_incline_category] || 50;
    const confidence = props.predicted_incline_confidence || 0.3;
    score += inclineScore * 0.35 * confidence;
    factors += 0.35 * confidence;
  }

  // Width score (wider is better)
  const width = props.width;
  if (width) {
    const meters = parseNumber(width, "width") || 1;
    let widthScore = 100;
    if (meters < 0.9) widthScore = 20;
    else if (meters < 1.2) widthScore = 50;
    else if (meters < 1.8) widthScore = 75;
    score += widthScore * 0.2;
    factors += 0.2;
  } else if (props.predicted_width_category) {
    const categoryScores = {
      wide: 100,
      adequate: 75,
      narrow: 45,
      very_narrow: 15,
    };
    const widthScore = categoryScores[props.predicted_width_category] || 50;
    const confidence = props.predicted_width_confidence || 0.3;
    score += widthScore * 0.2 * confidence;
    factors += 0.2 * confidence;
  }

  // Normalize score
  if (factors > 0) {
    score = (score / (1 + factors)) * 2;
  }

  // Bonus/penalty features
  if (props.lit === "yes") score += 3;
  if (props.tactile_paving === "yes") score += 5;
  if (props.ramp && props.ramp !== "no") score += 8;
  if (props.handrail === "yes") score += 3;
  if (props.kerb === "flush" || props.kerb === "lowered") score += 5;
  if (props.highway === "steps" && !props.ramp) score -= 40;

  return Math.max(0, Math.min(100, Math.round(score)));
}

const predictRoadAccessibilityModule = {
  predictWheelchairAccessibility,
  predictSurface,
  predictInclineCategory,
  predictWidthCategory,
  fillMissingAccessibilityData,
  calculateAccessibilityScoreWithPredictions,
  parseNumber,
};
export default predictRoadAccessibilityModule;
