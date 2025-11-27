const detailsCtx = { latlng: null, placeId: null };
let reviews = [];

const isLocal = window.location.protocol === "http:";
export const basePath = isLocal
  ? "../map-icons-osm"
  : "https://yevheniiabenediuk2000.github.io/Abilico/map-icons-osm";

const accessibilityKeywordsByGeoKey = {};

const globals = {
  detailsCtx,
  reviews,
  basePath,
  accessibilityKeywordsByGeoKey,
};

export default globals;
