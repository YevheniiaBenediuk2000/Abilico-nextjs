import pRetry from "https://cdn.jsdelivr.net/npm/p-retry@7.1.0/+esm";
import { pRetryConfig, SHOW_PLACES_ZOOM } from "../constants.mjs";

const OVERPASS_ENDPOINTS = [
  "https://overpass.osm.jp/api/interpreter",
  "https://overpass-api.de/api/interpreter",
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
    try {
      return await pRetry(async () => {
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
      }, pRetryConfig);
    } catch (error) {
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
        const response = await fetch(endpoint, {
          method: "POST",
          body: query,
          signal,
        });

        if (!response.ok) throw new Error("Overpass " + response.status);
        const data = await response.json();

        return data.elements[0].tags;
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
    return {};
  }

  console.error("Place fetch failed on all Overpass endpoints:", lastError);
  return {};
}

let placesAbortController = null;

export async function fetchPlaces(bounds, zoom) {
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

  const WHEELCHAIR_LIMITED = '["wheelchair"~"^(yes|limited|designated)$"]';
  const TOILETS_WHEELCHAIR_YES = '["toilets:wheelchair"="yes"]';

  const queryParts = [];

  const showNoPlaces = zoom < SHOW_PLACES_ZOOM;

  if (showNoPlaces) {
    return { type: "FeatureCollection", features: [] };
  }

  if (zoom >= SHOW_PLACES_ZOOM && zoom < 17) {
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
  } else if (zoom >= 17) {
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
          signal,
        });

        if (!response.ok) {
          throw new Error(`Overpass error ${response.status} @ ${endpoint}`);
        }

        const data = await response.json();
        console.log(data);
        return osmtogeojson(data);
      }, pRetryConfig);
    } catch (error) {
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
  return { type: "FeatureCollection", features: [] };
}
