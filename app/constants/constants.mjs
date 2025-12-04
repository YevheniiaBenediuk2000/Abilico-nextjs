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

export const ACCESSIBILITY_KEYWORD_DESCRIPTIONS = {
  // ─── Entrance & approach ─────────────────────────────────────
  "step-free entrance":
    "Entrance without steps or thresholds; you can roll straight in with a wheelchair.",

  "steps at entrance":
    "There are one or more steps at the entrance, making it hard or impossible to enter in a wheelchair.",

  "ramp at entrance":
    "There is a ramp at the entrance that can be used instead of steps.",

  "ramp too steep":
    "There is a ramp, but it is very steep or difficult to use safely in a wheelchair.",

  "automatic door":
    "Entrance door opens automatically (sensor/automatic mechanism).",

  "heavy manual door":
    "Entrance door is heavy and hard to open independently.",

  "wide doorway":
    "Doorway is wide enough for a wheelchair to pass comfortably.",

  "narrow doorway":
    "Doorway is narrow; a wheelchair barely fits or does not fit at all.",

  "curb cut at entrance":
    "Lowered curb or small ramp from the street/parking to the sidewalk or entrance.",

  "no curb cut":
    "High curb or no lowered section, making it hard to get from street/parking to the entrance.",

  // ─── Interior circulation ─────────────────────────────────────
  "spacious interior":
    "Plenty of space inside; easy to move around with a wheelchair.",

  "narrow aisles":
    "Passages between furniture/shelves are narrow or crowded; hard to pass with a wheelchair.",

  "level floors":
    "Floors are level and flat with no internal steps or sudden height changes.",

  "many level changes":
    "Multiple steps or height changes inside; moving around requires going up and down.",

  "elevator available":
    "There is an elevator or lift that can be used to access other floors.",

  "elevator out of order":
    "There is an elevator, but it is broken or not working.",

  "stairs inside":
    "Access to parts of the place requires using stairs.",

  "escalator only":
    "There is only an escalator and no elevator or ramp alternative.",

  // ─── Restrooms ────────────────────────────────────────────────
  "accessible toilet":
    "Toilet is designed for wheelchair users (larger space, step-free, usually with extra features).",

  "no accessible toilet":
    "There is no toilet suitable for wheelchair users (too small, step, or not reachable).",

  "spacious toilet":
    "Toilet room is large enough to turn and maneuver with a wheelchair.",

  "toilet grab bars":
    "Toilet has grab bars/handrails for support and safe transfers.",

  "no toilet grab bars":
    "Toilet lacks grab bars/handrails for support.",

  "toilet step":
    "There is a step or raised threshold to enter the toilet.",

  "toilet on same floor":
    "Toilet is on the same level and can be reached without stairs.",

  // ─── Parking & transport ──────────────────────────────────────
  "accessible parking":
    "Dedicated accessible parking spaces are available (e.g. disabled bays).",

  "no accessible parking":
    "No dedicated accessible/disabled parking spaces are available.",

  "parking close to entrance":
    "Parking is very close to the entrance; short distance to travel.",

  "parking far from entrance":
    "Parking is far from the entrance; long distance to move in a wheelchair.",

  "good public transport access":
    "Place is easy to reach using public transport (near accessible bus/tram/metro stops).",

  // ─── Seating & service ────────────────────────────────────────
  "accessible seating":
    "Seating area includes spots suitable for wheelchairs (space at tables, accessible height).",

  "no accessible seating":
    "No suitable space for a wheelchair at tables or only high bar seating.",

  "staff helpful with wheelchair":
    "Staff are actively helpful and supportive toward wheelchair users.",

  "staff unhelpful with wheelchair":
    "Staff are unhelpful or negative toward wheelchair users or refuse to assist.",
};

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
