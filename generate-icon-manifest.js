const fs = require("fs");
const path = require("path");

const ICON_DIR = path.join(__dirname, "map-icons");
const OUT_FILE = path.join(__dirname, "map-icons", "manifest.js");

/**
 * Recursively walk `dir`, collecting all .svg files.
 * @param {string} dir   absolute path to start
 * @param {string} base  relative path accumulator
 * @param {string[]} out array to push results into
 */
function walkDir(dir, base = "", out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (let entry of entries) {
    const absPath = path.join(dir, entry.name);
    const relPath = base ? `${base}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      walkDir(absPath, relPath, out);
    } else if (entry.isFile() && entry.name.endsWith(".svg")) {
      out.push(relPath);
    }
  }
  return out;
}

// run it
try {
  const icons = walkDir(ICON_DIR);
  const fileContent =
    `// auto-generated — do not edit by hand\n` +
    `export const ICON_MANIFEST = ${JSON.stringify(icons, null, 2)};\n`;

  fs.writeFileSync(OUT_FILE, fileContent, "utf8");
  console.log(`✅ Wrote ${icons.length} icons to ${OUT_FILE}`);
} catch (err) {
  console.error("❌ Error generating manifest:", err);
  process.exit(1);
}
