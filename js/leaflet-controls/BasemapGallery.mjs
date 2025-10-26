import { ls } from "../utils/localStorage.mjs";

export const BASEMAP_LS_KEY = "ui.basemap.choice";

export const osm = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  }
);

const osmGray = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 20,
    attribution: "© OpenStreetMap contributors, © CARTO",
  }
);

const worldImagery = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution:
      "Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and others",
  }
);

const cyclOSM = L.tileLayer(
  "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
  {
    maxZoom: 20,
    attribution: "© OpenStreetMap contributors, style © CyclOSM (cyclosm.org)",
  }
);

const THUNDERFOREST_KEY = "2b4c36450a944ef6876df29861a37103";
const tfSuffix = `?apikey=${THUNDERFOREST_KEY}`;

const openCycleMap = L.tileLayer(
  `https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png${tfSuffix}`,
  {
    maxZoom: 22,
    attribution: "© OpenStreetMap contributors, © Thunderforest",
  }
);

const transportDark = L.tileLayer(
  `https://tile.thunderforest.com/transport-dark/{z}/{x}/{y}.png${tfSuffix}`,
  {
    maxZoom: 22,
    attribution: "© OpenStreetMap contributors, © Thunderforest",
  }
);

const outdoors = L.tileLayer(
  `https://tile.thunderforest.com/outdoors/{z}/{x}/{y}.png${tfSuffix}`,
  {
    maxZoom: 22,
    attribution: "© OpenStreetMap contributors, © Thunderforest",
  }
);

const transport = L.tileLayer(
  `https://tile.thunderforest.com/transport/{z}/{x}/{y}.png${tfSuffix}`,
  {
    maxZoom: 22,
    attribution: "© OpenStreetMap contributors, © Thunderforest",
  }
);

const landScape = L.tileLayer(
  `https://tile.thunderforest.com/landscape/{z}/{x}/{y}.png${tfSuffix}`,
  {
    maxZoom: 22,
    attribution: "© OpenStreetMap contributors, © Thunderforest",
  }
);

export const baseLayers = {
  OSM: osm,
  "OSM Greyscale": osmGray,
  "World Imagery": worldImagery,
  CycleOSM: cyclOSM,

  "Open Cycle Map": openCycleMap,
  Transport: transport,
  "Transport Dark": transportDark,
  Landscape: landScape,
  Outdoors: outdoors,
};

function previewUrlFromTemplate(layer, { z = 2, x = 2, y = 2 } = {}) {
  let url = (layer && layer._url) || "";
  if (!url) return "";

  const subs = layer?.options?.subdomains ?? "abc";
  const sub = Array.isArray(subs)
    ? subs[0]
    : typeof subs === "string"
    ? subs[0]
    : "a";
  const r = window.devicePixelRatio > 1 ? "@2x" : "";

  url = url
    .replace("{s}", sub || "a")
    .replace("{z}", z)
    .replace("{x}", x)
    .replace("{y}", y)
    .replace("{r}", r);

  // strip any leftover braces just in case
  url = url.replace(/\{[^\}]+\}/g, "");
  return url;
}

// Build a list of basemaps with metadata (name, layer, preview img)
function buildBasemapList(baseLayersObj) {
  return Object.entries(baseLayersObj).map(([name, layer]) => ({
    name,
    layer,
    // choose a low zoom world-ish tile for all sources
    preview: previewUrlFromTemplate(layer, { z: 2, x: 2, y: 1 }),
  }));
}

const basemapList = buildBasemapList(baseLayers);

export const BasemapGallery = L.Control.extend({
  options: { position: "topright" },

  initialize(opts = {}) {
    L.setOptions(this, opts);
    // match baseLayers keys; falls back to OSM
    this._currentName = opts.initial || "OSM";
  },

  onAdd(map) {
    const container = L.DomUtil.create(
      "div",
      "leaflet-control basemap-gallery"
    );

    // Prevent map interactions while using the control
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    // --- Collapsed header (shows selected basemap preview) ---
    const head = document.createElement("div");
    head.className = "basemap-gallery__head";
    container.appendChild(head);

    // --- Expanded grid ---
    const grid = document.createElement("div");
    grid.className = "basemap-gallery__grid";
    container.appendChild(grid);

    // Utility: render the head based on current selection
    const renderHead = () => {
      const current =
        basemapList.find((b) => b.name === this._currentName) || basemapList[0];

      head.innerHTML = `
        <button type="button" class="bm-head-btn" aria-label="Current basemap: ${current.name}. Tap to change.">
          <img class="bm-head-img" src="${current.preview}" alt="${current.name} preview" />
          <span class="bm-head-label">${current.name}</span>
        </button>
      `;
    };

    // Build grid items
    basemapList.forEach(({ name, preview }) => {
      const wrap = document.createElement("div");
      wrap.className = "position-relative";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn bm-item bg-dark map-list-button";
      btn.setAttribute("aria-label", `Switch to ${name} basemap`);
      btn.dataset.name = name;

      if (name === this._currentName) btn.classList.add("active");

      btn.innerHTML = `
        <img class="bm-item__img" src="${preview}" alt="${name} preview" />
        <span class="bm-item__label badge text-white">${name}</span>
      `;

      btn.addEventListener("click", (e) => {
        const selectedName = e.currentTarget.dataset.name;
        if (selectedName === this._currentName) return;

        // Swap layers
        const oldLayer = baseLayers[this._currentName] || null;
        const newLayer = baseLayers[selectedName] || null;
        if (oldLayer) map.removeLayer(oldLayer);
        if (newLayer) newLayer.addTo(map);

        // Persist + UI
        ls.set(BASEMAP_LS_KEY, selectedName);
        this._currentName = selectedName;

        grid
          .querySelectorAll(".bm-item")
          .forEach((el) => el.classList.remove("active"));
        e.currentTarget.classList.add("active");

        // Update the collapsed head preview + label
        renderHead();
      });

      wrap.appendChild(btn);
      grid.appendChild(wrap);
    });

    // Initial head render
    renderHead();

    // Touch: tap head to toggle expand/collapse
    head.addEventListener("click", () => {
      container.classList.toggle("expanded");
    });

    // Close when clicking outside (for touch)
    document.addEventListener("click", (ev) => {
      if (!container.contains(ev.target))
        container.classList.remove("expanded");
    });

    return container;
  },
});
