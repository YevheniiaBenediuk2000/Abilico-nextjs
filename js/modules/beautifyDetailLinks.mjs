// --- Link helpers for Overview / Details list ---
export function splitMulti(v) {
  return String(v)
    .split(/[;|,]\s*|\s{2,}/)
    .filter(Boolean);
}

export function cleanUrl(u) {
  if (!u) return null;
  let s = String(u)
    .trim()
    .replace(/^https?\s*:?\/?\/?/i, "https://") // "Https //..." → "https://"
    .replace(/\s+/g, ""); // kill internal spaces

  if (!/^https?:\/\//i.test(s) && /^[\w.-]+\.[a-z]{2,}([/:?#]|$)/i.test(s)) {
    s = "https://" + s;
  }
  try {
    const url = new URL(s);

    // Canonicalize YouTube forms (youtu.be, /shorts) → /watch?v=ID
    const host = url.hostname.toLowerCase();
    if (
      host === "youtu.be" ||
      host === "www.youtube.com" ||
      host === "youtube.com"
    ) {
      let id = null;
      if (host === "youtu.be") id = url.pathname.slice(1);
      else if (url.pathname.startsWith("/shorts/"))
        id = url.pathname.split("/")[2];
      else id = url.searchParams.get("v");
      if (id) {
        const t = url.searchParams.get("t") || url.searchParams.get("start");
        const canon = new URL("https://www.youtube.com/watch");
        canon.searchParams.set("v", id);
        if (t) canon.searchParams.set("t", t.replace(/s$/, ""));
        return canon.toString();
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function hostLabel(u) {
  try {
    return new URL(u).hostname.replace(/^www\./i, "");
  } catch {
    return "link";
  }
}

export function linkLabel(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./i, "");
    const leaf = url.pathname.replace(/\/+$/, "").split("/").slice(-1)[0];
    if (host.includes("youtube.com"))
      return `YouTube · ${url.searchParams.get("v") || leaf || host}`;
    return leaf ? `${host} · ${leaf}` : host;
  } catch {
    return hostLabel(u);
  }
}

// Build a Mapillary viewer URL from either a key or a full Mapillary URL
export function toMapillaryViewerUrl(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^https?:\/\//i.test(s)) {
    return cleanUrl(s);
  }
  const keyOnly = s.split("&")[0];
  return `https://www.mapillary.com/app/?pKey=${encodeURIComponent(keyOnly)}`;
}

// Use consistent lower-case keys and lift common synonyms
export function normalizeTagsCase(tags = {}) {
  // 1) Lower-case everything (don’t keep originals)
  const out = {};
  for (const [k, v] of Object.entries(tags)) out[k.toLowerCase()] = v;

  // 2) Lift common synonyms
  if (!out.website && out.url) out.website = out.url;
  if (!out.image && out.image) out.image = out.image; // keep for symmetry
  if (!out.url && out.url) out.url = out.url;

  // 3) Merge multi-keys: website/url/website:N/url:N/contact:website → website
  const websiteVals = [];
  for (const [k, v] of Object.entries(out)) {
    if (
      k === "website" ||
      k === "url" ||
      k === "contact:website" ||
      /^website:\d+$/i.test(k) ||
      /^url:\d+$/i.test(k)
    ) {
      splitMulti(v).forEach((u) => {
        const cu = cleanUrl(u);
        if (cu) websiteVals.push(cu);
      });
    }
  }
  if (websiteVals.length) {
    out.website = [...new Set(websiteVals)].join(" ; "); // de-duped & merged
  }

  // 4) If url/website is a Mapillary link but mapillary tag is missing, populate it
  const u = out.website || out.url || "";
  if (!out.mapillary && /mapillary\.com/i.test(u)) out.mapillary = u;

  return out;
}
