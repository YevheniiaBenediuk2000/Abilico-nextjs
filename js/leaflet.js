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

const ORS_API_KEY = "5b3ce3597851110001cf624808521bae358447e592780fc0039f7235";
const map = L.map("map").setView([49.41461, 8.681495], 16);

let placeLayer;
let avoidPolygon = null;

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
const closeBtn = document.getElementById("constraint-modal-close");

function showConstraintModal() {
  modal.style.display = "block";
}

async function fetchRoute(start, end) {
  const url =
    "https://api.openrouteservice.org/v2/directions/wheelchair/geojson";

  const requestBody = {
    coordinates: [start, end],
    options: { avoid_polygons: avoidPolygon },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: ORS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();

    if (!response.ok) {
      if (data.error.code === 2004) {
        showConstraintModal();
      }

      throw new Error(JSON.stringify(data.error));
    }
    console.log("Alternative Route:", data);

    const routeGeometry = data.features[0].geometry; // LineString coordinates
    // Use your mapping library (e.g., Leaflet/Mapbox) to draw the route
    console.log("Route Geometry:", routeGeometry);

    return data;
  } catch (error) {
    console.error(error);
  }
}

async function fetchPlaces(bounds) {
  const boundingBox = [
    bounds.getSouth(),
    bounds.getWest(),
    bounds.getNorth(),
    bounds.getEast(),
  ].join(",");

  const overpassUrl = "https://overpass-api.de/api/interpreter";

  const query = `
    [out:json][maxsize:1073741824];
    (
      node(${boundingBox})
      [amenity]
      [amenity!~"bench|waste_basket|bicycle_parking|vending_machine|fountain|ice_cream"];
    );
    out center tags;
  `;

  try {
    const response = await fetch(overpassUrl, {
      method: "POST",
      body: query,
    });

    if (!response.ok) throw new Error("Overpass error " + response.status);

    const data = await response.json();

    return osmtogeojson(data);
  } catch (error) {
    console.error("Places fetch error:", error);
  }
}

function iconFor(tags) {
  let url;

  // const ICON_BASE_PATH = "../map-icons/svg";
  // const arr1 = tags.amenity.split("_");
  // ICON_RULES.forEach((rule) => {
  //   const arr2 = rule.v.split(".");
  //   const isOverlap = arr1.every((item) => arr2.includes(item));
  //   if (isOverlap) {
  //     const relPath = rule.v.replace(/\./g, "/") + ".svg";
  //     url = `${ICON_BASE_PATH}/${relPath}`;
  //   }
  // });

  const candidates = ICON_MANIFEST.filter((p) =>
    p.endsWith(`/${tags.amenity}.svg`)
  );
  if (candidates.length) {
    url = `../map-icons/${candidates[0]}`;
  }

  if (!url) {
    url = "../map-icons/svg/misc/no_icon.svg";
  }

  return url;
}

async function refreshPlaces() {
  if (placeLayer) map.removeLayer(placeLayer);

  const geojson = await fetchPlaces(map.getBounds());

  placeLayer = L.geoJSON(geojson, {
    pointToLayer: ({ properties: tags }, latlng) => {
      const marker = L.marker(latlng, {
        icon: L.icon({
          iconUrl: iconFor(tags),
          iconSize: [24, 24],
        }),
      });

      const title = tags.name || tags.amenity || "Unnamed place";

      marker.bindPopup(`<strong>${title}</strong>`);

      marker.on("click", () => renderDetails(tags));

      return marker;
    },
  }).addTo(map);
}

const showDirectionsUI = (end) => {
  searchInputContainer.style.display = "none";
  directions.style.display = "block";

  endInput.value = end.display_name;

  const handleStartInputChange = (e) => {
    startInputValue = e.target.value;

    if (startInputValue.trim().length > 0) {
      startInputClearBtn.classList.add("visible");
    } else {
      startInputClearBtn.classList.remove("visible");
    }
    const onSuggestionSelect = async (start) => {
      startInput.value = start.display_name;

      const routeData = await fetchRoute(
        [start.lon, start.lat],
        [end.lon, end.lat]
      );
      console.log("Route Data:", routeData);
      const routeLayer = L.geoJSON(routeData, {
        style: { color: "red", weight: 5 },
      }).addTo(map);
      console.log("Route Layer:", routeLayer);
      map.fitBounds(routeLayer.getBounds(), {
        padding: [30, 30],
        maxZoom: 14,
      });
    };
    renderSuggestions(startInputValue, onSuggestionSelect);
  };

  startInput.addEventListener("input", _.debounce(handleStartInputChange, 300));

  startInputClearBtn.addEventListener("click", () => {
    startInput.value = "";
    startInputValue = "";
    startInputClearBtn.classList.remove("visible");
  });
};

const selectMarker = (result) => {
  if (selectedMarker) {
    map.removeLayer(selectedMarker);
    selectedMarker = null;
  }

  const title = result.name || "Unnamed place";

  selectedMarker = L.circleMarker([result.lat, result.lon])
    .bindPopup(`<strong>${title}</strong>`)
    .addTo(map)
    .openPopup();
};

const renderDetails = (result) => {
  detailsPanel.innerHTML = "";
  detailsPanel.style.display = "block";
  Object.entries(result).forEach(([key, value]) => {
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
    showDirectionsUI(result)
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

function getObstacles() {
  const obstacle = turf.point([8.681495, 49.41461]);
  const bufferedObstacle = turf.buffer(obstacle, 0.01, {
    units: "kilometers",
  });

  L.geoJSON(bufferedObstacle)
    .addTo(map)
    .bindPopup("Obstacle (Stairs)")
    .openPopup();

  avoidPolygon = bufferedObstacle.geometry;
}

const handleSearchInputChange = (e) => {
  searchInputValue = e.target.value;

  if (searchInputValue.trim().length > 0) {
    searchInputClearBtn.classList.add("visible");
  } else {
    searchInputClearBtn.classList.remove("visible");
  }
  renderSuggestions(searchInputValue, renderDetails);
};

searchInput.addEventListener("input", _.debounce(handleSearchInputChange, 300));

searchInputClearBtn.addEventListener("click", () => {
  searchInput.value = "";
  searchInputValue = "";
  searchInputClearBtn.classList.remove("visible");
  suggestionsDiv.style.display = "none";
  searchInput.focus();

  document.getElementById("details-panel").style.display = "none";
  if (selectedMarker) {
    map.removeLayer(selectedMarker);
    selectedMarker = null;
  }
});

const dismissSuggestions = (e) => {
  if (e.target.closest(".suggestion-item")) return;

  suggestionsDiv.style.display = "none";
};

document.addEventListener("click", dismissSuggestions);

const attribution = "© OpenStreetMap contributors";
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution,
}).addTo(map);

getObstacles();

refreshPlaces();
map.on("moveend", () => refreshPlaces());

closeBtn.addEventListener("click", () => (modal.style.display = "none"));
window.addEventListener("click", (e) => {
  if (e.target === modal) modal.style.display = "none";
});
