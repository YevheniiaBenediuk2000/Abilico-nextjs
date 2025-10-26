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

const isLocal = window.location.protocol === "http:";
export const BASE_PATH = isLocal
  ? "../map-icons-osm"
  : "https://yevheniiabenediuk2000.github.io/Abilico/map-icons-osm";

export const pRetryConfig = { retries: 3, factor: 2, minTimeout: 400 };

export const SIZE_BY_TIER = {
  designated: 46, // biggest: fully designated accessible
  yes: 41,
  limited: 36,
  unknown: 31,
  no: 26, // smallest when explicitly not accessible
};

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
