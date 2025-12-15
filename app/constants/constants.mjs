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
]);

export const pRetryConfig = { retries: 3, factor: 2, minTimeout: 400 };

export const placeClusterConfig = {
  chunkedLoading: true,
  maxClusterRadius: (zoom) => {
    if (zoom === 18) {
      return 15;
    }
    return 40;
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

export const ACCESSIBILITY_KEYWORDS_CLASSIFICATION_THRESHOLD = 0.985;

// Brand Colors
export const PRIMARY_BLUE = "#0a3f89"; // Main brand blue color

// UI Constants
export const DIALOG_BORDER_RADIUS = 3; // MUI spacing unit (24px) - more rounded dialogs

export const ACCESSIBILITY_LABELS_IN_REVIEWS = [
  // Entrance & approach
  "step-free entrance",
  "steps at entrance",
  "ramp at entrance",
  "automatic door",
  "wide doorway",
  "narrow doorway",

  // Interior circulation
  "elevator available",
  "elevator out of order",

  // Restrooms
  "accessible toilet",
  "no accessible toilet",

  // Parking & transport
  "accessible parking",
  "no accessible parking",
];
