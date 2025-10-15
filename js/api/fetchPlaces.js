import pRetry from "https://cdn.jsdelivr.net/npm/p-retry@7.1.0/+esm";
import { PLACES_DISPLAY_ZOOM } from "../constants.mjs";

const pRetryConfig = { retries: 10, factor: 2, minTimeout: 400 };
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];

export async function fetchPlace(osmType, osmId) {
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
        const response = await fetch(endpoint, {
          method: "POST",
          body: query,
        });

        if (!response.ok) throw new Error("Overpass " + response.status);
        const data = await response.json();

        return data.elements[0].tags;
      }, pRetryConfig);
    } catch (error) {
      lastError = error;
      console.warn(`[Overpass] ${endpoint} failed, trying next…`, error);
    }
  }

  console.error("Place fetch failed on all Overpass endpoints:", lastError);
  return {};
}

export async function fetchPlaces(bounds, zoom) {
  const s = bounds.getSouth();
  const w = bounds.getWest();
  const n = bounds.getNorth();
  const e = bounds.getEast();
  const boundingBox = `${s},${w},${n},${e}`;

  const EXCLUDED =
    "bench|waste_basket|bicycle_parking|vending_machine|fountain|ice_cream";

  const queryParts = [];

  if (zoom >= PLACES_DISPLAY_ZOOM) {
    queryParts.push(
      `node["amenity"]["name"]["amenity"!~"${EXCLUDED}"](${boundingBox})`
    );
  }

  if (zoom >= 15) {
    queryParts.push(`node["shop"]["name"](${boundingBox})`);
  }

  if (zoom >= 16) {
    queryParts.push(`node["tourism"]["name"](${boundingBox})`);
  }
  if (zoom >= 17) {
    queryParts.push(`node["leisure"]["name"](${boundingBox})`);
  }
  if (zoom >= 18) {
    queryParts.push(`node["healthcare"]["name"](${boundingBox})`);
  }

  // If no parts (very low zoom), return empty
  if (queryParts.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const query = `
    [out:json][maxsize:1073741824];
    (
      ${queryParts.join("; ")};
    );
    out center tags;
  `;

  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      return await pRetry(async () => {
        const response = await fetch(endpoint, {
          method: "POST",
          body: query,
        });

        if (!response.ok) {
          throw new Error(`Overpass error ${response.status} @ ${endpoint}`);
        }

        const data = await response.json();
        console.log(data);
        return osmtogeojson(data);
      }, pRetryConfig);
    } catch (error) {
      lastError = error;
      console.warn(`[Overpass] ${endpoint} failed, trying next…`, error);
    }
  }

  console.error("Places fetch failed on all Overpass endpoints:", lastError);
  return { type: "FeatureCollection", features: [] };
}
