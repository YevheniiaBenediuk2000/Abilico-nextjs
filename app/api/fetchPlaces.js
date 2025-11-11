import pRetry from "p-retry";
import { pRetryConfig, SHOW_PLACES_ZOOM } from "../constants/constants.mjs";
import osmtogeojson from "osmtogeojson";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

let placeGeometryAbortController = null;

export async function fetchPlaceGeometry(osmType, osmId) {
  if (placeGeometryAbortController) {
    placeGeometryAbortController.abort();
  }
  placeGeometryAbortController = new AbortController();
  const { signal } = placeGeometryAbortController;

  const type = { N: "node", W: "way", R: "relation" }[osmType];

  const query = `
    [out:json];
    ${type}(${osmId});
    out geom;
  `;

  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    // console.log(`🌍 Trying Overpass endpoint: ${endpoint}`);
    try {
      return await pRetry(async () => {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
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

  if (lastError?.name === "AbortError") {
    return { type: "FeatureCollection", features: [] };
  }

  console.error("Geometry fetch failed on all Overpass endpoints:", lastError);
  return { type: "FeatureCollection", features: [] };
}

let placeAbortController = null;
export async function fetchPlace(osmType, osmId) {
  if (placeAbortController) {
    placeAbortController.abort();
  }
  placeAbortController = new AbortController();
  const { signal } = placeAbortController;

  const type = { N: "node", W: "way", R: "relation" }[osmType];

  const query = `
    [out:json];
    ${type}(${osmId});
    out center tags;
  `;

  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      return await pRetry(async () => {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
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
    KEYS.forEach((k) => clauses.add(`["${k}"~"^(limited|partial)$"]`));
    // If you don't want to accept "partial", change to: ^limited$
  }

  if (allowed.has("no")) {
    KEYS.forEach((k) => clauses.add(`["${k}"~"^(no|false)$"]`));
  }

  if (allowed.has("unknown")) {
    // wheelchairs present but value is not any of the recognized ones
    clauses.add(
      '["wheelchair"!~"^(designated|yes|true|limited|partial|no|false)$"]'
    );
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

// Build the base selectors depending on zoom
function selectorsForZoom(
  zoom,
  { AMENITY_EXCLUDED, LEISURE_EXCLUDED, MAN_MADE_EXCLUDED, MILITARY_EXCLUDED }
) {
  // Full fat at close zoom
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

  // Medium zoom: most categories, but no super-noisy tails
  const MID = [
    `node["amenity"]["amenity"!~"${AMENITY_EXCLUDED}"]`,
    `node["shop"]["shop"~"^(${SHOP_FOCUS_LOW.join("|")})$"]`,
    `node["tourism"]`,
    `node["leisure"]["leisure"!~"${LEISURE_EXCLUDED}"]`,
    `node["healthcare"]`,
    `node["office"]`,
    `node["historic"]`,
    `node["sport"]`,
    // (omit building/craft/man_made/military at this level)
  ];

  // Far zoom: only “important” types to keep counts small
  const LOW = [
    `node["amenity"]["amenity"~"^(${AMENITY_FOCUS_LOW.join("|")})$"]`,
    `node["tourism"]["tourism"~"^(${TOURISM_FOCUS_LOW.join("|")})$"]`,
    `node["leisure"]["leisure"~"^(${LEISURE_FOCUS_LOW.join("|")})$"]`,
    `node["healthcare"]["healthcare"~"^(hospital|clinic)$"]`,
    `node["shop"]["shop"~"^(${SHOP_FOCUS_LOW.join("|")})$"]`,
    `node["historic"]`,
  ];

  // Heuristic bands — tweak to taste
  if (zoom >= 17) return FULL;
  if (zoom >= 15) return MID;
  return LOW; // zoom < 15
}

// Optional: cap results at lower zooms (Overpass supports a numeric limit on `out`)
// 0 = no cap
function limitForZoom(zoom) {
  if (zoom >= 17) return 0;
  if (zoom >= 15) return 75; // mid zoom
  return 30; // far zoom
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
  const outLine = outLimit
    ? `out center tags ${outLimit};`
    : `out center tags;`;

  const query = `
    [out:json][timeout:180];
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
            body: query,
            signal,
          });

          if (!response.ok) {
            throw new Error(`Overpass error ${response.status} @ ${endpoint}`);
          }

          const data = await response.json();
          console.log(data);
          return osmtogeojson(data);
        } catch (error) {
          if (error?.name === "AbortError") {
            return { type: "FeatureCollection", features: [] };
          }
          throw error;
        }
      }, pRetryConfig);
    } catch (error) {
      console.error("❌ Overpass fetch failed:", error);
      if (error?.name === "AbortError") {
        return { type: "FeatureCollection", features: [] };
      }
      lastError = error;
      console.warn(`[Overpass] ${endpoint} failed, trying next…`, error);
    }
  }

  if (lastError?.name === "AbortError") {
    return { type: "FeatureCollection", features: [] };
  }

  console.error("Places fetch failed on all Overpass endpoints:", lastError);
}
