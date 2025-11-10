// will now just render a wrapper
import debounce from "lodash.debounce";

import elements from "./constants/domElements.js";
import {
  fetchPlace,
  fetchPlaceGeometry,
  fetchPlaces,
} from "./api/fetchPlaces.js";
import { fetchRoute } from "./api/fetchRoute.js";
import { obstacleStorage } from "./api/obstacleStorage.js";
import {
  DEFAULT_ZOOM,
  EXCLUDED_PROPS,
  placeClusterConfig,
} from "./constants/constants.mjs";
import { toastError, toastWarn } from "./utils/toast.mjs";
import { waypointDivIcon, WP_COLORS } from "./utils/wayPoints.mjs";
import {
  DRAW_HELP_LS_KEY,
  DrawHelpAlert,
} from "./leaflet-controls/DrawHelpAlert.mjs";
import {
  AccessibilityLegend,
  getAccessibilityTier,
} from "./leaflet-controls/AccessibilityLegend.mjs";
import { ls } from "./utils/localStorage.mjs";
import {
  duringLoading,
  hideLoading,
  showDetailsLoading,
  showListSpinner,
  showLoading,
  withButtonLoading,
} from "./utils/loading.mjs";
import {
  baseLayers,
  BASEMAP_LS_KEY,
  BasemapGallery,
  osm,
} from "./leaflet-controls/BasemapGallery.mjs";
import {
  renderPhotosGrid,
  resolvePlacePhotos,
  showMainPhoto,
} from "./modules/fetchPhotos.mjs";

// console.log("🧭 mapMain.js imported fetchPhotos.mjs successfully");

import { makePoiIcon } from "./icons/makePoiIcon.mjs";
import { supabase } from "./api/supabaseClient.js";
import { ensurePlaceExists, reviewStorage } from "./api/reviewStorage.js";
import {
  cleanUrl,
  hostLabel,
  linkLabel,
  normalizeTagsCase,
  splitMulti,
  toMapillaryViewerUrl,
} from "./modules/beautifyDetailLinks.js";

import { recomputePlaceAccessibilityKeywords } from "./modules/accessibilityKeywordsExtraction.js";
import globals from "./constants/globalVariables.js";

let accessibilityFilter = new Set([
  "designated",
  "yes",
  "limited",
  "unknown",
  "no",
]);

let map = null;
let geocoder = null;

const offcanvasInstance = new bootstrap.Offcanvas(elements.offcanvas);

let clickPopup = null;

let selectedPlaceLayer = null;
let placesPane;

const placeClusterLayer = L.markerClusterGroup(placeClusterConfig);

// Track when Leaflet.Draw is in editing/deleting mode
const drawState = { editing: false, deleting: false };
let drawControl = null;

let fromLatLng = null;
let toLatLng = null;
let fromMarker = null;
let toMarker = null;
let routeLayer = null;

const drawnItems = new L.FeatureGroup();
let drawHelpAlertControl = null;

// ---------- Bootstrap Modal + Tooltip helpers ----------
let obstacleModalInstance = null;
let obstacleForm, obstacleTitleInput;

let obstacleFeatures = [];

function showQuickRoutePopup(latlng) {
  const html = `
    <div class="d-flex align-items-center gap-2" role="group" aria-label="Quick route actions">
      <button id="qp-start" type="button" class="btn btn-sm btn-primary">Start here</button>
      <button id="qp-go" type="button" class="btn btn-sm btn-danger">Go here</button>
    </div>
  `;

  if (clickPopup) {
    map.closePopup(clickPopup);
    clickPopup = null;
  }

  clickPopup = L.popup({
    className: "quick-choose-popup",
    offset: [0, -8],
    autoClose: true,
    closeOnClick: true,
    closeButton: true,
  })
    .setLatLng(latlng)
    .setContent(html)
    .openOn(map);

  const startBtn = document.getElementById("qp-start");
  const goBtn = document.getElementById("qp-go");

  startBtn.addEventListener("click", async (ev) => {
    L.DomEvent.stop(ev);
    console.log("🟢 CLICK: Start here clicked at latlng:", latlng);
    try {
      elements.directionsUi.classList.remove("d-none");
      moveDepartureSearchBarUnderTo();
      mountInOffcanvas("Directions");

      await setFrom(L.latLng(latlng), null, { fit: false });
      elements.departureSearchInput.focus();
    } finally {
      map.closePopup(clickPopup);
      console.log("🟢 Start here handler finished");
    }
  });

  goBtn.addEventListener("click", async (ev) => {
    console.log("🟢 CLICK: Go here clicked at latlng:", latlng);
    L.DomEvent.stop(ev);
    try {
      elements.directionsUi.classList.remove("d-none");
      moveDepartureSearchBarUnderTo();
      mountInOffcanvas("Directions");

      await setTo(L.latLng(latlng), null, { fit: false });
      elements.departureSearchInput.focus();
    } finally {
      map.closePopup(clickPopup);
    }
  });
}

/** Mount search bar + details panel into the Offcanvas and open it. */
function mountInOffcanvas(titleText) {
  elements.offcanvasTitle.textContent = titleText;
  offcanvasInstance.show();
}

elements.offcanvas.addEventListener("hidden.bs.offcanvas", () => {
  elements.destinationSearchBarHome.prepend(elements.destinationSearchBar);
  elements.destinationSearchBar.classList.remove("d-none");
});

function toggleDepartureSuggestions(visible) {
  elements.departureSuggestions.classList.toggle("d-none", !visible);
  elements.departureSearchInput.setAttribute(
    "aria-expanded",
    visible ? "true" : "false"
  );
}

function toggleDestinationSuggestions(visible) {
  elements.destinationSuggestions.classList.toggle("d-none", !visible);
  elements.destinationSearchInput.setAttribute(
    "aria-expanded",
    visible ? "true" : "false"
  );
}

function ensureObstacleModal() {
  if (!obstacleModalInstance) {
    const modalEl = document.getElementById("obstacleModal");
    obstacleForm = document.getElementById("obstacle-form");
    obstacleTitleInput = document.getElementById("obstacle-title");
    obstacleModalInstance = new bootstrap.Modal(modalEl);
  }
}

/**
 * Opens the Bootstrap modal. Returns a Promise that resolves to:
 *  { title } on Save, or null on Cancel/close.
 */
function showObstacleModal(initial = { title: "" }) {
  ensureObstacleModal();
  obstacleTitleInput.value = initial.title;

  return new Promise((resolve) => {
    let saved = false;

    const onSubmit = (e) => {
      e.preventDefault();
      saved = true;
      const title = obstacleTitleInput.value.trim();
      obstacleModalInstance.hide();
      obstacleForm.removeEventListener("submit", onSubmit);
      modalEl.removeEventListener("hidden.bs.modal", onHidden);
      resolve({ title });
    };

    const modalEl = document.getElementById("obstacleModal");
    const onHidden = () => {
      obstacleForm.removeEventListener("submit", onSubmit);
      modalEl.removeEventListener("hidden.bs.modal", onHidden);
      if (!saved) resolve(null);
    };

    obstacleForm.addEventListener("submit", onSubmit);
    modalEl.addEventListener("hidden.bs.modal", onHidden);
    obstacleModalInstance.show();
  });
}

function tooltipTextFromProps(p = {}) {
  const t = p.title?.trim();
  if (t) return t;
  return "Obstacle";
}

function attachBootstrapTooltip(layer, text) {
  // Vector layers (polygon/circle/line) are SVG paths; markers have icons.
  const el = layer.getElement?.() || layer._path || layer._icon;
  if (!el) return;

  // Dispose an existing tooltip on this layer if present.
  if (layer._bsTooltip) {
    layer._bsTooltip.dispose();
    layer._bsTooltip = null;
  }

  el.setAttribute("data-bs-toggle", "tooltip");
  el.setAttribute("data-bs-title", text);
  // A11y
  el.setAttribute("aria-label", text);

  // Create a fresh tooltip instance
  layer._bsTooltip = new bootstrap.Tooltip(el, {
    placement: "top",
    trigger: "hover focus",
    container: "body",
  });
}

async function openEditModalForLayer(layer) {
  const id = layer.options.obstacleId;
  const idx = obstacleFeatures.findIndex(
    (f) => f.properties?.obstacleId === id
  );
  if (idx === -1) return;

  const props = obstacleFeatures[idx].properties || {};
  const result = await showObstacleModal({ title: props.title });
  if (!result) return; // cancelled

  // Update in-memory + storage
  obstacleFeatures[idx].properties = {
    ...props,
    obstacleId: id,
    title: result.title,
  };
  await obstacleStorage("PUT", obstacleFeatures);

  // Update tooltip
  attachBootstrapTooltip(
    layer,
    tooltipTextFromProps(obstacleFeatures[idx].properties)
  );
}

function hookLayerInteractions(layer, props) {
  // Ensure the element exists in the DOM before creating tooltip
  // (safe if we call after the layer is added to the map/featureGroup).
  // Re-attach tooltip whenever the layer is re-added to the map
  layer.once("add", () =>
    attachBootstrapTooltip(layer, tooltipTextFromProps(props))
  );

  layer.off("click");
  layer.on("click", () => {
    if (drawState.deleting || drawState.editing) return;
    openEditModalForLayer(layer);
  });
}

function toggleObstaclesByZoom() {
  const allow = map.getZoom() >= DEFAULT_ZOOM;

  if (allow) {
    if (!drawHelpAlertControl && !ls.get(DRAW_HELP_LS_KEY)) {
      drawHelpAlertControl = new DrawHelpAlert();
      map.addControl(drawHelpAlertControl);
    }

    map.addControl(drawControl);
  } else {
    if (drawHelpAlertControl && !ls.get(DRAW_HELP_LS_KEY)) {
      map.removeControl(drawHelpAlertControl);
      drawHelpAlertControl = null;
    }

    map.removeControl(drawControl);
  }
}

let placesReqSeq = 0;
async function refreshPlaces() {
  const mySeq = ++placesReqSeq; // capture this call’s id

  const zoom = map.getZoom();
  const key = showLoading("places");

  try {
    const geojson = await fetchPlaces(map.getBounds(), zoom, {
      accessibilityFilter,
    });
    // If this response is for an old call, ignore it
    if (mySeq !== placesReqSeq) return;

    placeClusterLayer.clearLayers();

    const placesLayer = L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const tags = feature.properties.tags || feature.properties;
        // console.log("POI tags sample:", tags);

        const marker = L.marker(latlng, {
          pane: "places-pane",
          icon: makePoiIcon(tags), // <-- fixed 33px badge
        })
          .on("click", () => {
            renderDetails(tags, L.latLng(latlng), { keepDirectionsUi: true });
          })
          .on("add", () => {
            const title = tags.name ?? tags.amenity ?? "Unnamed place";
            attachBootstrapTooltip(marker, title);
          })
          .on("remove", () => {
            if (marker._bsTooltip) {
              marker._bsTooltip.dispose();
              marker._bsTooltip = null;
            }
          });

        return marker;
      },
    });
    placeClusterLayer.addLayer(placesLayer);
  } finally {
    hideLoading(key);
  }
}

function moveDepartureSearchBarUnderTo() {
  const toLabel = elements.directionsUi?.querySelector?.(
    'label[for="destination-search-input"]'
  );

  if (!toLabel) {
    console.warn("⚠️ moveDepartureSearchBarUnderTo: label not found");
    return;
  }

  toLabel.insertAdjacentElement("afterend", elements.destinationSearchBar);
}

const renderOneReview = (text) => {
  const li = document.createElement("li");
  li.className = "list-group-item text-wrap";
  li.innerHTML = `${text}<div class="mt-1 d-flex flex-wrap gap-1 review-badges"></div>`;
  elements.reviewsList.appendChild(li);
};

function makeCircleFeature(layer) {
  const center = layer.getLatLng();
  const radius = layer.getRadius(); // meters
  return {
    type: "Feature",
    properties: { radius },
    geometry: { type: "Point", coordinates: [center.lng, center.lat] },
  };
}

const renderDetails = async (tags, latlng, { keepDirectionsUi } = {}) => {
  globals.detailsCtx.tags = tags;
  const titleText = tags.name || tags.amenity || "Details";

  elements.detailsPanel.classList.remove("d-none");
  const list = elements.detailsPanel.querySelector("#details-list");
  list.innerHTML = "";

  const nTags = normalizeTagsCase(tags);

  // WEBSITE (single merged block)
  const websiteLinks = splitMulti(nTags.website || "")
    .map(cleanUrl)
    .filter(Boolean);
  if (websiteLinks.length) {
    const item = document.createElement("div");
    item.className =
      "list-group-item d-flex justify-content-between align-items-start";
    const links = websiteLinks
      .map(
        (u) =>
          `<a href="${u}" target="_blank" rel="noopener nofollow ugc">${linkLabel(
            u
          )}</a>`
      )
      .join(" · ");
    item.innerHTML = `<div class="me-2"><h6 class="mb-1 fw-semibold">Website</h6><p class="small mb-1">${links}</p></div>`;
    list.appendChild(item);
  }

  // --- Render basic tags (address, amenity, etc.) ---
  Object.entries(nTags).forEach(([key, value]) => {
    const isWebsiteVariant =
      /^(website|url)(?::\d+)?$/i.test(key) || /^contact:website$/i.test(key);
    if (isWebsiteVariant) return;

    const containsAltName = /alt\s*name/i.test(key);
    const containsLocalizedVariants =
      /^(name|alt_name|short_name|display_name):/i.test(key);
    const isCountryKey = /^country$/i.test(key);
    const isWikiDataKey = /^wikidata(?::[a-z-]+)?$/i.test(key);

    const isExcluded =
      EXCLUDED_PROPS.has(key) ||
      containsAltName ||
      containsLocalizedVariants ||
      isCountryKey ||
      isWikiDataKey;

    if (isExcluded) return;

    const lk = key.toLowerCase();
    const item = document.createElement("div");
    item.className =
      "list-group-item d-flex justify-content-between align-items-start";

    // Special cases: linkify
    if (lk === "website" || lk === "url") {
      const urls = splitMulti(value).map(cleanUrl).filter(Boolean);
      if (!urls.length) return;

      const links = urls
        .map(
          (u) =>
            `<a href="${u}" target="_blank" rel="noopener nofollow ugc">${hostLabel(
              u
            )}</a>`
        )
        .join(" · ");

      item.innerHTML = `
      <div class="me-2">
        <h6 class="mb-1 fw-semibold">Website</h6>
        <p class="small mb-1">${links}</p>
      </div>`;
      list.appendChild(item);
      return;
    }

    if (lk === "image") {
      const urls = splitMulti(value).map(cleanUrl).filter(Boolean);
      if (!urls.length) return;

      const links = urls
        .map((u) => {
          // If someone put a Mapillary URL in image=, route it to the viewer
          if (/mapillary\.com/i.test(u)) {
            const viewer = toMapillaryViewerUrl(u);
            return `<a href="${viewer}" target="_blank" rel="noopener nofollow ugc">Mapillary</a>`;
          }
          // Google Photos shares are pages, not direct images; still useful
          if (/photos\.app\.goo\.gl|photos\.google\.com/i.test(u)) {
            return `<a href="${u}" target="_blank" rel="noopener nofollow ugc">Google Photos</a>`;
          }
          // Fallback: show host
          return `<a href="${u}" target="_blank" rel="noopener nofollow ugc">${hostLabel(
            u
          )}</a>`;
        })
        .join(" · ");

      item.innerHTML = `
      <div class="me-2">
        <h6 class="mb-1 fw-semibold">Photo Link(s)</h6>
        <p class="small mb-1">${links}</p>
      </div>`;
      list.appendChild(item);
      return;
    }

    if (lk === "mapillary") {
      const viewer = toMapillaryViewerUrl(value);
      if (!viewer) return;
      item.innerHTML = `
      <div class="me-2">
        <h6 class="mb-1 fw-semibold">Street Imagery</h6>
        <p class="small mb-1">
          <a href="${viewer}" target="_blank" rel="noopener nofollow ugc">Open in Mapillary</a>
        </p>
      </div>`;
      list.appendChild(item);
      return;
    }

    if (lk === "wikipedia" || /^wikipedia:[a-z-]+$/i.test(lk)) {
      const spec = lk === "wikipedia" ? value : `${lk.split(":")[1]}:${value}`;
      const m = String(spec).match(/^([a-z-]+)\s*:\s*(.+)$/i);
      if (m) {
        const lang = m[1];
        const title = m[2].replace(/\s/g, "_");
        const href = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(
          title
        )}`;
        item.innerHTML = `
      <div class="me-2">
        <h6 class="mb-1 fw-semibold">Wikipedia</h6>
        <p class="small mb-1"><a href="${href}" target="_blank" rel="noopener">Wikipedia (${lang})</a></p>
      </div>`;
        list.appendChild(item);
        return;
      }
    }

    // Default rendering
    let displayKey = null;
    if (key === "display_name") {
      displayKey = "Address";
    } else {
      displayKey = key
        .replace(/^Addr_?/i, "")
        .replace(/[_:]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    const displayValue = String(value)
      .replace(/[_:]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    item.innerHTML = `
    <div class="me-2">
      <h6 class="mb-1 fw-semibold">${displayKey}</h6>
      <p class="small mb-1">${displayValue}</p>
    </div>`;
    list.appendChild(item);
  });

  globals.detailsCtx.latlng = latlng;
  globals.detailsCtx.placeId = tags.id ?? tags.osm_id ?? tags.place_id;

  // ✅ Ensure the place exists before fetching reviews
  let uuid = null;
  try {
    uuid = await ensurePlaceExists(tags, latlng);
    globals.detailsCtx.placeId = uuid;
    console.log("✅ globals.detailsCtx.placeId (UUID):", uuid);
  } catch (err) {
    console.warn("⚠️ ensurePlaceExists failed, skipping reviews:", err);
    globals.detailsCtx.placeId = null; // still allow photos to load
  }
  globals.detailsCtx.placeId = uuid;
  console.log("✅ globals.detailsCtx.placeId (UUID):", uuid);

  // ✅ Give Supabase a short delay to confirm record visibility (important for free tier)
  await new Promise((r) => setTimeout(r, 10));

  // ✅ Fetch reviews ONCE (with small retry for consistency)
  const key = showLoading("reviews-load");
  globals.reviews = [];
  try {
    let retries = 3;
    while (retries-- > 0) {
      const data = await reviewStorage("GET", {
        place_id: globals.detailsCtx.placeId,
      });
      if (data?.length || retries === 0) {
        globals.reviews = data;
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
  } finally {
    hideLoading(key);
  }

  // ✅ Render reviews
  elements.reviewsList.innerHTML = "";
  if (globals.reviews.length === 0) {
    const emptyMsg = document.createElement("li");
    emptyMsg.className = "list-group-item text-muted";
    emptyMsg.textContent = "No reviews yet.";
    elements.reviewsList.appendChild(emptyMsg);
  } else {
    globals.reviews.forEach((r) => renderOneReview(r.comment));
  }

  // ✅ Handle layout and offcanvas
  if (!keepDirectionsUi) elements.directionsUi.classList.add("d-none");
  moveDepartureSearchBarUnderTo();
  mountInOffcanvas(titleText);

  // --- Photos ---
  try {
    const keyPhotos = showLoading("photos-load");
    const photos = await resolvePlacePhotos(tags, latlng);

    console.log(
      "📷 resolvePlacePhotos returned",
      photos.length,
      "items:",
      photos
    );
    showMainPhoto(photos[0]);
    renderPhotosGrid(photos);
    hideLoading(keyPhotos);
  } catch (err) {
    console.warn("Photo resolution failed", err);
    showMainPhoto(null);
    renderPhotosGrid([]);
  }

  recomputePlaceAccessibilityKeywords().catch(console.error);
};

async function initDrawingObstacles() {
  const key = showLoading("obstacles-load");
  try {
    obstacleFeatures = await obstacleStorage();
  } finally {
    hideLoading(key);
  }

  // 🧩 Log all obstacle IDs for debugging
  console.group("🧱 Obstacles loaded from Supabase");
  obstacleFeatures.forEach((row, idx) => {
    console.log(
      `${idx + 1}. id: ${row.id}, type: ${row.type}, description: ${
        row.description
      }`
    );
  });
  console.groupEnd();

  obstacleFeatures.forEach((row) => {
    const feature = {
      type: "Feature",
      properties: {
        obstacleId: row.id,
        shape: row.type,
        title: row.description,
        radius: row.radius,
      },
      geometry: row.geometry,
    };

    let layer = null;
    if (feature.properties.shape === "circle") {
      const [lng, lat] = feature.geometry.coordinates;
      layer = L.circle([lat, lng], {
        radius: feature.properties.radius,
        color: "red",
      });
    } else if (feature.properties.shape === "rectangle") {
      const bounds = L.geoJSON(feature).getBounds();
      layer = L.rectangle(bounds, { color: "red" });
    } else {
      layer = L.geoJSON(feature, { style: { color: "red" } }).getLayers()[0];
    }

    layer.options.obstacleId = feature.properties.obstacleId;
    drawnItems.addLayer(layer);
    hookLayerInteractions(layer, feature.properties);
  });

  map.addLayer(drawnItems);

  drawControl = new L.Control.Draw({
    position: "topright",
    edit: { featureGroup: drawnItems },
    draw: {
      polyline: { shapeOptions: { color: "red" } },
      polygon: { allowIntersection: false, shapeOptions: { color: "red" } },
      rectangle: { shapeOptions: { color: "red" } },
      circle: { shapeOptions: { color: "red" } },
      marker: false,
      circlemarker: false,
    },
  });
  toggleObstaclesByZoom();

  // CREATE
  map.on(L.Draw.Event.CREATED, async (e) => {
    let layerToAdd, featureToStore;

    if (e.layer instanceof L.Circle) {
      featureToStore = makeCircleFeature(e.layer);
      layerToAdd = L.circle(e.layer.getLatLng(), {
        radius: e.layer.getRadius(),
        color: "red",
      });
    } else {
      featureToStore = e.layer.toGeoJSON();
      layerToAdd = e.layer;
    }

    drawnItems.addLayer(layerToAdd);
    const result = await showObstacleModal();

    if (!result) {
      drawnItems.removeLayer(layerToAdd);
      return;
    }

    featureToStore.properties = {
      ...(featureToStore.properties || {}),
      title: result.title,
      shape: e.layerType,
    };

    hookLayerInteractions(layerToAdd, featureToStore.properties);
    attachBootstrapTooltip(
      layerToAdd,
      tooltipTextFromProps(featureToStore.properties)
    );

    const key = showLoading("obstacles-put");
    try {
      const { data, error } = await supabase
        .from("obstacles")
        .insert([
          {
            type: featureToStore.properties.shape,
            description: featureToStore.properties.title,
            geometry: featureToStore.geometry,
            radius:
              featureToStore.properties.radius ??
              (e.layer.getRadius?.() || null),
          },
        ])
        .select();

      if (error) throw error;

      const newObstacle = data[0];
      layerToAdd.options.obstacleId = newObstacle.id;
      obstacleFeatures.push({
        type: "Feature",
        properties: {
          obstacleId: newObstacle.id,
          shape: newObstacle.type,
          title: newObstacle.description,
        },
        geometry: newObstacle.geometry,
      });
      console.log("✅ Inserted new obstacle:", newObstacle.id);
    } catch (err) {
      console.error("❌ Failed to save obstacle:", err);
      drawnItems.removeLayer(layerToAdd);
      toastError("Could not save obstacle.");
    } finally {
      hideLoading(key);
    }
  });

  // EDIT
  map.on(L.Draw.Event.EDITED, async (e) => {
    e.layers.eachLayer(async (layer) => {
      const id = layer.options.obstacleId;
      const updated =
        layer instanceof L.Circle
          ? makeCircleFeature(layer)
          : layer.toGeoJSON();
      const existing = obstacleFeatures.find(
        (f) => f.properties.obstacleId === id
      );
      if (!existing) return;

      existing.geometry = updated.geometry;
      const key = showLoading("obstacles-put");

      try {
        await obstacleStorage("PUT", {
          id,
          type: existing.properties.shape,
          description: existing.properties.title,
          geometry: updated.geometry,
          radius: updated.properties?.radius || layer.getRadius?.() || null,
        });
        hookLayerInteractions(layer, updated.properties);
        console.log("✅ Updated obstacle:", id);
      } catch (err) {
        console.error("❌ Failed to update:", err);
        toastError("Could not update obstacle.");
      } finally {
        hideLoading(key);
      }
    });
  });

  // DELETE
  map.on(L.Draw.Event.DELETED, async (e) => {
    e.layers.eachLayer(async (layer) => {
      // Clean up tooltip instance if present
      if (layer._bsTooltip) {
        layer._bsTooltip.dispose();
        layer._bsTooltip = null;
      }

      const id =
        layer?.options?.obstacleId ||
        layer?.feature?.properties?.obstacleId ||
        layer?.feature?.id ||
        null;

      if (!id) {
        console.warn("⚠️ Skipping layer without obstacleId:", layer);
        return;
      }

      // Safely filter local list
      obstacleFeatures = obstacleFeatures.filter(
        (f) => f?.properties?.obstacleId !== id
      );

      try {
        console.log("🚀 Deleting from Supabase with ID:", id);
        await duringLoading("obstacles-put", obstacleStorage("DELETE", { id }));
        console.log("🗑️ Deleted obstacle:", id);
      } catch (err) {
        console.error("❌ Failed to delete obstacle:", err);
        toastError("Could not delete obstacle.");
      }
    });
  });
}

function renderDepartureSuggestions(items) {
  elements.departureSuggestions.innerHTML = "";
  if (!items || !items.length) {
    toggleDepartureSuggestions(false);
    return;
  }
  items.forEach((res, idx) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "list-group-item list-group-item-action list-group-item-light";
    btn.role = "option";
    btn.dataset.index = String(idx);
    btn.textContent = res.name;
    btn.addEventListener("click", () => selectDepartureSuggestion(items[idx]));
    li.appendChild(btn);
    elements.departureSuggestions.appendChild(li);
  });
  toggleDepartureSuggestions(true);
}

function renderDestinationSuggestions(items) {
  elements.destinationSuggestions.innerHTML = "";
  if (!items || !items.length) {
    toggleDestinationSuggestions(false);
    return;
  }
  items.forEach((res, idx) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "list-group-item list-group-item-action list-group-item-light";
    btn.role = "option";
    btn.dataset.index = String(idx);
    btn.textContent = res.name;
    btn.addEventListener("click", () =>
      selectDestinationSuggestion(items[idx])
    );
    li.appendChild(btn);
    elements.destinationSuggestions.appendChild(li);
  });
  toggleDestinationSuggestions(true);
}

function attachDraggable(marker, onMove) {
  marker.on("dragend", async (e) => {
    const ll = e.target.getLatLng();
    await onMove(ll);
  });
}

function clearRoute() {
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
}

async function updateRoute({ fit = true } = {}) {
  console.log("🧭 updateRoute() called:", { fromLatLng, toLatLng });

  // 🧩 Defensive guard
  if (
    !fromLatLng ||
    !toLatLng ||
    !fromLatLng.lat ||
    !fromLatLng.lng ||
    !toLatLng.lat ||
    !toLatLng.lng
  ) {
    console.warn("⚠️ updateRoute aborted: invalid from/to coords", {
      fromLatLng,
      toLatLng,
    });
    return;
  }

  clearRoute();

  const key = showLoading("route");

  try {
    const geojson = await fetchRoute(
      [
        [fromLatLng.lng, fromLatLng.lat],
        [toLatLng.lng, toLatLng.lat],
      ],
      obstacleFeatures
    );
    console.log("📦 fetchRoute() returned:", geojson);

    routeLayer = L.geoJSON(geojson, {
      style: { color: "var(--bs-indigo)", weight: 5, opacity: 0.9 },
      interactive: false,
    }).addTo(map);

    const bounds = routeLayer.getBounds();
    if (fit && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [120, 120] });
    }
  } finally {
    hideLoading(key);
  }
}

function reverseAddressAt(latlng) {
  console.log("🧭 reverseAddressAt called for:", latlng);

  const key = showLoading("reverse");

  return new Promise((resolve) => {
    geocoder.reverse(latlng, map.options.crs.scale(18), (items) => {
      console.log("📍 reverseAddressAt → got items:", items);
      hideLoading(key);

      const best = items?.[0]?.name;
      resolve(best || `${latlng.lat}, ${latlng.lng}`);
    });
  });
}

async function setFrom(latlng, text, opts = {}) {
  console.log("➡️ setFrom() called with:", { latlng, text, opts });

  fromLatLng = latlng;
  if (fromMarker) map.removeLayer(fromMarker);
  fromMarker = L.marker(latlng, {
    draggable: true,
    icon: waypointDivIcon("A", WP_COLORS.start),
  }).addTo(map);

  attachDraggable(fromMarker, async (ll) => {
    console.log("🌀 fromMarker dragged to:", ll);
    fromLatLng = ll;
    elements.departureSearchInput.value = await reverseAddressAt(ll);
    updateRoute({ fit: false });
  });

  elements.departureSearchInput.value =
    text ?? (await reverseAddressAt(latlng));

  await updateRoute(opts);
}

async function setTo(latlng, text, opts = {}) {
  console.log("➡️ setTo() called with:", { latlng, text, opts });
  console.log(
    "ℹ️ directionsUi visible?",
    !elements.directionsUi.classList.contains("d-none")
  );
  toLatLng = latlng;
  const directionsActive = !elements.directionsUi.classList.contains("d-none");
  if (directionsActive) {
    if (toMarker) map.removeLayer(toMarker);
    toMarker = L.marker(latlng, {
      draggable: true,
      icon: waypointDivIcon("B", WP_COLORS.end),
    }).addTo(map);
    attachDraggable(toMarker, async (ll) => {
      toLatLng = ll;
      elements.destinationSearchInput.value = await reverseAddressAt(ll);
      updateRoute({ fit: false });
    });
  }

  elements.destinationSearchInput.value =
    text ?? (await reverseAddressAt(latlng));
  updateRoute(opts);
}

async function selectDepartureSuggestion(res) {
  toggleDepartureSuggestions(false);
  await setFrom(L.latLng(res.center), res.name);
}

async function selectDestinationSuggestion(res) {
  toggleDestinationSuggestions(false);

  if (selectedPlaceLayer) map.removeLayer(selectedPlaceLayer);

  showDetailsLoading(
    elements.detailsPanel,
    res.name ?? "Details",
    moveDepartureSearchBarUnderTo,
    mountInOffcanvas
  );

  const key = showLoading("place-select");

  try {
    const osmType = res.properties.osm_type;
    const osmId = res.properties.osm_id;

    // 🗺️ Draw outline or marker
    const geojsonGeometry = await fetchPlaceGeometry(osmType, osmId);
    const polyLike =
      geojsonGeometry.features.find(
        (f) => f.geometry && f.geometry.type !== "Point"
      ) || null;

    if (polyLike) {
      selectedPlaceLayer = L.geoJSON(geojsonGeometry, {
        style: {
          color: "#d33",
          weight: 2,
          opacity: 0.8,
          fillColor: "#f03",
          fillOpacity: 0.1,
          dashArray: "6,4",
        },
      });
      map.fitBounds(selectedPlaceLayer.getBounds());
    } else {
      const icon = waypointDivIcon("", WP_COLORS.end);
      selectedPlaceLayer = L.marker(L.latLng(res.center), {
        icon,
        keyboard: false,
        interactive: false,
      });
      map.setView(selectedPlaceLayer.getLatLng(), 18);
    }

    selectedPlaceLayer.addTo(map);
    await setTo(L.latLng(res.center), res.name);

    // 🧭 STEP 1: basic Photon tags
    let tags = res.properties.tags || res.properties || {};
    console.log("🔍 Photon basic tags:", tags);

    // 🧭 STEP 2: fetch Overpass enrichment
    const enriched = await fetchPlace(osmType, osmId); // uses Overpass
    tags = { ...tags, ...enriched };
    console.log("📦 Enriched tags:", tags);

    // 🧭 STEP 3: render all details, photos, reviews, etc.
    renderDetails(tags, L.latLng(res.center));
  } catch (err) {
    console.error("❌ selectDestinationSuggestion failed", err);
  } finally {
    hideLoading(key);
  }
}

const hideSuggestionsIfClickedOutside = (e) => {
  if (!elements.departureSearchBar.contains(e.target)) {
    toggleDepartureSuggestions(false);
  }

  if (!elements.destinationSearchBar.contains(e.target)) {
    toggleDestinationSuggestions(false);
  }
};

export async function initMap() {
  // ✅ Create a Photon-based geocoder instance from Leaflet-Control-Geocoder.
  // This object normally has `geocode()` (search by name) and `reverse()` (get name from coordinates),
  // but the default implementation uses XHR, which often fails in modern frameworks (Next.js, Vite, Turbopack).
  geocoder = L.Control.Geocoder.photon({
    serviceUrl: "https://photon.komoot.io/api/",
    reverseUrl: "https://photon.komoot.io/reverse/",
  });

  // ------------------------------------------------------------
  // Utility helper for making safe JSON requests
  // ------------------------------------------------------------

  // Instead of repeating fetch + error handling in both functions,
  // we define a helper that guarantees consistent error messages.
  const safeFetch = async (url) => {
    const res = await fetch(url);

    // If Photon responds with non-2xx (e.g., 403 or 500), throw a descriptive error.
    if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);

    // Parse JSON — Photon always returns valid GeoJSON FeatureCollection.
    return res.json();
  };

  // ------------------------------------------------------------
  // Override the default forward geocoding behavior (Search bar)
  // ------------------------------------------------------------

  // This replaces Leaflet’s internal geocode() implementation
  // with our own version that uses fetch() and always calls the callback (`cb`)
  // — even if the request fails or returns no results.
  geocoder.geocode = async function (query, cb) {
    try {
      // Compose the Photon API endpoint with a properly encoded search string.
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
        query
      )}`;

      // Fetch the GeoJSON response safely.
      const json = await safeFetch(url);

      // Map each GeoJSON feature into Leaflet-friendly result objects.
      const results = (json.features || []).map((f) => ({
        name:
          f.properties.name || // normal place name
          f.properties.osm_value || // fallback: OSM tag (like "restaurant")
          f.properties.street || // or street name
          "Unnamed", // fallback if no name at all
        center: [
          // convert [lon, lat] → [lat, lon] for Leaflet
          f.geometry.coordinates[1],
          f.geometry.coordinates[0],
        ],
        properties: f.properties, // keep all Photon metadata for later (e.g. OSM ID)
      }));

      // Log to help debug and confirm search → callback path.
      console.log("🌍 Photon geocode callback fired:", query, results);

      // ✅ Always call the callback with results — this updates the search suggestions.
      cb(results);
    } catch (err) {
      // In case of fetch/network/parse errors, print clearly in console.
      console.error("❌ Photon geocode failed:", err);

      // ✅ Important: still call `cb([])` so the UI spinner stops instead of hanging forever.
      cb([]);
    }
  };

  // ------------------------------------------------------------
  // 📍 Override reverse geocoding behavior (Route start/end naming)
  // ------------------------------------------------------------

  // Similar to above, but goes the other way around: lat/lng → nearest place name.
  geocoder.reverse = async function (latlng, scale, cb) {
    console.log(
      "🔎 geocoder.reverse input:",
      latlng,
      "array?",
      Array.isArray(latlng)
    );

    try {
      // Build the reverse geocoding URL with coordinates.
      const url = `https://photon.komoot.io/reverse?lat=${latlng.lat}&lon=${latlng.lng}`;

      // Fetch and parse JSON safely.
      const json = await safeFetch(url);

      // Convert GeoJSON features to Leaflet-friendly results.
      const results = (json.features || []).map((f) => ({
        name:
          f.properties.name || // best available name
          f.properties.osm_value || // fallback (e.g., "building" or "bus_stop")
          f.properties.street || // or nearby street
          "Unnamed", // last-resort fallback
        center: [f.geometry.coordinates[1], f.geometry.coordinates[0]],
        properties: f.properties,
      }));

      // Log to confirm reverse geocode happened and data returned.
      console.log("📍 Photon reverse callback fired:", latlng, results);

      // ✅ Pass results to the callback so map labels and inputs update.
      cb(results);
    } catch (err) {
      // Handle network, JSON, or HTTP failures.
      console.error("❌ Photon reverse failed:", err);

      // ✅ Always call cb([]) — never leave routing promises hanging.
      cb([]);
    }
  };

  // ============= MAP INIT =============
  map = L.map("map", { zoomControl: false });

  const initialName = ls.get(BASEMAP_LS_KEY) || "OSM Greyscale";
  let currentBasemapLayer = baseLayers[initialName] || osm;
  currentBasemapLayer.addTo(map);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        map.setView([latitude, longitude], DEFAULT_ZOOM);
        L.marker([latitude, longitude]).addTo(map);
      },
      (error) => {
        const userDeniedGeolocation = error.code === 1;
        if (!userDeniedGeolocation) {
          console.log(error);
          toastError("Could not get your location. Using default location.", {
            important: true,
          });
        }

        const defaultLatLng = [50.4501, 30.5234]; // Kyiv, Ukraine
        // const defaultLatLng = [51.5074, -0.1278]; // London, UK
        map.setView(defaultLatLng, DEFAULT_ZOOM);
      }
    );
  } else {
    const defaultLatLng = [50.4501, 30.5234]; // Kyiv, Ukraine
    map.setView(defaultLatLng, DEFAULT_ZOOM);
    toastWarn("Geolocation not supported. Using default location.");
  }

  // ============= EVENT LISTENERS =============
  map.whenReady(async () => {
    // console.log("✅ Leaflet map ready, initializing places...");
    placesPane = map.createPane("places-pane");
    placesPane.style.zIndex = 450;

    L.control.zoom({ position: "bottomright" }).addTo(map);
    placeClusterLayer.addTo(map);

    map.addControl(new AccessibilityLegend());

    // console.log("🧩 AccessibilityLegend added to map");

    map.on("draw:editstart", () => (drawState.editing = true));
    map.on("draw:editstop", () => (drawState.editing = false));
    map.on("draw:deletestart", () => (drawState.deleting = true));
    map.on("draw:deletestop", () => (drawState.deleting = false));

    map.on("moveend", debounce(refreshPlaces, 200));
    await initDrawingObstacles();

    map.addControl(new BasemapGallery({ initial: initialName }));

    map.on("baselayerchange", (e) => ls.set(BASEMAP_LS_KEY, e.name));
    map.on("zoomend", toggleObstaclesByZoom);
    map.on("click", (e) => {
      if (drawState.editing || drawState.deleting) return;
      showQuickRoutePopup(e.latlng);
    });
  });

  // Also hide on Escape
  elements.departureSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggleDepartureSuggestions(false);
  });
  elements.destinationSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggleDestinationSuggestions(false);
  });

  let destinationGeocodeReqSeq = 0;
  elements.destinationSearchInput.addEventListener(
    "input",
    debounce((e) => {
      console.log("🎯 debounce triggered for query:", e.target.value);
      const searchQuery = e.target.value.trim();

      if (!searchQuery) {
        toggleDestinationSuggestions(false);
        return;
      }

      const mySeq = ++destinationGeocodeReqSeq;
      showListSpinner(elements.destinationSuggestions, "Searching…");

      geocoder.geocode(searchQuery, (items) => {
        if (mySeq !== destinationGeocodeReqSeq) return;

        renderDestinationSuggestions(items);

        if (!items?.length) {
          elements.destinationSuggestions.innerHTML = `<li class="list-group-item text-muted">No results</li>`;
          elements.destinationSuggestions.classList.remove("d-none");
        }
      });
    }, 200)
  );

  let departureGeocodeReqSeq = 0;
  elements.departureSearchInput.addEventListener(
    "input",
    debounce((e) => {
      const searchQuery = e.target.value.trim();
      if (!searchQuery) {
        toggleDepartureSuggestions(false);
        return;
      }
      const mySeq = ++departureGeocodeReqSeq;
      showListSpinner(elements.departureSuggestions, "Searching…");

      geocoder.geocode(searchQuery, (items) => {
        if (mySeq !== departureGeocodeReqSeq) return;
        renderDepartureSuggestions(items);
        if (!items?.length) {
          elements.departureSuggestions.innerHTML = `<li class="list-group-item text-muted">No results</li>`;
          elements.departureSuggestions.classList.remove("d-none");
        }
      });
    }, 200)
  );

  document.addEventListener("click", hideSuggestionsIfClickedOutside);

  elements.detailsPanel
    .querySelector("#btn-start-here")
    .addEventListener("click", async () => {
      elements.directionsUi.classList.remove("d-none");
      mountInOffcanvas("Directions");
      await setFrom(globals.detailsCtx.latlng);
      elements.departureSearchInput.focus();
    });

  elements.detailsPanel
    .querySelector("#btn-go-here")
    .addEventListener("click", async () => {
      elements.directionsUi.classList.remove("d-none");
      mountInOffcanvas("Directions");
      await setTo(globals.detailsCtx.latlng);
      elements.departureSearchInput.focus();
    });

  elements.reviewForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const textarea = elements.reviewForm.querySelector("#review-text");
    const text = textarea.value.trim();
    if (!text) return;

    try {
      console.log("🧭 Review submit ctx:", globals.detailsCtx);
      const placeId =
        globals.detailsCtx.placeId ??
        (await ensurePlaceExists(
          globals.detailsCtx.tags,
          globals.detailsCtx.latlng
        ));
      const newReview = { text, place_id: placeId };

      await withButtonLoading(
        elements.submitReviewBtn,
        reviewStorage("POST", newReview),
        "Saving…"
      );

      // ✅ Reload and render updated reviews list
      globals.reviews = await reviewStorage("GET", { place_id: placeId });
      elements.reviewsList.innerHTML = "";
      globals.reviews.forEach((r) => renderOneReview(r.comment));

      textarea.value = "";

      recomputePlaceAccessibilityKeywords().catch(console.error);
    } catch (error) {
      console.error("❌ Failed to save review:", error);
      toastError("Could not save your review. Please try again.");
    }
  });

  // ✅ Global — must be OUTSIDE the submit handler
  document.addEventListener("accessibilityFilterChanged", (e) => {
    const incoming = e.detail;

    if (!incoming || !incoming.length) {
      accessibilityFilter = new Set([
        "designated",
        "yes",
        "limited",
        "unknown",
        "no",
      ]);
    } else {
      accessibilityFilter = new Set(incoming);
    }

    refreshPlaces();
  });
}
