export const ORS_API_KEY =
  "5b3ce3597851110001cf624808521bae358447e592780fc0039f7235";

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

export const ACCESSIBILITY_LABELS_IN_REVIEWS = [
  // Entrance & approach
  "step-free entrance",
  "stairs at entrance",
  "ramp",
  "automatic door",
  "wide doorway",
  "narrow doorway",

  // Interior circulation
  "elevator",
  "broken elevator",

  // Restrooms
  "accessible toilet",
  "no accessible toilet",

  // Parking & transport
  "accessible parking",
  "no accessible parking",
];
