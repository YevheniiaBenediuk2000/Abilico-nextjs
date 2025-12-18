// Manual mapping for `brand:wikidata` Q-IDs (technical metadata) -> human-readable brand names.
//
// Why this exists:
// - OSM can have tags like:
//   brand = SEB
//   brand:wikidata = Q117706903
// - We should never show raw Q-IDs (e.g. "Q117706903") in the UI.
// - If a place has ONLY `brand:wikidata` and no readable `brand`, you can optionally map it here.
//
// Example:
// export const BRAND_WIKIDATA_MAP = {
//   Q117706903: "SEB",
// };
//
// Keep this small and curated (only for important/commonly seen brands).
export const BRAND_WIKIDATA_MAP = {};

// If a place has one of these `brand:wikidata` Q-IDs, we hide the Brand row entirely.
// Use this for known-bad/misleading brand IDs in your dataset.
export const SUPPRESSED_BRAND_WIKIDATA = new Set(["Q100148965"]);


