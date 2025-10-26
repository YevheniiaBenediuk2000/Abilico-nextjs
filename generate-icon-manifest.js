// scripts/build-icon-manifest.js
const fs = require("fs");
const path = require("path");

const ICON_ROOT = path.join(__dirname, "map-icons-osm"); // ← your folder
const OUT_FILE = path.join(__dirname, "js", "static", "manifest.js");

const EXT_OK = new Set([".svg", ".png"]);

// Prefer nicer sets first
const DIR_PRIORITY = [
  "svg",
  "svg-twotone",
  "classic.small",
  "square.small",
  "classic.big",
  "square.big",
];

function priorityOf(relPath) {
  const p = relPath.split(path.sep)[0];
  const i = DIR_PRIORITY.indexOf(p);
  return i === -1 ? 999 : i;
}

function* walk(dir, base = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      yield* walk(abs, rel);
    } else if (entry.isFile() && EXT_OK.has(path.extname(entry.name))) {
      yield rel;
    }
  }
}

function aliases(name) {
  // name is lowercase, no extension
  const a = new Set();
  a.add(name);
  a.add(name.replace(/-/g, "_"));
  a.add(name.replace(/_/g, "-"));
  a.add(name.replace(/[-_ ]/g, "")); // e.g., place_of_worship → placeofworship
  // Handful of very common variants
  if (name === "fast_food") a.add("fastfood");
  if (name === "ice_cream") a.add("icecream");
  if (name.endsWith("_shop")) a.add(name.replace(/_shop$/, "")); // e.g. bicycle_shop → bicycle
  return [...a];
}

function buildIndex() {
  const index = {}; // key -> rel path
  const chosenRank = {}; // key -> priority int

  for (const relPath of walk(ICON_ROOT)) {
    const ext = path.extname(relPath);
    const base = path.basename(relPath, ext).toLowerCase();
    const rank = priorityOf(relPath);

    for (const key of aliases(base)) {
      const prev = chosenRank[key];
      if (prev == null || rank < prev) {
        index[key] = relPath;
        chosenRank[key] = rank;
      }
    }
  }

  // Pick sensible fallbacks we know exist
  const FALLBACK = [
    "information", // svg/misc/information.svg
    "shopping", // svg/shopping.svg
    "recreation", // svg/recreation.svg
    "sightseeing", // svg/sightseeing.svg
    "health", // svg/health.svg
    "sports", // svg/sports.svg
    "unknown", // svg/unknown.svg
    "no_icon", // misc/no_icon.* (from raster sets)
  ].reduce((acc, k) => {
    if (index[k]) acc[k] = index[k];
    return acc;
  }, {});

  const header = `// auto-generated — do not edit by hand\n`;
  const body =
    `export const ICON_INDEX = ${JSON.stringify(index, null, 2)};\n` +
    `export const ICON_FALLBACKS = ${JSON.stringify(FALLBACK, null, 2)};\n`;
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, header + body, "utf8");
  console.log(`✅ Wrote ${Object.keys(index).length} icons to ${OUT_FILE}`);
}

buildIndex();
