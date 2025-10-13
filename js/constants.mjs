export const ORS_API_KEY =
  "5b3ce3597851110001cf624808521bae358447e592780fc0039f7235";

export const DEFAULT_ZOOM = 17;

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
