// import {
//   pipeline,
//   env,
// } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers";
import { fetchPlace, fetchPlaces } from "./api/fetchPlaces.js";
import { fetchRoute } from "./api/fetchRoute.js";
import { obstacleStorage, reviewStorage } from "./api/obstacleStorage.js";
import { BASE_PATH, DEFAULT_ZOOM, EXCLUDED_PROPS } from "./constants.mjs";
import { ICON_MANIFEST } from "./static/manifest.js";
import { hideModal, showModal } from "./utils.mjs";

// ===== OMNIBOX STATE =====
let userLocation = null;
let selectedPlaceMarker = null;
const searchInput = document.getElementById("search-input");
const suggestionsEl = document.getElementById("search-suggestions");

const placeClusterGroup = L.markerClusterGroup({
  chunkedLoading: true,
  maxClusterRadius: 80,
  disableClusteringAtZoom: 17,
});

let obstacleFeatures = [];

const detailsPanel = document.getElementById("details-panel");
const modal = document.getElementById("constraint-modal");
const modalCloseBtn = document.getElementById("constraint-modal-close");

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
  if (map.getZoom() < 14) {
    placeClusterGroup.clearLayers();
    return;
  }

  const geojson = await fetchPlaces(map.getBounds());

  const geojsonLayer = L.geoJSON(geojson, {
    pointToLayer: ({ properties: tags }, latlng) => {
      const marker = L.marker(latlng, {
        icon: L.icon({
          iconUrl: iconFor(tags),
          iconSize: [32, 32],
        }),
      });

      const title = tags.name ?? tags.amenity ?? "Unnamed place";

      marker.bindPopup(`<strong>${title}</strong>`);

      marker.on("click", () => renderDetails(tags));

      return marker;
    },
  });

  placeClusterGroup.clearLayers();
  placeClusterGroup.addLayer(geojsonLayer);
}

const renderDetails = async (tags) => {
  detailsPanel.style.display = "block";
  detailsPanel.innerHTML = "<h3>Details</h3>";

  Object.entries(tags).forEach(([key, value]) => {
    if (!EXCLUDED_PROPS.has(key)) {
      const div = document.createElement("div");
      div.className = "detail-item";

      // Format the key for display
      let displayKey = key;
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

  // Add Reviews Section
  const reviews = await reviewStorage();

  const reviewsContainer = document.createElement("div");
  reviewsContainer.id = "reviews-container";
  reviewsContainer.innerHTML = "<h3>Reviews</h3>";
  detailsPanel.appendChild(reviewsContainer);

  const placeId = tags.id ?? tags.osm_id ?? tags.place_id;

  const list = document.createElement("ul");

  reviews.forEach((r) => {
    if (placeId && placeId === r.placeId) {
      const li = document.createElement("li");
      li.innerHTML = r.text;
      list.appendChild(li);
    }
  });
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
    const text = form.querySelector("#review-text").value.trim();
    if (!text) return;

    const newReview = { text, placeId };
    reviews.push(newReview);

    await reviewStorage("PUT", reviews);

    // Refresh details to show new review
    renderDetails(tags);
  });
};

async function initDrawingObstacles() {
  const drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  const drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: {
      polyline: false,
      marker: false,
      polygon: { allowIntersection: false, shapeOptions: { color: "red" } },
      rectangle: false,
      circle: false,
      circlemarker: { radius: 13, color: "red", fillColor: "red" },
    },
  });
  map.addControl(drawControl);

  map.on(L.Draw.Event.CREATED, async (e) => {
    const layer = e.layer;
    drawnItems.addLayer(layer);

    let newFeature;

    if (e.layerType === "circle" || e.layerType === "circlemarker") {
      // turf.buffer requires a point + radius in km
      const center = layer.getLatLng();
      newFeature = turf.buffer(
        turf.point([center.lng, center.lat]),
        layer.getRadius() / 1000,
        { units: "kilometers" }
      );
    } else if (e.layerType === "polygon" || e.layerType === "rectangle") {
      newFeature = layer.toGeoJSON();
    }

    obstacleFeatures = await obstacleStorage("PUT", [
      ...obstacleFeatures,
      {
        ...newFeature,
        _leaflet_id: layer._leaflet_id,
      },
    ]);
  });

  map.on(L.Draw.Event.EDITED, (e) => {
    e.layers.eachLayer((layer) => {
      const idx = obstacleFeatures.findIndex(
        (f) => f._leaflet_id === layer._leaflet_id
      );
      if (idx === -1) return;

      let newFeature = layer.toGeoJSON();
      newFeature._leaflet_id = layer._leaflet_id;
      obstacleFeatures[idx] = newFeature;
      obstacleStorage("PUT", obstacleFeatures);
    });
  });

  map.on(L.Draw.Event.DELETED, (e) => {
    e.layers.eachLayer((layer) => {
      obstacleFeatures = obstacleFeatures.filter(
        (f) => f._leaflet_id !== layer._leaflet_id
      );
    });
    obstacleStorage("PUT", obstacleFeatures);
  });

  obstacleFeatures = await obstacleStorage();

  obstacleFeatures.forEach((feature) => {
    const layer = L.geoJSON(feature, {
      style: { color: "red", fillColor: "red" },
    }).getLayers()[0];
    layer._leaflet_id = feature._leaflet_id;
    drawnItems.addLayer(layer);
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
        const defaultLatLng = [51.5074, -0.1278]; // London, UK
        map.setView(defaultLatLng, DEFAULT_ZOOM);
      } else {
        console.log(error);
      }
    }
  );
} else {
  console.log(error);
  showModal("Geolocation not supported. Using default location.");
}

// ============= EVENT LISTENERS ================

modalCloseBtn.addEventListener("click", hideModal);
window.addEventListener("click", (e) => e.target === modal && hideModal());

map.whenReady(() => {
  L.control.zoom({ position: "bottomright" }).addTo(map);

  map.addLayer(placeClusterGroup);

  routingControl.addTo(map);
  const routingContainer = routingControl.getContainer();
  routingContainer.appendChild(detailsPanel);

  // We’ll toggle this class to show LRM's geocoder fields when needed
  routingContainer.classList.remove("lrm-show-geocoders");

  refreshPlaces();
  initDrawingObstacles();

  map.on("moveend", _.debounce(refreshPlaces, 1000));

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

  map.flyTo(res.center, Math.max(map.getZoom()));

  if (selectedPlaceMarker) {
    selectedPlaceMarker.remove();
  }
  selectedPlaceMarker = L.marker(res.center).addTo(map).bindPopup(res.name);
  selectedPlaceMarker.openPopup();

  const tags = await fetchPlace(res.properties.osm_type, res.properties.osm_id);
  renderPlaceCardFromGeocoder(tags, res.center);
}

/** Render a simple card for the selected place + Directions button */
function renderPlaceCardFromGeocoder(tags, latlng) {
  detailsPanel.innerHTML = ""; // clear previous
  detailsPanel.style.display = "block";

  // ensure the panel shows this place
  renderDetails(tags);

  const header = document.createElement("div");
  header.innerHTML = `<button id="btn-directions">Directions</button>`;
  detailsPanel.appendChild(header);

  document.getElementById("btn-directions").addEventListener("click", () => {
    // Reveal LRM geocoders + set destination
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
}

searchInput.addEventListener(
  "input",
  _.debounce((e) => {
    const searchQuery = e.target.value.trim();
    if (!searchQuery) {
      suggestionsEl.style.display = "none";
      return;
    }

    geocoder.geocode(searchQuery, renderSuggestions);
  }, 200)
);

const hideSuggestionsIfClickedOutside = (e) => {
  if (!document.getElementById("searchbar").contains(e.target)) {
    suggestionsEl.style.display = "none";
  }
};
document.addEventListener("click", hideSuggestionsIfClickedOutside);
