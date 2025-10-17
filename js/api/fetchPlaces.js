import pRetry from "https://cdn.jsdelivr.net/npm/p-retry@7.1.0/+esm";
import { SHOW_PLACES_ZOOM } from "../constants.mjs";

const pRetryConfig = { retries: 10, factor: 2, minTimeout: 400 };
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];

export async function fetchPlaceGeometry(osmType, osmId) {
  const type = { N: "node", W: "way", R: "relation" }[osmType];

  const query = `
    [out:json];
    ${type}(${osmId});
    out geom;
  `;

  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      return await pRetry(async () => {
        const response = await fetch(endpoint, { method: "POST", body: query });
        if (!response.ok)
          throw new Error(`Overpass error ${response.status} @ ${endpoint}`);
        const data = await response.json();

        // Convert Overpass JSON to GeoJSON (FeatureCollection)
        return osmtogeojson(data);
      }, pRetryConfig);
    } catch (error) {
      lastError = error;
      console.warn(`[Overpass] ${endpoint} failed, trying next…`, error);
    }
  }

  console.error("Geometry fetch failed on all Overpass endpoints:", lastError);
  return { type: "FeatureCollection", features: [] };
}

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

  const AMENITY_EXCLUDED =
    "bench|waste_basket|bicycle_parking|vending_machine|fountain|ice_cream|grit_bin|drinking_water|give_box|parcel_locker|water_point|recycling|waste_basket|waste_disposal";
  const LEISURE_EXCLUDED = "park|picnic_table";

  // TODO: add excluded for all the other categories

  const WHEELCHAIR_YES = '["wheelchair"~"^(yes|designated)$"]';
  const WHEELCHAIR_LIMITED = '["wheelchair"~"^(yes|limited|designated)$"]';
  const TOILETS_WHEELCHAIR_YES = '["toilets:wheelchair"="yes"]';

  const queryParts = [];

  const showNoPlaces = zoom < SHOW_PLACES_ZOOM;

  if (showNoPlaces) {
    return { type: "FeatureCollection", features: [] };
  }

  if (zoom === SHOW_PLACES_ZOOM) {
    queryParts.push(
      `node["amenity"]["name"]${WHEELCHAIR_YES}["amenity"!~"${AMENITY_EXCLUDED}"](${boundingBox})`
    );
    queryParts.push(`node["shop"]["name"]${WHEELCHAIR_YES}(${boundingBox})`);
    queryParts.push(`node["tourism"]["name"]${WHEELCHAIR_YES}(${boundingBox})`);
    queryParts.push(
      `node["leisure"]["name"]${WHEELCHAIR_YES}["leisure"!~"${LEISURE_EXCLUDED}"](${boundingBox})`
    );
    queryParts.push(
      `node["healthcare"]["name"]${WHEELCHAIR_YES}(${boundingBox})`
    );
    queryParts.push(
      `node["building"]["name"]${WHEELCHAIR_YES}(${boundingBox})`
    );
    queryParts.push(`node["office"]["name"]${WHEELCHAIR_YES}(${boundingBox})`);
    queryParts.push(`node["craft"]["name"]${WHEELCHAIR_YES}(${boundingBox})`);

    queryParts.push(
      `node["amenity"]["name"]${TOILETS_WHEELCHAIR_YES}["amenity"!~"${AMENITY_EXCLUDED}"](${boundingBox})`
    );
    queryParts.push(
      `node["shop"]["name"]${TOILETS_WHEELCHAIR_YES}(${boundingBox})`
    );
    queryParts.push(
      `node["tourism"]["name"]${TOILETS_WHEELCHAIR_YES}(${boundingBox})`
    );
    queryParts.push(
      `node["leisure"]["name"]${TOILETS_WHEELCHAIR_YES}["leisure"!~"${LEISURE_EXCLUDED}"](${boundingBox})`
    );
    queryParts.push(
      `node["healthcare"]["name"]${TOILETS_WHEELCHAIR_YES}(${boundingBox})`
    );
    queryParts.push(
      `node["building"]["name"]${TOILETS_WHEELCHAIR_YES}(${boundingBox})`
    );
    queryParts.push(
      `node["office"]["name"]${TOILETS_WHEELCHAIR_YES}(${boundingBox})`
    );
    queryParts.push(
      `node["craft"]["name"]${TOILETS_WHEELCHAIR_YES}(${boundingBox})`
    );
  } else if (zoom >= SHOW_PLACES_ZOOM + 1 && zoom < 18) {
    queryParts.push(
      `node["amenity"]["name"]${WHEELCHAIR_LIMITED}["amenity"!~"${AMENITY_EXCLUDED}"](${boundingBox})`
    );
    queryParts.push(
      `node["shop"]["name"]${WHEELCHAIR_LIMITED}(${boundingBox})`
    );
    queryParts.push(
      `node["tourism"]["name"]${WHEELCHAIR_LIMITED}(${boundingBox})`
    );
    queryParts.push(
      `node["leisure"]["name"]${WHEELCHAIR_LIMITED}["leisure"!~"${LEISURE_EXCLUDED}"](${boundingBox})`
    );
    queryParts.push(
      `node["healthcare"]["name"]${WHEELCHAIR_LIMITED}(${boundingBox})`
    );
    queryParts.push(
      `node["building"]["name"]${WHEELCHAIR_LIMITED}(${boundingBox})`
    );
    queryParts.push(
      `node["office"]["name"]${WHEELCHAIR_LIMITED}(${boundingBox})`
    );
    queryParts.push(
      `node["craft"]["name"]${WHEELCHAIR_LIMITED}(${boundingBox})`
    );

    queryParts.push(
      `node["amenity"]["name"]${TOILETS_WHEELCHAIR_YES}["amenity"!~"${AMENITY_EXCLUDED}"](${boundingBox})`
    );
    queryParts.push(
      `node["shop"]["name"]${TOILETS_WHEELCHAIR_YES}(${boundingBox})`
    );
    queryParts.push(
      `node["tourism"]["name"]${TOILETS_WHEELCHAIR_YES}(${boundingBox})`
    );
    queryParts.push(
      `node["leisure"]["name"]${TOILETS_WHEELCHAIR_YES}["leisure"!~"${LEISURE_EXCLUDED}"](${boundingBox})`
    );
    queryParts.push(
      `node["healthcare"]["name"]${TOILETS_WHEELCHAIR_YES}(${boundingBox})`
    );
    queryParts.push(
      `node["building"]["name"]${TOILETS_WHEELCHAIR_YES}(${boundingBox})`
    );
    queryParts.push(
      `node["office"]["name"]${TOILETS_WHEELCHAIR_YES}(${boundingBox})`
    );
    queryParts.push(
      `node["craft"]["name"]${TOILETS_WHEELCHAIR_YES}(${boundingBox})`
    );
  } else if (zoom >= 18) {
    queryParts.push(
      `node["amenity"]["name"]["amenity"!~"${AMENITY_EXCLUDED}"](${boundingBox})`
    );
    queryParts.push(`node["shop"]["name"](${boundingBox})`);
    queryParts.push(`node["tourism"]["name"](${boundingBox})`);
    queryParts.push(
      `node["leisure"]["name"]["leisure"!~"${LEISURE_EXCLUDED}"](${boundingBox})`
    );
    queryParts.push(`node["healthcare"]["name"](${boundingBox})`);
    queryParts.push(`node["building"]["name"](${boundingBox})`);
    queryParts.push(`node["office"]["name"](${boundingBox})`);
    queryParts.push(`node["craft"]["name"](${boundingBox})`);
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
