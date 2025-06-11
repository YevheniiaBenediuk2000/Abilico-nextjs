import {
  pipeline,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers";
import { fetchSuggestions } from "./api/fetchSuggestions.js";
import { fetchPlaces } from "./api/fetchPlaces.js";
import { fetchRoute } from "./api/fetchRoute.js";
import { obstacleStorage, reviewStorage } from "./api/obstacleStorage.js";
import { ICON_MANIFEST } from "./static/manifest.js";

// NEW — filter state
let currentAmenityType = "";
let currentAccessibility = new Set(); // e.g. “wheelchair”, “ramp”

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

let searchInputValue = "";
let startInputValue = "";

let selectedMarker = null;

const searchInputContainer = document.querySelector(".search-input-container");
const suggestionsDiv = document.getElementById("suggestions");
const directions = document.querySelector(".directions");
const searchInput = document.getElementById("search-input");
const detailsPanel = document.getElementById("details-panel");
const directionsButtonElement = document.createElement("button");
const searchInputClearBtn = document.getElementById("search-input-clear-btn");
const startInputClearBtn = document.getElementById("start-input-clear-btn");
const startInput = document.getElementById("start-input");
const endInput = document.getElementById("end-input");
const modal = document.getElementById("constraint-modal");
const modalCloseBtn = document.getElementById("constraint-modal-close");

function showModal(message) {
  modal.style.display = "block";
  modal.querySelector("h2").textContent = message;
}

function iconFor(tags) {
  const BASE_PATH = "../map-icons-osm";

  const candidates = ICON_MANIFEST.filter((p) =>
    p.endsWith(`/${tags.amenity}.svg`)
  );

  const url = candidates.length
    ? `${BASE_PATH}/${candidates[0]}`
    : `${BASE_PATH}/svg/misc/no_icon.svg`;

  return url;
}

async function refreshPlaces() {
  const geojson = await fetchPlaces(
    map.getBounds(),
    currentAmenityType,
    currentAccessibility
  );

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

  // NEW — show top-100 nearest in #suggestions panel (reuse existing element)
  (function showNearby() {
    const max = 100;
    const list = geojson.features.slice(0, max);
    suggestionsDiv.innerHTML =
      '<h3 style="margin:10px 10px 4px 10px">Nearby Places</h3>'; // reuse existing container
    list.forEach((f) => {
      const { name, amenity } = f.properties;
      const title = name ?? amenity ?? "Unnamed place";
      const item = document.createElement("div");
      item.className = "suggestion-item";
      item.textContent = title;
      item.onclick = () => {
        map.setView([f.geometry.coordinates[1], f.geometry.coordinates[0]], 18);
        selectMarker({
          ...f.properties,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          name: title,
        });
        renderDetails(
          f.properties,
          L.latLng(f.geometry.coordinates[1], f.geometry.coordinates[0])
        );
        suggestionsDiv.style.display = "none";
      };
      suggestionsDiv.appendChild(item);
    });
    suggestionsDiv.style.display = list.length ? "block" : "none";
  })();
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

      const routeLayer = L.geoJSON(routeData, { style: { weight: 5 } }).addTo(
        map
      );

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

const renderDetails = async (tags, latlng) => {
  detailsPanel.innerHTML = "<h3 style='margin: 0 0 4px 0;'>Details</h3>";
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

  // Add Directions Button
  directionsButtonElement.innerHTML = "";
  directionsButtonElement.className = "directions-button";
  directionsButtonElement.textContent = "Directions";
  directionsButtonElement.addEventListener("click", () =>
    showDirectionsUI(tags, latlng)
  );
  detailsPanel.appendChild(directionsButtonElement);

  // Add Reviews Section
  reviews = await reviewStorage();

  const reviewsContainer = document.createElement("div");
  reviewsContainer.id = "reviews-container";
  reviewsContainer.innerHTML = "<h3 style='margin: 16px 0 4px 0;'>Reviews</h3>";
  detailsPanel.appendChild(reviewsContainer);

  const placeId = tags.id;

  const list = document.createElement("ul");
  list.style.margin = "0 0 4px 0";

  reviews.forEach((r) => {
    if (placeId === r.placeId) {
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

  // Add Accessibility Features Section
  const accessibilityContainer = document.createElement("div");
  accessibilityContainer.id = "accessibility-container";
  accessibilityContainer.innerHTML =
    "<h3 style='margin: 16px 0 4px 0;'>Accessibility Features</h3>";
  detailsPanel.appendChild(accessibilityContainer);

  const loadingIndicator = document.createElement("p");
  loadingIndicator.textContent = "Analyzing accessibility features...";
  accessibilityContainer.appendChild(loadingIndicator);

  try {
    const placeId = tags.id;
    const placeReviews = reviews.filter((r) => placeId === r.placeId);

    if (placeReviews.length > 0) {
      const accessibilityFeatures = await analyzeReviews(placeReviews);

      // Clear loading indicator
      accessibilityContainer.removeChild(loadingIndicator);

      if (Object.keys(accessibilityFeatures).length === 0) {
        const noFeatures = document.createElement("p");
        noFeatures.textContent =
          "No accessibility features mentioned in reviews";
        accessibilityContainer.appendChild(noFeatures);
      } else {
        for (const [category] of Object.entries(accessibilityFeatures)) {
          const categoryDiv = document.createElement("div");
          categoryDiv.className = "accessibility-category";

          const categoryHeader = document.createElement("h4");
          categoryHeader.textContent = category.replace(/\b\w/g, (l) =>
            l.toUpperCase()
          );
          categoryDiv.appendChild(categoryHeader);

          accessibilityContainer.appendChild(categoryDiv);
        }
      }
    } else {
      accessibilityContainer.removeChild(loadingIndicator);
      const noReviews = document.createElement("p");
      noReviews.textContent =
        "No reviews available to analyze accessibility features";
      accessibilityContainer.appendChild(noReviews);
    }
  } catch (error) {
    console.error("Error analyzing accessibility features:", error);
    accessibilityContainer.removeChild(loadingIndicator);
    const errorMessage = document.createElement("p");
    errorMessage.textContent = "Error analyzing accessibility features";
    errorMessage.style.color = "red";
    accessibilityContainer.appendChild(errorMessage);
  }
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

// NLP
let nlpPipeline = null;

// Define accessibility categories
const ACCESSIBILITY_CATEGORIES = [
  "entrance",
  "restroom",
  "elevator",
  "parking",
  "ramp",
  "tactile",
  "hearing",
  "visual",
];

async function initializeNLP() {
  try {
    // Use a lightweight model for browser compatibility
    nlpPipeline = await pipeline(
      "zero-shot-classification",
      "Xenova/distilbert-base-uncased-mnli",
      { quantized: true }
    );
  } catch (error) {
    console.error("Failed to initialize NLP pipeline:", error);
  }
}

// Process reviews and extract accessibility features
async function analyzeReviews(reviews) {
  if (!nlpPipeline) await initializeNLP();

  const accessibilityFeatures = {};

  for (const category of ACCESSIBILITY_CATEGORIES) {
    accessibilityFeatures[category] = new Set();
  }

  for (const review of reviews) {
    const sentences = review.text
      .split(/[.!?]/)
      .filter((s) => s.trim().length > 0);

    for (const sentence of sentences) {
      try {
        const result = await nlpPipeline(sentence, ACCESSIBILITY_CATEGORIES);
        const topScore = Math.max(...result.scores);

        if (topScore > 0.5) {
          // Confidence threshold
          const topCategory = result.labels[result.scores.indexOf(topScore)];

          // Extract keyword phrases using pattern matching
          const phrases = extractAccessibilityPhrases(sentence, topCategory);

          accessibilityFeatures[topCategory].add("");
        }
      } catch (error) {
        console.error("Error processing sentence:", error);
      }
    }
  }

  // Convert Sets to Arrays and format output
  const formattedResults = {};
  for (const [category, phrases] of Object.entries(accessibilityFeatures)) {
    if (phrases.size > 0) {
      formattedResults[category] = Array.from(phrases).map((phrase) =>
        phrase.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase())
      );
    }
  }

  return formattedResults;
}

// Helper function to extract meaningful phrases
function extractAccessibilityPhrases(sentence, category) {
  const phrases = [];
  const words = sentence.toLowerCase().split(/\s+/);
  const categoryIndex = words.indexOf(category.toLowerCase());

  if (categoryIndex !== -1) {
    // Extract 2-4 word phrases containing the category
    const start = Math.max(0, categoryIndex - 2);
    const end = Math.min(words.length, categoryIndex + 3);
    phrases.push(words.slice(start, end).join(" "));
  }

  // Look for common accessibility adjectives
  const accessibilityAdjectives = [
    "accessible",
    "adapted",
    "wheelchair",
    "easy",
    "automatic",
    "wide",
    "spacious",
    "step-free",
    "barrier-free",
    "inclusive",
  ];

  accessibilityAdjectives.forEach((adj) => {
    const adjIndex = words.indexOf(adj);
    if (adjIndex !== -1) {
      // Extract adjective + following 1-2 words
      const start = adjIndex;
      const end = Math.min(words.length, adjIndex + 3);
      phrases.push(words.slice(start, end).join(" "));
    }
  });

  return phrases.filter(
    (phrase) =>
      phrase.includes(category) ||
      accessibilityAdjectives.some((adj) => phrase.includes(adj))
  );
}

// NEW — filter listeners
document.getElementById("type-filter").addEventListener("change", (e) => {
  currentAmenityType = e.target.value; // "" means “any”
  refreshPlaces(); // re-query Overpass
});

document
  .getElementById("accessibility-filter")
  .addEventListener("change", (e) => {
    const cb = e.target;
    if (cb.checked) currentAccessibility.add(cb.value);
    else currentAccessibility.delete(cb.value);
    refreshPlaces();
  });

// NEW — distance helper (Haversine, uses Leaflet’s built-in)
function distanceMeters(latlng1, latlng2) {
  return map.distance(latlng1, latlng2); // Leaflet’s Vincenty impl.
}
