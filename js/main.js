// import {
//   pipeline,
//   env,
// } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers";
import debounce from "https://cdn.jsdelivr.net/npm/lodash.debounce@4.0.8/+esm";

import {
  fetchPlace,
  fetchPlaceGeometry,
  fetchPlaces,
} from "./api/fetchPlaces.js";
import { fetchRoute } from "./api/fetchRoute.js";
import { obstacleStorage, reviewStorage } from "./api/obstacleStorage.js";
import {
  BASE_PATH,
  DEFAULT_ZOOM,
  SHOW_PLACES_ZOOM,
  EXCLUDED_PROPS,
} from "./constants.mjs";
import { ICON_MANIFEST } from "./static/manifest.js";
import { toastError, toastWarn } from "./utils/toast.mjs";
import { waypointDivIcon, WP_COLORS } from "./utils/wayPoints.mjs";
import {
  DRAW_HELP_LS_KEY,
  DrawHelpAlert,
} from "./leaflet-controls/DrawHelpAlert.mjs";
import {
  ACCESSIBILITY_LEGEND_LS_KEY,
  AccessibilityLegend,
  getAccessibilityTier,
  SIZE_BY_TIER,
  Z_INDEX_BY_TIER,
} from "./leaflet-controls/AccessibilityLegend.mjs";
import { ls } from "./utils/localStorage.mjs";

let clickPopup = null;

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
    try {
      directionsUi.classList.remove("d-none");
      moveDepartureSearchBarUnderTo();
      mountInOffcanvas("Directions");

      await setFrom(latlng, null, { fit: false });
      destinationSearchInput.focus();
    } finally {
      map.closePopup(clickPopup);
    }
  });

  goBtn.addEventListener("click", async (ev) => {
    L.DomEvent.stop(ev);
    try {
      directionsUi.classList.remove("d-none");
      moveDepartureSearchBarUnderTo();
      mountInOffcanvas("Directions");

      await setTo(latlng, null, { fit: false });
      departureSearchInput.focus();
    } finally {
      map.closePopup(clickPopup);
    }
  });
}

const directionsUi = document.getElementById("directions-ui");

let selectedPlaceLayer = null;
let placesPane;

const placeClusterLayer = L.markerClusterGroup({
  chunkedLoading: true,
  maxClusterRadius: 40,
  // disableClusteringAtZoom: 18,
  spiderfyOnMaxZoom: true,
});

// Track when Leaflet.Draw is in editing/deleting mode
const drawState = { editing: false, deleting: false };
let drawControl = null;

// ===== OMNIBOX STATE =====
let userLocation = null;
const destinationSearchBar = document.getElementById("destination-search-bar");
const destinationSearchBarHome = destinationSearchBar.parentElement;
const destinationSearchInput = document.getElementById(
  "destination-search-input"
);
const destinationSuggestionsEl = document.getElementById(
  "destination-suggestions"
);

const departureSearchBar = document.getElementById("departure-search-bar");
const departureSearchInput = document.getElementById("departure-search-input");
const departureSuggestionsEl = document.getElementById("departure-suggestions");

let fromLatLng = null;
let toLatLng = null;
let fromMarker = null;
let toMarker = null;
let routeLayer = null;

let drawnItems;
let obstacleFeatures = [];

const detailsPanel = document.getElementById("details-panel");

// ----- Offcanvas integration -----
const offcanvasEl = document.getElementById("placeOffcanvas");
const offcanvasTitleEl = document.getElementById("placeOffcanvasLabel");
const offcanvasInstance = new bootstrap.Offcanvas(offcanvasEl);

/** Mount search bar + details panel into the Offcanvas and open it. */
function mountInOffcanvas(titleText) {
  offcanvasTitleEl.textContent = titleText;
  offcanvasInstance.show();
}

offcanvasEl.addEventListener("hidden.bs.offcanvas", () => {
  destinationSearchBarHome.prepend(destinationSearchBar);
  destinationSearchBar.classList.remove("d-none");
});

// ---------- Bootstrap Modal + Tooltip helpers ----------
let obstacleModalInstance = null;
let obstacleForm, obstacleTitleInput;

function toggleDepartureSuggestions(visible) {
  departureSuggestionsEl.classList.toggle("d-none", !visible);
  departureSearchInput.setAttribute(
    "aria-expanded",
    visible ? "true" : "false"
  );
}

function toggleDestinationSuggestions(visible) {
  destinationSuggestionsEl.classList.toggle("d-none", !visible);
  destinationSearchInput.setAttribute(
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

  layer.on("add", () => {
    attachBootstrapTooltip(layer, tooltipTextFromProps(props));
  });

  layer.on("click", () => {
    if (drawState.deleting || drawState.editing) return;

    openEditModalForLayer(layer);
  });
}

function toggleObstaclesByZoom() {
  const z = map.getZoom();
  const allow = z >= SHOW_PLACES_ZOOM;

  // Show/hide the whole obstacle layer group
  if (allow) {
    if (drawnItems && !map.hasLayer(drawnItems)) {
      map.addLayer(drawnItems);
      map.addControl(drawControl);
    }
  } else {
    if (drawnItems && map.hasLayer(drawnItems)) {
      map.removeLayer(drawnItems);
      map.removeControl(drawControl);
    }
  }
}

const geocoder = L.Control.Geocoder.photon({
  serviceUrl: "https://photon.komoot.io/api/",
  reverseUrl: "https://photon.komoot.io/reverse/",
});

function iconFor(tags) {
  const candidates = ICON_MANIFEST.filter((p) =>
    p.endsWith(`/${tags.amenity}.svg`)
  );

  const url = candidates.length
    ? `${BASE_PATH}/${candidates[0]}`
    : `${BASE_PATH}/svg/misc/no_icon.svg`;

  return url;
}

let placesReqSeq = 0;
async function refreshPlaces() {
  const mySeq = ++placesReqSeq; // capture this call’s id

  const zoom = map.getZoom();
  const geojson = await fetchPlaces(map.getBounds(), zoom);

  // If this response is for an old call, ignore it
  if (mySeq !== placesReqSeq) return;

  placeClusterLayer.clearLayers();

  const placesLayer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      const tags = feature.properties;
      const tier = getAccessibilityTier(tags);
      const size = SIZE_BY_TIER[tier] ?? SIZE_BY_TIER.unknown;
      const zIndexOffset = Z_INDEX_BY_TIER[tier] ?? Z_INDEX_BY_TIER.unknown;

      const marker = L.marker(latlng, {
        pane: "places-pane",
        icon: L.icon({
          iconUrl: iconFor(tags),
          iconSize: [size, size],
          iconAnchor: [Math.round(size / 2), Math.round(size * 0.9)],
          popupAnchor: [0, -Math.round(size * 0.6)],
          tooltipAnchor: [0, -Math.round(size * 0.5)],
        }),
        zIndexOffset,
      })
        .on("click", () => {
          renderDetails(tags, latlng, { keepDirectionsUi: true });
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
}

function moveDepartureSearchBarUnderTo() {
  const toLabel = directionsUi.querySelector(
    'label[for="destination-search-input"]'
  );
  toLabel.insertAdjacentElement("afterend", destinationSearchBar);
}

const renderDetails = async (tags, latlng, { keepDirectionsUi } = {}) => {
  detailsPanel.innerHTML = "<h3>Details</h3>";

  Object.entries(tags).forEach(([key, value]) => {
    if (!EXCLUDED_PROPS.has(key)) {
      const div = document.createElement("div");
      div.className = "detail-item";

      // Format the key for display
      let displayKey = null;
      if (key === "display_name") {
        displayKey = "Address";
      } else {
        // Replace underscores with spaces and capitalize first letters
        displayKey = key
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }

      div.innerHTML = `<strong>${displayKey}:</strong> ${value}`;
      detailsPanel.appendChild(div);
    }
  });

  // Add Directions button
  const dirBtn = document.createElement("button");
  dirBtn.textContent = "Directions";
  dirBtn.id = "btn-directions";
  dirBtn.addEventListener("click", async () => {
    directionsUi.classList.remove("d-none");
    await setTo(latlng);
    departureSearchInput.focus();
    detailsPanel.innerHTML = "";
  });
  detailsPanel.appendChild(dirBtn);

  // Add Reviews Section

  const reviewsContainer = document.createElement("div");
  reviewsContainer.id = "reviews-container";
  reviewsContainer.innerHTML = "<h3>Reviews</h3>";
  detailsPanel.appendChild(reviewsContainer);

  const placeId = tags.id ?? tags.osm_id ?? tags.place_id;

  const list = document.createElement("ul");

  reviewsContainer.appendChild(list);

  if (!keepDirectionsUi) {
    directionsUi.classList.add("d-none");
  }

  moveDepartureSearchBarUnderTo();

  const titleText = tags.name || tags.amenity || "Details";
  mountInOffcanvas(titleText);

  // Add review form
  const form = document.createElement("form");
  form.id = "review-form";
  form.innerHTML = `
    <textarea id="review-text" placeholder="Write your review..." required></textarea><br>
    <button type="submit">Submit Review</button>
  `;
  reviewsContainer.appendChild(form);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const textarea = form.querySelector("#review-text");
    const text = textarea.value.trim();
    if (!text) return;

    const newReview = { text, placeId };
    reviews.push(newReview);

    const record = await reviewStorage("PUT", reviews);

    const li = document.createElement("li");
    li.innerHTML = record[record.length - 1].text;
    list.appendChild(li);
    textarea.value = "";
  });

  const reviews = await reviewStorage();
  reviews.forEach((r) => {
    if (placeId && placeId === r.placeId) {
      const li = document.createElement("li");
      li.innerHTML = r.text;
      list.appendChild(li);
    }
  });
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
async function initDrawingObstacles() {
  drawnItems = new L.FeatureGroup();

  obstacleFeatures = await obstacleStorage();

  obstacleFeatures.forEach((feature) => {
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
      // Polygons/rectangles/polylines etc. come back via GeoJSON
      layer = L.geoJSON(feature, { style: { color: "red" } }).getLayers()[0];
    }

    layer.options.obstacleId = feature.properties.obstacleId;
    drawnItems.addLayer(layer);
    hookLayerInteractions(layer, feature.properties); // tooltip + click-to-edit
  });

  if (!ls.get(DRAW_HELP_LS_KEY)) {
    map.addControl(new DrawHelpAlert());
  }

  drawControl = new L.Control.Draw({
    position: "topright",
    edit: { featureGroup: drawnItems },
    draw: {
      polyline: { shapeOptions: { color: "red" } },
      marker: false,
      polygon: { allowIntersection: false, shapeOptions: { color: "red" } },
      rectangle: { shapeOptions: { color: "red" } },
      circle: { shapeOptions: { color: "red" } },
      circlemarker: false,
    },
  });
  map.addControl(drawControl);

  toggleObstaclesByZoom();

  map.on(L.Draw.Event.CREATED, async (e) => {
    const obstacleId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

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

    layerToAdd.options.obstacleId = obstacleId;

    drawnItems.addLayer(layerToAdd);

    // Ask for title
    const result = await showObstacleModal();

    if (!result) {
      // Cancelled: remove the layer and do NOT persist
      drawnItems.removeLayer(layerToAdd);
      return;
    }

    // Persist with title
    featureToStore.properties = {
      ...(featureToStore.properties || {}),
      obstacleId,
      title: result.title,
      shape: e.layerType,
    };

    // Attach tooltip + click-to-edit
    hookLayerInteractions(layerToAdd, featureToStore.properties);

    obstacleFeatures = await obstacleStorage("PUT", [
      ...obstacleFeatures,
      featureToStore,
    ]);
  });

  map.on(L.Draw.Event.EDITED, (e) => {
    e.layers.eachLayer((layer) => {
      const id = layer.options.obstacleId;

      let updated;

      if (layer instanceof L.Circle) {
        updated = makeCircleFeature(layer);
      } else {
        updated = layer.toGeoJSON();
      }

      const i = obstacleFeatures.findIndex(
        (f) => f.properties.obstacleId === id
      );

      if (i !== -1) {
        // Keep existing properties (title, etc.)
        updated.properties = {
          ...(obstacleFeatures[i].properties || {}),
          obstacleId: id,
          radius:
            (updated.properties && updated.properties.radius) ||
            obstacleFeatures[i].properties?.radius,
        };

        obstacleFeatures[i] = updated;

        // Refresh tooltip (in case geometry change affected element)
        hookLayerInteractions(layer, updated.properties);
      }
    });

    obstacleStorage("PUT", obstacleFeatures);
  });

  map.on(L.Draw.Event.DELETED, (e) => {
    e.layers.eachLayer((layer) => {
      // Clean up tooltip instance if present
      if (layer._bsTooltip) {
        layer._bsTooltip.dispose();
        layer._bsTooltip = null;
      }

      obstacleFeatures = obstacleFeatures.filter(
        (f) => f.properties.obstacleId !== layer.options.obstacleId
      );
    });
    obstacleStorage("PUT", obstacleFeatures);
  });
}

function createButton(label, container) {
  const btn = L.DomUtil.create("button", "", container);
  btn.setAttribute("type", "button");
  btn.innerHTML = label;
  return btn;
}

// ============= INIT ================

const map = L.map("map", { zoomControl: false });
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      userLocation = L.latLng(latitude, longitude);
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

      // const defaultLatLng = [50.4501, 30.5234]; // Kyiv, Ukraine
      const defaultLatLng = [51.5074, -0.1278]; // London, UK
      map.setView(defaultLatLng, SHOW_PLACES_ZOOM);
    }
  );
} else {
  console.log(error);
  const defaultLatLng = [50.4501, 30.5234]; // Kyiv, Ukraine
  map.setView(defaultLatLng, SHOW_PLACES_ZOOM);
  toastWarn("Geolocation not supported. Using default location.");
}

// ============= EVENT LISTENERS ================

map.whenReady(() => {
  map.on("draw:editstart", () => {
    drawState.editing = true;
  });
  map.on("draw:editstop", () => {
    drawState.editing = false;
  });
  map.on("draw:deletestart", () => {
    drawState.deleting = true;
  });
  map.on("draw:deletestop", () => {
    drawState.deleting = false;
  });

  placesPane = map.createPane("places-pane");
  placesPane.style.zIndex = 450; // below selected

  const selectedPane = map.createPane("selected-pane");
  selectedPane.style.zIndex = 650; // above normal markers

  L.control.zoom({ position: "bottomright" }).addTo(map);

  if (!ls.get(ACCESSIBILITY_LEGEND_LS_KEY)) {
    map.addControl(new AccessibilityLegend());
  }

  placeClusterLayer.addTo(map);

  refreshPlaces();
  initDrawingObstacles();

  map.on("zoomend", toggleObstaclesByZoom);

  map.on("moveend", debounce(refreshPlaces, 1));

  map.on("click", async (e) => {
    if (drawState.editing || drawState.deleting) return;

    showQuickRoutePopup(e.latlng);
  });
});

function renderDepartureSuggestions(items) {
  departureSuggestionsEl.innerHTML = "";
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
    departureSuggestionsEl.appendChild(li);
  });
  toggleDepartureSuggestions(true);
}

function renderDestinationSuggestions(items) {
  destinationSuggestionsEl.innerHTML = "";
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
    destinationSuggestionsEl.appendChild(li);
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
  clearRoute();
  if (!fromLatLng || !toLatLng) return;

  const geojson = await fetchRoute(
    [
      [fromLatLng.lng, fromLatLng.lat],
      [toLatLng.lng, toLatLng.lat],
    ],
    obstacleFeatures
  );

  routeLayer = L.geoJSON(geojson, {
    style: { color: "var(--bs-indigo)", weight: 5, opacity: 0.9 },
    interactive: false,
  }).addTo(map);

  const bounds = routeLayer.getBounds();
  if (fit && bounds.isValid()) {
    map.fitBounds(bounds, { padding: [120, 120] });
  }
}

function reverseAddressAt(latlng) {
  return new Promise((resolve) => {
    geocoder.reverse(latlng, map.options.crs.scale(18), (items) => {
      const best = items?.[0]?.name;
      resolve(best || `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`);
    });
  });
}

async function setFrom(latlng, text, opts = {}) {
  fromLatLng = latlng;
  if (fromMarker) map.removeLayer(fromMarker);
  fromMarker = L.marker(latlng, {
    draggable: true,
    icon: waypointDivIcon("A", WP_COLORS.start),
  }).addTo(map);
  attachDraggable(fromMarker, async (ll) => {
    fromLatLng = ll;
    departureSearchInput.value = await reverseAddressAt(ll);
    updateRoute({ fit: false });
  });
  departureSearchInput.value = text ?? (await reverseAddressAt(latlng));
  updateRoute(opts);
}

async function setTo(latlng, text, opts = {}) {
  toLatLng = latlng;
  const directionsActive = !directionsUi.classList.contains("d-none");
  if (directionsActive) {
    if (toMarker) map.removeLayer(toMarker);
    toMarker = L.marker(latlng, {
      draggable: true,
      icon: waypointDivIcon("B", WP_COLORS.end),
    }).addTo(map);
    attachDraggable(toMarker, async (ll) => {
      toLatLng = ll;
      destinationSearchInput.value = await reverseAddressAt(ll);
      updateRoute({ fit: false });
    });
  }

  destinationSearchInput.value = text ?? (await reverseAddressAt(latlng));
  updateRoute(opts);
}

async function selectDepartureSuggestion(res) {
  toggleDepartureSuggestions(false);
  await setFrom(res.center, res.name);
}

async function selectDestinationSuggestion(res) {
  toggleDestinationSuggestions(false);

  if (selectedPlaceLayer) {
    map.removeLayer(selectedPlaceLayer);
  }

  const osmType = res.properties.osm_type;
  const osmId = res.properties.osm_id;

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
    selectedPlaceLayer = L.marker(res.center, {
      icon,
      keyboard: false,
      interactive: false,
    });
    map.setView(selectedPlaceLayer.getLatLng(), 18);
  }

  selectedPlaceLayer.addTo(map);
  await setTo(res.center, res.name);

  const tags = await fetchPlace(res.properties.osm_type, res.properties.osm_id);
  renderDetails(tags, res.center);
}

// Also hide on Escape
departureSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") toggleDepartureSuggestions(false);
});
destinationSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") toggleDestinationSuggestions(false);
});

let destinationGeocodeReqSeq = 0;
destinationSearchInput.addEventListener(
  "input",
  debounce((e) => {
    const searchQuery = e.target.value.trim();

    if (!searchQuery) {
      toggleDestinationSuggestions(false);
      return;
    }

    const mySeq = ++destinationGeocodeReqSeq;

    geocoder.geocode(searchQuery, (items) => {
      if (mySeq !== destinationGeocodeReqSeq) return;

      renderDestinationSuggestions(items);
    });
  }, 1)
);

let departureGeocodeReqSeq = 0;
departureSearchInput.addEventListener(
  "input",
  debounce((e) => {
    const searchQuery = e.target.value.trim();
    if (!searchQuery) {
      toggleDepartureSuggestions(false);
      return;
    }
    const mySeq = ++departureGeocodeReqSeq;
    geocoder.geocode(searchQuery, (items) => {
      if (mySeq !== departureGeocodeReqSeq) return;
      renderDepartureSuggestions(items);
    });
  }, 1)
);

const hideSuggestionsIfClickedOutside = (e) => {
  if (!departureSearchBar.contains(e.target)) {
    toggleDepartureSuggestions(false);
  }

  if (!destinationSearchBar.contains(e.target)) {
    toggleDestinationSuggestions(false);
  }
};
document.addEventListener("click", hideSuggestionsIfClickedOutside);
