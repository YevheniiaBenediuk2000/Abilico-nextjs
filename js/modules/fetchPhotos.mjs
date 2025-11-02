const mainPhotoWrapper = document.getElementById("main-photo-wrapper");
const mainPhotoImg = document.getElementById("main-photo");
const photosGrid = document.getElementById("photos-grid");
const photosEmpty = document.getElementById("photos-empty");

const COMMONS_API = "https://commons.wikimedia.org/w/api.php?origin=*";

const WIKI_MEDIA_LIST = (lang, title) =>
  `https://${lang}.wikipedia.org/w/api.php?origin=*&action=query&prop=images&imlimit=max&titles=${encodeURIComponent(
    title
  )}&format=json`;

async function fetchWikipediaImagesList(lang, title) {
  const res = await fetch(WIKI_MEDIA_LIST(lang, title));
  if (!res.ok) return [];
  const data = await res.json();
  const pages = data?.query?.pages || {};
  const fileTitles = Object.values(pages)
    .flatMap((p) => p.images || [])
    .map((im) => im.title)
    .filter((t) => /^File:/i.test(t));
  // Reuse your existing Commons fetcher, which adds credits, sizes, licenses:
  return fetchCommonsFileInfos(fileTitles);
}

export function showMainPhoto(photo) {
  if (!photo) {
    mainPhotoWrapper.classList.add("d-none");
    mainPhotoImg.removeAttribute("src");
    mainPhotoImg.removeAttribute("alt");
    return;
  }

  mainPhotoImg.src = photo.src || photo.thumb;
  mainPhotoImg.alt = photo.title || "Place photo";

  // Clicking main photo opens Photos tab and scrolls into view
  mainPhotoImg.onclick = () => {
    const tabBtn = document.getElementById("photos-tab");
    if (tabBtn) {
      const tab = new bootstrap.Tab(tabBtn);
      tab.show();
      photosGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  mainPhotoWrapper.classList.remove("d-none");
}

export function renderPhotosGrid(photos) {
  photosGrid.innerHTML = "";
  if (!photos?.length) {
    photosEmpty.classList.remove("d-none");
    return;
  }
  photosEmpty.classList.add("d-none");

  for (const p of photos) {
    // console.log("Rendering photo:", p);
    const col = document.createElement("div");
    // col.className = "col-6";

    const a = document.createElement("a");
    a.href = p.pageUrl || p.src;
    a.target = "_blank";
    a.rel = "noopener";

    const tile = document.createElement("figure");
    tile.className = "figure";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = p.thumb || p.src;
    img.alt = p.title || "Photo";
    img.className = "figure-img img-fluid shadow-sm mb-1";

    const caption = document.createElement("figcaption");
    caption.innerHTML = [
      p.title ? `<strong>${p.title}</strong>` : "",
      p.credit ? `<span>${p.credit}</span>` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    caption.className = "figure-caption";

    tile.appendChild(img);
    tile.appendChild(caption);
    a.appendChild(tile);
    col.appendChild(a);
    photosGrid.appendChild(col);
  }
}

function uniqBy(arr, key) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = key(x);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

function isHttpUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "http:" || x.protocol === "https:";
  } catch {
    return false;
  }
}

/* ---------- Direct image(s) from image=* ---------- */
function parseImageTag(imageValue) {
  if (!imageValue) return [];
  // Split common separators ; | , whitespace
  const parts = String(imageValue)
    .split(/[;|,\s]\s*/)
    .filter(Boolean);
  return parts.filter(isHttpUrl);
}

function photoFromDirectUrl(url) {
  return {
    src: url,
    thumb: url, // best effort; most hosts do not offer thumb endpoints
    title: "",
    credit: "",
    source: "Direct",
    width: undefined,
    height: undefined,
    pageUrl: url,
  };
}

// --- heuristics to weed out non-photographic files ---
const BAD_TITLE_RE =
  /(logo|icon|pictogram|symbol|seal|coat[_ -]?of[_ -]?arms|flag|map|diagram)/i;

function looksLikeIcon(meta = {}) {
  const title = meta.title || "";
  const mime = (meta.mime || "").toLowerCase(); // we'll populate this below
  const w = meta.width || 0;
  const h = meta.height || 0;
  const tooSmall = w && h ? Math.max(w, h) <= 300 : false; // tiny usually = icon

  return mime === "image/svg+xml" || BAD_TITLE_RE.test(title) || tooSmall;
}

// Keep photos if we have them; otherwise fall back to original list
function dropIconsPreferPhotos(items = []) {
  const photos = items.filter((x) => !looksLikeIcon(x));
  return photos.length ? photos : items;
}

/* ---------- Wikimedia Commons helpers ---------- */
async function fetchCommonsFileInfos(fileTitles) {
  if (!fileTitles.length) return [];
  const titles = fileTitles
    .map((t) => (t.startsWith("File:") ? t : `File:${t}`))
    .join("|");

  const url = `${COMMONS_API}&action=query&prop=imageinfo&format=json&titles=${encodeURIComponent(
    titles
  )}&iiprop=url|extmetadata|size|mime&iiurlwidth=1024`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  const pages = data?.query?.pages || {};
  const out = [];

  for (const k of Object.keys(pages)) {
    const p = pages[k];
    const ii = p?.imageinfo?.[0];
    if (!ii) continue;

    const ext = ii.extmetadata || {};
    const creditPieces = [
      ext.Artist?.value ? stripHtml(ext.Artist.value) : "",
      ext.LicenseShortName?.value ? `(${ext.LicenseShortName.value})` : "",
    ].filter(Boolean);

    out.push({
      src: ii.url,
      thumb: ii.thumburl || ii.url,
      width: ii.width,
      mime: ii.mime || "",
      height: ii.height,
      title: p.title?.replace(/^File:/, "") || "",
      credit: creditPieces.join(" "),
      source: "Wikimedia Commons",
      pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(
        p.title
      )}`,
    });
  }
  return dropIconsPreferPhotos(out);
}

function stripHtml(s) {
  const d = globalThis.document ? document.createElement("div") : null;
  if (!d) return s?.replace(/<[^>]*>/g, "") ?? "";
  d.innerHTML = s || "";
  return d.textContent || d.innerText || "";
}

async function resolveFromWikimediaCommonsTag(value) {
  if (!value) return [];
  // Could be "File:Name.jpg" or "Category:Something"
  const v = String(value).trim();
  if (/^Category:/i.test(v)) {
    // list first ~50 files from category
    const url = `${COMMONS_API}&action=query&list=categorymembers&cmtitle=${encodeURIComponent(
      v
    )}&cmtype=file&cmprop=title&cmlimit=50&format=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const titles = (data?.query?.categorymembers || [])
      .map((m) => m?.title)
      .filter(Boolean);
    return fetchCommonsFileInfos(titles);
  } else {
    // Assume file name(s), split by separators
    const files = v.split(/[;|,]\s*/).filter(Boolean);
    return fetchCommonsFileInfos(files);
  }
}

/* ---------- Wikipedia ---------- */
function parseWikipediaTag(value) {
  // Accept forms:
  //   "en:Palace_of_Culture_and_Science"
  //   "uk:Київський_університет"
  //   "https://en.wikipedia.org/wiki/Eiffel_Tower"
  if (!value) return null;
  const v = String(value).trim();

  if (isHttpUrl(v)) {
    try {
      const u = new URL(v);
      const lang = u.hostname.split(".")[0]; // en.wikipedia.org
      const title = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ""));
      return { lang, title };
    } catch {
      return null;
    }
  }

  const m = v.match(/^([a-z-]+)\s*:\s*(.+)$/i);
  if (m) {
    return { lang: m[1], title: m[2].replace(/\s/g, "_") };
  }

  return null;
}

// Wikipedia REST: list all media used on the page, then hydrate via Commons
async function fetchWikipediaMediaList(lang, title) {
  const url = `https://${lang}.wikipedia.org/w/rest.php/v1/page/${encodeURIComponent(
    title
  )}/links/media`;
  const rsp = await fetch(url, {
    headers: {
      "Api-User-Agent": "OpenAccessMap (viktor.shevchuk.dev@gmail.com)",
    },
  });

  // If the page is huge (>100 media), fall back to your existing Action API path
  // (prop=images -> fetchCommonsFileInfos)
  if (rsp.status === 500) {
    return fetchWikipediaImagesList(lang, title); // you already have this
  }
  if (!rsp.ok) return [];

  const data = await rsp.json();
  const files = data?.files || [];

  // Titles sometimes come back without "File:"; normalize.
  const titles = files
    .map((f) =>
      f?.title
        ? f.title.startsWith("File:")
          ? f.title
          : `File:${f.title}`
        : null
    )
    .filter(Boolean);

  return fetchCommonsFileInfos(titles); // you already have this (adds credit/license/thumbs)
}

async function resolveFromWikipediaTag(value) {
  const spec = parseWikipediaTag(value);
  if (!spec) return [];
  const { lang, title } = spec;

  // REST Summary often provides originalimage + thumbnail
  const rest = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title
  )}?redirect=true`;
  const res = await fetch(rest);
  if (!res.ok) return [];
  const data = await res.json();

  const photos = [];
  if (data?.originalimage?.source) {
    photos.push({
      src: data.originalimage.source,
      thumb: data.thumbnail?.source || data.originalimage.source,
      width: data.originalimage.width,
      height: data.originalimage.height,
      title: data.title || title,
      credit: "Wikipedia",
      source: `Wikipedia (${lang})`,
      pageUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(
        title
      )}`,
    });
  }

  const listPhotos = await fetchWikipediaMediaList(lang, title);
  photos.push(...listPhotos);

  // As a bonus, try pageimages via MediaWiki API for more sizes (optional)
  return photos;
}

/* ---------- Wikidata (P18) ---------- */
async function resolveFromWikidataTag(qid) {
  if (!qid) return [];
  const q = String(qid).trim();
  if (!/^Q\d+$/i.test(q)) return [];
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(
    q
  )}.json?origin=*`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  const entity = data?.entities?.[q.toUpperCase()];
  const claims = entity?.claims || {};
  const p18 = claims.P18 || [];
  const fileNames = p18
    .map((c) => c?.mainsnak?.datavalue?.value)
    .filter(Boolean);

  return fetchCommonsFileInfos(fileNames);
}

async function commonsGeoSearch({ lat, lng }, radiusM = 20, limit = 100) {
  const url = `${COMMONS_API}&action=query&generator=geosearch&ggsnamespace=6&ggslimit=${limit}&ggscoord=${lat}|${lng}&ggsradius=${radiusM}&prop=imageinfo|coordinates&iiurlwidth=1280&iiprop=url|extmetadata|mime&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const pages = data?.query?.pages || {};
  const items = Object.values(pages)
    .map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii?.url) return null;
      const author =
        ii.extmetadata?.Artist?.value?.replace(/<[^>]*>/g, "") || "";
      const license = ii.extmetadata?.LicenseShortName?.value || "";
      return {
        mime: ii.mime || "",
        width: ii.width,
        height: ii.height,
        src: ii.url,
        thumb: ii.thumburl || ii.url,
        title: p.title?.replace(/^File:/, "") || "Photo",
        credit: [author, license].filter(Boolean).join(" • "),
        source: "Wikimedia Commons (nearby)",
        pageUrl: ii.descriptionurl || ii.url,
      };
    })
    .filter(Boolean);
  return dropIconsPreferPhotos(items);
}

function commonsTitleFromValue(v) {
  if (!v) return null;
  let t = String(v).trim();
  if (!t || /^https?:\/\//i.test(t)) return null; // URLs handled elsewhere
  if (!/^File:/i.test(t)) t = `File:${t}`;
  return t.replace(/ /g, "_");
}

function collectOsmImageCandidates(tags = {}) {
  const urls = [];
  const commonsTitles = [];

  for (const k of Object.keys(tags)) {
    if (!/^image(?::\d+)?$/i.test(k)) continue; // image, image:0..9
    const v = String(tags[k]).trim();
    if (!v) continue;
    if (isHttpUrl(v)) {
      urls.push(v);
    } else {
      const t = commonsTitleFromValue(v);
      if (t) commonsTitles.push(t);
    }
  }

  // normalize wikimedia_commons if present (file name variants)
  if (tags.wikimedia_commons) {
    const t = commonsTitleFromValue(tags.wikimedia_commons);
    if (t) commonsTitles.push(t);
  }
  return { urls, commonsTitles };
}

/* ---------- Public: resolve photos from all tags ---------- */
export async function resolvePlacePhotos(tags, latlng) {
  const tasks = [];

  // image= (direct URLs)
  parseImageTag(tags?.image).forEach((u) => {
    tasks.push(Promise.resolve([photoFromDirectUrl(u)]));
  });

  // wikimedia_commons=
  if (tags?.wikimedia_commons) {
    tasks.push(resolveFromWikimediaCommonsTag(tags.wikimedia_commons));
  }

  // wikipedia=
  if (tags?.wikipedia) {
    tasks.push(resolveFromWikipediaTag(tags.wikipedia));
  }

  // wikidata=
  if (tags?.wikidata) {
    tasks.push(resolveFromWikidataTag(tags.wikidata));
  }

  const cands = collectOsmImageCandidates(tags);
  if (cands.commonsTitles.length) {
    tasks.push(fetchCommonsFileInfos(cands.commonsTitles));
  }

  // Add nearby sources if we have coords
  if (latlng) {
    tasks.push(commonsGeoSearch(latlng).catch(() => []));
  }

  const chunks = await Promise.allSettled(tasks);
  const flat = chunks
    .flatMap((c) => (c.status === "fulfilled" ? c.value : []))
    .filter(Boolean);

  // Dedup by src URL
  const unique = uniqBy(flat, (x) => x.src || x.thumb || x.pageUrl);

  // Lightweight ranking: prefer P18/Commons/Wikipedia over “direct image” if present
  const score = (p) =>
    p.source?.includes("Wikimedia")
      ? 3
      : p.source?.startsWith("Wikipedia")
      ? 2
      : p.source === "Direct"
      ? 1
      : 0;

  unique.sort((a, b) => score(b) - score(a));

  return unique;
}
