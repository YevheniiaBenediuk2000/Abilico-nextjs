export const DEFAULT_ZOOM = 14;
export const SHOW_PLACES_ZOOM = 13;

export const EXCLUDED_PROPS = new Set([
  "boundingbox",
  "licence",
  "place_id",
  "osm_id",
  "osm_type",
  "lat",
  "lon",
  "class",
  "place_rank",
  "importance",
  "id",
  "source",
  "created_by",

  // UI: Hide noisy building/roof appearance fields from Place Details → Overview
  // (these auto-render as "Building Colour", "Roof Colour", "Roof Shape")
  "building:colour",
  "building:color",
  "roof:colour",
  "roof:color",
  "roof:shape",
  // Some data sources normalize ":" to "_" — cover those too.
  "building_colour",
  "building_color",
  "roof_colour",
  "roof_color",
  "roof_shape",

  // UI: Hide "Target" rows (e.g., target=lt) from Place Details → Overview
  "target",

  // UI: Hide "Short Name" from Place Details → Overview (it's shown as a chip in the header instead)
  "short_name",
  "short-name",
  "shortName",
]);

export const pRetryConfig = { retries: 3, factor: 2, minTimeout: 400 };

export const placeClusterConfig = {
  chunkedLoading: true,
  // Spread marker creation work across frames for smoother initial load when there are many POIs.
  chunkInterval: 60,
  chunkDelay: 30,
  maxClusterRadius: (zoom) => {
    // Slightly more clustering for a “Google-like” feel.
    // Higher value => more clustering (fewer individual markers).
    // if (zoom >= 18) return 22;
    // if (zoom >= 16) return 50;
    // return 60;

    if (zoom >= 18) return 15;
    return 0;
  },
  // disableClusteringAtZoom: 14,
  spiderfyOnMaxZoom: true,
};

export const BADGE_COLOR_BY_TIER = {
  designated: "#16a34a", // green
  yes: "#6cc24a", // green (darker)
  limited: "var(--bs-warning)", // amber
  unknown: "var(--bs-tertiary-color)", // slate
  no: "var(--bs-danger)", // red
};

// Colors for ML-predicted accessibility (same hues but used with dashed border)
export const PREDICTED_BADGE_COLOR_BY_TIER = {
  accessible: "#16a34a", // green - maps to designated/yes
  limited: "#ca8a04", // amber/yellow
  not_accessible: "#dc2626", // red
};

export const ACCESSIBILITY_KEYWORDS_CLASSIFICATION_THRESHOLD = 0.985;

// ML Prediction threshold - only show colored predictions above this probability
export const PREDICTION_PROBABILITY_THRESHOLD = 0.42;

// Brand Colors
export const PRIMARY_BLUE = "#0c77d2"; // Main brand blue color

// UI Constants
export const DIALOG_BORDER_RADIUS = 3; // MUI spacing unit (24px) - more rounded dialogs

export const ACCESSIBILITY_LABELS_IN_REVIEWS = [
  // Entrance & approach
  "ramp at entrance",
  "no ramp",

  "automatic door",
  "heavy door",

  "wide doorway",
  "narrow doorway",

  // Interior circulation
  "elevator available",
  "no elevator",
  "elevator out of order",

  // Restrooms
  "accessible toilet",
  "no accessible toilet",

  // Parking & transport
  "accessible parking",
  "no accessible parking",
];
