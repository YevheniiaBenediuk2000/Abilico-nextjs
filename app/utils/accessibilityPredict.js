/**
 * Client-side utility for accessibility predictions
 *
 * Use this module to predict wheelchair accessibility for places
 * based on their OSM features.
 *
 * Now uses client-side ONNX inference (onnxruntime-web) instead of server API.
 *
 * @example
 * import { predictAccessibility, predictAccessibilityBatch } from '@/app/utils/accessibilityPredict';
 *
 * // Single prediction
 * const result = await predictAccessibility({
 *   amenity: 'restaurant',
 *   building: 'yes',
 *   automatic_door: 'yes'
 * });
 * console.log(result.label, result.probability); // "accessible", 0.85
 *
 * // Batch prediction
 * const results = await predictAccessibilityBatch([
 *   { amenity: 'restaurant', building: 'yes' },
 *   { shop: 'supermarket', entrance: 'main' }
 * ]);
 */

import {
  predictAccessibility as onnxPredict,
  predictSingle,
  initAccessibilityModel,
  isAccessibilityModelReady,
  preloadAccessibilityModel,
} from "./onnxAccessibilityPredictor.js";

// Re-export preload function for app initialization
export { preloadAccessibilityModel, isAccessibilityModelReady };

/**
 * Predict accessibility for a single place.
 *
 * @param {Object} place - OSM features of the place
 * @param {Object} options - Additional options (explain option is ignored in client-side mode)
 * @returns {Promise<{label: string, probability: number, confidence: string, basedOn?: Array}>}
 */
export async function predictAccessibility(place, options = {}) {
  return predictSingle(place);
}

/**
 * Predict accessibility for multiple places in a single request.
 * More efficient than making individual calls for each place.
 *
 * @param {Array<Object>} places - Array of places with OSM features
 * @param {Object} options - Additional options (explain option is ignored in client-side mode)
 * @returns {Promise<{predictions: Array, model: string}>}
 */
export async function predictAccessibilityBatch(places, options = {}) {
  return onnxPredict(places);
}

/**
 * Extract OSM features relevant for accessibility prediction from a place object.
 * Use this to prepare data from the Overpass API or other sources.
 *
 * @param {Object} osmPlace - Raw OSM place data (may have tags nested)
 * @returns {Object} - Cleaned features object for prediction
 */
export function extractAccessibilityFeatures(osmPlace) {
  const relevantTags = [
    "amenity",
    "shop",
    "tourism",
    "building",
    "entrance",
    "door",
    "automatic_door",
    "access",
    "level",
    "healthcare",
    "office",
    "bench",
    "changing_table",
    "indoor",
    "leisure",
  ];

  const features = {};

  // Handle both { tags: { amenity: ... } } and { amenity: ... } formats
  const tags = osmPlace.tags || osmPlace;

  for (const tag of relevantTags) {
    const value = tags[tag] || tags[`tags.${tag}`];
    if (value !== null && value !== undefined && value !== "") {
      features[tag] = value;
    }
  }

  return features;
}

/**
 * Get a human-readable accessibility label with color coding.
 *
 * @param {string} label - Model output label ("accessible" or "not_accessible")
 * @param {number} probability - Prediction probability
 * @param {string} confidence - Confidence level ("high", "medium", "low")
 * @returns {{text: string, color: string, icon: string}}
 */
export function getAccessibilityDisplay(label, probability, confidence) {
  if (label === "accessible") {
    if (confidence === "high") {
      return {
        text: "Likely Accessible",
        color: "#16a34a", // green
        icon: "♿",
      };
    } else {
      return {
        text: "Possibly Accessible",
        color: "#eab308", // yellow
        icon: "♿?",
      };
    }
  } else {
    if (confidence === "high") {
      return {
        text: "Likely Not Accessible",
        color: "#dc2626", // red
        icon: "⚠️",
      };
    } else {
      return {
        text: "Possibly Not Accessible",
        color: "#f97316", // orange
        icon: "⚠️",
      };
    }
  }
}

export default {
  predictAccessibility,
  predictAccessibilityBatch,
  extractAccessibilityFeatures,
  getAccessibilityDisplay,
};
