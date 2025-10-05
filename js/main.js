// import {
//   pipeline,
//   env,
// } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers";
import { fetchPlaces } from "./api/fetchPlaces.js";
import { fetchRoute } from "./api/fetchRoute.js";
import { obstacleStorage, reviewStorage } from "./api/obstacleStorage.js";
import { ICON_MANIFEST } from "./static/manifest.js";

const EXCLUDED_PROPS = new Set([
  "boundingbox",
  "licence",
  "place_id",
  "osm_id",
  "osm_type",
  "lat",
  "lon",
  "class",
  "place_rank",
  "importance",
  "id",
  "source",
]);

let obstacleFeatures = [];
let reviews = [];

let selectedMarker = null;

const detailsPanel = document.getElementById("details-panel");
const modal = document.getElementById("constraint-modal");
const modalCloseBtn = document.getElementById("constraint-modal-close");

const isLocal = window.location.protocol === "http:";
const BASE_PATH = isLocal
  ? "../map-icons-osm"
  : "https://yevheniiabenediuk2000.github.io/Abilico/map-icons-osm";

// --- LRM adapter that calls our existing OpenRouteService-based fetchRoute() ---
const WheelchairRouter = L.Class.extend({
  initialize(options = {}) {
    L.setOptions(this, options);
  },

  // LRM calls this when it needs a route
  route(waypoints, callback, context, opts) {
    const coords = waypoints.map((wp) => [wp.latLng.lng, wp.latLng.lat]);

    // Use your existing obstacleFeatures + fetchRoute (ORS wheelchair + avoid_polygons)
    fetchRoute(coords, obstacleFeatures)
      .then((geojson) => {
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
            totalDistance:
              summary.distance || props.segments?.[0]?.distance || 0,
            totalTime: summary.duration || props.segments?.[0]?.duration || 0,
          },
          // Echo back waypoints for LRM
          inputWaypoints: waypoints,
          waypoints: waypoints.map((wp) => wp.latLng),
          // You can build turn-by-turn instructions later if you want:
          instructions: [],
        };

        callback.call(context, null, [route]);
      })
      .catch((err) => {
        callback.call(context, {
          status: 500,
          message: err?.message || "Routing error",
        });
      });
  },
});

function showModal(message) {
  modal.style.display = "block";
  modal.querySelector("h2").textContent = message;
}

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
  const geojson = await fetchPlaces(map.getBounds());

  if (!geojson || !geojson.features) {
    console.error("Nothing fetched – skipping render");
    return; // ← prevents the TypeError
  }

  // NEW — sort by distance to map centre (or user marker)
  // Choose origin: use user marker if available else map centre
  const origin = selectedMarker ? selectedMarker.getLatLng() : map.getCenter();

  geojson.features.sort((a, b) => {
    const d1 = distanceMeters(
      origin,
      L.latLng(a.geometry.coordinates[1], a.geometry.coordinates[0])
    );
    const d2 = distanceMeters(
      origin,
      L.latLng(b.geometry.coordinates[1], b.geometry.coordinates[0])
    );
    return d1 - d2;
  });

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

      marker.on("click", () => renderDetails(tags, latlng));

      return marker;
    },
  });

  placeClusterGroup.clearLayers();
  placeClusterGroup.addLayer(geojsonLayer);
}

const renderDetails = async (tags, latlng) => {
  detailsPanel.innerHTML = "<h3>Details</h3>";
  detailsPanel.style.display = "block";

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
  reviews = await reviewStorage();

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
    renderDetails(tags, latlng);
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
      if (idx > -1) {
        let newFeature = layer.toGeoJSON();
        newFeature._leaflet_id = layer._leaflet_id;
        obstacleFeatures[idx] = newFeature;
        obstacleStorage("PUT", obstacleFeatures);
      }
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

// ============= INIT ================

let initialLatLng = [51.5074, -0.1278]; // London, UK

const map = L.map("map").setView(initialLatLng, 17);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      map.setView([latitude, longitude]);
      L.marker([latitude, longitude]).addTo(map);
    },
    (error) => {
      console.warn(error);
      const userDeniedGeolocationCode = 1;
      if (error.code === userDeniedGeolocationCode) return;

      showModal(
        `Unable to retrieve location: ${error.message}. Using default location.`
      );
    }
  );
} else {
  console.warn(error);
  showModal("Geolocation not supported. Using default location.");
}

const placeClusterGroup = L.markerClusterGroup({
  chunkedLoading: true,
  maxClusterRadius: 80,
  disableClusteringAtZoom: 17,
});
map.addLayer(placeClusterGroup);

refreshPlaces();
initDrawingObstacles();

const geocoder = L.Control.Geocoder.openrouteservice(
  "5b3ce3597851110001cf624808521bae358447e592780fc0039f7235",
  {}
);

let control = L.Routing.control({
  router: new WheelchairRouter(),
  geocoder,
  routeWhileDragging: true,
  reverseWaypoints: true,
  showAlternatives: true,
}).addTo(map);
const directionsContainer = control.getContainer();
directionsContainer.appendChild(detailsPanel);
setTimeout(() => {
  control.setWaypoints([L.latLng(57.74, 11.94), L.latLng(57.6792, 11.949)]);
  control.route();
}, 2000);

// ============= EVENT LISTENERS ================

map.on("moveend", refreshPlaces);
modalCloseBtn.addEventListener("click", () => (modal.style.display = "none"));
window.addEventListener("click", (e) => {
  if (e.target === modal) modal.style.display = "none";
});

// NEW — distance helper (Haversine, uses Leaflet’s built-in)
function distanceMeters(latlng1, latlng2) {
  return map.distance(latlng1, latlng2); // Leaflet’s Vincenty impl.
}

// --- Map click popup to set start/end (and via) -----------------------------
function createButton(label, container) {
  var btn = L.DomUtil.create("button", "", container);
  btn.setAttribute("type", "button");
  btn.innerHTML = label;
  return btn;
}

map.on("click", function (e) {
  var container = L.DomUtil.create("div"),
    startBtn = createButton("Start here", container),
    endBtn = createButton("Go here", container);

  const wps = control.getWaypoints();
  const bothSet = wps.every((wp) => !!wp.latLng);
  let viaBtn;
  if (bothSet) {
    viaBtn = createButton("Add via here", container);
  }

  const popup = L.popup().setLatLng(e.latlng).setContent(container).openOn(map);

  // Set START (replace waypoint 0)
  L.DomEvent.on(startBtn, "click", function () {
    control.spliceWaypoints(0, 1, e.latlng);
    map.closePopup();
  });

  // Set END (replace last waypoint)
  L.DomEvent.on(endBtn, "click", function () {
    const last = control.getWaypoints().length - 1;
    control.spliceWaypoints(last, 1, e.latlng);
    map.closePopup();
  });

  // Insert VIA (before last), only if start+end already set
  if (viaBtn) {
    L.DomEvent.on(viaBtn, "click", function () {
      const last = control.getWaypoints().length - 1;
      control.spliceWaypoints(last, 0, e.latlng); // insert
      map.closePopup();
    });
  }
});
