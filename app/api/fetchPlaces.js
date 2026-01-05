import pRetry from "p-retry";
import { pRetryConfig, SHOW_PLACES_ZOOM } from "../constants/constants.mjs";
import osmtogeojson from "osmtogeojson";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Helpful for Overpass operators + can reduce aggressive throttling in some deployments.
const HEADERS = {
  "Content-Type": "text/plain;charset=UTF-8",
  Accept: "application/json",
  "User-Agent":
    "Abilico/1.0 (https://github.com/YevheniiaBenediuk2000/Abilico)",
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
              throw new Error(
                `Overpass error ${response.status} @ ${endpoint}`
              );
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

// === ZOOM-BASED FOCUS ARRAYS ===
// These arrays define which place types to show at different zoom levels for performance

const AMENITY_FOCUS_LOWEST = [
  "hospital",
  "university",
  "theatre",
  "cinema",
  "marketplace",
  "police",
  "social_facility",
  "library",
  "college",
  "school",
  "community_centre",
];

const AMENITY_FOCUS_LOW = [
  ...AMENITY_FOCUS_LOWEST,
  "fast_food",
  "cafe",
  "restaurant",
  "fire_station",
  "doctors",
  "toilets",
  "parking",
  "clinic",
  "pharmacy",
  "arts_centre",
  "courthouse",
  "place_of_worship",
  "post_office",
  "townhall",
];

const TOURISM_FOCUS_LOWEST = ["museum", "attraction"];

const TOURISM_FOCUS_LOW = [
  ...TOURISM_FOCUS_LOWEST,
  "hotel",
  "hostel",
  "zoo",
  "theme_park",
  "gallery",
];

const LEISURE_FOCUS_LOW = ["sports_centre", "swimming_pool", "fitness_centre"];

const SHOP_FOCUS_LOWEST = ["mall", "department_store", "supermarket"];

const SHOP_FOCUS_LOW = [...SHOP_FOCUS_LOWEST, "bakery", "convenience"];

// Build the base selectors depending on zoom level for performance optimization
function selectorsForZoom(
  zoom,
  { AMENITY_EXCLUDED, LEISURE_EXCLUDED, MAN_MADE_EXCLUDED, MILITARY_EXCLUDED }
) {
  // Full fat at close zoom (zoom >= 18)
  const FULL = [
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

  // Medium zoom (zoom 17): most categories, but no super-noisy tails
  const MID = [
    `node["amenity"]["amenity"!~"${AMENITY_EXCLUDED}"]`,
    `node["shop"]["shop"~"^(${SHOP_FOCUS_LOW.join("|")})$"]`,
    `node["tourism"]`,
    `node["leisure"]["leisure"!~"${LEISURE_EXCLUDED}"]`,
    `node["healthcare"]`,
    `node["historic"]`,
    // (omit building/craft/man_made/military at this level)
  ];

  // Far zoom (zoom 16): only "important" types to keep counts small
  const LOW = [
    `node["amenity"]["amenity"~"^(${AMENITY_FOCUS_LOW.join("|")})$"]`,
    `node["shop"]["shop"~"^(${SHOP_FOCUS_LOW.join("|")})$"]`,
    `node["tourism"]["tourism"~"^(${TOURISM_FOCUS_LOW.join("|")})$"]`,
    `node["leisure"]["leisure"~"^(${LEISURE_FOCUS_LOW.join("|")})$"]`,
    `node["healthcare"]["healthcare"~"^(hospital|clinic)$"]`,
    `node["historic"]`,
  ];

  // Lower zoom (zoom 15): even fewer types
  const LOW_15 = [
    `node["amenity"]["amenity"~"^(${AMENITY_FOCUS_LOW.join("|")})$"]`,
    `node["tourism"]["tourism"~"^(${TOURISM_FOCUS_LOW.join("|")})$"]`,
    `node["shop"]["shop"~"^(${SHOP_FOCUS_LOW.join("|")})$"]`,
  ];

  // Lowest zoom (zoom < 15): only major landmarks
  const LOWEST = [
    `node["amenity"]["amenity"~"^(${AMENITY_FOCUS_LOWEST.join("|")})$"]`,
    `node["tourism"]["tourism"~"^(${TOURISM_FOCUS_LOWEST.join("|")})$"]`,
    `node["shop"]["shop"~"^(${SHOP_FOCUS_LOWEST.join("|")})$"]`,
  ];

  // Heuristic bands — tweak to taste
  if (zoom >= 18) {
    console.log("📍 [selectorsForZoom] zoom >= 18 → FULL selectors");
    return FULL;
  }
  if (zoom >= 17) {
    console.log("📍 [selectorsForZoom] zoom 17 → MID selectors");
    return MID;
  }
  if (zoom >= 16) {
    console.log("📍 [selectorsForZoom] zoom 16 → LOW selectors");
    return LOW;
  }
  if (zoom >= 15) {
    console.log("📍 [selectorsForZoom] zoom 15 → LOW_15 selectors");
    return LOW_15;
  }
  console.log("📍 [selectorsForZoom] zoom < 15 → LOWEST selectors");
  return LOWEST;
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
    [out:json][timeout:180];
    (
      ${queryParts.join(";\n      ")};
    );
    ${outLine}
  `;

  console.log(
    "🚀 [fetchPlaces] zoom:",
    zoom,
    "query selectors count:",
    queryParts.length
  );

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

// =============================================================================
// ID-FIRST FETCHING STRATEGY
// Fetches only IDs first (lightweight), then fetches full data for missing places
// =============================================================================

let placeIdsAbortController = null;

/**
 * Fetch only place IDs (lightweight query) for the current viewport.
 * Use this to determine which places need to be fetched in detail.
 */
export async function fetchPlaceIds(bounds, zoom, options) {
  const { accessibilityFilter } = options;

  const showNoPlaces = zoom < SHOW_PLACES_ZOOM;
  if (showNoPlaces) {
    return [];
  }

  if (placeIdsAbortController) {
    placeIdsAbortController.abort();
  }
  placeIdsAbortController = new AbortController();
  const { signal } = placeIdsAbortController;

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
    return [];
  }

  const baseSelectors = selectorsForZoom(zoom, {
    AMENITY_EXCLUDED,
    LEISURE_EXCLUDED,
    MAN_MADE_EXCLUDED,
    MILITARY_EXCLUDED,
  });

  const accClauses = buildAccessibilityClauses(accessibilityFilter);

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

  const query = `
    [out:json][timeout:25];
    (
      ${queryParts.join(";\n      ")};
    );
    out ids;
  `;

  console.log("🆔 [fetchPlaceIds] Fetching IDs for zoom:", zoom);

  let lastError = null;

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

          if (!response.ok) {
            throw new Error(`Overpass error ${response.status} @ ${endpoint}`);
          }

          const data = await response.json();
          const ids = data.elements || [];
          console.log(`🆔 [fetchPlaceIds] Got ${ids.length} IDs`);
          return ids;
        } catch (error) {
          if (error?.name === "AbortError") {
            return [];
          }
          throw error;
        }
      }, pRetryConfig);
    } catch (error) {
      if (error?.name === "AbortError") {
        return [];
      }
      lastError = error;
      if (
        !error?.message?.includes("504") &&
        !error?.message?.includes("timeout")
      ) {
        console.warn(`[Overpass] ${endpoint} failed, trying next…`, error);
      }
    }
  }

  if (lastError?.name === "AbortError") {
    return [];
  }

  console.error("Place IDs fetch failed on all Overpass endpoints:", lastError);
  return [];
}

/**
 * Fetch full place data by their IDs.
 * Used after fetchPlaceIds to get details only for places not in cache.
 */
export async function fetchPlacesByIds(ids) {
  if (!ids || ids.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  // Group by type
  const nodes = ids.filter((i) => i.type === "node").map((i) => i.id);
  const ways = ids.filter((i) => i.type === "way").map((i) => i.id);
  const relations = ids.filter((i) => i.type === "relation").map((i) => i.id);

  const queryParts = [];
  if (nodes.length) queryParts.push(`node(id:${nodes.join(",")})`);
  if (ways.length) queryParts.push(`way(id:${ways.join(",")})`);
  if (relations.length) queryParts.push(`relation(id:${relations.join(",")})`);

  if (queryParts.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const query = `
    [out:json][timeout:60];
    (
      ${queryParts.join(";\n      ")};
    );
    out center tags;
  `;

  console.log(`📦 [fetchPlacesByIds] Fetching ${ids.length} places by ID`);

  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      return await pRetry(async () => {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: HEADERS,
            body: query,
          });

          if (!response.ok) {
            throw new Error(`Overpass error ${response.status} @ ${endpoint}`);
          }

          const data = await response.json();
          console.log(
            `📦 [fetchPlacesByIds] Got ${data.elements?.length || 0} elements`
          );
          return osmtogeojson(data);
        } catch (error) {
          throw error;
        }
      }, pRetryConfig);
    } catch (error) {
      lastError = error;
      if (
        !error?.message?.includes("504") &&
        !error?.message?.includes("timeout")
      ) {
        console.warn(`[Overpass] ${endpoint} failed, trying next…`, error);
      }
    }
  }

  console.error(
    "Places by ID fetch failed on all Overpass endpoints:",
    lastError
  );
  return { type: "FeatureCollection", features: [] };
}
