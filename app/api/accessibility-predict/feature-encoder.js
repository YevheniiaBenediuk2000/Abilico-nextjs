/**
 * Feature Encoder for Accessibility Prediction Model
 *
 * Converts OSM place data into the feature vector format expected
 * by the trained ONNX model.
 */

import OnnxModelSingleton from "./onnx-model.js";

/**
 * Normalize tag key to match training format.
 * OSM data may have different formats (e.g., "amenity" vs "tags.amenity")
 */
function normalizeTagKey(key) {
  // Remove 'tags.' prefix if present
  return key.replace(/^tags\./, "");
}

/**
 * Encode a single place's OSM features into a feature vector.
 *
 * @param {Object} place - OSM place data with tags
 * @returns {Float32Array} - Feature vector for model inference
 */
export function encodeFeatures(place) {
  const config = OnnxModelSingleton.getConfig();
  const { feature_columns, encoding_info } = config;

  // Initialize all features to 0
  const features = new Float32Array(feature_columns.length);

  // Create a lookup for feature column indices
  const columnIndex = {};
  feature_columns.forEach((col, idx) => {
    columnIndex[col] = idx;
  });

  // Normalize the input: support both { amenity: "restaurant" } and { "tags.amenity": "restaurant" }
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
  for (const hasFeature of encoding_info.has_features) {
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
    encoding_info.categorical_features
  )) {
    const tagValue = normalizedTags[category];
    if (tagValue) {
      // Truncate to match training encoding (first 20 chars)
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
 * Encode multiple places into a batch feature matrix.
 *
 * @param {Array<Object>} places - Array of OSM place data
 * @returns {Float32Array} - Flattened feature matrix (batch_size * num_features)
 */
export function encodeBatch(places) {
  const config = OnnxModelSingleton.getConfig();
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
 * Get feature names and their current values for debugging/explanation.
 *
 * @param {Object} place - OSM place data
 * @returns {Array<{feature: string, value: number}>} - Active features
 */
export function explainFeatures(place) {
  const config = OnnxModelSingleton.getConfig();
  const features = encodeFeatures(place);

  const activeFeatures = [];
  config.feature_columns.forEach((col, idx) => {
    if (features[idx] > 0) {
      activeFeatures.push({
        feature: col,
        value: features[idx],
      });
    }
  });

  return activeFeatures;
}

/**
 * Get the top contributing features for a prediction.
 * Uses the model's feature importances combined with which features are active.
 *
 * @param {Object} place - OSM place data
 * @param {number} topN - Number of top features to return (default: 5)
 * @returns {Array<{feature: string, importance: number, displayName: string}>} - Top contributing features
 */
export function getContributingFeatures(place, topN = 5) {
  const config = OnnxModelSingleton.getConfig();
  const features = encodeFeatures(place);
  const importances = config.feature_importances || {};

  // Get active features with their importances
  const activeWithImportance = [];
  config.feature_columns.forEach((col, idx) => {
    if (features[idx] > 0 && importances[col]) {
      // Convert feature column name to human-readable format
      const displayName = formatFeatureName(col);
      activeWithImportance.push({
        feature: col,
        importance: importances[col],
        displayName,
      });
    }
  });

  // Sort by importance (descending) and take top N
  activeWithImportance.sort((a, b) => b.importance - a.importance);
  return activeWithImportance.slice(0, topN);
}

/**
 * Format a feature column name into a human-readable display name.
 * e.g., "amenity_restaurant" -> "Amenity: Restaurant"
 *       "has_automatic_door" -> "Has Automatic Door"
 */
function formatFeatureName(feature) {
  if (feature.startsWith("has_")) {
    // "has_automatic_door" -> "Has Automatic Door"
    const tagName = feature.replace("has_", "");
    return `Has ${tagName.replace(/_/g, " ")}`;
  }

  // "amenity_restaurant" -> "Amenity: Restaurant"
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
