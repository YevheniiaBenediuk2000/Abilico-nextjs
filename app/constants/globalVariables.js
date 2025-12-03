const detailsCtx = { latlng: null, placeId: null };
let reviews = [];

const isLocal =
  typeof window !== "undefined" && window.location.protocol === "http:";
export const basePath = isLocal
  ? "../map-icons-osm"
  : "https://yevheniiabenediuk2000.github.io/Abilico/map-icons-osm";

const globals = {
  detailsCtx,
  reviews,
  basePath,
};

export default globals;
