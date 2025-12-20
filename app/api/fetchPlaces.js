import pRetry from "p-retry";
import { pRetryConfig, SHOW_PLACES_ZOOM } from "../constants/constants.mjs";
import osmtogeojson from "osmtogeojson";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Helpful for Overpass operators + can reduce aggressive throttling in some deployments.
// (User requirement: keep all categories; this only affects request metadata.)
const HEADERS = {
  "Content-Type": "text/plain;charset=UTF-8",
  Accept: "application/json",
  "User-Agent": "Abilico/1.0",
};

function isRateLimitError(err) {
  const msg = String(err?.message || "");
  return /\bOverpass error 429\b/.test(msg) || /\b429\b/.test(msg);
}

// Abort controllers scoped per place so one details request doesn't cancel another.
// Key format: "N/123", "W/456", "R/789"
const placeGeometryAbortControllers = new Map();

export async function fetchPlaceGeometry(osmType, osmId) {
  const placeKey = `${osmType}/${osmId}`;
  const prev = placeGeometryAbortControllers.get(placeKey);
  if (prev) prev.abort();

  const controller = new AbortController();
  placeGeometryAbortControllers.set(placeKey, controller);
  const { signal } = controller;

  const type = { N: "node", W: "way", R: "relation" }[osmType];

  const query = `
    [out:json][timeout:25];
    ${type}(${osmId});
    out geom;
  `;

  let lastError = null;

  try {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    // console.log(`🌍 Trying Overpass endpoint: ${endpoint}`);
    try {
      return await pRetry(async () => {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: HEADERS,
            body: query,
            signal,
          });
          if (!response.ok)
            throw new Error(`Overpass error ${response.status} @ ${endpoint}`);
          const data = await response.json();
          // Convert Overpass JSON to GeoJSON (FeatureCollection)
          return osmtogeojson(data);
        } catch (error) {
          if (error?.name === "AbortError") {
            return { type: "FeatureCollection", features: [] };
          }
          throw error;
        }
      }, pRetryConfig);
    } catch (error) {
      if (error?.name === "AbortError") {
        console.log("⚠️ fetchPlaces aborted safely");
        // return empty FeatureCollection instead of undefined
        return { type: "FeatureCollection", features: [] };
      }

      lastError = error;
      console.warn(`[Overpass] ${endpoint} failed, trying next…`, error);
    }
  }
  } finally {
    // Clean up controller for this key if we're still the latest call.
    const current = placeGeometryAbortControllers.get(placeKey);
    if (current === controller) placeGeometryAbortControllers.delete(placeKey);
  }

  if (lastError?.name === "AbortError") {
    return { type: "FeatureCollection", features: [] };
  }

  console.error("Geometry fetch failed on all Overpass endpoints:", lastError);
  return { type: "FeatureCollection", features: [] };
}

// Abort controllers scoped per place for tag fetches.
const placeAbortControllers = new Map();
export async function fetchPlace(osmType, osmId) {
  const placeKey = `${osmType}/${osmId}`;
  const prev = placeAbortControllers.get(placeKey);
  if (prev) prev.abort();

  const controller = new AbortController();
  placeAbortControllers.set(placeKey, controller);
  const { signal } = controller;

  const type = { N: "node", W: "way", R: "relation" }[osmType];

  const query = `
    [out:json][timeout:25];
    ${type}(${osmId});
    out center tags;
  `;

  let lastError = null;

  try {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      return await pRetry(async () => {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
              headers: HEADERS,
            body: query,
            signal,
          });

          if (!response.ok) throw new Error("Overpass " + response.status);
          const data = await response.json();

          return data.elements[0].tags;
        } catch (error) {
          if (error?.name === "AbortError") {
            return {};
          }
          throw error;
        }
      }, pRetryConfig);
    } catch (error) {
      if (error?.name === "AbortError") {
        return {};
      }

      lastError = error;
      console.warn(`[Overpass] ${endpoint} failed, trying next…`, error);
    }
    }
  } finally {
    const current = placeAbortControllers.get(placeKey);
    if (current === controller) placeAbortControllers.delete(placeKey);
  }

  if (lastError?.name === "AbortError") {
    console.log("⚠️ fetchPlaces aborted at end safely");
    return { type: "FeatureCollection", features: [] };
  }

  console.error("Place fetch failed on all Overpass endpoints:", lastError);
  return {};
}

function buildAccessibilityClauses(allowed) {
  const ALL = ["designated", "yes", "limited", "unknown", "no"];
  if (ALL.every((t) => allowed.has(t))) return [""];

  const clauses = new Set();
  const KEYS = ["wheelchair", "toilets:wheelchair", "wheelchair:toilets"];

  if (allowed.has("designated")) {
    clauses.add('["wheelchair"="designated"]');
  }

  if (allowed.has("yes")) {
    KEYS.forEach((k) => clauses.add(`["${k}"~"^(yes|true)$"]`));
  }

  if (allowed.has("limited")) {
    // IMPORTANT: use a normal capturing group, not (?:...)
    KEYS.forEach((k) => clauses.add(`["${k}"~"^limited$"]`));
    // If you don't want to accept "partial", change to: ^limited$
  }

  if (allowed.has("no")) {
    KEYS.forEach((k) => clauses.add(`["${k}"~"^(no|false)$"]`));
  }

  if (allowed.has("unknown")) {
    // wheelchairs present but value is not any of the recognized ones
    clauses.add('["wheelchair"!~"^(designated|yes|true|limited|no|false)$"]');
    // …or none of the relevant keys exist at all
    clauses.add(
      '[!"wheelchair"][!"toilets:wheelchair"][!"wheelchair:toilets"]'
    );
  }

  return Array.from(clauses);
}

const AMENITY_FOCUS_LOW = [
  // bigger / civic / fewer items
  "bank",
  "atm",
  "pharmacy",
  "hospital",
  "clinic",
  "library",
  "university",
  "college",
  "school",
  "theatre",
  "cinema",
  "place_of_worship",
  "police",
  "post_office",
  "townhall",
];

const TOURISM_FOCUS_LOW = [
  "attraction",
  "museum",
  "gallery",
  "zoo",
  "theme_park",
  "aquarium",
  "viewpoint",
  "hotel",
];

const LEISURE_FOCUS_LOW = [
  "stadium",
  "sports_centre",
  "swimming_pool",
  "fitness_centre",
];

const SHOP_FOCUS_LOW = [
  "mall",
  "department_store",
  "supermarket",
  "convenience",
  "bakery",
];

// Build the base selectors.
// IMPORTANT: user requirement is to not hide/remove place types depending on zoom.
// So we always include the full set of categories; performance comes from caching + rendering optimizations.
function selectorsForZoom(
  _zoom,
  { AMENITY_EXCLUDED, LEISURE_EXCLUDED, MAN_MADE_EXCLUDED, MILITARY_EXCLUDED }
) {
  return [
    // Use `node` to include only nodes (not ways or relations).
    `node["amenity"]["amenity"!~"${AMENITY_EXCLUDED}"]`,
    `node["shop"]`,
    `node["tourism"]`,
    `node["leisure"]["leisure"!~"${LEISURE_EXCLUDED}"]`,
    `node["healthcare"]`,
    `node["building"]`,
    `node["office"]`,
    `node["craft"]`,
    `node["historic"]`,
    `node["man_made"]["man_made"!~"${MAN_MADE_EXCLUDED}"]`,
    `node["military"]["military"!~"${MILITARY_EXCLUDED}"]`,
    `node["sport"]`,
  ];
}

// Do not cap results; capping can drop entire categories/types depending on ordering.
function limitForZoom(_zoom) {
  return 0;
}

let placesAbortController = null;
export async function fetchPlaces(bounds, zoom, options) {
  const { accessibilityFilter } = options;

  // console.log("🚀 fetchPlaces called", { bounds, zoom, accessibilityFilter });

  const showNoPlaces = zoom < SHOW_PLACES_ZOOM;
  if (showNoPlaces) {
    return { type: "FeatureCollection", features: [] };
  }

  if (placesAbortController) {
    placesAbortController.abort();
  }
  placesAbortController = new AbortController();
  const { signal } = placesAbortController;

  const s = bounds.getSouth();
  const w = bounds.getWest();
  const n = bounds.getNorth();
  const e = bounds.getEast();
  const boundingBox = `${s},${w},${n},${e}`;

  const AMENITY_EXCLUDED =
    "bench|waste_basket|bicycle_parking|vending_machine|fountain|ice_cream|grit_bin|drinking_water|give_box|parcel_locker|water_point|recycling|waste_basket|waste_disposal";
  const LEISURE_EXCLUDED = "park|picnic_table";
  const MAN_MADE_EXCLUDED =
    "surveillance|pump|pipeline|pier|groyne|flagpole|embankment|dyke|clearcut|cutline";
  const MILITARY_EXCLUDED = "trench";

  if (accessibilityFilter.size === 0) {
    // Nothing checked ⇒ show nothing
    return { type: "FeatureCollection", features: [] };
  }

  const baseSelectors = selectorsForZoom(zoom, {
    AMENITY_EXCLUDED,
    LEISURE_EXCLUDED,
    MAN_MADE_EXCLUDED,
    MILITARY_EXCLUDED,
  });

  const accClauses = buildAccessibilityClauses(accessibilityFilter);

  // If accClauses === [""] we’ll just append bbox once per base selector.
  const queryParts = [];
  for (const base of baseSelectors) {
    if (accClauses.length === 1 && accClauses[0] === "") {
      queryParts.push(`${base}(${boundingBox})`);
    } else {
      for (const clause of accClauses) {
        queryParts.push(`${base}${clause}(${boundingBox})`);
      }
    }
  }

  const outLimit = limitForZoom(zoom);
  // `qt` speeds up output processing on Overpass (quick timestamps / faster output mode).
  // Keep tags + centers as before.
  const outLine = outLimit
    ? `out center tags ${outLimit} qt;`
    : `out center tags qt;`;

  const query = `
    [out:json][timeout:60];
    (
      ${queryParts.join(";\n      ")};
    );
    ${outLine}
  `;

  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    // console.log(`🌍 Trying Overpass endpoint: ${endpoint}`);
    try {
      return await pRetry(async () => {
        try {
          // console.log("📡 POST →", endpoint, "query:", query.slice(0, 300));
          const response = await fetch(endpoint, {
            method: "POST",
            headers: HEADERS,
            body: query,
            signal,
          });

          if (!response.ok) {
            throw new Error(`Overpass error ${response.status} @ ${endpoint}`);
          }

          const data = await response.json();
          return osmtogeojson(data);
        } catch (error) {
          if (error?.name === "AbortError") {
            return { type: "FeatureCollection", features: [] };
          }
          throw error;
        }
      }, pRetryConfig);
    } catch (error) {
      // Don't log 504 errors as errors - they're expected when servers are busy
      if (
        error?.message?.includes("504") ||
        error?.message?.includes("timeout")
      ) {
        console.warn(`[Overpass] ${endpoint} timed out, trying next endpoint…`);
      } else if (isRateLimitError(error)) {
        // 429 is expected under load; avoid scary console errors
        console.warn(`[Overpass] ${endpoint} rate-limited (429), trying next…`);
      } else if (error?.name !== "AbortError") {
        console.error("❌ Overpass fetch failed:", error);
      }
      if (error?.name === "AbortError") {
        return { type: "FeatureCollection", features: [] };
      }
      lastError = error;
      // Only warn if it's not a timeout
      if (
        !error?.message?.includes("504") &&
        !error?.message?.includes("timeout") &&
        !isRateLimitError(error)
      ) {
        console.warn(`[Overpass] ${endpoint} failed, trying next…`, error);
      }
    }
  }

  if (lastError?.name === "AbortError") {
    return { type: "FeatureCollection", features: [] };
  }

  // If we're rate-limited everywhere, fail softly: keep map usable and try again on next refresh.
  if (isRateLimitError(lastError)) {
    console.warn(
      "Places fetch rate-limited on all Overpass endpoints; returning empty result for now."
    );
    return { type: "FeatureCollection", features: [] };
  }

  console.error("Places fetch failed on all Overpass endpoints:", lastError);
}
