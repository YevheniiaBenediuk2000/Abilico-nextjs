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

const ORS_API_KEY = "5b3ce3597851110001cf624808521bae358447e592780fc0039f7235";

let searchInputValue = "";
let startInputValue = "";

let selectedMarker = null;

const searchInputContainer = document.querySelector(".search-input-container");
const suggestionsDiv = document.getElementById("suggestions");
const directions = document.querySelector(".directions");
const directionsContainer = document.querySelector(".directions-container");
const searchInput = document.getElementById("search-input");
const detailsPanel = document.getElementById("details-panel");
const directionsButtonElement = document.createElement("button");
const searchInputClearBtn = document.getElementById("search-input-clear-btn");
const startInputClearBtn = document.getElementById("start-input-clear-btn");
const startInput = document.getElementById("start-input");
const endInput = document.getElementById("end-input");
const modal = document.getElementById("constraint-modal");
const modalCloseBtn = document.getElementById("constraint-modal-close");

function showConstraintModal() {
  modal.style.display = "block";
}

function iconFor(tags) {
  const BASE_PATH = "../map-icons";

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

  const geojsonLayer = L.geoJSON(geojson, {
    pointToLayer: ({ properties: tags }, latlng) => {
      const marker = L.marker(latlng, {
        icon: L.icon({
          iconUrl: iconFor(tags),
          iconSize: [24, 24],
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

const clearStartInput = () => {
  startInput.value = "";
  startInputValue = "";
  startInputClearBtn.classList.remove("visible");
};

const clearSearchInput = () => {
  searchInput.value = "";
  searchInputValue = "";
  searchInputClearBtn.classList.remove("visible");
};

const showDirectionsUI = (endTags, endLatLng) => {
  searchInputContainer.style.display = "none";
  directions.style.display = "block";

  clearSearchInput();
  clearStartInput();
  endInput.value = endTags.display_name ?? endTags.name ?? "Unnamed place";

  const handleStartInputChange = (e) => {
    startInputValue = e.target.value;

    if (startInputValue.trim().length > 0) {
      startInputClearBtn.classList.add("visible");
    } else {
      startInputClearBtn.classList.remove("visible");
    }
    const onSuggestionSelect = async (start) => {
      startInput.value = start.display_name;
      const endCoords = endLatLng
        ? [endLatLng.lng, endLatLng.lat]
        : [endTags.lon, endTags.lat];
      const routeData = await fetchRoute(
        [[start.lon, start.lat], endCoords],
        obstacleFeatures
      );
      console.log("Route Data:", routeData);
      const routeLayer = L.geoJSON(routeData, { style: { weight: 5 } }).addTo(
        map
      );
      console.log("Route Layer:", routeLayer);
      map.fitBounds(routeLayer.getBounds(), {});
    };
    renderSuggestions(startInputValue, onSuggestionSelect);
  };

  startInput.addEventListener("input", _.debounce(handleStartInputChange, 400));
  startInput.focus();

  startInputClearBtn.addEventListener("click", clearStartInput);
};

const selectMarker = (result) => {
  if (selectedMarker) {
    map.removeLayer(selectedMarker);
    selectedMarker = null;
  }

  const title = result.name || "Unnamed place";

  selectedMarker = L.circleMarker([result.lat, result.lon], {
    radius: 10,
  })
    .bindPopup(`<strong>${title}</strong>`)
    .addTo(map)
    .openPopup();
};

const renderDetails = (tags, latlng) => {
  detailsPanel.innerHTML = "";
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

  directionsButtonElement.innerHTML = "";
  directionsButtonElement.className = "directions-button";
  directionsButtonElement.textContent = "Directions";
  directionsButtonElement.addEventListener("click", () =>
    showDirectionsUI(tags, latlng)
  );
  detailsPanel.appendChild(directionsButtonElement);
};

const renderSuggestions = async (query, onSuggestionSelect) => {
  if (!query) {
    suggestionsDiv.style.display = "none";
    return;
  }

  const data = await fetchSuggestions(query);

  suggestionsDiv.innerHTML = "";
  data.forEach((result) => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.textContent = result.display_name;
    div.onclick = () => {
      map.setView([result.lat, result.lon], 16);
      suggestionsDiv.style.display = "none";
      selectMarker(result);
      onSuggestionSelect(result);
    };
    suggestionsDiv.appendChild(div);
  });
  suggestionsDiv.style.display = "block";
};

const handleSearchInputChange = (e) => {
  searchInputValue = e.target.value;

  if (searchInputValue.trim().length > 0) {
    searchInputClearBtn.classList.add("visible");
  } else {
    searchInputClearBtn.classList.remove("visible");
  }
  renderSuggestions(searchInputValue, renderDetails);
};

const dismissSuggestions = (e) => {
  if (e.target.closest(".suggestion-item")) return;

  suggestionsDiv.style.display = "none";
};

// ============= INIT ================

const map = L.map("map").setView([49.41461, 8.681495], 17);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

function initDrawing() {
  const drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  const drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: {
      polyline: false,
      marker: false,
      polygon: { allowIntersection: false, shapeOptions: { color: "red" } },
      rectangle: { shapeOptions: { color: "red" } },
      circle: { shapeOptions: { color: "red" } },
      circlemarker: { radius: 10, color: "red", fillColor: "red" },
    },
  });
  map.addControl(drawControl);

  map.on(L.Draw.Event.CREATED, (e) => {
    const layer = e.layer;
    drawnItems.addLayer(layer);

    let feature;

    if (e.layerType === "circle" || e.layerType === "circlemarker") {
      // turf.buffer requires a point + radius in km
      const center = layer.getLatLng();
      feature = turf.buffer(
        turf.point([center.lng, center.lat]),
        layer.getRadius() / 1000,
        { units: "kilometers" }
      );
    } else if (e.layerType === "polygon" || e.layerType === "rectangle") {
      feature = layer.toGeoJSON();
    }

    obstacleFeatures.push({ ...feature, _leaflet_id: layer._leaflet_id });
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
      }
    });
  });

  map.on(L.Draw.Event.DELETED, (e) => {
    e.layers.eachLayer((layer) => {
      obstacleFeatures = obstacleFeatures.filter(
        (f) => f._leaflet_id !== layer._leaflet_id
      );
    });
  });
}

const placeClusterGroup = L.markerClusterGroup({
  chunkedLoading: true,
  maxClusterRadius: 60,
  disableClusteringAtZoom: 17,
});
map.addLayer(placeClusterGroup);

refreshPlaces();
initDrawing();
// ============= EVENT LISTENERS ================

map.on("moveend", refreshPlaces);
modalCloseBtn.addEventListener("click", () => (modal.style.display = "none"));
window.addEventListener("click", (e) => {
  if (e.target === modal) modal.style.display = "none";
});
searchInput.addEventListener("input", _.debounce(handleSearchInputChange, 400));

searchInputClearBtn.addEventListener("click", () => {
  clearSearchInput();
  suggestionsDiv.style.display = "none";
  searchInput.focus();

  document.getElementById("details-panel").style.display = "none";
  if (selectedMarker) {
    map.removeLayer(selectedMarker);
    selectedMarker = null;
  }
});
document.addEventListener("click", dismissSuggestions);
