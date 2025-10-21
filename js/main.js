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
import {
  createMarker,
  waypointDivIcon,
  WP_COLORS,
} from "./utils/wayPoints.mjs";

let selectedPlaceLayer = null;
let placesPane;

const placeClusterLayer = L.markerClusterGroup({
  chunkedLoading: true,
  maxClusterRadius: 40,
  disableClusteringAtZoom: 18,
  spiderfyOnMaxZoom: true,
});

// ===== OMNIBOX STATE =====
let userLocation = null;
const searchBar = document.getElementById("search-bar");
const searchInput = document.getElementById("search-input");
const suggestionsEl = document.getElementById("search-suggestions");

let obstacleFeatures = [];

const detailsPanel = document.getElementById("details-panel");

// ---------- Bootstrap Modal + Tooltip helpers ----------
let obstacleModalInstance = null;
let obstacleForm, obstacleTitleInput;

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
export function showObstacleModal(initial = { title: "" }) {
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

export function hookLayerInteractions(layer, props) {
  // Ensure the element exists in the DOM before creating tooltip
  // (safe if we call after the layer is added to the map/featureGroup).
  attachBootstrapTooltip(layer, tooltipTextFromProps(props));

  // Click to edit
  layer.on("click", () => openEditModalForLayer(layer));
}

// --- LRM adapter that calls our existing OpenRouteService-based fetchRoute() ---
const WheelchairRouter = L.Class.extend({
  initialize(options = {}) {
    L.setOptions(this, options);
  },

  // LRM calls this when it needs a route
  async route(waypoints, callback, context, opts) {
    const coords = waypoints.map((wp) => [wp.latLng.lng, wp.latLng.lat]);

    try {
      // Use your existing obstacleFeatures + fetchRoute (ORS wheelchair + avoid_polygons)
      const geojson = await fetchRoute(coords, obstacleFeatures);

      if (!geojson || !geojson.features || !geojson.features.length) {
        return callback.call(context, { status: 500, message: "No route" });
      }

      const feat = geojson.features[0];
      const line = feat.geometry; // LineString
      const props = feat.properties || {};
      const summary = props.summary || { distance: 0, duration: 0 };

      const lrmCoords = line.coordinates.map(([lng, lat]) =>
        L.latLng(lat, lng)
      );

      const route = {
        name: "Wheelchair",
        coordinates: lrmCoords,
        // LRM expects these two props in meters/seconds:
        summary: {
          totalDistance: summary.distance || props.segments?.[0]?.distance || 0,
          totalTime: summary.duration || props.segments?.[0]?.duration || 0,
        },
        // Echo back waypoints for LRM
        inputWaypoints: waypoints,
        waypoints: waypoints.map((wp) => wp.latLng),
        // You can build turn-by-turn instructions later if you want:
        instructions: [],
      };

      callback.call(context, null, [route]);
    } catch (error) {
      callback.call(context, {
        status: 500,
        message: error?.message || "Routing error",
      });
    }
  },
});

const geocoder = L.Control.Geocoder.photon({
  serviceUrl: "https://photon.komoot.io/api/",
  reverseUrl: "https://photon.komoot.io/reverse/",
});
const routingControl = L.Routing.control({
  position: "topleft",
  router: new WheelchairRouter(),
  geocoder,
  routeWhileDragging: true,
  reverseWaypoints: true,
  showAlternatives: true,
  createMarker,
});

routingControl.on("routesfound", function (e) {
  searchBar.style.display = "none";
  detailsPanel.style.display = "none";
  routingControl.getContainer().style.marginTop = "10px";

  const routeBounds = L.latLngBounds(e.routes[0].coordinates);
  map.fitBounds(routeBounds, { padding: [70, 50] });
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

async function refreshPlaces() {
  const zoom = map.getZoom();
  const geojson = await fetchPlaces(map.getBounds(), zoom);

  placeClusterLayer.clearLayers();

  const placesLayer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      const tags = feature.properties;
      const marker = L.marker(latlng, {
        pane: "places-pane",
        icon: L.icon({ iconUrl: iconFor(tags), iconSize: [32, 32] }),
      }).on("click", () => renderDetails(tags, latlng));

      const title = tags.name ?? tags.amenity ?? "Unnamed place";

      marker.bindPopup(`<strong>${title}</strong>`);

      return marker;
    },
  });

  placeClusterLayer.addLayer(placesLayer);
}

const renderDetails = async (tags, latlng) => {
  detailsPanel.style.display = "block";
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
  dirBtn.addEventListener("click", () => {
    if (selectedPlaceLayer && selectedPlaceLayer instanceof L.Marker) {
      map.removeLayer(selectedPlaceLayer);
      selectedPlaceLayer = null;
    }

    const wps = routingControl.getWaypoints();

    const start = userLocation || wps[0].latLng;
    const end = latlng;

    if (start) {
      routingControl.setWaypoints([start, end]);
    } else {
      routingControl.setWaypoints([null, end]);
    }

    const routingContainer = routingControl.getContainer();
    routingContainer.classList.add("lrm-show-geocoders");
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
  const drawnItems = new L.FeatureGroup();
  drawnItems.addTo(map);
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

  const DrawHelpLabel = L.Control.extend({
    options: { position: "topright" },
    onAdd() {
      const div = L.DomUtil.create("div", "leaflet-bar draw-label");
      div.innerHTML = `
        <p>🧱 Draw obstacles</p>
        <p>You can mark areas the route should avoid.</p>
      `;
      L.DomEvent.disableClickPropagation(div);
      return div;
    },
  });

  map.addControl(new DrawHelpLabel());

  const drawControl = new L.Control.Draw({
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
      if (userDeniedGeolocation) {
        const defaultLatLng = [50.4501, 30.5234]; // Kyiv, Ukraine
        map.setView(defaultLatLng, SHOW_PLACES_ZOOM);
      } else {
        console.log(error);
        toastError("Could not get your location.", {
          important: true,
        });
      }
    }
  );
} else {
  console.log(error);
  toastWarn("Geolocation not supported. Using default location.");
}

// ============= EVENT LISTENERS ================

map.whenReady(() => {
  placesPane = map.createPane("places-pane");
  placesPane.style.zIndex = 450; // below selected

  const selectedPane = map.createPane("selected-pane");
  selectedPane.style.zIndex = 650; // above normal markers

  L.control.zoom({ position: "bottomright" }).addTo(map);

  routingControl.addTo(map);
  const routingContainer = routingControl.getContainer();
  routingContainer.appendChild(detailsPanel);

  // We’ll toggle this class to show LRM's geocoder fields when needed
  routingContainer.classList.remove("lrm-show-geocoders");

  placeClusterLayer.addTo(map);

  refreshPlaces();
  initDrawingObstacles();

  map.on("moveend", debounce(refreshPlaces, 300));

  map.on("click", function (e) {
    const container = L.DomUtil.create("div"),
      startBtn = createButton("Start here", container),
      endBtn = createButton("Go here", container);

    const wps = routingControl.getWaypoints();
    const bothSet = wps.every((wp) => !!wp.latLng);
    let viaBtn;
    if (bothSet) {
      viaBtn = createButton("Add via here", container);
    }

    const popup = L.popup()
      .setLatLng(e.latlng)
      .setContent(container)
      .openOn(map);

    // Set START (replace waypoint 0)
    L.DomEvent.on(startBtn, "click", function () {
      routingControl.spliceWaypoints(0, 1, e.latlng);
      map.closePopup();
    });

    // Set END (replace last waypoint)
    L.DomEvent.on(endBtn, "click", function () {
      const last = routingControl.getWaypoints().length - 1;
      routingControl.spliceWaypoints(last, 1, e.latlng);
      map.closePopup();
    });

    // Insert VIA (before last), only if start+end already set
    if (viaBtn) {
      L.DomEvent.on(viaBtn, "click", function () {
        const last = routingControl.getWaypoints().length - 1;
        routingControl.spliceWaypoints(last, 0, e.latlng); // insert
        map.closePopup();
      });
    }
  });
});

/** Render suggestions list */
function renderSuggestions(items) {
  suggestionsEl.innerHTML = "";
  if (!items || !items.length) {
    suggestionsEl.style.display = "none";
    return;
  }
  items.forEach((res, idx) => {
    const li = document.createElement("li");
    li.role = "option";
    li.dataset.index = String(idx);
    li.innerHTML = res.name;
    li.addEventListener("click", () => selectSuggestion(items[idx]));
    suggestionsEl.appendChild(li);
  });
  suggestionsEl.style.display = "block";
}

/** Select a suggestion: center map, drop marker, render card */
async function selectSuggestion(res) {
  suggestionsEl.style.display = "none";

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

  const tags = await fetchPlace(res.properties.osm_type, res.properties.osm_id);
  renderDetails(tags, res.center);
}

searchInput.addEventListener(
  "input",
  debounce((e) => {
    const searchQuery = e.target.value.trim();
    if (!searchQuery) {
      suggestionsEl.style.display = "none";
      return;
    }

    geocoder.geocode(searchQuery, renderSuggestions);
  }, 300)
);

const hideSuggestionsIfClickedOutside = (e) => {
  if (!searchBar.contains(e.target)) {
    suggestionsEl.style.display = "none";
  }
};
document.addEventListener("click", hideSuggestionsIfClickedOutside);
