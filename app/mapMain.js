import debounce from "lodash.debounce";
import OpeningHoursLib from "opening_hours";

import elements from "./constants/domElements.js";
import {
  predictAccessibilityBatch,
  predictAccessibility,
  preloadAccessibilityModel,
} from "./utils/accessibilityPredict.js";
import {
  fetchPlace,
  fetchPlaceGeometry,
  fetchPlaceIds,
  fetchPlacesByIds,
} from "./api/fetchPlaces.js";
import { fetchUserPlaces } from "./api/fetchUserPlaces.js";
import { fetchRoute } from "./api/fetchRoute.js";
import { obstacleStorage } from "./api/obstacleStorage.js";
import {
  BADGE_COLOR_BY_TIER,
  DEFAULT_ZOOM,
  EXCLUDED_PROPS,
  placeClusterConfig,
  PREDICTED_BADGE_COLOR_BY_TIER,
  PREDICTION_PROBABILITY_THRESHOLD,
  SHOW_PLACES_ZOOM,
} from "./constants/constants.mjs";
import { toastError, toastWarn } from "./utils/toast.mjs";
import { waypointDivIcon, WP_COLORS } from "./utils/wayPoints.mjs";
import {
  DRAW_HELP_LS_KEY,
  DrawHelpAlert,
} from "./leaflet-controls/DrawHelpAlert.mjs";
import {
  customizeDrawToolbar,
  getCautionDrawHandler,
} from "./leaflet-controls/CustomizeDrawToolbar.mjs";
import { ls, LS_KEYS } from "./utils/localStorage.mjs";
import {
  duringLoading,
  hideLoading,
  showDetailsLoading,
  showLoading,
  withButtonLoading,
} from "./utils/loading.mjs";
import {
  baseLayers,
  BASEMAP_LS_KEY,
  BasemapGallery,
  osm,
} from "./leaflet-controls/BasemapGallery.mjs";
import { VisionAccessibilityControl } from "./leaflet-controls/VisionAccessibilityControl.mjs";
import {
  renderPhotosGrid,
  resolvePlacePhotos,
  showMainPhoto,
} from "./modules/fetchPhotos.mjs";
import { ZoomMuiControl } from "./leaflet-controls/ZoomMuiControl.mjs";
import { queryClient } from "./queryClient.js";
import { computePlaceScores } from "./api/placeRatings.js";
import { ACCESSIBILITY_CATEGORY_LABELS } from "./constants/accessibilityCategories.js";

import { makePoiIcon } from "./icons/makePoiIcon.mjs";
import { supabase } from "./api/supabaseClient.js";
import { ensurePlaceExists, reviewStorage } from "./api/reviewStorage.js";
import {
  formatAddressFromTags,
  formatAreaFromTags,
  formatLevel,
} from "./utils/formatAddress.mjs";
import {
  savePlacesToCache,
  loadPlacesFromCache,
} from "./utils/placesPersistence.js";
import {
  BRAND_WIKIDATA_MAP,
  SUPPRESSED_BRAND_WIKIDATA,
} from "./constants/brandWikidataMap.js";
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
import {
  initRoadAccessibilityLayer,
  setRoadAccessibilityEnabled,
  setVisualizationMode,
  isRoadAccessibilityEnabled,
  forceRefreshRoads,
  setRoadLoadingCallback,
  isRoadAccessibilityLoading,
  setPredictionsEnabled,
  isPredictionsEnabled,
  isOnnxModelsReady,
  preloadOnnxModelsInBackground,
  setPredictionsLoadingCallback,
} from "./modules/roadAccessibilityMap.js";

// DEBUG: confirm import really works
// console.log("🔍 computePlaceScores import is:", computePlaceScores);

// Expose globals on window for React components to access
if (typeof window !== "undefined") {
  window.globals = globals;
}

// Initialize accessibility filter from localStorage, or default to all tiers
const ACCESSIBILITY_FILTER_LS_KEY = "ui.placeAccessibility.filter";
const ML_PREDICTIONS_LS_KEY = "ui.placeAccessibility.mlPredictions";
const ALL_ACCESSIBILITY_TIERS = [
  "designated",
  "yes",
  "limited",
  "unknown",
  "no",
];

function loadAccessibilityFilterFromLS() {
  if (typeof window === "undefined") return new Set(ALL_ACCESSIBILITY_TIERS);
  try {
    const raw = window.localStorage.getItem(ACCESSIBILITY_FILTER_LS_KEY);
    if (!raw) return new Set(ALL_ACCESSIBILITY_TIERS);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const filtered = parsed.filter((t) =>
        ALL_ACCESSIBILITY_TIERS.includes(t)
      );
      if (filtered.length) return new Set(filtered);
    }
  } catch {
    // ignore parse errors
  }
  return new Set(ALL_ACCESSIBILITY_TIERS);
}

function loadMlPredictionsEnabledFromLS() {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(ML_PREDICTIONS_LS_KEY);
    if (raw === null) return true; // default to enabled
    return JSON.parse(raw) !== false;
  } catch {
    return true;
  }
}

let accessibilityFilter = loadAccessibilityFilterFromLS();

/**
 * Get the accessibility tier for a feature based on its wheelchair tags
 * @param {Object} feature - GeoJSON feature
 * @returns {string} - One of: "designated", "yes", "limited", "no", "unknown"
 */
function getFeatureAccessibilityTier(feature) {
  const tags = feature?.properties?.tags || feature?.properties || {};
  const raw = (
    tags.wheelchair ??
    tags["toilets:wheelchair"] ??
    tags["wheelchair:toilets"] ??
    ""
  )
    .toString()
    .toLowerCase();

  if (raw.includes("designated")) return "designated";
  if (raw === "yes" || raw.includes("true")) return "yes";
  if (raw.includes("limited") || raw.includes("partial")) return "limited";
  if (raw === "no" || raw.includes("false")) return "no";
  return "unknown";
}

/**
 * Check if a feature passes the current accessibility filter
 * @param {Object} feature - GeoJSON feature
 * @returns {boolean}
 */
function isFeatureAllowedByAccessibilityFilter(feature) {
  const tier = getFeatureAccessibilityTier(feature);
  return accessibilityFilter.has(tier);
}

// Map-wide cache of places by stable OSM key (N/123, W/456, R/789)
const placesCacheById = new Map();
// Optional: also track a simple array of all known features for quick reuse
let allPlacesFeatures = [];

let departureSuggestionsRoot = null;
let departureSuggestionsRenderSeq = 0;

let destinationSuggestionsRoot = null;
let destinationSuggestionsRenderSeq = 0;

let map = null;
let geocoder = null;
let currentBasemapLayer = null; // Store basemap layer reference globally

let clickPopup = null;

let selectedPlaceLayer = null;
// Track map markers by OSM key so we can temporarily override selected marker color
const placeMarkersByKey = new Map(); // key -> L.Marker
let selectedMarkerState = null; // { key, marker, originalIcon }
let placesPane;

const placeClusterLayer = L.markerClusterGroup(placeClusterConfig);

// Cache for ML accessibility predictions (persists across refreshes)
const placePredictionsCache = new Map(); // placeKey -> { label, probability, confidence }
let placePredictionsEnabled = loadMlPredictionsEnabledFromLS(); // Toggle for showing predictions on map

// Expose toggle function and prediction cache for React components
if (typeof window !== "undefined") {
  window.setPlacePredictionsEnabled = (enabled) => {
    placePredictionsEnabled = enabled;
    // Optionally refresh the markers when toggled
    if (map) {
      refreshPlaceMarkerPredictions();
    }
  };
  window.isPlacePredictionsEnabled = () => placePredictionsEnabled;
  // Expose prediction cache for PlacesListOverlay to show predictions in cards
  window.getPlacePrediction = (placeKey) => placePredictionsCache.get(placeKey);
  window.getPlacePredictionsCache = () => placePredictionsCache;
}

// Track when Leaflet.Draw is in editing/deleting mode
const drawState = { editing: false, deleting: false };
let drawControl = null;

let fromLatLng = null;
let toLatLng = null;
let fromMarker = null;
let toMarker = null;
let routeLayer = null;
let myLocationLatLng = null;
let autoFromGeolocateAttempted = false;

const drawnItems = new L.FeatureGroup();
// Separate layer group for obstacles (not in cluster group)
let obstaclesLayer = null;
let drawHelpAlertControl = null;

// ---------- Bootstrap Modal + Tooltip helpers ----------
let obstacleModalInstance = null;
let obstacleForm, obstacleTitleInput;

let obstacleFeatures = [];

let editingReviewId = null;

// place-type filter state used on the map side
let placeTypeFilterState = null; // { [groupLabel]: { [subLabel]: boolean } } or null = all on

// photos-only filter state used on the map side
let photosOnlyFilterEnabled = false;
let photosOnlyPlaceKeys = new Set(); // placeKeys that have photos

// open-now filter state used on the map side
let openNowFilterEnabled = false;

// ---- User accessibility preferences (for personalised scores) ----
let userPrefsCache = [];
let userPrefsLoaded = false;

async function getUserAccessibilityPreferences() {
  if (userPrefsLoaded) {
    return userPrefsCache;
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      // Silently handle auth errors - user might not be logged in
      console.debug("Auth check for prefs:", userError.message);
      userPrefsCache = [];
      userPrefsLoaded = true;
      return userPrefsCache;
    }

    if (!user) {
      console.log(
        "👤 No logged-in user – personal accessibility preferences empty."
      );
      userPrefsCache = [];
      userPrefsLoaded = true;
      return userPrefsCache;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("accessibility_preferences")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error(
        "❌ Failed to load accessibility_preferences:",
        profileError
      );
      userPrefsCache = [];
    } else {
      userPrefsCache = profile?.accessibility_preferences || [];
    }

    console.log("👤 Loaded accessibility_preferences:", userPrefsCache);
  } catch (err) {
    console.error("❌ Error while loading accessibility_preferences:", err);
    userPrefsCache = [];
  } finally {
    userPrefsLoaded = true;
  }

  return userPrefsCache;
}

// helper to load from localStorage (same key as React)
const PLACE_TYPE_FILTER_LS_KEY = "ui.placeType.filter";

function loadPlaceTypeFilterFromLS() {
  try {
    const raw = localStorage.getItem(PLACE_TYPE_FILTER_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

// used when building markers to decide if a feature is visible
function isFeatureAllowedByTypeFilter(feature) {
  if (!placeTypeFilterState) return true; // no filter -> all allowed

  // Check if there are any active filters at all
  let hasAnyActiveFilter = false;
  let totalFilters = 0;
  for (const groupLabel in placeTypeFilterState) {
    const group = placeTypeFilterState[groupLabel];
    if (group && typeof group === "object") {
      for (const subLabel in group) {
        totalFilters++;
        if (group[subLabel] === true) {
          hasAnyActiveFilter = true;
          break;
        }
      }
      if (hasAnyActiveFilter) break;
    }
  }

  // If filters are defined (totalFilters > 0) but none are selected, hide all places
  if (totalFilters > 0 && !hasAnyActiveFilter) return false;

  const props = feature.properties || {};
  const tags = props.tags || props;

  const major =
    (tags.amenity && "amenity") ||
    (tags.shop && "shop") ||
    (tags.tourism && "tourism") ||
    (tags.leisure && "leisure") ||
    (tags.healthcare && "healthcare") ||
    (tags.office && "office") ||
    // OSM diplomatic/embassy tagging can appear without an `office` key (e.g. embassy=yes)
    // Treat these as "Office" group for filtering/UI consistency.
    ((tags.diplomatic || tags.embassy) && "office") ||
    (tags.historic && "historic") ||
    (tags.natural && "natural") ||
    (tags.sport && "sport") ||
    "other";

  const labelForMajor = {
    amenity: "Amenities",
    shop: "Shops",
    tourism: "Tourism",
    leisure: "Leisure",
    healthcare: "Healthcare",
    office: "Office",
    historic: "Historic",
    natural: "Natural",
    sport: "Sport",
    other: "Other",
  };

  const groupLabel = labelForMajor[major] || "Other";

  const subRaw = (() => {
    // If this is a diplomatic/embassy place without office=*,
    // prefer a stable subtype rather than falling through to "other".
    if (major === "office" && !tags.office) {
      if (tags.diplomatic) return tags.diplomatic;
      if (tags.embassy)
        return String(tags.embassy).toLowerCase().trim() === "yes"
          ? "embassy"
          : tags.embassy;
    }
    return (
      tags[major] ||
      tags.amenity ||
      tags.shop ||
      tags.tourism ||
      tags.leisure ||
      tags.healthcare ||
      tags.office ||
      tags.historic ||
      tags.natural ||
      tags.sport ||
      "other"
    );
  })();

  const subLabel = subRaw.toString().replace(/[_-]/g, " ");

  const group = placeTypeFilterState[groupLabel];

  // 🔁 If user never configured this group, don't filter it out
  if (!group) return true;

  const val = group[subLabel];

  // 🔁 If this subtype was never seen/saved, treat it as ON by default
  if (typeof val === "undefined") return true;

  return !!val;
}

// used when building markers to decide if a feature should be shown based on photos filter
function isFeatureAllowedByPhotosFilter(feature) {
  if (!photosOnlyFilterEnabled) return true; // filter not active -> all allowed

  const placeKey = placeKeyFromFeature(feature);
  if (!placeKey) return false; // no key -> can't match

  return photosOnlyPlaceKeys.has(placeKey);
}

// used when building markers to decide if a feature should be shown based on open now filter
function isFeatureAllowedByOpenNowFilter(feature) {
  if (!openNowFilterEnabled) return true; // filter not active -> all allowed

  const props = feature.properties || {};
  const tags = props.tags || props;
  const openingHours = tags.opening_hours || tags["opening_hours"];

  if (!openingHours) return false; // no opening hours -> can't determine if open

  try {
    const oh = new OpeningHoursLib(openingHours, null, { locale: "en" });
    const now = new Date();
    const isUnknown = oh.getUnknown(now);
    if (isUnknown) return false; // unknown hours -> hide when filter is active
    return oh.getState(now); // true if open now
  } catch {
    // Failed to parse opening_hours - treat as closed/unknown
    return false;
  }
}

function isBenchFeature(feature) {
  const props = feature?.properties || {};
  const tags = props.tags || props;
  const amenity = String(tags?.amenity ?? "")
    .toLowerCase()
    .trim();
  return amenity === "bench";
}

function placeKeyFromFeature(feature) {
  const p = feature.properties || {};

  // User-added places have id (UUID) and source = 'user', but no osm_id/osm_type
  if (p.source === "user" && p.id) {
    return `user/${p.id}`; // e.g. "user/uuid-here"
  }

  // OSM places have osm_type and osm_id (or `type`/`id` from osmtogeojson)
  let osmType = p.osm_type || p.type || null;
  let osmId = p.osm_id || p.id || null;

  // osmtogeojson often sets feature.id like "node/123", "way/456", "relation/789"
  if ((!osmType || !osmId) && typeof feature?.id === "string") {
    const parts = feature.id.split("/");
    if (parts.length === 2) {
      osmType = osmType || parts[0];
      osmId = osmId || parts[1];
    }
  }

  // Normalize long types to the short form used elsewhere in this app.
  const typeMap = { node: "N", way: "W", relation: "R" };
  if (typeof osmType === "string") {
    const t = osmType.toLowerCase();
    osmType = typeMap[t] || osmType;
  }

  if (!osmType || !osmId) return null;
  return `${osmType}/${osmId}`; // e.g. "N/123456789"
}

function displayNameFromTags(tags = {}) {
  const humanize = (v) => {
    const s = String(v ?? "")
      .replace(/[_-]/g, " ")
      .trim();
    if (!s) return "";
    // Many OSM keys use `yes/no` as a boolean; don't show bare "yes" as a title.
    if (s.toLowerCase() === "yes" || s.toLowerCase() === "true" || s === "1")
      return "";
    return s;
  };

  return (
    tags.name ||
    tags.brand ||
    tags.operator ||
    tags["addr:housename"] ||
    humanize(tags.amenity) ||
    humanize(tags.shop) ||
    humanize(tags.tourism) ||
    humanize(tags.leisure) ||
    humanize(tags.healthcare) ||
    humanize(tags.office) ||
    humanize(tags.historic) ||
    humanize(tags.natural) ||
    humanize(tags.sport) ||
    humanize(tags.craft) ||
    humanize(tags.man_made) ||
    humanize(tags.military) ||
    (String(tags.building ?? "")
      .toLowerCase()
      .trim() === "yes"
      ? "Building"
      : humanize(tags.building)) ||
    "Point of interest"
  );
}

async function showQuickRoutePopup(latlng) {
  // Reverse geocode to get location name
  let locationName = null;
  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Abilico/1.0",
      },
    });

    if (response.ok) {
      const data = await response.json();
      const address = data.address || {};

      // Do NOT show street/house number here. Prefer neighborhood/district + city.
      const city =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.county ||
        address.state_district ||
        address.state ||
        null;

      const district =
        address.suburb ||
        address.neighbourhood ||
        address.city_district ||
        address.quarter ||
        null;

      if (district && city) {
        locationName = `${district}, ${city}`;
      } else if (city) {
        locationName = String(city);
      } else if (district) {
        locationName = String(district);
      }
    }
  } catch (err) {
    console.warn("Reverse geocoding failed:", err);
  }

  const html = `
    <div class="quick-route-popup-container">
      <div class="quick-route-bubble" role="group" aria-label="Directions">
        <button id="qp-close" type="button" class="quick-route-close" aria-label="Close">
          <span class="material-icons">close</span>
        </button>
        <div class="quick-route-actions">
          <button id="qp-directions" type="button" class="quick-route-btn" aria-label="Get directions to this place">
            <span class="material-icons quick-route-icon">directions</span>
            <span class="quick-route-text">Directions</span>
          </button>
        </div>
      </div>
    </div>
  `;

  if (clickPopup) {
    map.closePopup(clickPopup);
    clickPopup = null;
  }

  clickPopup = L.popup({
    className: "quick-choose-popup",
    offset: [0, -8],
    autoClose: false,
    closeOnClick: false,
    closeButton: false,
  })
    .setLatLng(latlng)
    .setContent(html)
    .openOn(map);

  const directionsBtn = document.getElementById("qp-directions");
  directionsBtn?.addEventListener("click", async (ev) => {
    L.DomEvent.stop(ev);
    try {
      // openDirectionsToPlace() already sets destination; avoid double reverse-geocode calls.
      await openDirectionsToPlace(latlng, { fit: false });
      if (locationName) {
        elements.destinationSearchInput.value = locationName;
      }

      if (
        typeof window !== "undefined" &&
        typeof window.closePlacePopup === "function"
      ) {
        window.closePlacePopup();
      }
    } finally {
      map.closePopup(clickPopup);
      clickPopup = null;
    }
  });

  const closeBtn = document.getElementById("qp-close");
  closeBtn?.addEventListener("click", (ev) => {
    L.DomEvent.stop(ev);
    map.closePopup(clickPopup);
    clickPopup = null;
  });
}

function mountInOffcanvas(titleText) {
  if (
    typeof window !== "undefined" &&
    typeof window.openPlaceDetails === "function"
  ) {
    window.openPlaceDetails(titleText);
  } else {
    console.warn("openPlaceDetails() is not available yet");
  }
}

function getDirectionsUiEl() {
  return elements.directionsUi || document.getElementById("directions-ui");
}

async function ensureDirectionsUiVisible(titleText = "Directions") {
  // Opening the drawer first increases the chance the directions UI is mounted.
  mountInOffcanvas(titleText);

  let el = getDirectionsUiEl();
  if (!el) {
    // Wait a couple frames for React to mount the Drawer content if needed.
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    );
    el = getDirectionsUiEl();
  }

  if (!el) {
    console.warn("⚠️ Directions UI element not found (#directions-ui)");
    return null;
  }

  el.classList.remove("d-none");
  return el;
}

function openPlaceDetailsPopup(
  titleText,
  category = null,
  distance = null,
  features = [],
  shortName = null
) {
  if (
    typeof window !== "undefined" &&
    typeof window.openPlacePopup === "function"
  ) {
    window.openPlacePopup(titleText, category, distance, features, shortName);
  } else {
    // Fallback: use the drawer if popup is not wired yet
    mountInOffcanvas(titleText);
  }
}

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

  // Show Edit button if editing an existing obstacle (has initial title)
  const editBtn = document.getElementById("obstacle-edit-btn");
  const saveBtn = obstacleForm.querySelector('button[type="submit"]');
  const isEditing = initial.title && initial.title.trim() !== "";

  // If editing, start in view mode (read-only) with Edit button visible
  // If creating new, input is editable and Edit button is hidden
  if (isEditing) {
    obstacleTitleInput.readOnly = true;
    obstacleTitleInput.disabled = false; // Keep enabled but readonly for styling
    obstacleTitleInput.style.backgroundColor = "#f5f5f5";
    obstacleTitleInput.style.cursor = "not-allowed";
    if (editBtn) {
      editBtn.style.display = "inline-block";
    }
    if (saveBtn) {
      saveBtn.style.display = "none";
    }
  } else {
    obstacleTitleInput.readOnly = false;
    obstacleTitleInput.style.backgroundColor = "";
    obstacleTitleInput.style.cursor = "";
    if (editBtn) {
      editBtn.style.display = "none";
    }
    if (saveBtn) {
      saveBtn.style.display = "inline-block";
    }
  }

  return new Promise((resolve) => {
    let saved = false;
    let isEditMode = !isEditing; // Start in edit mode for new obstacles, view mode for existing

    const enableEditMode = () => {
      isEditMode = true;
      obstacleTitleInput.readOnly = false;
      obstacleTitleInput.style.backgroundColor = "";
      obstacleTitleInput.style.cursor = "";
      obstacleTitleInput.focus(); // Focus the input when entering edit mode
      if (editBtn) {
        editBtn.style.display = "none";
      }
      if (saveBtn) {
        saveBtn.style.display = "inline-block";
      }
    };

    const onSubmit = (e) => {
      e.preventDefault();
      if (!isEditMode && isEditing) {
        // If in view mode, clicking form submit should enable edit mode
        enableEditMode();
        return;
      }
      saved = true;
      const title = obstacleTitleInput.value.trim();
      obstacleModalInstance.hide();
      obstacleForm.removeEventListener("submit", onSubmit);
      modalEl.removeEventListener("hidden.bs.modal", onHidden);
      if (editBtn) {
        editBtn.removeEventListener("click", onEditClick);
      }
      resolve({ title });
    };

    const onEditClick = (e) => {
      e.preventDefault();
      enableEditMode();
    };

    const modalEl = document.getElementById("obstacleModal");
    const onHidden = () => {
      obstacleForm.removeEventListener("submit", onSubmit);
      modalEl.removeEventListener("hidden.bs.modal", onHidden);
      if (editBtn) {
        editBtn.removeEventListener("click", onEditClick);
      }
      // Reset input styling when modal is closed
      obstacleTitleInput.readOnly = false;
      obstacleTitleInput.style.backgroundColor = "";
      obstacleTitleInput.style.cursor = "";
      if (!saved) resolve(null);
    };

    obstacleForm.addEventListener("submit", onSubmit);
    if (editBtn && isEditing) {
      editBtn.addEventListener("click", onEditClick);
    }
    modalEl.addEventListener("hidden.bs.modal", onHidden);
    obstacleModalInstance.show();
  });
}

function tooltipTextFromProps(p = {}) {
  const t = p.title?.trim();
  if (t) return t;
  return "Obstacle";
}

/**
 * Create tooltip text with vote counts for an obstacle
 * @param {Object} obstacle - The obstacle feature object
 * @param {Object} voteStats - Vote statistics {confirm, issue, total}
 * @returns {string} HTML string for tooltip
 */
function tooltipTextWithVotes(obstacle, voteStats = null) {
  const title = tooltipTextFromProps(obstacle.properties || {});

  if (!voteStats || voteStats.total === 0) {
    return title;
  }

  return `
    <div style="text-align: left;">
      <strong>${title}</strong>
      <div style="font-size: 0.85em; margin-top: 4px; color: #666;">
        <div>✅ Confirmed: ${voteStats.confirm}</div>
        <div>⚠️ Reported: ${voteStats.issue}</div>
        <div style="margin-top: 2px; font-weight: bold;">Total: ${voteStats.total}</div>
      </div>
    </div>
  `;
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
    html: text.includes("<") || text.includes("</"), // Enable HTML if text contains HTML tags
  });
}

function hideAllBootstrapTooltips() {
  // Close any visible bootstrap tooltip on place markers
  try {
    placeMarkersByKey?.forEach?.((marker) => {
      marker?._bsTooltip?.hide?.();
    });
  } catch {}

  // Close any visible tooltip on drawn items (obstacles etc.)
  try {
    drawnItems?.eachLayer?.((layer) => {
      layer?._bsTooltip?.hide?.();
    });
  } catch {}

  // Fallback: remove any stray tooltip DOM nodes (e.g., if instance tracking was lost)
  try {
    document
      .querySelectorAll?.(".tooltip.show")
      ?.forEach?.((el) => el.remove());
  } catch {}
}

/**
 * Attach tooltip to obstacle layer with vote counts loaded on hover
 * @param {Object} layer - Leaflet layer
 * @param {Object} obstacle - Obstacle feature object with place_id
 */
async function attachObstacleTooltip(layer, obstacle) {
  const { getVoteStatistics } = await import("./api/placeVotes.js");
  const el = layer.getElement?.() || layer._path || layer._icon;
  if (!el) return;

  // Dispose existing tooltip
  if (layer._bsTooltip) {
    layer._bsTooltip.dispose();
    layer._bsTooltip = null;
  }

  const initialText = tooltipTextFromProps(obstacle.properties || {});
  let voteStatsLoaded = false;
  let voteStats = null;

  // Create tooltip with initial text
  el.setAttribute("data-bs-toggle", "tooltip");
  el.setAttribute("data-bs-title", initialText);
  el.setAttribute("aria-label", initialText);

  layer._bsTooltip = new bootstrap.Tooltip(el, {
    placement: "top",
    trigger: "hover focus",
    container: "body",
    html: false,
  });

  // Load vote statistics on hover
  const loadVoteStats = async () => {
    if (voteStatsLoaded || !obstacle.place_id) return;

    try {
      voteStatsLoaded = true;
      voteStats = await getVoteStatistics(obstacle.place_id);

      // Update tooltip content if votes exist
      if (voteStats && voteStats.total > 0 && layer._bsTooltip) {
        const enhancedText = tooltipTextWithVotes(obstacle, voteStats);

        // Dispose and recreate tooltip with HTML enabled
        layer._bsTooltip.dispose();
        layer._bsTooltip = new bootstrap.Tooltip(el, {
          placement: "top",
          trigger: "hover focus",
          container: "body",
          html: true,
          title: enhancedText,
        });
        // Don't show automatically - only on hover
      }
    } catch (error) {
      console.error("Failed to load vote statistics for tooltip:", error);
      voteStatsLoaded = false; // Allow retry
    }
  };

  // Load vote stats on mouseenter
  el.addEventListener("mouseenter", loadVoteStats, { once: false });
}

async function openEditModalForLayer(layer) {
  const id = layer.options.obstacleId;
  const idx = obstacleFeatures.findIndex((f) => f.id === id);
  if (idx === -1) return;

  const props = obstacleFeatures[idx].properties || {};
  const result = await showObstacleModal({ title: props.title });
  if (!result) return; // cancelled

  // Update in-memory + storage
  obstacleFeatures[idx].properties = {
    ...props,
    title: result.title,
  };
  await obstacleStorage("PUT", obstacleFeatures[idx]);

  // Update tooltip
  attachBootstrapTooltip(
    layer,
    tooltipTextFromProps(obstacleFeatures[idx].properties)
  );
}

function hookLayerInteractions(layer, props) {
  // Ensure the element exists in the DOM before creating tooltip
  // (safe if we call after the layer is added to the map/featureGroup).
  // Note: For obstacles, tooltip will be attached via attachObstacleTooltip
  // For non-obstacles, we still attach the basic tooltip
  if (!layer.options.obstacleId) {
    layer.once("add", () =>
      attachBootstrapTooltip(layer, tooltipTextFromProps(props))
    );
  }

  layer.off("click");
  layer.on("click", async () => {
    if (drawState.deleting || drawState.editing) return;
    // ✅ Check user login status - check both currentUser and Supabase directly
    let isLoggedIn = !!currentUser;
    if (!isLoggedIn) {
      // Double-check with Supabase in case currentUser is stale
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        isLoggedIn = !!user;
        // Update currentUser if we found a user
        if (user && !currentUser) {
          currentUser = user;
        }
      } catch (err) {
        console.warn("Failed to check user status:", err);
      }
    }

    if (!isLoggedIn) {
      // For non-logged-in users, show a read-only popup with obstacle info
      const title = tooltipTextFromProps(props);
      const popupContent = L.DomUtil.create("div", "p-2");
      popupContent.innerHTML = `
        <h6 class="mb-2">${title}</h6>
        <p class="small text-muted mb-2">Log in to edit or delete obstacles</p>
        <a href="/auth" class="btn btn-sm btn-primary w-100 text-decoration-none">
          Log in
        </a>
      `;
      L.popup({
        className: "obstacle-readonly-popup",
        closeButton: true,
        autoClose: true,
        closeOnClick: true,
      })
        .setLatLng(
          layer.getLatLng ? layer.getLatLng() : layer.getBounds().getCenter()
        )
        .setContent(popupContent)
        .openOn(map);
      return;
    }
    // Logged-in users - open obstacle dialog
    const id = layer.options.obstacleId;
    const idx = obstacleFeatures.findIndex((f) => f.id === id);
    if (idx !== -1) {
      const obstacle = obstacleFeatures[idx];
      if (typeof window !== "undefined" && window.openObstacleDialog) {
        window.openObstacleDialog(obstacle);
      }
    }
  });
}

function updateObstacleInMap(updatedObstacle) {
  const idx = obstacleFeatures.findIndex((f) => f.id === updatedObstacle.id);
  if (idx !== -1) {
    obstacleFeatures[idx] = updatedObstacle;

    // Update the layer tooltip
    let layerToUpdate = null;
    drawnItems.eachLayer((layer) => {
      if (layer.options.obstacleId === updatedObstacle.id) {
        layerToUpdate = layer;
      }
    });

    if (layerToUpdate) {
      attachBootstrapTooltip(
        layerToUpdate,
        tooltipTextFromProps(updatedObstacle.properties)
      );
    }
  }
}

function toggleObstaclesByZoom() {
  // ✅ Only show controls if user is logged in
  if (!currentUser || !drawControl) return;

  const allow = map.getZoom() >= DEFAULT_ZOOM;

  if (allow) {
    if (!drawHelpAlertControl && !ls.get(DRAW_HELP_LS_KEY)) {
      drawHelpAlertControl = new DrawHelpAlert();
      map.addControl(drawHelpAlertControl);
    }

    map.addControl(drawControl);
    // Customize the toolbar after adding the control
    customizeDrawToolbar(drawControl, map);
  } else {
    if (drawHelpAlertControl && !ls.get(DRAW_HELP_LS_KEY)) {
      map.removeControl(drawHelpAlertControl);
      drawHelpAlertControl = null;
    }

    map.removeControl(drawControl);
  }

  // Show/hide obstacles based on zoom level (same threshold as draw controls)
  const showObstacles = map.getZoom() >= DEFAULT_ZOOM;
  if (obstaclesLayer) {
    if (showObstacles) {
      // Show obstacles layer
      if (!map.hasLayer(obstaclesLayer)) {
        obstaclesLayer.addTo(map);
      }
      // Make all obstacle layers visible
      obstaclesLayer.eachLayer((layer) => {
        if (layer.setOpacity) {
          layer.setOpacity(1);
        }
        if (layer._icon) {
          layer._icon.style.display = "";
          layer._icon.style.visibility = "visible";
        }
        if (layer._path) {
          layer._path.style.display = "";
          layer._path.style.visibility = "visible";
        }
      });
    } else {
      // Hide obstacles by removing from map (cleaner than opacity)
      if (map.hasLayer(obstaclesLayer)) {
        obstaclesLayer.removeFrom(map);
      }
    }
  }
}

function serializeBounds(bounds, zoom) {
  const s = bounds.getSouth();
  const w = bounds.getWest();
  const n = bounds.getNorth();
  const e = bounds.getEast();
  // Quantize bounds to reduce cache key churn while panning.
  // Higher zoom => finer precision; lower zoom => coarser precision.
  const decimals = zoom >= 17 ? 4 : zoom >= 15 ? 3 : 2;
  const round = (v) => Number(v.toFixed(decimals));
  return [round(s), round(w), round(n), round(e)];
}

// =============================================================================
// SMART PLACES FETCHING WITH INDEXEDDB CACHING
// Uses ID-first strategy: fetch IDs, check cache, only fetch missing places
// =============================================================================

// In-memory cache populated from IndexedDB on first load
let indexedDBCacheLoaded = false;
let indexedDBPlacesMap = new Map(); // id -> feature

async function ensureIndexedDBCacheLoaded() {
  if (indexedDBCacheLoaded) return;
  try {
    const cached = await loadPlacesFromCache();
    cached.forEach((item) => {
      if (item.id && item.feature) {
        indexedDBPlacesMap.set(item.id, item.feature);
      }
    });
    console.log(
      `📂 [IndexedDB] Loaded ${indexedDBPlacesMap.size} places from persistent cache`
    );
    indexedDBCacheLoaded = true;
  } catch (e) {
    console.warn("Failed to load IndexedDB cache:", e);
    indexedDBCacheLoaded = true; // Don't retry on error
  }
}

/**
 * Smart fetch that uses ID-first strategy with IndexedDB caching.
 * 1. Fetch only IDs from Overpass (lightweight)
 * 2. Check which IDs are already in IndexedDB cache
 * 3. Fetch full data only for missing IDs
 * 4. Save new places to IndexedDB
 */
async function fetchPlacesWithCache(bounds, zoom, options) {
  await ensureIndexedDBCacheLoaded();

  // Step 1: Fetch IDs for current viewport
  const ids = await fetchPlaceIds(bounds, zoom, options);

  if (!ids || ids.length === 0) {
    console.log("🆔 [fetchPlacesWithCache] No IDs returned");
    return { type: "FeatureCollection", features: [] };
  }

  console.log(`🆔 [fetchPlacesWithCache] Got ${ids.length} IDs from Overpass`);

  // Step 2: Separate cached vs missing IDs
  const cachedFeatures = [];
  const missingIds = [];

  for (const idObj of ids) {
    const key = `${idObj.type}/${idObj.id}`;
    const cached = indexedDBPlacesMap.get(key);
    if (cached) {
      cachedFeatures.push(cached);
    } else {
      missingIds.push(idObj);
    }
  }

  console.log(
    `💾 [fetchPlacesWithCache] ${cachedFeatures.length} from cache, ${missingIds.length} need fetching`
  );

  // Step 3: Fetch only missing places
  let newFeatures = [];
  if (missingIds.length > 0) {
    const fetched = await fetchPlacesByIds(missingIds);
    newFeatures = fetched?.features || [];

    // Step 4: Save new places to IndexedDB
    if (newFeatures.length > 0) {
      const toSave = newFeatures
        .map((f) => {
          // osmtogeojson sets feature.id as "node/123", "way/456", etc.
          let key = null;
          if (typeof f.id === "string" && f.id.includes("/")) {
            key = f.id; // Already in correct format
          } else {
            // Fallback: try to extract from properties
            const p = f.properties || {};
            const osmType = p.type || p.osm_type;
            const osmId = p.id || p.osm_id;
            if (osmType && osmId) {
              key = `${osmType}/${osmId}`;
            }
          }

          if (key) {
            indexedDBPlacesMap.set(key, f); // Also update in-memory cache
            return { id: key, feature: f };
          }
          return null;
        })
        .filter(Boolean);

      if (toSave.length > 0) {
        console.log(
          `💾 [fetchPlacesWithCache] Saving ${toSave.length} new places to IndexedDB`
        );
        savePlacesToCache(toSave).catch((e) =>
          console.warn("Failed to save places to IndexedDB:", e)
        );
      }
    }
  }

  // Combine cached + new features
  const allFeatures = [...cachedFeatures, ...newFeatures];
  console.log(
    `✅ [fetchPlacesWithCache] Returning ${allFeatures.length} total features`
  );

  return { type: "FeatureCollection", features: allFeatures };
}

function accessibilityKey() {
  return Array.from(accessibilityFilter).sort().join(",");
}

let placesReqSeq = 0;
let detailsReqSeq = 0;
async function refreshPlaces() {
  const mySeq = ++placesReqSeq; // capture this call’s id

  const bounds = map.getBounds();
  const zoom = map.getZoom();
  const key = showLoading(Symbol(`places-${mySeq}`));

  try {
    // Avoid any extra work (Supabase, clustering, etc.) when we don't show places.
    if (zoom < SHOW_PLACES_ZOOM) {
      placeClusterLayer.clearLayers();
      placeMarkersByKey.clear();
      try {
        if (
          typeof window !== "undefined" &&
          typeof window.setPlacesListData === "function"
        ) {
          const center = map.getCenter();
          window.setPlacesListData({
            features: [],
            center: center ? { lat: center.lat, lng: center.lng } : null,
            zoom,
          });
        }
      } catch (err) {
        console.error("❌ Failed to update places list overlay:", err);
      }
      return;
    }

    const queryKey = [
      "places",
      serializeBounds(bounds, zoom),
      zoom,
      accessibilityKey(),
    ];

    // ✅ 1. Try to reuse from react-query in-memory cache (survives within session)
    let geojson = queryClient.getQueryData(queryKey);

    // IMPORTANT: if we previously cached an empty Overpass response (rate limit/timeout),
    // don't get stuck with it for a long time — force a refetch.
    if (
      geojson &&
      Array.isArray(geojson.features) &&
      geojson.features.length === 0
    ) {
      geojson = null;
    }

    // ✅ 2. If not in react-query cache, use smart ID-first fetch with IndexedDB caching
    if (!geojson) {
      geojson = await queryClient.fetchQuery({
        queryKey,
        staleTime: 30 * 1000,
        // Use the new ID-first strategy with IndexedDB caching
        queryFn: () =>
          fetchPlacesWithCache(bounds, zoom, { accessibilityFilter }),
      });
    }

    // If this response is for an old call, ignore it
    if (mySeq !== placesReqSeq) {
      return;
    }

    // ✅ 3. Fetch user-added places from Supabase and merge them
    // IMPORTANT: OSM places have priority - never overwrite them with user places
    const userPlacesQueryKey = ["user-places", serializeBounds(bounds, zoom)];
    const userPlacesGeoJSON =
      queryClient.getQueryData(userPlacesQueryKey) ??
      (await queryClient.fetchQuery({
        queryKey: userPlacesQueryKey,
        queryFn: () => fetchUserPlaces(bounds),
      }));

    // If a newer refresh started while we were fetching, ignore this work
    if (mySeq !== placesReqSeq) {
      return;
    }
    if (
      userPlacesGeoJSON &&
      userPlacesGeoJSON.features &&
      userPlacesGeoJSON.features.length > 0
    ) {
      // Create a Set of existing OSM place keys to protect them
      const osmKeys = new Set();
      (geojson.features || []).forEach((f) => {
        const p = f.properties || {};
        // Only protect OSM places (those with osm_id and source !== 'user')
        if (p.osm_id && p.source !== "user") {
          const k = placeKeyFromFeature(f);
          if (k) osmKeys.add(k);
        }
      });

      // Only add user places that don't conflict with existing OSM places
      const uniqueUserPlaces = userPlacesGeoJSON.features.filter((f) => {
        const k = placeKeyFromFeature(f);
        if (!k) return false; // Skip if no valid key
        if (osmKeys.has(k)) {
          console.warn(
            `⚠️ Skipping user place that conflicts with OSM place: ${k}`
          );
          return false; // Protect OSM places - skip user place
        }
        return true;
      });

      // ✅ IMPORTANT: prune stale user-place cache entries in the current viewport.
      // User places can be rejected/deleted; if we never prune, their markers can persist.
      const freshUserKeysInView = new Set(
        uniqueUserPlaces.map((f) => placeKeyFromFeature(f)).filter(Boolean)
      );
      for (const [k, f] of placesCacheById.entries()) {
        const p = f?.properties || {};
        if (p.source !== "user") continue;
        const g = f?.geometry;
        if (!g || g.type !== "Point" || !Array.isArray(g.coordinates)) continue;
        const [lng, lat] = g.coordinates;
        if (!bounds.contains(L.latLng(lat, lng))) continue;
        if (!freshUserKeysInView.has(k)) {
          placesCacheById.delete(k);
        }
      }

      // Merge user places with OSM places (OSM places are protected)
      geojson.features = [...(geojson.features || []), ...uniqueUserPlaces];
    }

    // ✅ 1) Merge fresh features into global cache
    const freshFeatures = geojson.features || [];
    freshFeatures.forEach((f) => {
      const k = placeKeyFromFeature(f);
      if (!k) return;
      placesCacheById.set(k, f);
    });

    // Optional: keep a flat array for convenience
    allPlacesFeatures = Array.from(placesCacheById.values());

    // ✅ 2) Compute which cached features are inside current bounds AND match accessibility filter
    const featuresInView = allPlacesFeatures
      .filter((f) => {
        const g = f.geometry;
        if (!g) return false;
        if (g.type !== "Point" || !Array.isArray(g.coordinates)) return false;

        const [lng, lat] = g.coordinates;
        return bounds.contains(L.latLng(lat, lng));
      })
      .filter((f) => !isBenchFeature(f))
      .filter((f) => isFeatureAllowedByAccessibilityFilter(f));

    console.log(
      `🗺️ [refreshPlaces] Features in view after accessibility filter: ${featuresInView.length}`
    );

    // Fetch user_reported_accessibility from database for places that have approved reports
    // This ensures markers show the correct accessibility color on first load
    try {
      // Collect OSM IDs from visible features
      const osmIds = featuresInView
        .map((f) => {
          const props = f.properties || {};
          const osmType = props.osm_type || props.type || null;
          const osmIdNum = props.osm_id || props.id || null;
          if (osmType && osmIdNum) {
            return `${osmType}/${osmIdNum}`;
          } else if (typeof f.id === "string" && f.id.includes("/")) {
            return f.id;
          }
          return null;
        })
        .filter(Boolean);

      if (osmIds.length > 0) {
        // Batch query: get all places with user_reported_accessibility
        const { data: placesWithReports, error } = await supabase
          .from("places")
          .select(
            "osm_id, user_reported_accessibility, user_reported_accessibility_comment, accessibility_status"
          )
          .in("osm_id", osmIds)
          .not("user_reported_accessibility", "is", null);

        if (!error && placesWithReports && placesWithReports.length > 0) {
          // Create a lookup map for quick access
          const reportsByOsmId = new Map();
          placesWithReports.forEach((p) => {
            reportsByOsmId.set(p.osm_id, p);
          });

          // Merge user_reported_accessibility into feature tags
          featuresInView.forEach((f) => {
            const props = f.properties || {};
            const osmType = props.osm_type || props.type || null;
            const osmIdNum = props.osm_id || props.id || null;
            let dbOsmId = null;
            if (osmType && osmIdNum) {
              dbOsmId = `${osmType}/${osmIdNum}`;
            } else if (typeof f.id === "string" && f.id.includes("/")) {
              dbOsmId = f.id;
            }

            if (dbOsmId && reportsByOsmId.has(dbOsmId)) {
              const dbData = reportsByOsmId.get(dbOsmId);
              const tags = f.properties.tags || f.properties;
              if (dbData.user_reported_accessibility) {
                tags.user_reported_accessibility =
                  dbData.user_reported_accessibility;
              }
              if (dbData.user_reported_accessibility_comment) {
                tags.user_reported_accessibility_comment =
                  dbData.user_reported_accessibility_comment;
              }
              if (dbData.accessibility_status) {
                tags.accessibility_status = dbData.accessibility_status;
              }
            }
          });
        }
      }
    } catch (e) {
      console.warn(
        "[refreshPlaces] Failed to fetch user_reported_accessibility batch:",
        e
      );
    }

    const geojsonForView = {
      type: "FeatureCollection",
      features: featuresInView,
    };

    placeClusterLayer.clearLayers();
    placeMarkersByKey.clear();

    // Render only what's in the current viewport (huge perf win once the in-memory cache grows).
    const placesLayer = L.geoJSON(geojsonForView, {
      filter: (feature) => {
        // called for each feature; return true to keep it
        if (isBenchFeature(feature)) return false; // don't show benches on the map
        if (!isFeatureAllowedByTypeFilter(feature)) return false;
        if (!isFeatureAllowedByPhotosFilter(feature)) return false;
        if (!isFeatureAllowedByOpenNowFilter(feature)) return false;
        return true;
      },
      pointToLayer: (feature, latlng) => {
        const tags = feature.properties.tags || feature.properties;
        const placeKey = placeKeyFromFeature(feature);

        // Check if we have a cached prediction for this place
        const wheelchair =
          tags.wheelchair ||
          tags["toilets:wheelchair"] ||
          tags["wheelchair:toilets"];
        const cachedPrediction =
          !wheelchair && placeKey ? placePredictionsCache.get(placeKey) : null;
        const meetsThreshold =
          cachedPrediction &&
          cachedPrediction.probability >= PREDICTION_PROBABILITY_THRESHOLD;

        // Use predicted icon if we have a high-confidence cached prediction
        const icon =
          placePredictionsEnabled && meetsThreshold
            ? makePoiIcon(tags, {
                isPredicted: true,
                predictedTier: cachedPrediction.label,
              })
            : makePoiIcon(tags);

        const marker = L.marker(latlng, {
          pane: "places-pane",
          icon,
        })
          .on("click", async () => {
            hideAllBootstrapTooltips();
            // Temporarily override the selected marker badge to brand blue
            setSelectedPlaceMarker(placeKey, tags);

            // Fetch user_reported_accessibility from database if this place has an osm_id
            // This allows displaying admin-approved inaccuracy reports
            let mergedTags = { ...tags };

            // Construct the osm_id in database format: "node/123456" or "way/789"
            // Feature can have osm_type + osm_id separately, or feature.id as "node/123"
            let dbOsmId = null;
            const props = feature.properties || {};
            const osmType = props.osm_type || props.type || null;
            const osmIdNum = props.osm_id || props.id || null;

            if (osmType && osmIdNum) {
              // Combine type and id: "node/8926666445"
              dbOsmId = `${osmType}/${osmIdNum}`;
            } else if (
              typeof feature?.id === "string" &&
              feature.id.includes("/")
            ) {
              // feature.id is already in "node/123" format
              dbOsmId = feature.id;
            }

            if (dbOsmId) {
              try {
                const { data: placeData, error } = await supabase
                  .from("places")
                  .select(
                    "user_reported_accessibility, user_reported_accessibility_comment, accessibility_status"
                  )
                  .eq("osm_id", dbOsmId)
                  .maybeSingle();

                if (!error && placeData) {
                  // Merge database fields into tags (DB takes precedence for user-reported data)
                  if (placeData.user_reported_accessibility) {
                    mergedTags.user_reported_accessibility =
                      placeData.user_reported_accessibility;
                  }
                  if (placeData.user_reported_accessibility_comment) {
                    mergedTags.user_reported_accessibility_comment =
                      placeData.user_reported_accessibility_comment;
                  }
                  if (placeData.accessibility_status) {
                    mergedTags.accessibility_status =
                      placeData.accessibility_status;
                  }

                  // Update marker icon if user-reported accessibility was found
                  // This ensures the marker reflects the admin-approved accessibility status
                  // Use badgeOverride to preserve the blue "selected" color
                  if (
                    placeData.user_reported_accessibility &&
                    typeof marker.setIcon === "function"
                  ) {
                    marker.setIcon(
                      makePoiIcon(mergedTags, {
                        badgeOverride: "var(--bs-primary)",
                      })
                    );
                    // Update the stored original icon with the new accessibility-colored icon
                    // so when deselected, the marker shows the correct accessibility color
                    if (
                      selectedMarkerState &&
                      selectedMarkerState.key === placeKey
                    ) {
                      selectedMarkerState.originalIcon =
                        makePoiIcon(mergedTags);
                    }
                  }
                } else if (error) {
                  console.warn("[mapMain] DB query error:", error);
                }
              } catch (e) {
                console.warn(
                  "[mapMain] Failed to fetch user_reported_accessibility:",
                  e
                );
              }
            }

            renderDetails(mergedTags, L.latLng(latlng), {
              keepDirectionsUi: true,
            });
          })
          .on("add", () => {
            const title = displayNameFromTags(tags);
            attachBootstrapTooltip(marker, title);
          })
          .on("remove", () => {
            if (marker._bsTooltip) {
              marker._bsTooltip.dispose();
              marker._bsTooltip = null;
            }
            if (placeKey) {
              placeMarkersByKey.delete(placeKey);
            }
          });

        if (placeKey) {
          marker._placeKey = placeKey;
          placeMarkersByKey.set(placeKey, marker);
        }

        return marker;
      },
    });

    placeClusterLayer.addLayer(placesLayer);

    // 🔗 Notify React list overlay about places in the current viewport
    try {
      if (
        typeof window !== "undefined" &&
        typeof window.setPlacesListData === "function"
      ) {
        const center = map.getCenter();
        const features = featuresInView;

        window.setPlacesListData({
          features,
          center: center ? { lat: center.lat, lng: center.lng } : null,
          zoom,
        });
      }
    } catch (err) {
      console.error("❌ Failed to update places list overlay:", err);
    }

    // ✨ Fetch ML predictions for places with unknown accessibility (async, non-blocking)
    fetchAndApplyPlacePredictions(featuresInView).catch((err) => {
      console.warn("ML prediction background fetch failed:", err);
    });
  } finally {
    hideLoading(key);
  }
}

function restoreSelectedPlaceMarker() {
  if (!selectedMarkerState) return;
  try {
    const { marker, originalIcon } = selectedMarkerState;
    if (marker && originalIcon && typeof marker.setIcon === "function") {
      marker.setIcon(originalIcon);
    }
  } catch (e) {
    console.warn("Failed to restore selected marker icon:", e);
  } finally {
    selectedMarkerState = null;
  }
}

function setSelectedPlaceMarker(placeKey, tags = {}) {
  if (!placeKey) return;

  // Restore previous selection so its accessibility color comes back
  restoreSelectedPlaceMarker();

  const marker = placeMarkersByKey.get(placeKey);
  if (!marker || typeof marker.setIcon !== "function") return;

  // Store original icon so we can restore it when selection changes
  selectedMarkerState = {
    key: placeKey,
    marker,
    originalIcon: marker.options?.icon,
  };

  // Override badge color to brand blue (do not change accessibility tier permanently)
  marker.setIcon(
    makePoiIcon(tags, {
      badgeOverride: "var(--bs-primary)",
    })
  );
}

// ============================================================================
// ML ACCESSIBILITY PREDICTIONS FOR MAP MARKERS
// ============================================================================

/**
 * Extract relevant OSM features for ML prediction from tags
 */
function extractFeaturesForPrediction(tags) {
  const relevantTags = [
    "amenity",
    "shop",
    "tourism",
    "building",
    "entrance",
    "door",
    "automatic_door",
    "access",
    "level",
    "healthcare",
    "office",
    "bench",
    "changing_table",
    "indoor",
    "leisure",
  ];

  const features = {};
  for (const tag of relevantTags) {
    const value = tags[tag];
    if (value !== null && value !== undefined && value !== "") {
      features[tag] = value;
    }
  }
  return features;
}

/**
 * Batch-fetch ML predictions for places with unknown accessibility
 * and update their marker icons on the map.
 */
async function fetchAndApplyPlacePredictions(featuresInView) {
  if (!placePredictionsEnabled) return;

  // Find places with unknown accessibility that need prediction
  const placesToPredict = [];
  const placeKeyToTags = new Map();

  for (const feature of featuresInView) {
    const tags = feature.properties?.tags || feature.properties || {};
    const placeKey = placeKeyFromFeature(feature);
    if (!placeKey) continue;

    // Check if already in cache
    if (placePredictionsCache.has(placeKey)) continue;

    // Check if accessibility is unknown
    const wheelchair =
      tags.wheelchair ||
      tags["toilets:wheelchair"] ||
      tags["wheelchair:toilets"];
    if (wheelchair) continue; // Already has accessibility info

    // Extract features for prediction
    const features = extractFeaturesForPrediction(tags);
    if (Object.keys(features).length === 0) continue; // Not enough data

    // Add the place ID to features for caching purposes
    features._placeId = placeKey;

    placesToPredict.push({ placeKey, features, tags });
    placeKeyToTags.set(placeKey, tags);
  }

  if (placesToPredict.length === 0) return;

  console.log(
    `✨ [ML Prediction] Running client-side predictions for ${placesToPredict.length} places...`
  );

  try {
    // Batch predict (limit batch size for memory efficiency)
    const BATCH_SIZE = 50;
    const markersToUpdate = [];

    for (let i = 0; i < placesToPredict.length; i += BATCH_SIZE) {
      const batch = placesToPredict.slice(i, i + BATCH_SIZE);
      const places = batch.map((p) => p.features);

      try {
        const result = await predictAccessibilityBatch(places);
        const predictions = result.predictions || [];

        // Collect predictions for batch UI update
        for (let j = 0; j < batch.length && j < predictions.length; j++) {
          const { placeKey, tags } = batch[j];
          const prediction = predictions[j];

          // Cache the prediction
          placePredictionsCache.set(placeKey, prediction);

          // Queue marker update (don't update immediately to avoid blocking)
          markersToUpdate.push({ placeKey, tags, prediction });
        }
      } catch (batchErr) {
        console.warn("ML prediction batch failed:", batchErr.message);
        continue;
      }

      // Yield to UI between batches to prevent freezing
      if (i + BATCH_SIZE < placesToPredict.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // Update markers in chunks with UI yielding
    const MARKER_UPDATE_CHUNK = 20;
    for (let i = 0; i < markersToUpdate.length; i += MARKER_UPDATE_CHUNK) {
      const chunk = markersToUpdate.slice(i, i + MARKER_UPDATE_CHUNK);
      for (const { placeKey, tags, prediction } of chunk) {
        updateMarkerWithPrediction(placeKey, tags, prediction);
      }
      // Yield to UI between chunks
      if (i + MARKER_UPDATE_CHUNK < markersToUpdate.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    console.log(
      `✨ [ML Prediction] Updated ${placesToPredict.length} markers with predictions`
    );
  } catch (err) {
    console.error("Failed to run place predictions:", err);
  }
}

/**
 * Update a single marker's icon to show the ML prediction
 */
function updateMarkerWithPrediction(placeKey, tags, prediction) {
  if (!placePredictionsEnabled) return;

  const marker = placeMarkersByKey.get(placeKey);
  if (!marker || typeof marker.setIcon !== "function") return;

  // Don't override the currently selected marker (it has blue badge)
  if (selectedMarkerState && selectedMarkerState.key === placeKey) return;

  // Only show prediction styling if confidence meets threshold
  const meetsThreshold =
    prediction.probability >= PREDICTION_PROBABILITY_THRESHOLD;

  if (!meetsThreshold) {
    // Low confidence - keep grey/unknown styling
    return;
  }

  // Create new icon with prediction styling
  const newIcon = makePoiIcon(tags, {
    isPredicted: true,
    predictedTier: prediction.label, // "accessible", "limited", or "not_accessible"
  });

  marker.setIcon(newIcon);
}

/**
 * Refresh all place marker predictions (called when toggle changes)
 */
function refreshPlaceMarkerPredictions() {
  for (const [placeKey, marker] of placeMarkersByKey) {
    // Skip currently selected marker
    if (selectedMarkerState && selectedMarkerState.key === placeKey) continue;

    // Get the cached feature tags
    const feature = placesCacheById.get(placeKey);
    if (!feature) continue;

    const tags = feature.properties?.tags || feature.properties || {};
    const wheelchair =
      tags.wheelchair ||
      tags["toilets:wheelchair"] ||
      tags["wheelchair:toilets"];

    if (wheelchair) continue; // Has known accessibility, skip

    const prediction = placePredictionsCache.get(placeKey);

    // Only show prediction styling if confidence meets threshold
    const meetsThreshold =
      prediction && prediction.probability >= PREDICTION_PROBABILITY_THRESHOLD;

    if (placePredictionsEnabled && meetsThreshold) {
      // Show prediction styling
      marker.setIcon(
        makePoiIcon(tags, {
          isPredicted: true,
          predictedTier: prediction.label,
        })
      );
    } else {
      // Revert to default unknown styling (low confidence or disabled)
      marker.setIcon(makePoiIcon(tags));
    }
  }
}

// ============================================================================

function moveDepartureSearchBarUnderTo() {
  const directionsUi = getDirectionsUiEl();
  const toLabel = directionsUi?.querySelector?.(
    'label[for="destination-search-input"]'
  );

  if (!toLabel) {
    console.warn("⚠️ moveDepartureSearchBarUnderTo: label not found");
    return;
  }

  toLabel.insertAdjacentElement("afterend", elements.destinationSearchBar);
}

function restoreDestinationSearchBarHome() {
  const home = elements.destinationSearchBarHome;
  const bar = elements.destinationSearchBar;
  const next = elements.destinationSearchBarNextSibling;

  if (!home || !bar) return;

  home.insertBefore(bar, next || null);
  bar.classList.remove("d-none");
}

// Expose to React so Drawer onClose can call it
if (typeof window !== "undefined") {
  window.restoreDestinationSearchBarHome = restoreDestinationSearchBarHome;
}

// Helper function to format time ago
function getTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }
  if (diffInSeconds < 2592000) {
    const weeks = Math.floor(diffInSeconds / 604800);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }
  if (diffInSeconds < 31536000) {
    const months = Math.floor(diffInSeconds / 2592000);
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  }
  const years = Math.floor(diffInSeconds / 31536000);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

async function renderReviewsList() {
  const listEl = elements.reviewsList;
  if (!listEl) return;

  const dispatchReviewsUpdated = () => {
    try {
      if (typeof window === "undefined") return;
      const ratings = (globals.reviews || [])
        .map((r) => Number(r?.rating ?? r?.overall_rating))
        .filter((n) => Number.isFinite(n) && n > 0);
      const count = ratings.length;
      const avg =
        count > 0 ? ratings.reduce((sum, n) => sum + n, 0) / count : 0;
      window.dispatchEvent(
        new CustomEvent("reviews-updated", {
          detail: { count, avg },
        })
      );
    } catch {
      // ignore
    }
  };

  listEl.innerHTML = "";

  if (!globals.reviews || globals.reviews.length === 0) {
    const emptyContainer = document.createElement("div");
    emptyContainer.style.padding = "0";
    emptyContainer.style.paddingTop = "8px";
    emptyContainer.style.textAlign = "center";

    const emptyMsg = document.createElement("div");
    emptyMsg.style.color = "rgba(0, 0, 0, 0.6)";
    emptyMsg.style.fontSize = "0.875rem";
    emptyMsg.textContent = "Be the first to review this place.";

    emptyContainer.appendChild(emptyMsg);
    listEl.appendChild(emptyContainer);
    dispatchReviewsUpdated();
    return;
  }

  // Load user's accessibility preferences to highlight matching categories
  const userPreferences = await getUserAccessibilityPreferences();
  const userPrefsSet = new Set(userPreferences || []);

  globals.reviews.forEach((review, index) => {
    const li = document.createElement("li");
    li.className = "list-group-item";
    li.style.padding = "0";
    li.style.marginBottom = index < globals.reviews.length - 1 ? "16px" : "0";
    li.dataset.reviewId = review.id;

    const isEditing = editingReviewId === review.id;

    if (isEditing) {
      // === Inline edit mode === - improved styling
      const cardContainer = document.createElement("div");
      cardContainer.style.border = "1px solid";
      cardContainer.style.borderColor = "rgba(var(--bs-primary-rgb), 0.3)";
      cardContainer.style.borderRadius = "16px";
      cardContainer.style.padding = "20px";
      cardContainer.style.backgroundColor = "#ffffff";
      cardContainer.style.boxShadow =
        "0 2px 8px rgba(var(--bs-primary-rgb), 0.15)";

      const form = document.createElement("form");
      form.style.display = "flex";
      form.style.flexDirection = "column";
      form.style.gap = "16px";

      // Show rating in edit mode (read-only display) - improved styling
      const ratingValue = review.rating || review.overall_rating;
      if (ratingValue && ratingValue >= 1 && ratingValue <= 5) {
        const ratingContainer = document.createElement("div");
        ratingContainer.style.display = "flex";
        ratingContainer.style.alignItems = "center";
        ratingContainer.style.gap = "8px";
        ratingContainer.style.marginBottom = "8px";

        const starsContainer = document.createElement("span");
        starsContainer.style.color = "#ff9800";
        starsContainer.style.fontSize = "1.25rem";
        starsContainer.style.display = "flex";
        starsContainer.style.alignItems = "center";
        starsContainer.style.gap = "2px";
        starsContainer.setAttribute(
          "aria-label",
          `${ratingValue} out of 5 stars`
        );

        // Add filled stars
        for (let i = 0; i < Math.floor(ratingValue); i++) {
          const star = document.createElement("span");
          star.textContent = "★";
          star.setAttribute("aria-hidden", "true");
          starsContainer.appendChild(star);
        }

        // Add half star if needed
        if (ratingValue % 1 >= 0.5) {
          const halfStar = document.createElement("span");
          halfStar.textContent = "☆";
          halfStar.style.opacity = "0.5";
          halfStar.setAttribute("aria-hidden", "true");
          starsContainer.appendChild(halfStar);
        }

        // Add empty stars
        const totalStars = Math.ceil(ratingValue);
        for (let i = totalStars; i < 5; i++) {
          const emptyStar = document.createElement("span");
          emptyStar.textContent = "☆";
          emptyStar.style.opacity = "0.3";
          emptyStar.setAttribute("aria-hidden", "true");
          starsContainer.appendChild(emptyStar);
        }

        const ratingText = document.createElement("span");
        ratingText.style.fontSize = "0.875rem";
        ratingText.style.fontWeight = "600";
        ratingText.style.color = "rgba(0, 0, 0, 0.87)";
        ratingText.style.marginLeft = "4px";
        ratingText.textContent = ratingValue.toFixed(1);

        ratingContainer.appendChild(starsContainer);
        ratingContainer.appendChild(ratingText);
        form.appendChild(ratingContainer);
      }

      const textarea = document.createElement("textarea");
      textarea.value = review.comment || "";
      textarea.required = false; // Comment is optional
      textarea.rows = 4;
      textarea.style.width = "100%";
      textarea.style.padding = "12px";
      textarea.style.border = "1px solid rgba(0, 0, 0, 0.23)";
      textarea.style.borderRadius = "4px";
      textarea.style.fontSize = "0.9375rem";
      textarea.style.fontFamily = "inherit";
      textarea.style.resize = "vertical";
      textarea.style.transition = "border-color 0.2s";
      textarea.setAttribute("aria-label", "Edit your review comment");
      textarea.addEventListener("focus", () => {
        textarea.style.borderColor = "rgba(var(--bs-primary-rgb), 0.5)";
        textarea.style.outline = "none";
      });
      textarea.addEventListener("blur", () => {
        textarea.style.borderColor = "rgba(0, 0, 0, 0.23)";
      });
      form.appendChild(textarea);

      const footerRow = document.createElement("div");
      footerRow.style.display = "flex";
      footerRow.style.justifyContent = "space-between";
      footerRow.style.alignItems = "center";
      footerRow.style.marginTop = "8px";
      footerRow.style.gap = "12px";

      const meta = document.createElement("div");
      meta.style.fontSize = "0.75rem";
      meta.style.color = "rgba(0, 0, 0, 0.6)";

      if (review.created_at) {
        const dt = new Date(review.created_at);
        if (!Number.isNaN(dt.getTime())) {
          meta.textContent = dt.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
        } else {
          meta.textContent = "Editing your review";
        }
      } else {
        meta.textContent = "Editing your review";
      }

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.style.background = "transparent";
      cancelBtn.style.border = "1px solid rgba(0, 0, 0, 0.23)";
      cancelBtn.style.borderRadius = "4px";
      cancelBtn.style.padding = "6px 16px";
      cancelBtn.style.fontSize = "0.8125rem";
      cancelBtn.style.fontWeight = "500";
      cancelBtn.style.color = "rgba(0, 0, 0, 0.87)";
      cancelBtn.style.cursor = "pointer";
      cancelBtn.style.transition = "all 0.2s";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("mouseenter", () => {
        cancelBtn.style.backgroundColor = "rgba(0, 0, 0, 0.04)";
      });
      cancelBtn.addEventListener("mouseleave", () => {
        cancelBtn.style.backgroundColor = "transparent";
      });
      cancelBtn.addEventListener("click", () => {
        editingReviewId = null;
        renderReviewsList();
        // Re-render badges/summary for consistency
        recomputePlaceAccessibilityKeywords().catch(console.error);
      });

      const saveBtn = document.createElement("button");
      saveBtn.type = "submit";
      saveBtn.style.background = "rgba(var(--bs-primary-rgb), 0.87)";
      saveBtn.style.border = "none";
      saveBtn.style.borderRadius = "4px";
      saveBtn.style.padding = "6px 16px";
      saveBtn.style.fontSize = "0.8125rem";
      saveBtn.style.fontWeight = "500";
      saveBtn.style.color = "#ffffff";
      saveBtn.style.cursor = "pointer";
      saveBtn.style.transition = "all 0.2s";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("mouseenter", () => {
        saveBtn.style.backgroundColor = "rgba(var(--bs-primary-rgb), 1)";
      });
      saveBtn.addEventListener("mouseleave", () => {
        saveBtn.style.backgroundColor = "rgba(var(--bs-primary-rgb), 0.87)";
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(saveBtn);
      footerRow.appendChild(meta);
      footerRow.appendChild(actions);
      form.appendChild(footerRow);
      cardContainer.appendChild(form);

      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!currentUser) {
          toastError("Please log in to edit your review.");
          return;
        }

        const currentText = review.comment || "";
        const trimmed = textarea.value.trim();

        // If unchanged or empty -> just exit edit mode
        if (!trimmed || trimmed === currentText) {
          editingReviewId = null;
          renderReviewsList();
          recomputePlaceAccessibilityKeywords().catch(console.error);
          return;
        }

        try {
          const updated = await withButtonLoading(
            saveBtn,
            reviewStorage("PUT", {
              id: review.id,
              text: trimmed,
              rating: review.rating,
              image_url: review.image_url,
            }),
            "Saving…"
          );

          if (!Array.isArray(updated) || !updated.length) {
            toastError("Could not update review. Please try again.");
            return;
          }

          const idx = globals.reviews.findIndex((r) => r.id === review.id);
          if (idx !== -1) {
            globals.reviews[idx] = {
              ...globals.reviews[idx],
              comment: trimmed,
            };
          }

          editingReviewId = null;
          renderReviewsList();
          recomputePlaceAccessibilityKeywords(true).catch(console.error);
        } catch (err) {
          console.error("❌ Failed to update review:", err);
          toastError("Could not update review. Please try again.");
        }
      });

      li.appendChild(form);

      // Placeholder for accessibility keyword badges
      const badgesWrap = document.createElement("div");
      badgesWrap.className = "mt-1 d-flex flex-wrap gap-1 review-badges";
      badgesWrap.style.marginTop = "12px";
      badgesWrap.setAttribute("aria-label", "Detected accessibility mentions");
      cardContainer.appendChild(badgesWrap);

      li.appendChild(cardContainer);
    } else {
      // === Normal (read-only) mode ===

      // Main card container
      const cardContainer = document.createElement("div");
      cardContainer.style.border = "1px solid";
      cardContainer.style.borderColor = "rgba(0, 0, 0, 0.12)";
      cardContainer.style.borderRadius = "16px";
      cardContainer.style.padding = "20px";
      cardContainer.style.backgroundColor = "#ffffff";
      cardContainer.style.transition = "all 0.2s ease-in-out";
      cardContainer.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)";

      // Add hover effect
      cardContainer.addEventListener("mouseenter", () => {
        cardContainer.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
        cardContainer.style.borderColor = "rgba(var(--bs-primary-rgb), 0.3)";
      });
      cardContainer.addEventListener("mouseleave", () => {
        cardContainer.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)";
        cardContainer.style.borderColor = "rgba(0, 0, 0, 0.12)";
      });

      // Reviewer header with profile icon and name
      const reviewerHeader = document.createElement("div");
      reviewerHeader.style.display = "flex";
      reviewerHeader.style.alignItems = "center";
      reviewerHeader.style.gap = "12px";
      reviewerHeader.style.marginBottom = "16px";

      // Get reviewer name from profile or show "Anonymous"
      let reviewerName = "Anonymous";
      let reviewerInitials = "A";

      // Debug: Log review data to see profile structure
      console.log(`🎭 Review ${review.id} profile data:`, {
        user_id: review.user_id,
        profile: review.profile,
        profile_full_name: review.profile?.full_name,
      });

      if (review.profile && review.profile.full_name) {
        reviewerName = review.profile.full_name.trim();
        // Get initials from full name (first letter of first word and first letter of last word)
        const nameParts = reviewerName.split(/\s+/).filter((p) => p);
        if (nameParts.length >= 2) {
          reviewerInitials = (
            nameParts[0][0] + nameParts[nameParts.length - 1][0]
          ).toUpperCase();
        } else if (nameParts.length === 1) {
          reviewerInitials = nameParts[0].substring(0, 2).toUpperCase();
        }
        console.log(
          `✅ Using reviewer name: "${reviewerName}" with initials "${reviewerInitials}"`
        );
      } else {
        console.log(
          `⚠️ No profile or full_name found for review ${review.id}, showing Anonymous`
        );
      }

      // Profile icon/avatar with initials - improved styling
      const avatar = document.createElement("div");
      avatar.style.width = "40px";
      avatar.style.height = "40px";
      avatar.style.borderRadius = "50%";
      avatar.style.display = "flex";
      avatar.style.alignItems = "center";
      avatar.style.justifyContent = "center";
      avatar.style.color = "#ffffff";
      avatar.style.fontWeight = "600";
      avatar.style.fontSize = "0.875rem";
      avatar.style.flexShrink = "0";
      avatar.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";

      // Generate color from reviewer name (or use default)
      const getAvatarColor = (name) => {
        if (!name || name === "Anonymous") return "#ff9800"; // Orange for anonymous
        const hash = name
          .split("")
          .reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return hash % 2 === 0 ? "#ff5722" : "#9c27b0"; // Deep orange or purple
      };

      avatar.style.backgroundColor = getAvatarColor(reviewerName);
      avatar.textContent = reviewerInitials;
      avatar.setAttribute("aria-label", `Profile of ${reviewerName}`);

      // Reviewer name and metadata container
      const nameContainer = document.createElement("div");
      nameContainer.style.display = "flex";
      nameContainer.style.flexDirection = "column";
      nameContainer.style.flex = "1";
      nameContainer.style.minWidth = "0";

      const nameElement = document.createElement("div");
      nameElement.style.fontWeight = "600";
      nameElement.style.fontSize = "0.9375rem";
      nameElement.style.color = "rgba(0, 0, 0, 0.87)";
      nameElement.style.lineHeight = "1.4";
      nameElement.textContent = reviewerName;

      reviewerHeader.appendChild(avatar);
      nameContainer.appendChild(nameElement);
      reviewerHeader.appendChild(nameContainer);

      // Add timestamp to header if available
      if (review.created_at) {
        const dt = new Date(review.created_at);
        if (!Number.isNaN(dt.getTime())) {
          const timeAgo = getTimeAgo(dt);
          const timeElement = document.createElement("div");
          timeElement.style.fontSize = "0.75rem";
          timeElement.style.color = "rgba(0, 0, 0, 0.6)";
          timeElement.style.marginTop = "2px";
          timeElement.textContent = timeAgo;
          nameContainer.appendChild(timeElement);
        }
      }

      cardContainer.appendChild(reviewerHeader);

      // Rating display - show stars based on rating value
      const ratingValue = review.rating || review.overall_rating;
      if (ratingValue && ratingValue >= 1 && ratingValue <= 5) {
        const ratingContainer = document.createElement("div");
        ratingContainer.style.display = "flex";
        ratingContainer.style.alignItems = "center";
        ratingContainer.style.gap = "8px";
        ratingContainer.style.marginBottom = "12px";

        // Create star rating display (filled and empty stars) - improved styling
        const starsContainer = document.createElement("div");
        starsContainer.style.color = "#ff9800";
        starsContainer.style.fontSize = "1.25rem";
        starsContainer.style.lineHeight = "1";
        starsContainer.style.display = "flex";
        starsContainer.style.alignItems = "center";
        starsContainer.style.gap = "2px";
        starsContainer.setAttribute(
          "aria-label",
          `${ratingValue} out of 5 stars`
        );

        // Add filled stars
        for (let i = 0; i < Math.floor(ratingValue); i++) {
          const star = document.createElement("span");
          star.textContent = "★";
          star.setAttribute("aria-hidden", "true");
          starsContainer.appendChild(star);
        }

        // Add half star if needed (for ratings like 3.5, 4.5, etc.)
        if (ratingValue % 1 >= 0.5) {
          const halfStar = document.createElement("span");
          halfStar.textContent = "☆";
          halfStar.style.opacity = "0.5";
          halfStar.setAttribute("aria-hidden", "true");
          starsContainer.appendChild(halfStar);
        }

        // Add empty stars to complete 5 stars
        const totalStars = Math.ceil(ratingValue);
        for (let i = totalStars; i < 5; i++) {
          const emptyStar = document.createElement("span");
          emptyStar.textContent = "☆";
          emptyStar.style.opacity = "0.3";
          emptyStar.setAttribute("aria-hidden", "true");
          starsContainer.appendChild(emptyStar);
        }

        // Add numeric rating next to stars - improved styling
        const ratingText = document.createElement("span");
        ratingText.style.fontSize = "0.875rem";
        ratingText.style.fontWeight = "600";
        ratingText.style.color = "rgba(0, 0, 0, 0.87)";
        ratingText.style.marginLeft = "4px";
        ratingText.textContent = ratingValue.toFixed(1);

        ratingContainer.appendChild(starsContainer);
        ratingContainer.appendChild(ratingText);
        cardContainer.appendChild(ratingContainer);
      }

      // Main comment text - only show if comment exists - improved styling
      const commentText = review.comment || "";
      if (commentText.trim()) {
        const textP = document.createElement("div");
        textP.style.fontSize = "0.9375rem";
        textP.style.lineHeight = "1.6";
        textP.style.color = "rgba(0, 0, 0, 0.87)";
        textP.style.marginBottom = "12px";
        textP.style.whiteSpace = "pre-wrap";
        textP.style.wordBreak = "break-word";
        textP.textContent = commentText;
        cardContainer.appendChild(textP);
      } else if (!ratingValue) {
        // If no rating and no comment, show a placeholder
        const noContentP = document.createElement("div");
        noContentP.style.fontSize = "0.875rem";
        noContentP.style.color = "rgba(0, 0, 0, 0.6)";
        noContentP.style.fontStyle = "italic";
        noContentP.style.marginBottom = "12px";
        noContentP.textContent = "No comment provided.";
        cardContainer.appendChild(noContentP);
      }

      // Category ratings details section (if review has category_ratings) - improved styling
      const categoryRatings = review.category_ratings;
      if (
        categoryRatings &&
        typeof categoryRatings === "object" &&
        !Array.isArray(categoryRatings) &&
        categoryRatings !== null &&
        Object.keys(categoryRatings).length > 0
      ) {
        const detailsContainer = document.createElement("div");
        detailsContainer.style.marginTop = "16px";
        detailsContainer.style.marginBottom = "12px";

        // Create a button to toggle details visibility - improved styling
        const detailsBtn = document.createElement("button");
        detailsBtn.type = "button";
        detailsBtn.style.background = "none";
        detailsBtn.style.border = "none";
        detailsBtn.style.padding = "0";
        detailsBtn.style.cursor = "pointer";
        detailsBtn.style.fontSize = "0.875rem";
        detailsBtn.style.color = "rgba(var(--bs-primary-rgb), 0.87)";
        detailsBtn.style.fontWeight = "500";
        detailsBtn.style.display = "flex";
        detailsBtn.style.alignItems = "center";
        detailsBtn.style.gap = "6px";
        detailsBtn.style.transition = "color 0.2s";
        detailsBtn.innerHTML =
          '<span style="font-size: 0.75rem;">▶</span> Show category details';
        detailsBtn.setAttribute("aria-expanded", "false");
        detailsBtn.setAttribute("aria-label", "Toggle category rating details");

        detailsBtn.addEventListener("mouseenter", () => {
          detailsBtn.style.color = "rgba(var(--bs-primary-rgb), 1)";
        });
        detailsBtn.addEventListener("mouseleave", () => {
          detailsBtn.style.color = "rgba(var(--bs-primary-rgb), 0.87)";
        });

        // Create collapsible details content - improved styling
        const detailsContent = document.createElement("div");
        detailsContent.style.marginTop = "12px";
        detailsContent.style.fontSize = "0.875rem";
        detailsContent.style.display = "none"; // Initially hidden

        // Create list of category ratings - card style
        const categoryList = document.createElement("div");
        categoryList.style.display = "flex";
        categoryList.style.flexDirection = "column";
        categoryList.style.gap = "8px";
        categoryList.style.padding = "12px";
        categoryList.style.backgroundColor = "rgba(0, 0, 0, 0.02)";
        categoryList.style.borderRadius = "8px";

        Object.entries(categoryRatings).forEach(([categoryId, rating]) => {
          if (typeof rating === "number" && rating >= 1 && rating <= 5) {
            const categoryItem = document.createElement("div");
            categoryItem.style.display = "flex";
            categoryItem.style.justifyContent = "space-between";
            categoryItem.style.alignItems = "center";
            categoryItem.style.padding = "8px 12px";
            categoryItem.style.borderRadius = "6px";
            categoryItem.style.transition = "background-color 0.2s";

            // Check if this category is in user's preferences
            const isUserPreference = userPrefsSet.has(categoryId);

            // Apply highlighting style if it matches user preferences - improved
            if (isUserPreference) {
              categoryItem.style.backgroundColor =
                "rgba(var(--bs-primary-rgb), 0.08)";
              categoryItem.style.borderLeft =
                "1px solid rgba(var(--bs-primary-rgb), 0.5)";
            } else {
              categoryItem.style.backgroundColor = "transparent";
            }

            // Category label - improved styling
            const label = document.createElement("span");
            label.style.fontWeight = isUserPreference ? "600" : "500";
            label.style.fontSize = "0.875rem";
            label.style.color = isUserPreference
              ? "rgba(var(--bs-primary-rgb), 0.87)"
              : "rgba(0, 0, 0, 0.87)";
            label.textContent =
              ACCESSIBILITY_CATEGORY_LABELS[categoryId] || categoryId;

            // Rating display (stars) - improved styling
            const ratingDisplay = document.createElement("div");
            ratingDisplay.style.display = "flex";
            ratingDisplay.style.alignItems = "center";
            ratingDisplay.style.gap = "4px";

            const starsContainer = document.createElement("span");
            starsContainer.style.color = "#ff9800";
            starsContainer.style.fontSize = "0.875rem";
            starsContainer.style.display = "flex";
            starsContainer.style.alignItems = "center";
            starsContainer.style.gap = "1px";

            // Add filled stars
            for (let i = 0; i < Math.floor(rating); i++) {
              const star = document.createElement("span");
              star.textContent = "★";
              star.setAttribute("aria-hidden", "true");
              starsContainer.appendChild(star);
            }

            // Add half star if needed
            if (rating % 1 >= 0.5) {
              const halfStar = document.createElement("span");
              halfStar.textContent = "☆";
              halfStar.style.opacity = "0.5";
              halfStar.setAttribute("aria-hidden", "true");
              starsContainer.appendChild(halfStar);
            }

            // Add empty stars
            const totalStars = Math.ceil(rating);
            for (let i = totalStars; i < 5; i++) {
              const emptyStar = document.createElement("span");
              emptyStar.textContent = "☆";
              emptyStar.style.opacity = "0.3";
              emptyStar.setAttribute("aria-hidden", "true");
              starsContainer.appendChild(emptyStar);
            }

            const ratingText = document.createElement("span");
            ratingText.style.fontSize = "0.8125rem";
            ratingText.style.fontWeight = "500";
            ratingText.style.color = "rgba(0, 0, 0, 0.6)";
            ratingText.style.marginLeft = "4px";
            ratingText.textContent = rating.toFixed(1);

            ratingDisplay.appendChild(starsContainer);
            ratingDisplay.appendChild(ratingText);
            categoryItem.appendChild(label);
            categoryItem.appendChild(ratingDisplay);
            categoryList.appendChild(categoryItem);
          }
        });

        detailsContent.appendChild(categoryList);
        detailsContainer.appendChild(detailsBtn);
        detailsContainer.appendChild(detailsContent);
        cardContainer.appendChild(detailsContainer);

        // Toggle functionality
        detailsBtn.addEventListener("click", () => {
          const isExpanded =
            detailsBtn.getAttribute("aria-expanded") === "true";

          if (isExpanded) {
            // Collapse
            detailsContent.style.display = "none";
            detailsBtn.setAttribute("aria-expanded", "false");
            detailsBtn.innerHTML =
              '<span style="font-size: 0.75rem;">▶</span> Show category details';
          } else {
            // Expand
            detailsContent.style.display = "block";
            detailsBtn.setAttribute("aria-expanded", "true");
            detailsBtn.innerHTML =
              '<span style="font-size: 0.75rem;">▼</span> Hide category details';
          }
        });
      }

      // Meta + actions row - improved styling
      const footer = document.createElement("div");
      footer.style.display = "flex";
      footer.style.justifyContent = "space-between";
      footer.style.alignItems = "center";
      footer.style.marginTop = "16px";
      footer.style.paddingTop = "16px";
      footer.style.borderTop = "1px solid rgba(0, 0, 0, 0.08)";
      footer.style.gap = "12px";

      // Remove duplicate timestamp (already shown in header)
      // footer.appendChild(meta);

      // Only owners (and admins) can edit/delete
      const isOwner = !!currentUser;

      const ADMIN_EMAILS = [
        "yevheniiabenediuk@gmail.com",
        "victor.shevchuk.96@gmail.com",
      ];
      const isAdmin =
        !!currentUser &&
        !!currentUser.email &&
        ADMIN_EMAILS.includes(currentUser.email);

      if (isOwner || isAdmin) {
        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "8px";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.style.background = "transparent";
        editBtn.style.border = "1px solid rgba(0, 0, 0, 0.23)";
        editBtn.style.borderRadius = "4px";
        editBtn.style.padding = "6px 16px";
        editBtn.style.fontSize = "0.8125rem";
        editBtn.style.fontWeight = "500";
        editBtn.style.color = "rgba(0, 0, 0, 0.87)";
        editBtn.style.cursor = "pointer";
        editBtn.style.transition = "all 0.2s";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", () => handleEditReview(review));
        editBtn.addEventListener("mouseenter", () => {
          editBtn.style.backgroundColor = "rgba(0, 0, 0, 0.04)";
        });
        editBtn.addEventListener("mouseleave", () => {
          editBtn.style.backgroundColor = "transparent";
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.style.background = "transparent";
        deleteBtn.style.border = "1px solid rgba(211, 47, 47, 0.5)";
        deleteBtn.style.borderRadius = "4px";
        deleteBtn.style.padding = "6px 16px";
        deleteBtn.style.fontSize = "0.8125rem";
        deleteBtn.style.fontWeight = "500";
        deleteBtn.style.color = "#d32f2f";
        deleteBtn.style.cursor = "pointer";
        deleteBtn.style.transition = "all 0.2s";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => handleDeleteReview(review));
        deleteBtn.addEventListener("mouseenter", () => {
          deleteBtn.style.backgroundColor = "rgba(211, 47, 47, 0.08)";
        });
        deleteBtn.addEventListener("mouseleave", () => {
          deleteBtn.style.backgroundColor = "transparent";
        });

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        footer.appendChild(actions);
      }

      cardContainer.appendChild(footer);

      // Placeholder for accessibility keyword badges
      const badgesWrapReadOnly = document.createElement("div");
      badgesWrapReadOnly.className =
        "mt-1 d-flex flex-wrap gap-1 review-badges";
      badgesWrapReadOnly.style.marginTop = "12px";
      badgesWrapReadOnly.setAttribute(
        "aria-label",
        "Detected accessibility mentions"
      );
      cardContainer.appendChild(badgesWrapReadOnly);

      li.appendChild(cardContainer);
    }

    listEl.appendChild(li);
  });

  dispatchReviewsUpdated();
}

async function handleEditReview(review) {
  if (!currentUser) {
    toastError("Please log in to edit your review.");
    return;
  }

  // Toggle inline edit mode for this review
  editingReviewId = review.id;
  renderReviewsList();
}

async function handleDeleteReview(review) {
  if (!currentUser) {
    toastError("Please log in to delete your review.");
    return;
  }

  try {
    const ok = await reviewStorage("DELETE", { id: review.id });
    if (ok === false) {
      toastError("Could not delete review. Please try again.");
      return;
    }

    globals.reviews = globals.reviews.filter((r) => r.id !== review.id);
    renderReviewsList();
    recomputePlaceAccessibilityKeywords(true).catch(console.error);
  } catch (err) {
    console.error("❌ Failed to delete review:", err);
    toastError("Could not delete review. Please try again.");
  }
}

// (keep makeCircleFeature as-is below)
function makeCircleFeature(layer) {
  const center = layer.getLatLng();
  const radius = layer.getRadius(); // meters
  return {
    type: "Feature",
    properties: { radius },
    geometry: { type: "Point", coordinates: [center.lng, center.lat] },
  };
}

// Helper function to get MUI Material Icon name for place types
function getMuiIconForPlaceType(key, value) {
  const lk = String(key || "").toLowerCase();
  const lv = String(value || "")
    .toLowerCase()
    .replace(/[_-]/g, "-");

  // Map OSM place type keys and values to MUI Material Icons
  const iconMap = {
    // Tourism
    tourism: {
      hotel: "hotel",
      hostel: "hotel",
      motel: "hotel",
      apartment: "apartment",
      guest_house: "hotel",
      museum: "museum",
      gallery: "palette",
      attraction: "attractions",
      zoo: "pets",
      theme_park: "attractions",
      aquarium: "waves",
      viewpoint: "visibility",
      information: "info",
      "*": "place",
    },
    // Amenity
    amenity: {
      restaurant: "restaurant",
      fast_food: "fastfood",
      cafe: "local_cafe",
      bar: "local_bar",
      pub: "sports_bar",
      biergarten: "sports_bar",
      food_court: "restaurant",
      pharmacy: "local_pharmacy",
      hospital: "local_hospital",
      clinic: "medical_services",
      doctors: "medical_services",
      dentist: "medical_services",
      veterinary: "pets",
      bank: "account_balance",
      atm: "atm",
      post_office: "mail",
      library: "local_library",
      school: "school",
      university: "school",
      college: "school",
      kindergarten: "child_care",
      theatre: "theater_comedy",
      cinema: "movie",
      arts_centre: "palette",
      marketplace: "store",
      fuel: "local_gas_station",
      charging_station: "ev_station",
      parking: "local_parking",
      toilets: "wc",
      drinking_water: "water_drop",
      place_of_worship: "place",
      fire_station: "fire_truck",
      police: "local_police",
      bus_station: "directions_bus",
      bicycle_rental: "pedal_bike",
      "*": "place",
    },
    // Shop
    shop: {
      supermarket: "store",
      convenience: "store",
      bakery: "bakery_dining",
      butcher: "restaurant",
      clothes: "checkroom",
      jewelry: "diamond",
      florist: "local_florist",
      hardware: "hardware",
      furniture: "chair",
      electronics: "devices",
      book: "menu_book",
      "*": "store",
    },
    // Leisure
    leisure: {
      park: "park",
      playground: "child_care",
      pitch: "sports_soccer",
      stadium: "stadium",
      swimming_pool: "pool",
      fitness_centre: "fitness_center",
      dog_park: "pets",
      "*": "park",
    },
    // Healthcare
    healthcare: {
      hospital: "local_hospital",
      clinic: "medical_services",
      "*": "medical_services",
    },
    // Office
    office: {
      "*": "business",
    },
    // Historic
    historic: {
      "*": "museum",
    },
    // Sport
    sport: {
      "*": "sports_soccer",
    },
  };

  // Check if we have a mapping for this key
  if (iconMap[lk]) {
    // Try exact match first
    if (iconMap[lk][lv]) {
      return iconMap[lk][lv];
    }
    // Try with underscores replaced
    const lvUnderscore = lv.replace(/-/g, "_");
    if (iconMap[lk][lvUnderscore]) {
      return iconMap[lk][lvUnderscore];
    }
    // Fallback to wildcard
    if (iconMap[lk]["*"]) {
      return iconMap[lk]["*"];
    }
  }

  // Default fallback
  return "place";
}

const renderDetails = async (tags, latlng, { keepDirectionsUi } = {}) => {
  // When switching places, force-close any lingering hover tooltips so the map stays clean.
  hideAllBootstrapTooltips();

  const myDetailsSeq = ++detailsReqSeq;
  const isStale = () => myDetailsSeq !== detailsReqSeq;

  globals.detailsCtx.tags = tags;

  // Update vision accessibility control if available
  if (typeof window !== "undefined" && window.visionAccessibilityControl) {
    window.visionAccessibilityControl.update(tags);
  }

  // Helper: convert hex to rgba with opacity.
  // Needed in multiple sections of renderDetails (e.g., restroom card).
  const hexToRgba = (hex, alpha) => {
    if (!hex || !hex.startsWith("#") || hex.length !== 7) {
      return `rgba(108, 117, 125, ${alpha})`; // fallback to unknown color
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const titleText = displayNameFromTags(tags) || "Details";

  // Extract short_name (normalize to uppercase, only show if different from name)
  const shortNameRaw =
    tags.short_name || tags["short_name"] || tags["short-name"] || null;
  const shortName = shortNameRaw
    ? String(shortNameRaw).trim().toUpperCase()
    : null;
  const normalizeForContains = (s) =>
    String(s ?? "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();

  const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Return true when the name already contains the short name as a standalone token/phrase
  // (e.g. "Vilniaus ... VU MF" already contains "VU MF").
  const nameContainsShortName = (name, sn) => {
    const n = normalizeForContains(name);
    const v = normalizeForContains(sn);
    if (!n || !v) return false;

    // Build a forgiving phrase matcher: spaces in short name match any whitespace/punctuation gap.
    // Example: "VU MF" matches "VU MF", "(VU MF)", "VU-MF", "VU  MF", etc.
    const parts = v.split(" ").filter(Boolean).map(escapeRegExp);
    if (!parts.length) return false;
    const phrase = parts.join("[\\s\\-_.()]*");
    const re = new RegExp(`(?:^|\\b)${phrase}(?:$|\\b)`, "i");
    return re.test(n);
  };

  const shouldShowShortName =
    !!shortName &&
    shortName !== titleText.trim().toUpperCase() &&
    !nameContainsShortName(titleText, shortName);

  elements.detailsPanel.classList.remove("d-none");
  const list = elements.detailsPanel.querySelector("#details-list");
  list.innerHTML = "";

  const nTags = normalizeTagsCase(tags);

  // Extract category for header display
  const categoryKeys = [
    "amenity",
    "tourism",
    "shop",
    "leisure",
    "healthcare",
    "office",
    "historic",
    "sport",
  ];
  let categoryValue = null;

  // Diplomatic/embassy tagging:
  // - old style: embassy=yes (or embassy=consulate, etc.)
  // - current style: office=diplomatic + diplomatic=embassy
  const embassyRaw = nTags.embassy ?? null;
  const diplomaticRaw = nTags.diplomatic ?? null;
  const officeRaw = nTags.office ?? null;
  const embassyLower =
    embassyRaw != null ? String(embassyRaw).trim().toLowerCase() : "";
  const diplomaticLower =
    diplomaticRaw != null ? String(diplomaticRaw).trim().toLowerCase() : "";
  const officeLower =
    officeRaw != null ? String(officeRaw).trim().toLowerCase() : "";

  const resolveDiplomaticCategory = () => {
    const kind =
      (embassyLower && embassyLower !== "no" ? embassyLower : "") ||
      (officeLower === "diplomatic" && diplomaticLower ? diplomaticLower : "");
    if (!kind) return null;
    if (kind === "yes" || kind === "embassy") return "Embassy";
    if (kind.includes("consulate")) return "Consulate";
    // Fallback: title-case the kind
    return kind
      .replace(/[_-]/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((w, i) =>
        i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w.toLowerCase()
      )
      .join(" ");
  };

  categoryValue = resolveDiplomaticCategory();
  for (const key of categoryKeys) {
    if (nTags[key]) {
      const value = String(nTags[key]).trim();
      if (value && value !== "yes") {
        // Format category value: "local_pharmacy" -> "Pharmacy", "fast_food" -> "Fast food"
        categoryValue = value
          .replace(/[_-]/g, " ")
          .split(" ")
          .map((word, index) => {
            if (index === 0) {
              return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            return word.toLowerCase();
          })
          .join(" ");
        break;
      }
    }
  }

  // Fallback: some POIs (e.g. university faculties) are tagged as building=university without amenity=university.
  // Reuse the same "University" category rather than creating a new one-off type.
  if (!categoryValue && nTags.building) {
    const buildingVal = String(nTags.building).trim().toLowerCase();
    if (
      buildingVal === "university" ||
      buildingVal === "college" ||
      buildingVal === "school"
    ) {
      categoryValue = buildingVal
        .replace(/[_-]/g, " ")
        .split(" ")
        .map((word, index) => {
          if (index === 0)
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          return word.toLowerCase();
        })
        .join(" ");
    }
  }

  // Extract features for header chips (drive_through, dispensing, etc.)
  const features = [];

  // Check if drive_through is available and relevant for this category
  const driveThroughValue =
    nTags.drive_through ||
    nTags["drive-through"] ||
    nTags.drive_through ||
    null;
  const relevantCategoriesForDriveThrough = [
    "pharmacy",
    "local_pharmacy",
    "fast_food",
    "cafe",
    "coffee_shop",
    "bank",
    "atm",
    "restaurant",
    "fuel",
  ];
  const categoryLower = categoryValue ? categoryValue.toLowerCase() : "";
  const isRelevantForDriveThrough = relevantCategoriesForDriveThrough.some(
    (cat) =>
      categoryLower.includes(cat.replace(/_/g, " ")) ||
      categoryLower === cat.replace(/_/g, " ")
  );

  if (
    driveThroughValue &&
    String(driveThroughValue).toLowerCase().trim() === "yes" &&
    isRelevantForDriveThrough
  ) {
    features.push({
      type: "drive_through",
      label: "Drive-through available",
      icon: "directions_car",
    });
  }

  // Check if dispensing is available (for pharmacies)
  const dispensingValue = nTags.dispensing || nTags.Dispensing || null;
  const isPharmacy = categoryLower.includes("pharmacy");
  if (
    dispensingValue &&
    String(dispensingValue).toLowerCase().trim() === "yes" &&
    isPharmacy
  ) {
    features.push({
      type: "dispensing",
      label: "Dispenses prescription medicines",
      icon: "medical_services",
    });
  }

  // Extract payment information and create a single payment chip
  // Check normalized tags (case-insensitive lookup)
  const paymentCreditCards =
    nTags["payment:credit_cards"] || nTags["payment_credit_cards"] || null;
  const paymentDebitCards =
    nTags["payment:debit_cards"] || nTags["payment_debit_cards"] || null;
  const paymentCash = nTags["payment:cash"] || nTags["payment_cash"] || null;

  const creditCardsYes =
    paymentCreditCards &&
    String(paymentCreditCards).toLowerCase().trim() === "yes";
  const debitCardsYes =
    paymentDebitCards &&
    String(paymentDebitCards).toLowerCase().trim() === "yes";
  const cashYes =
    paymentCash && String(paymentCash).toLowerCase().trim() === "yes";
  const cashNo =
    paymentCash && String(paymentCash).toLowerCase().trim() === "no";
  const anyCardYes = creditCardsYes || debitCardsYes;

  if (anyCardYes || cashYes) {
    let paymentLabel = null;
    if (cashNo && anyCardYes) {
      paymentLabel = "Card payments only";
    } else if (cashYes && !anyCardYes) {
      paymentLabel = "Cash only";
    } else if (anyCardYes) {
      paymentLabel = "Cards accepted";
    }

    if (paymentLabel) {
      features.push({
        type: "payment",
        label: paymentLabel,
        icon: "credit_card",
      });
    }
  }

  // Extract smoking information
  const smokingValue = nTags.smoking || nTags.Smoking || null;
  const smokingYes = nTags["smoking:yes"] || nTags["smoking_yes"] || null;
  const smokingNo = nTags["smoking:no"] || nTags["smoking_no"] || null;
  const smokingDedicated =
    nTags["smoking:dedicated"] || nTags["smoking_dedicated"] || null;

  // Priority: smoking:dedicated > smoking:yes/smoking:no > smoking=yes/no
  if (
    smokingDedicated &&
    String(smokingDedicated).toLowerCase().trim() === "yes"
  ) {
    features.push({
      type: "smoking",
      label: "Smoking room available",
      icon: "smoking_rooms",
    });
  } else if (smokingYes && String(smokingYes).toLowerCase().trim() === "yes") {
    features.push({
      type: "smoking",
      label: "Smoking allowed",
      icon: "smoking_rooms",
    });
  } else if (smokingNo && String(smokingNo).toLowerCase().trim() === "yes") {
    features.push({ type: "smoking", label: "No smoking", icon: "smoke_free" });
  } else if (smokingValue) {
    const smokingLower = String(smokingValue).toLowerCase().trim();
    if (
      smokingLower === "yes" ||
      smokingLower === "outside" ||
      smokingLower === "isolated"
    ) {
      features.push({
        type: "smoking",
        label: "Smoking allowed",
        icon: "smoking_rooms",
      });
    } else if (smokingLower === "no") {
      features.push({
        type: "smoking",
        label: "No smoking",
        icon: "smoke_free",
      });
    } else if (smokingLower === "dedicated" || smokingLower === "separated") {
      features.push({
        type: "smoking",
        label: "Smoking room available",
        icon: "smoking_rooms",
      });
    }
  }

  // Extract fee information and map to friendly text
  const feeValue = nTags.fee || nTags.Fee || null;
  if (feeValue) {
    const feeLower = String(feeValue).toLowerCase().trim();
    if (feeLower === "no" || feeLower === "false") {
      features.push({ type: "fee", label: "Free entry", icon: "local_offer" });
    } else if (feeLower === "yes" || feeLower === "true") {
      features.push({ type: "fee", label: "Paid entry", icon: "attach_money" });
    }
  }

  // Extract indoor_seating information - only show when yes
  const indoorSeatingValue =
    nTags.indoor_seating ||
    nTags["indoor-seating"] ||
    nTags.indoor_seating ||
    null;
  if (indoorSeatingValue) {
    const indoorSeatingLower = String(indoorSeatingValue).toLowerCase().trim();
    if (indoorSeatingLower === "yes" || indoorSeatingLower === "true") {
      features.push({
        type: "indoor_seating",
        label: "Indoor seating available",
        icon: "event_seat",
      });
    }
    // Skip if no or missing - don't show "No indoor seating" to avoid clutter
  }

  // Services: Barber (attribute, not a place type)
  // OSM: shop=hairdresser + barber=yes|only|no (sometimes amenity=hairdresser)
  // Show only when relevant, and avoid rendering awkward "Barber: yes" rows.
  const barberValue = nTags.barber || nTags.Barber || null;
  const barberLower =
    barberValue != null ? String(barberValue).toLowerCase().trim() : "";
  const amenityLowerForBarber = nTags.amenity
    ? String(nTags.amenity).toLowerCase().trim()
    : "";
  const shopLowerForBarber = nTags.shop
    ? String(nTags.shop).toLowerCase().trim()
    : "";
  const isHairdresserForBarber =
    amenityLowerForBarber === "hairdresser" ||
    shopLowerForBarber === "hairdresser";
  if (isHairdresserForBarber) {
    if (barberLower === "only") {
      features.push({
        type: "barber",
        label: "Barber services only",
        icon: "content_cut",
      });
    } else if (
      barberLower === "yes" ||
      barberLower === "true" ||
      barberLower === "1"
    ) {
      features.push({
        type: "barber",
        label: "Barber services",
        icon: "content_cut",
      });
    }
  }

  // Audience / gender targeting (attribute, not a place type)
  // OSM can use: male=yes/no/only and female=yes/no/only (sometimes unisex=yes).
  // Avoid rendering awkward rows like "Male: yes" and instead show a clean Audience section.
  // Note: some data uses prefixed variants like toilets:male=yes. We treat those as audience hints too.
  const unisexValue =
    nTags.unisex ||
    nTags.Unisex ||
    nTags["toilets:unisex"] ||
    nTags["toilets_unisex"] ||
    nTags["toilets-unisex"] ||
    null;
  const unisexLower =
    unisexValue != null ? String(unisexValue).toLowerCase().trim() : "";
  const maleValue =
    nTags.male ||
    nTags.Male ||
    nTags["toilets:male"] ||
    nTags["toilets_male"] ||
    nTags["toilets-male"] ||
    null;
  const femaleValue =
    nTags.female ||
    nTags.Female ||
    nTags["toilets:female"] ||
    nTags["toilets_female"] ||
    nTags["toilets-female"] ||
    null;
  const maleLower =
    maleValue != null ? String(maleValue).toLowerCase().trim() : "";
  const femaleLower =
    femaleValue != null ? String(femaleValue).toLowerCase().trim() : "";

  const isTruthy = (v) => v === "yes" || v === "true" || v === "1";
  const isOnly = (v) => v === "only";
  const isFalsey = (v) => v === "no" || v === "false" || v === "0";

  let audienceLabel = null;
  if (isTruthy(unisexLower)) {
    audienceLabel = "Unisex";
  } else if (
    (isTruthy(maleLower) || isOnly(maleLower)) &&
    isFalsey(femaleLower)
  ) {
    audienceLabel = "Men only";
  } else if (
    (isTruthy(femaleLower) || isOnly(femaleLower)) &&
    isFalsey(maleLower)
  ) {
    audienceLabel = "Women only";
  } else if (
    (isTruthy(maleLower) || isOnly(maleLower)) &&
    (isTruthy(femaleLower) || isOnly(femaleLower))
  ) {
    audienceLabel = "Men and women";
  } else if (isTruthy(maleLower) || isOnly(maleLower)) {
    audienceLabel = "For men";
  } else if (isTruthy(femaleLower) || isOnly(femaleLower)) {
    audienceLabel = "For women";
  }

  const audienceInfo = audienceLabel
    ? {
        label: audienceLabel,
        icon:
          audienceLabel === "Men and women" || audienceLabel === "Unisex"
            ? "groups"
            : "person",
      }
    : null;

  // Diet: Vegetarian (attribute, not a place type)
  // OSM: diet:vegetarian=yes|only|no (legacy: vegetarian=yes|only|no)
  // Show only when relevant (restaurants/cafes/bars/fast food, and a few food-related shops),
  // and hide if missing/no.
  const vegetarianValue =
    nTags["diet:vegetarian"] ||
    nTags["diet_vegetarian"] ||
    nTags["diet-vegetarian"] ||
    nTags.vegetarian ||
    null;
  const vegetarianLower =
    vegetarianValue != null ? String(vegetarianValue).toLowerCase().trim() : "";
  const amenityLowerForDiet = nTags.amenity
    ? String(nTags.amenity).toLowerCase().trim()
    : "";
  const shopLowerForDiet = nTags.shop
    ? String(nTags.shop).toLowerCase().trim()
    : "";
  const relevantAmenitiesForDiet = new Set([
    "restaurant",
    "cafe",
    "bar",
    "pub",
    "fast_food",
    "food_court",
    "ice_cream",
    "biergarten",
    "canteen",
  ]);
  const relevantShopsForDiet = new Set([
    "supermarket",
    "convenience",
    "greengrocer",
    "health_food",
    "deli",
    "bakery",
  ]);
  const isRelevantForVegetarian =
    relevantAmenitiesForDiet.has(amenityLowerForDiet) ||
    relevantShopsForDiet.has(shopLowerForDiet);
  if (isRelevantForVegetarian) {
    if (vegetarianLower === "only") {
      features.push({
        type: "diet_vegetarian",
        label: "Vegetarian only",
        icon: "spa",
      });
    } else if (
      vegetarianLower === "yes" ||
      vegetarianLower === "true" ||
      vegetarianLower === "1"
    ) {
      features.push({
        type: "diet_vegetarian",
        label: "Vegetarian options",
        icon: "spa",
      });
    }
  }

  // Diet: Vegan (attribute, not a place type)
  // OSM: diet:vegan=yes|only|no (legacy: vegan=yes|only|no)
  // Same relevance rules as vegetarian; hide if missing/no.
  const veganValue =
    nTags["diet:vegan"] ||
    nTags["diet_vegan"] ||
    nTags["diet-vegan"] ||
    nTags.vegan ||
    null;
  const veganLower =
    veganValue != null ? String(veganValue).toLowerCase().trim() : "";
  const isRelevantForVegan =
    relevantAmenitiesForDiet.has(amenityLowerForDiet) ||
    relevantShopsForDiet.has(shopLowerForDiet);
  if (isRelevantForVegan) {
    if (veganLower === "only") {
      features.push({
        type: "diet_vegan",
        label: "Vegan only",
        icon: "spa",
      });
    } else if (
      veganLower === "yes" ||
      veganLower === "true" ||
      veganLower === "1"
    ) {
      features.push({
        type: "diet_vegan",
        label: "Vegan options",
        icon: "spa",
      });
    }
  }

  // Banking services (service info, not accessibility)
  // Only show when the value is explicitly known (true/false).
  const bankingServices = [];
  const parseKnownBool = (v) => {
    if (v == null) return null;
    const s = String(v).trim().toLowerCase();
    if (!s) return null;
    if (s === "yes" || s === "true" || s === "1") return true;
    if (s === "no" || s === "false" || s === "0") return false;
    return null; // unknown / ambiguous -> don't show
  };

  const atmBool = parseKnownBool(nTags.atm || nTags.ATM || null);
  if (atmBool !== null) {
    bankingServices.push(`ATM: ${atmBool ? "Available" : "Not available"}`);
  }

  const cashInBool = parseKnownBool(
    nTags.cash_in ||
      nTags["cash-in"] ||
      nTags["cash in"] ||
      nTags.Cash_in ||
      nTags["Cash In"] ||
      null
  );
  if (cashInBool !== null) {
    bankingServices.push(
      `Cash-in deposits: ${cashInBool ? "Available" : "Not available"}`
    );
  }

  // Consistent padding constant for all detail sections (24px = MUI spacing 3)
  const SECTION_PADDING = "24px";

  // Icon styling variables for Category and Address sections
  const ICON_SECONDARY_COLOR = "var(--bs-primary)"; // Brand blue for Category/Address icons
  const ICON_BACKGROUND_COLOR = "rgba(var(--bs-primary-rgb), 0.08)"; // Light blue background for icon containers
  const ICON_SIZE = "48px"; // Icon container size (width and height)
  const ICON_BORDER_RADIUS = "12px"; // Border radius for icon containers

  // Shared helper function to create detail section headers with icon (matching Contact Information style)
  function createDetailSectionHeader(iconName, titleText) {
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "12px";
    header.style.marginBottom = "20px";

    // Icon container - using variables for Category/Address styling
    const iconContainer = document.createElement("div");
    iconContainer.style.display = "flex";
    iconContainer.style.alignItems = "center";
    iconContainer.style.justifyContent = "center";
    iconContainer.style.width = ICON_SIZE;
    iconContainer.style.height = ICON_SIZE;
    iconContainer.style.borderRadius = ICON_BORDER_RADIUS;
    iconContainer.style.backgroundColor = ICON_BACKGROUND_COLOR;
    iconContainer.style.color = ICON_SECONDARY_COLOR;
    iconContainer.style.flexShrink = "0";

    const icon = document.createElement("span");
    icon.className = "material-icons";
    icon.style.fontSize = "24px"; // Adjusted for 48px container
    icon.style.color = ICON_SECONDARY_COLOR;
    icon.textContent = iconName;
    iconContainer.appendChild(icon);

    const title = document.createElement("h6");
    title.style.fontSize = "1.125rem";
    title.style.fontWeight = "600";
    title.style.color = "rgba(0, 0, 0, 0.87)";
    title.style.letterSpacing = "-0.01em";
    title.style.margin = "0";
    title.textContent = titleText;

    header.appendChild(iconContainer);
    header.appendChild(title);

    return header;
  }

  // Helper function to get Material Icon name with fallback
  function getSocialMediaIcon(platform) {
    // Map platform to Material Icon name from @mui/icons-material
    const iconMap = {
      Facebook: "Facebook", // Material Icons Facebook icon
      Instagram: "Instagram", // Material Icons Instagram icon (if available)
      Twitter: "Twitter", // Material Icons Twitter icon
      LinkedIn: "work",
      YouTube: "YouTube", // Material Icons YouTube icon
      TikTok: "music_note",
    };
    return iconMap[platform] || "share";
  }

  // Helper function to detect social media platform and get icon
  function detectSocialMedia(url) {
    if (!url) return null;
    try {
      const cleaned = cleanUrl(url);
      if (!cleaned) return null;
      const urlObj = new URL(cleaned);
      const hostname = urlObj.hostname.toLowerCase().replace(/^www\./, "");

      // Facebook
      if (hostname.includes("facebook.com")) {
        return {
          platform: "Facebook",
          icon: getSocialMediaIcon("Facebook"),
          url: cleaned,
        };
      }
      // Instagram
      if (hostname.includes("instagram.com")) {
        return {
          platform: "Instagram",
          icon: getSocialMediaIcon("Instagram"),
          url: cleaned,
        };
      }
      // Twitter/X
      if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
        return { platform: "Twitter", icon: "alternate_email", url: cleaned };
      }
      // LinkedIn
      if (hostname.includes("linkedin.com")) {
        return { platform: "LinkedIn", icon: "work", url: cleaned };
      }
      // YouTube
      if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
        return { platform: "YouTube", icon: "play_circle", url: cleaned };
      }
      // TikTok
      if (hostname.includes("tiktok.com")) {
        return { platform: "TikTok", icon: "music_note", url: cleaned };
      }

      return null;
    } catch {
      return null;
    }
  }

  // 🔥 Remove raw "contact" tag (e.g. contact=yes) so it doesn't render as "Contact / Yes"
  if ("contact" in nTags) {
    delete nTags.contact;
  }
  if ("Contact" in nTags) {
    // safety in case normalizeTagsCase kept a capital key
    delete nTags.Contact;
  }

  // CONTACT INFO - Extract website, phone, and email from tags
  const allWebsiteLinks = splitMulti(
    nTags.website || nTags["contact:website"] || ""
  )
    .map(cleanUrl)
    .filter(Boolean);

  // Extract social media links from dedicated tags (facebook, contact:facebook, instagram, etc.)
  const socialMediaTagKeys = [
    "facebook",
    "contact:facebook",
    "instagram",
    "contact:instagram",
    "twitter",
    "contact:twitter",
    "linkedin",
    "contact:linkedin",
    "youtube",
    "contact:youtube",
    "tiktok",
    "contact:tiktok",
  ];

  // Helper to convert username/page to full URL if needed
  const normalizeSocialMediaUrl = (value, platform) => {
    if (!value) return null;
    const trimmed = String(value).trim();

    // If it already looks like a URL, return as-is
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    // Convert username/page to full URL
    if (platform === "facebook") {
      // If it's just a username or page name, prepend facebook.com
      if (!trimmed.includes("facebook.com") && !trimmed.includes("/")) {
        return `https://www.facebook.com/${trimmed}`;
      }
      // If it's a path like "/publicpub", make it full URL
      if (trimmed.startsWith("/")) {
        return `https://www.facebook.com${trimmed}`;
      }
    } else if (platform === "instagram") {
      if (!trimmed.includes("instagram.com") && !trimmed.includes("/")) {
        return `https://www.instagram.com/${trimmed}`;
      }
      if (trimmed.startsWith("/")) {
        return `https://www.instagram.com${trimmed}`;
      }
    } else if (platform === "twitter") {
      if (
        !trimmed.includes("twitter.com") &&
        !trimmed.includes("x.com") &&
        !trimmed.includes("/")
      ) {
        return `https://www.twitter.com/${trimmed}`;
      }
      if (trimmed.startsWith("/")) {
        return `https://www.twitter.com${trimmed}`;
      }
    }

    // If it doesn't match any pattern, try to clean it as-is
    return trimmed;
  };

  const socialMediaLinksFromTags = [];
  socialMediaTagKeys.forEach((key) => {
    const value = nTags[key];
    if (value) {
      const links = splitMulti(value);
      links.forEach((link) => {
        // Determine platform from key
        const platform = key
          .toLowerCase()
          .replace(/^contact:/, "")
          .replace(/^contact_/, "");

        // Normalize URL (handle usernames, partial URLs, etc.)
        let normalizedUrl = normalizeSocialMediaUrl(link, platform);
        if (!normalizedUrl) return;

        // Clean the URL
        const cleaned = cleanUrl(normalizedUrl);
        if (!cleaned) return;

        // Detect and add social media link
        const social = detectSocialMedia(cleaned);
        if (social) {
          // Only add if not already in the list (avoid duplicates)
          const isDuplicate = socialMediaLinksFromTags.some(
            (existing) => existing.url === social.url
          );
          if (!isDuplicate) {
            socialMediaLinksFromTags.push(social);
          }
        }
      });
    }
  });

  // Separate social media links from regular website links
  const socialMediaLinks = [...socialMediaLinksFromTags]; // Start with dedicated tags
  const regularWebsiteLinks = [];

  allWebsiteLinks.forEach((url) => {
    const social = detectSocialMedia(url);
    if (social) {
      // Only add if not already in the list (avoid duplicates)
      const isDuplicate = socialMediaLinks.some(
        (existing) => existing.url === social.url
      );
      if (!isDuplicate) {
        socialMediaLinks.push(social);
      }
    } else {
      regularWebsiteLinks.push(url);
    }
  });

  // Use regular website links for ContactInfo
  const websiteLinks = regularWebsiteLinks;

  // Remove raw "contact" tag (e.g. contact=yes) from generic details,
  // we only want the rich Contact section (website/phone/email).
  if (nTags && typeof nTags === "object") {
    for (const key of Object.keys(nTags)) {
      if (key && key.trim().toLowerCase() === "contact") {
        delete nTags[key];
      }
    }
  }

  // Extract phone numbers (phone, contact:phone, contact:mobile, phone:mobile, etc.)
  const phoneNumbers = [];
  // Collect all phone-related keys (including phone:mobile, phone:*, etc.)
  const phoneKeys = [
    "phone",
    "contact:phone",
    "contact:mobile",
    "mobile",
    "contact:fax",
  ];
  // Also check for phone:* variants (phone:mobile, phone:landline, etc.)
  if (nTags && typeof nTags === "object") {
    Object.keys(nTags).forEach((key) => {
      const lk = key.toLowerCase();
      if (
        lk.startsWith("phone:") ||
        lk.startsWith("phone_") ||
        lk.startsWith("phone-")
      ) {
        phoneKeys.push(key);
      }
    });
  }
  // Remove duplicates
  const uniquePhoneKeys = [...new Set(phoneKeys)];
  uniquePhoneKeys.forEach((key) => {
    const value = nTags[key];
    if (value) {
      const phones = splitMulti(value).filter(Boolean);
      phoneNumbers.push(...phones);
    }
  });

  // Extract email addresses (email, contact:email)
  const emailAddresses = [];
  const emailKeys = ["email", "contact:email"];
  emailKeys.forEach((key) => {
    const value = nTags[key];
    if (value) {
      const emails = splitMulti(value).filter(Boolean);
      emailAddresses.push(...emails);
    }
  });

  // Render ContactInfo component if we have any contact info
  if (
    websiteLinks.length > 0 ||
    phoneNumbers.length > 0 ||
    emailAddresses.length > 0
  ) {
    const contactContainer = document.createElement("div");
    contactContainer.className = "list-group-item";
    contactContainer.style.padding = "0";
    list.appendChild(contactContainer);

    // Dynamically import and render React component
    (async () => {
      try {
        const [ReactMod, ReactDOMMod, ContactInfoMod] = await Promise.all([
          import("react"),
          import("react-dom/client"),
          import("./components/ContactInfo.jsx"),
        ]);

        const React = ReactMod.default || ReactMod;
        const { createRoot } = ReactDOMMod;
        const ContactInfo = ContactInfoMod.default || ContactInfoMod;

        const root = createRoot(contactContainer);
        root.render(
          React.createElement(ContactInfo, {
            website: websiteLinks.length > 0 ? websiteLinks : null,
            phone: phoneNumbers.length > 0 ? phoneNumbers : null,
            email: emailAddresses.length > 0 ? emailAddresses : null,
          })
        );
      } catch (err) {
        console.error("Failed to render ContactInfo component:", err);
        // Fallback to plain text
        const fallbackHtml = [];
        if (websiteLinks.length > 0) {
          fallbackHtml.push(
            `<div class="me-2"><h6 class="mb-1 fw-semibold">Website</h6><p class="small mb-1">${websiteLinks
              .map(
                (u) =>
                  `<a href="${u}" target="_blank" rel="noopener nofollow">${linkLabel(
                    u
                  )}</a>`
              )
              .join(" · ")}</p></div>`
          );
        }
        if (phoneNumbers.length > 0) {
          fallbackHtml.push(
            `<div class="me-2"><h6 class="mb-1 fw-semibold">Phone</h6><p class="small mb-1">${phoneNumbers
              .map(
                (p) => `<a href="tel:${p.replace(/[\s\-\(\)]/g, "")}">${p}</a>`
              )
              .join(" · ")}</p></div>`
          );
        }
        if (emailAddresses.length > 0) {
          fallbackHtml.push(
            `<div class="me-2"><h6 class="mb-1 fw-semibold">Email</h6><p class="small mb-1">${emailAddresses
              .map((e) => `<a href="mailto:${e}">${e}</a>`)
              .join(" · ")}</p></div>`
          );
        }
        contactContainer.innerHTML = fallbackHtml.join("");
      }
    })();
  }

  // Helper function to format social media URL for display (clean, readable text)
  function formatSocialMediaUrlForDisplay(url) {
    if (!url) return "";
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace(/^www\./i, ""); // Remove www.
      const pathname = urlObj.pathname.replace(/\/$/, ""); // Remove trailing slash
      const displayPath = pathname || "";

      // Return clean format: "facebook.com/JunglePizzaVilnius"
      return hostname + displayPath;
    } catch {
      // Fallback: remove https:// and www. manually
      return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    }
  }

  // SOCIAL MEDIA - Render social media links separately if there are multiple platforms
  if (socialMediaLinks.length > 0) {
    const socialMediaItem = document.createElement("div");
    socialMediaItem.className = "list-group-item";
    socialMediaItem.style.padding = "0";

    const container = document.createElement("div");
    container.style.padding = SECTION_PADDING;
    container.style.borderTop = "1px solid";
    container.style.borderColor = "rgba(0, 0, 0, 0.12)";

    // Header: "Social Media" with share icon
    const header = createDetailSectionHeader("share", "Social Media");
    container.appendChild(header);

    // Create a card for each social media platform
    socialMediaLinks.forEach((social) => {
      const card = document.createElement("div");
      card.style.marginBottom = "12px";
      card.style.border = "1px solid";
      card.style.borderColor = "rgba(0, 0, 0, 0.12)";
      card.style.borderRadius = "8px";
      card.style.transition = "all 0.2s ease-in-out";
      card.style.cursor = "pointer";

      // Hover effect - use secondary color
      card.addEventListener("mouseenter", () => {
        card.style.borderColor = ICON_SECONDARY_COLOR;
        card.style.boxShadow = `0 2px 8px rgba(var(--bs-primary-rgb), 0.15)`;
        card.style.transform = "translateY(-1px)";
      });
      card.addEventListener("mouseleave", () => {
        card.style.borderColor = "rgba(0, 0, 0, 0.12)";
        card.style.boxShadow = "none";
        card.style.transform = "translateY(0)";
      });

      // Click to open link
      card.addEventListener("click", () => {
        window.open(social.url, "_blank", "noopener,nofollow");
      });

      const cardContent = document.createElement("div");
      cardContent.style.display = "flex";
      cardContent.style.alignItems = "center";
      cardContent.style.gap = "16px";
      cardContent.style.padding = "16px";

      // Icon container - use same variables as Address/Category
      const iconContainer = document.createElement("div");
      iconContainer.style.display = "flex";
      iconContainer.style.alignItems = "center";
      iconContainer.style.justifyContent = "center";
      iconContainer.style.width = ICON_SIZE;
      iconContainer.style.height = ICON_SIZE;
      iconContainer.style.borderRadius = ICON_BORDER_RADIUS;
      iconContainer.style.backgroundColor = ICON_BACKGROUND_COLOR;
      iconContainer.style.color = ICON_SECONDARY_COLOR;
      iconContainer.style.flexShrink = "0";

      const icon = document.createElement("span");
      // Use Material Icons for all social media icons
      // Material Icons font uses lowercase names: "Facebook" component -> "facebook" icon name
      icon.className = "material-icons";
      icon.style.fontSize = "24px";
      icon.style.color = ICON_SECONDARY_COLOR;
      // Convert platform name to Material Icons font name (lowercase)
      // "Facebook" -> "facebook", "Instagram" -> "instagram", etc.
      const iconName = social.icon.toLowerCase();
      icon.textContent = iconName;
      iconContainer.appendChild(icon);

      // Content
      const contentWrapper = document.createElement("div");
      contentWrapper.style.flex = "1";
      contentWrapper.style.minWidth = "0";

      const label = document.createElement("div");
      label.style.fontSize = "0.75rem";
      label.style.color = "rgba(0, 0, 0, 0.6)";
      label.style.textTransform = "uppercase";
      label.style.letterSpacing = "0.5px";
      label.style.marginBottom = "4px";
      label.style.fontWeight = "500";
      label.textContent = social.platform;

      // Format URL for display (clean, readable text)
      const displayUrl = formatSocialMediaUrlForDisplay(social.url);

      const linkText = document.createElement("div");
      linkText.style.display = "flex";
      linkText.style.alignItems = "center";
      linkText.style.gap = "4px";
      linkText.style.fontSize = "0.9375rem";
      linkText.style.fontWeight = "500";
      linkText.style.color = "rgba(0, 0, 0, 0.87)";
      linkText.style.wordBreak = "break-word"; // Better than break-all
      linkText.style.lineHeight = "1.4";

      // Display text (clean URL)
      const displayText = document.createElement("span");
      displayText.textContent = displayUrl;
      linkText.appendChild(displayText);

      // External link indicator
      const externalIcon = document.createElement("span");
      externalIcon.className = "material-icons";
      externalIcon.style.fontSize = "0.875rem";
      externalIcon.style.color = "rgba(0, 0, 0, 0.6)";
      externalIcon.style.flexShrink = "0";
      externalIcon.textContent = "open_in_new";
      linkText.appendChild(externalIcon);

      contentWrapper.appendChild(label);
      contentWrapper.appendChild(linkText);

      cardContent.appendChild(iconContainer);
      cardContent.appendChild(contentWrapper);
      card.appendChild(cardContent);
      container.appendChild(card);
    });

    socialMediaItem.appendChild(container);
    list.appendChild(socialMediaItem);
  }

  // OPENING HOURS - Render with React component
  const openingHours = nTags.opening_hours || nTags["opening_hours"] || null;
  // Extract check_date:opening_hours specifically for opening hours
  const openingHoursCheckDate =
    nTags["check_date:opening_hours"] ||
    nTags["check_date_opening_hours"] ||
    null;
  const formattedOpeningHoursCheckDate = openingHoursCheckDate
    ? formatDateForDisplay(String(openingHoursCheckDate))
    : null;

  if (openingHours) {
    const hoursContainer = document.createElement("div");
    hoursContainer.className = "list-group-item";
    hoursContainer.style.padding = "0"; // Padding handled by React component
    list.appendChild(hoursContainer);

    // Dynamically import and render React component
    (async () => {
      try {
        const [ReactMod, ReactDOMMod, OpeningHoursMod] = await Promise.all([
          import("react"),
          import("react-dom/client"),
          import("./components/OpeningHours.jsx"),
        ]);

        const React = ReactMod.default || ReactMod;
        const { createRoot } = ReactDOMMod;
        const OpeningHours = OpeningHoursMod.default || OpeningHoursMod;

        const root = createRoot(hoursContainer);
        root.render(
          React.createElement(OpeningHours, {
            openingHours: openingHours,
            holidayHours: nTags["opening_hours:holiday"] || null,
            checkDate: formattedOpeningHoursCheckDate,
          })
        );
      } catch (err) {
        console.error("Failed to render OpeningHours component:", err);
        // Fallback to plain text
        hoursContainer.innerHTML = `<div class="me-2"><h6 class="mb-1 fw-semibold">Opening Hours</h6><p class="small mb-1">${openingHours}</p></div>`;
      }
    })();
  }

  // --- ACCESSIBILITY / WHEELCHAIR: Render accessibility information ---
  // Helper function to get wheelchair tier (reuse logic from AccessibilityLegend)
  function getAccessibilityTier(tags = {}) {
    const raw = (tags.wheelchair ?? "").toString().toLowerCase();

    if (raw.includes("designated")) return "designated";
    if (raw === "yes" || raw.includes("true")) return "yes";
    if (raw.includes("limited") || raw.includes("partial")) return "limited";
    if (raw === "no" || raw.includes("false")) return "no";

    return "unknown";
  }

  // Labels matching the legend display
  const TIER_LABELS = {
    designated: "Designated wheelchair route",
    yes: "Wheelchair accessible",
    limited: "Limited access",
    unknown: "Unknown",
    no: "No wheelchair access",
  };

  // Colors from constants (same as map badges)
  const TIER_COLORS = {
    designated: BADGE_COLOR_BY_TIER.designated,
    yes: BADGE_COLOR_BY_TIER.yes,
    limited: "#ffc107", // amber/orange (CSS var not usable here)
    unknown: "#6c757d", // grey (CSS var not usable here)
    no: "#dc3545", // red (CSS var not usable here)
  };

  const wheelchairTags = {};
  Object.entries(nTags).forEach(([key, value]) => {
    const lk = key.trim().toLowerCase();
    // Collect all wheelchair-related tags
    if (/^wheelchair/i.test(lk)) {
      wheelchairTags[key] = value;
    }
  });

  // Check for user-reported accessibility (from approved reports) - this takes precedence
  const userReportedAccessibility = nTags.user_reported_accessibility || null;
  const userReportedWheelchair =
    userReportedAccessibility && typeof userReportedAccessibility === "object"
      ? userReportedAccessibility.wheelchair
      : null;

  // If admin approved a user report, use that as the primary status (overwrites original)
  // Otherwise, use the original wheelchair status
  const primaryWheelchair =
    userReportedWheelchair ||
    wheelchairTags.wheelchair ||
    wheelchairTags.Wheelchair ||
    null;
  const primaryTier = getAccessibilityTier({ wheelchair: primaryWheelchair });
  const primaryLabel = TIER_LABELS[primaryTier] || "Unknown";
  const primaryColor = TIER_COLORS[primaryTier] || TIER_COLORS.unknown;

  // Original status (only shown if different from user-reported or if no user report exists)
  const originalWheelchair =
    wheelchairTags.wheelchair || wheelchairTags.Wheelchair || null;
  const originalTier = getAccessibilityTier({ wheelchair: originalWheelchair });
  const originalLabel = TIER_LABELS[originalTier] || "Unknown";
  const originalColor = TIER_COLORS[originalTier] || TIER_COLORS.unknown;

  const userReportedComment = nTags.user_reported_accessibility_comment || null;

  // Show original status separately only if user-reported status exists and is different
  const showOriginalSeparately =
    userReportedWheelchair &&
    originalWheelchair &&
    originalWheelchair !== userReportedWheelchair;

  // Track if we need to show ML prediction (for unknown accessibility and predictions enabled)
  const showMlPrediction = primaryTier === "unknown" && placePredictionsEnabled;

  const accItem = document.createElement("div");
  accItem.className = "list-group-item";
  accItem.style.padding = "0";

  // Main container with consistent padding
  const container = document.createElement("div");
  container.style.padding = SECTION_PADDING;
  container.style.borderTop = "1px solid";
  container.style.borderColor = "rgba(0, 0, 0, 0.12)"; // divider color

  // Header section matching ContactInfo/OpeningHours style
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.gap = "12px"; // gap: 1.5
  header.style.marginBottom = "20px"; // mb: 2.5

  // Title matching typography (no icon)
  const title = document.createElement("h6");
  title.style.fontSize = "1.125rem"; // 18px
  title.style.fontWeight = "600";
  title.style.color = "rgba(0, 0, 0, 0.87)"; // text.primary
  title.style.letterSpacing = "-0.01em";
  title.style.margin = "0";
  title.textContent = "Wheelchair Access";

  header.appendChild(title);

  // Helper function to create a status card
  const createStatusCard = (
    labelText,
    statusLabel,
    statusColor,
    isUserReported = false
  ) => {
    const cardContainer = document.createElement("div");
    cardContainer.style.border = "1px solid";
    cardContainer.style.borderColor = "rgba(0, 0, 0, 0.12)"; // divider
    cardContainer.style.borderRadius = "16px"; // borderRadius: 2
    cardContainer.style.padding = "16px"; // p: 2
    cardContainer.style.display = "flex";
    cardContainer.style.alignItems = "center";
    cardContainer.style.gap = "16px"; // gap: 2
    if (isUserReported) {
      cardContainer.style.marginTop = "12px"; // Add spacing between original and user-reported
    }

    // Convert hex color to rgba with 10% opacity
    const hexToRgba = (hex, alpha) => {
      if (!hex || !hex.startsWith("#") || hex.length !== 7) {
        return `rgba(108, 117, 125, ${alpha})`; // fallback to unknown color
      }
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // Icon container for status (48x48 to match ContactInfo items)
    const statusIconContainer = document.createElement("div");
    statusIconContainer.style.display = "flex";
    statusIconContainer.style.alignItems = "center";
    statusIconContainer.style.justifyContent = "center";
    statusIconContainer.style.width = "48px";
    statusIconContainer.style.height = "48px";
    statusIconContainer.style.borderRadius = "16px"; // borderRadius: 2
    statusIconContainer.style.backgroundColor = hexToRgba(statusColor, 0.1); // 10% opacity
    statusIconContainer.style.flexShrink = "0";

    const statusIcon = document.createElement("div");
    statusIcon.style.width = "24px";
    statusIcon.style.height = "24px";
    statusIcon.style.display = "inline-block";
    statusIcon.style.backgroundColor = statusColor;
    statusIcon.style.maskImage = "url('/icons/maki/wheelchair.svg')";
    statusIcon.style.maskSize = "contain";
    statusIcon.style.maskRepeat = "no-repeat";
    statusIcon.style.maskPosition = "center";
    statusIcon.style.webkitMaskImage = "url('/icons/maki/wheelchair.svg')";
    statusIcon.style.webkitMaskSize = "contain";
    statusIcon.style.webkitMaskRepeat = "no-repeat";
    statusIcon.style.webkitMaskPosition = "center";

    statusIconContainer.appendChild(statusIcon);

    // Content wrapper
    const contentWrapper = document.createElement("div");
    contentWrapper.style.flex = "1";
    contentWrapper.style.minWidth = "0";

    // Label
    const labelElement = document.createElement("div");
    labelElement.style.display = "block";
    labelElement.style.color = "rgba(0, 0, 0, 0.6)"; // text.secondary
    labelElement.style.fontSize = "0.75rem";
    labelElement.style.fontWeight = "500";
    labelElement.style.textTransform = "uppercase";
    labelElement.style.letterSpacing = "0.5px";
    labelElement.style.marginBottom = "4px"; // mb: 0.5
    labelElement.textContent = labelText;

    // Chip/badge with color and label
    const chip = document.createElement("div");
    chip.style.display = "inline-block";
    chip.style.padding = "0.375rem 0.75rem";
    chip.style.borderRadius = "1rem";
    chip.style.backgroundColor = statusColor;
    chip.style.color = "white";
    chip.style.fontSize = "0.9375rem";
    chip.style.fontWeight = "500";
    chip.style.lineHeight = "1.25";
    chip.style.fontFamily = "inherit";
    chip.textContent = statusLabel;

    contentWrapper.appendChild(labelElement);
    contentWrapper.appendChild(chip);

    cardContainer.appendChild(statusIconContainer);
    cardContainer.appendChild(contentWrapper);

    return cardContainer;
  };

  // Primary status card (user-reported if admin approved, otherwise original)
  const statusLabel = userReportedWheelchair
    ? "STATUS (User Reported)"
    : "STATUS";
  const primaryStatusCard = createStatusCard(
    statusLabel,
    primaryLabel,
    primaryColor,
    false
  );
  container.appendChild(header);
  container.appendChild(primaryStatusCard);

  // --- ML PREDICTION: Show AI prediction when wheelchair status is unknown ---
  if (showMlPrediction) {
    // Create prediction container (initially shows loading state)
    const predictionContainer = document.createElement("div");
    predictionContainer.style.marginTop = "16px";
    predictionContainer.style.padding = "16px";
    predictionContainer.style.backgroundColor = "rgba(12, 119, 210, 0.05)"; // light blue background
    predictionContainer.style.borderRadius = "12px";
    predictionContainer.style.border = "1px dashed rgba(12, 119, 210, 0.3)";

    // Header with AI icon
    const predictionHeader = document.createElement("div");
    predictionHeader.style.display = "flex";
    predictionHeader.style.alignItems = "center";
    predictionHeader.style.gap = "8px";
    predictionHeader.style.marginBottom = "12px";

    const aiIcon = document.createElement("span");
    aiIcon.textContent = "✨";
    aiIcon.style.fontSize = "14px";

    const predictionTitle = document.createElement("span");
    predictionTitle.style.fontSize = "0.75rem";
    predictionTitle.style.fontWeight = "600";
    predictionTitle.style.color = "#0c77d2";
    predictionTitle.style.textTransform = "uppercase";
    predictionTitle.style.letterSpacing = "0.5px";
    predictionTitle.textContent = "AI Prediction";

    predictionHeader.appendChild(aiIcon);
    predictionHeader.appendChild(predictionTitle);

    // Content area (will be updated after fetch)
    const predictionContent = document.createElement("div");
    predictionContent.style.display = "flex";
    predictionContent.style.alignItems = "center";
    predictionContent.style.gap = "12px";

    // Loading state
    const loadingText = document.createElement("span");
    loadingText.style.fontSize = "0.875rem";
    loadingText.style.color = "rgba(0, 0, 0, 0.6)";
    loadingText.textContent = "Analyzing accessibility...";
    predictionContent.appendChild(loadingText);

    predictionContainer.appendChild(predictionHeader);
    predictionContainer.appendChild(predictionContent);
    container.appendChild(predictionContainer);

    // Fetch ML prediction asynchronously
    (async () => {
      try {
        // Generate a placeKey for cache lookup (same format as map markers)
        const placeId =
          nTags.id ||
          nTags.osm_id ||
          nTags["@id"] ||
          globals.detailsCtx?.placeId;
        const placeKey = placeId ? `N/${placeId}` : null;

        // Check if we already have a cached prediction from map markers
        if (placeKey && placePredictionsCache.has(placeKey)) {
          const cachedPrediction = placePredictionsCache.get(placeKey);
          renderPredictionResult(predictionContent, cachedPrediction);
          return;
        }

        // Extract relevant OSM features for prediction
        const features = {};
        const relevantTags = [
          "amenity",
          "shop",
          "tourism",
          "building",
          "entrance",
          "door",
          "automatic_door",
          "access",
          "level",
          "healthcare",
          "office",
          "bench",
          "changing_table",
          "indoor",
          "leisure",
        ];

        for (const tag of relevantTags) {
          const value = nTags[tag] || nTags[`tags.${tag}`];
          if (value !== null && value !== undefined && value !== "") {
            features[tag] = value;
          }
        }

        // Only predict if we have some features
        if (Object.keys(features).length === 0) {
          predictionContent.innerHTML = "";
          const noDataText = document.createElement("span");
          noDataText.style.fontSize = "0.875rem";
          noDataText.style.color = "rgba(0, 0, 0, 0.5)";
          noDataText.style.fontStyle = "italic";
          noDataText.textContent = "Not enough data for prediction";
          predictionContent.appendChild(noDataText);
          return;
        }

        // Add place ID to features for caching (same as map markers)
        if (placeKey) {
          features._placeId = placeKey;
        }

        // Use client-side ONNX prediction
        const result = await predictAccessibility(features);

        // Cache the result for future use
        if (placeKey && result) {
          placePredictionsCache.set(placeKey, result);
        }

        renderPredictionResult(predictionContent, result);
      } catch (err) {
        console.warn("Failed to get accessibility prediction:", err);
        predictionContent.innerHTML = "";
        const errText = document.createElement("span");
        errText.style.fontSize = "0.875rem";
        errText.style.color = "rgba(0, 0, 0, 0.5)";
        errText.textContent = "Prediction unavailable";
        predictionContent.appendChild(errText);
      }
    })();

    // Helper function to render prediction result
    function renderPredictionResult(container, result) {
      container.innerHTML = "";

      // Prediction icon
      const predIcon = document.createElement("div");
      predIcon.style.width = "36px";
      predIcon.style.height = "36px";
      predIcon.style.borderRadius = "50%";
      predIcon.style.display = "flex";
      predIcon.style.alignItems = "center";
      predIcon.style.justifyContent = "center";
      predIcon.style.flexShrink = "0";

      // Handle 3-class predictions: accessible, limited, not_accessible
      const predictionLabel = result.label;
      const isAccessible = predictionLabel === "accessible";
      const isLimited = predictionLabel === "limited";

      // Set colors based on prediction class using predefined constants
      let iconColor, bgColor, labelText;
      if (isAccessible) {
        iconColor = PREDICTED_BADGE_COLOR_BY_TIER.accessible;
        bgColor = "rgba(22, 163, 74, 0.1)";
        labelText = "Likely Accessible";
      } else if (isLimited) {
        iconColor = PREDICTED_BADGE_COLOR_BY_TIER.limited;
        bgColor = "rgba(202, 138, 4, 0.1)";
        labelText = "Likely Limited Access";
      } else {
        iconColor = PREDICTED_BADGE_COLOR_BY_TIER.not_accessible;
        bgColor = "rgba(220, 38, 38, 0.1)";
        labelText = "Likely Not Accessible";
      }

      predIcon.style.backgroundColor = bgColor;

      // Different icons for each state
      if (isAccessible) {
        predIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`;
      } else if (isLimited) {
        predIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
      } else {
        predIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      }

      container.appendChild(predIcon);

      // Text content
      const textWrapper = document.createElement("div");

      const labelEl = document.createElement("div");
      labelEl.style.fontSize = "0.9375rem";
      labelEl.style.fontWeight = "500";
      labelEl.style.color = iconColor;
      labelEl.textContent = labelText;

      const confidenceEl = document.createElement("div");
      confidenceEl.style.fontSize = "0.75rem";
      confidenceEl.style.color = "rgba(0, 0, 0, 0.5)";
      confidenceEl.textContent = `${Math.round(
        result.probability * 100
      )}% confidence`;

      textWrapper.appendChild(labelEl);
      textWrapper.appendChild(confidenceEl);

      // Show contributing features (basedOn) if available
      if (
        result.basedOn &&
        Array.isArray(result.basedOn) &&
        result.basedOn.length > 0
      ) {
        const basedOnEl = document.createElement("div");
        basedOnEl.style.fontSize = "0.6875rem";
        basedOnEl.style.color = "rgba(0, 0, 0, 0.4)";
        basedOnEl.style.marginTop = "4px";
        basedOnEl.style.fontStyle = "italic";
        const featureNames = result.basedOn
          .slice(0, 3)
          .map((f) => f.displayName || f.feature || f)
          .join(", ");
        basedOnEl.textContent = `Based on: ${featureNames}`;
        textWrapper.appendChild(basedOnEl);
      }

      container.appendChild(textWrapper);
    }
  }

  accItem.appendChild(container);
  list.appendChild(accItem);

  // --- WHEELCHAIR-ACCESSIBLE RESTROOM: Show if toilets:wheelchair exists ---
  const toiletsWheelchair =
    nTags["toilets:wheelchair"] ||
    nTags["toilets_wheelchair"] ||
    nTags["toilets-wheelchair"] ||
    nTags["wheelchair:toilets"] ||
    nTags["wheelchair_toilets"] ||
    nTags["wheelchair-toilets"] ||
    null;
  if (toiletsWheelchair) {
    const toiletsWheelchairLower = String(toiletsWheelchair)
      .toLowerCase()
      .trim();
    const isYes =
      toiletsWheelchairLower === "yes" || toiletsWheelchairLower === "true";
    const isNo =
      toiletsWheelchairLower === "no" || toiletsWheelchairLower === "false";

    if (isYes || isNo) {
      const restroomAccItem = document.createElement("div");
      restroomAccItem.className = "list-group-item";
      restroomAccItem.style.padding = "0";

      const restroomContainer = document.createElement("div");
      restroomContainer.style.padding = SECTION_PADDING;
      restroomContainer.style.borderTop = "1px solid";
      restroomContainer.style.borderColor = "rgba(0, 0, 0, 0.12)";

      // Card container matching wheelchair design
      const restroomCardContainer = document.createElement("div");
      restroomCardContainer.style.border = "1px solid";
      restroomCardContainer.style.borderColor = "rgba(0, 0, 0, 0.12)";
      restroomCardContainer.style.borderRadius = "16px";
      restroomCardContainer.style.padding = "16px";
      restroomCardContainer.style.display = "flex";
      restroomCardContainer.style.alignItems = "center";
      restroomCardContainer.style.gap = "16px";

      // Determine color and label based on value (same logic as vision accessibility)
      const restroomColor = isYes ? "#6cc24a" : "#dc3545"; // green for yes, red for no
      const restroomLabel = isYes ? "Available" : "Not available";

      // Icon container (green for yes, red for no)
      const restroomIconContainer = document.createElement("div");
      restroomIconContainer.style.display = "flex";
      restroomIconContainer.style.alignItems = "center";
      restroomIconContainer.style.justifyContent = "center";
      restroomIconContainer.style.width = "48px";
      restroomIconContainer.style.height = "48px";
      restroomIconContainer.style.borderRadius = "16px";
      restroomIconContainer.style.backgroundColor = hexToRgba(
        restroomColor,
        0.1
      ); // 10% opacity
      restroomIconContainer.style.flexShrink = "0";

      const restroomIcon = document.createElement("div");
      restroomIcon.style.width = "24px";
      restroomIcon.style.height = "24px";
      restroomIcon.style.display = "inline-block";
      restroomIcon.style.backgroundColor = restroomColor;
      restroomIcon.style.maskImage = "url('/icons/maki/toilet.svg')";
      restroomIcon.style.maskSize = "contain";
      restroomIcon.style.maskRepeat = "no-repeat";
      restroomIcon.style.maskPosition = "center";
      restroomIcon.style.webkitMaskImage = "url('/icons/maki/toilet.svg')";
      restroomIcon.style.webkitMaskSize = "contain";
      restroomIcon.style.webkitMaskRepeat = "no-repeat";
      restroomIcon.style.webkitMaskPosition = "center";
      restroomIconContainer.appendChild(restroomIcon);

      // Content wrapper
      const restroomContentWrapper = document.createElement("div");
      restroomContentWrapper.style.flex = "1";
      restroomContentWrapper.style.minWidth = "0";

      const restroomLabelElement = document.createElement("div");
      restroomLabelElement.style.display = "block";
      restroomLabelElement.style.color = "rgba(0, 0, 0, 0.6)";
      restroomLabelElement.style.fontSize = "0.75rem";
      restroomLabelElement.style.fontWeight = "500";
      restroomLabelElement.style.textTransform = "uppercase";
      restroomLabelElement.style.letterSpacing = "0.5px";
      restroomLabelElement.style.marginBottom = "4px";
      restroomLabelElement.textContent = "WHEELCHAIR-ACCESSIBLE RESTROOM";

      // Chip/badge with color and label (matching wheelchair style)
      const restroomChip = document.createElement("div");
      restroomChip.style.display = "inline-block";
      restroomChip.style.padding = "0.375rem 0.75rem";
      restroomChip.style.borderRadius = "1rem";
      restroomChip.style.backgroundColor = restroomColor;
      restroomChip.style.color = "white";
      restroomChip.style.fontSize = "0.9375rem";
      restroomChip.style.fontWeight = "500";
      restroomChip.style.lineHeight = "1.25";
      restroomChip.style.fontFamily = "inherit";
      restroomChip.textContent = restroomLabel;

      restroomContentWrapper.appendChild(restroomLabelElement);
      restroomContentWrapper.appendChild(restroomChip);

      restroomCardContainer.appendChild(restroomIconContainer);
      restroomCardContainer.appendChild(restroomContentWrapper);

      restroomContainer.appendChild(restroomCardContainer);
      restroomAccItem.appendChild(restroomContainer);
      list.appendChild(restroomAccItem);
    }
  }

  // --- OTHER ACCESSIBILITY: Vision accessibility (blind=yes/no) ---
  const blindValue = nTags.blind || nTags.Blind || null;
  if (blindValue) {
    const blindLower = String(blindValue).toLowerCase().trim();
    const isYes = blindLower === "yes" || blindLower === "true";
    const isNo = blindLower === "no" || blindLower === "false";

    if (isYes || isNo) {
      const visionAccItem = document.createElement("div");
      visionAccItem.className = "list-group-item";
      visionAccItem.style.padding = "0";

      const container = document.createElement("div");
      container.style.padding = SECTION_PADDING;
      container.style.borderTop = "1px solid";
      container.style.borderColor = "rgba(0, 0, 0, 0.12)";

      // Header section matching Wheelchair Access style
      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.gap = "12px";
      header.style.marginBottom = "20px";

      const title = document.createElement("h6");
      title.style.fontSize = "1.125rem";
      title.style.fontWeight = "600";
      title.style.color = "rgba(0, 0, 0, 0.87)";
      title.style.letterSpacing = "-0.01em";
      title.style.margin = "0";
      title.textContent = "Other Accessibility";

      header.appendChild(title);

      // Card container matching wheelchair design
      const cardContainer = document.createElement("div");
      cardContainer.style.border = "1px solid";
      cardContainer.style.borderColor = "rgba(0, 0, 0, 0.12)";
      cardContainer.style.borderRadius = "16px";
      cardContainer.style.padding = "16px";
      cardContainer.style.display = "flex";
      cardContainer.style.alignItems = "center";
      cardContainer.style.gap = "16px";

      // Determine color and label based on value
      const visionColor = isYes ? "#6cc24a" : "#dc3545"; // green for yes, red for no
      const visionLabel = isYes
        ? "Accessible for low vision"
        : "No vision accessibility";

      // Icon container (green for yes, red for no)
      const statusIconContainer = document.createElement("div");
      statusIconContainer.style.display = "flex";
      statusIconContainer.style.alignItems = "center";
      statusIconContainer.style.justifyContent = "center";
      statusIconContainer.style.width = "48px";
      statusIconContainer.style.height = "48px";
      statusIconContainer.style.borderRadius = "16px";
      statusIconContainer.style.backgroundColor = hexToRgba(visionColor, 0.1); // 10% opacity
      statusIconContainer.style.flexShrink = "0";

      const statusIcon = document.createElement("span");
      statusIcon.className = "material-icons";
      statusIcon.style.fontSize = "24px";
      statusIcon.style.color = visionColor;
      statusIcon.textContent = "blind";
      statusIconContainer.appendChild(statusIcon);

      // Content wrapper
      const contentWrapper = document.createElement("div");
      contentWrapper.style.flex = "1";
      contentWrapper.style.minWidth = "0";

      const labelElement = document.createElement("div");
      labelElement.style.display = "block";
      labelElement.style.color = "rgba(0, 0, 0, 0.6)";
      labelElement.style.fontSize = "0.75rem";
      labelElement.style.fontWeight = "500";
      labelElement.style.textTransform = "uppercase";
      labelElement.style.letterSpacing = "0.5px";
      labelElement.style.marginBottom = "4px";
      labelElement.textContent = "Low Vision Accessibility";

      // Chip/badge with color and label (matching wheelchair style)
      const chip = document.createElement("div");
      chip.style.display = "inline-block";
      chip.style.padding = "0.375rem 0.75rem";
      chip.style.borderRadius = "1rem";
      chip.style.backgroundColor = visionColor;
      chip.style.color = "white";
      chip.style.fontSize = "0.9375rem";
      chip.style.fontWeight = "500";
      chip.style.lineHeight = "1.25";
      chip.style.fontFamily = "inherit";
      chip.textContent = visionLabel;

      contentWrapper.appendChild(labelElement);
      contentWrapper.appendChild(chip);

      cardContainer.appendChild(statusIconContainer);
      cardContainer.appendChild(contentWrapper);

      container.appendChild(header);
      container.appendChild(cardContainer);
      visionAccItem.appendChild(container);
      list.appendChild(visionAccItem);
    }
  }

  // Render other wheelchair tags if any exist (but skip the main wheelchair tag we already rendered)
  if (Object.keys(wheelchairTags).length > 0) {
    // Wheelchair description if available
    const wheelchairDesc =
      wheelchairTags["wheelchair:description"] ||
      wheelchairTags["Wheelchair:description"];
    if (wheelchairDesc) {
      const descItem = document.createElement("div");
      descItem.className = "list-group-item";
      descItem.style.padding = "0";

      const descContainer = document.createElement("div");
      descContainer.style.padding = "16px"; // p: 2
      descContainer.style.border = "1px solid";
      descContainer.style.borderColor = "rgba(0, 0, 0, 0.12)";
      descContainer.style.borderRadius = "16px";
      descContainer.style.marginTop = "12px"; // mt: 1.5

      const label = document.createElement("div");
      label.style.display = "block";
      label.style.color = "rgba(0, 0, 0, 0.6)";
      label.style.fontSize = "0.75rem";
      label.style.fontWeight = "500";
      label.style.textTransform = "uppercase";
      label.style.letterSpacing = "0.5px";
      label.style.marginBottom = "4px";
      label.textContent = "Details";

      const value = document.createElement("div");
      value.style.color = "rgba(0, 0, 0, 0.87)";
      value.style.fontSize = "0.875rem";
      value.style.lineHeight = "1.5";
      value.textContent = String(wheelchairDesc);

      descContainer.appendChild(label);
      descContainer.appendChild(value);
      descItem.appendChild(descContainer);
      list.appendChild(descItem);
    }

    // Other wheelchair:* tags (wheelchair:entrance, wheelchair:toilet, etc.)
    Object.entries(wheelchairTags).forEach(([key, value]) => {
      // Skip already rendered tags
      if (
        key.toLowerCase() === "wheelchair" ||
        key.toLowerCase() === "wheelchair:description"
      ) {
        return;
      }

      const accItem = document.createElement("div");
      accItem.className = "list-group-item";
      accItem.style.padding = "0";

      const itemContainer = document.createElement("div");
      itemContainer.style.padding = "16px";
      itemContainer.style.border = "1px solid";
      itemContainer.style.borderColor = "rgba(0, 0, 0, 0.12)";
      itemContainer.style.borderRadius = "16px";
      itemContainer.style.marginTop = "12px";

      // Format key nicely (wheelchair:entrance -> "Entrance")
      let displayKey = key
        .replace(/^wheelchair:/i, "")
        .replace(/[_:]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      // Format value
      const wheelchairLabels = {
        yes: "Wheelchair accessible",
        designated: "Designated accessible",
        limited: "Partially accessible",
        no: "Not accessible",
        unknown: "Not specified",
      };
      const displayValue =
        wheelchairLabels[String(value).toLowerCase()] || String(value);

      const label = document.createElement("div");
      label.style.display = "block";
      label.style.color = "rgba(0, 0, 0, 0.6)";
      label.style.fontSize = "0.75rem";
      label.style.fontWeight = "500";
      label.style.textTransform = "uppercase";
      label.style.letterSpacing = "0.5px";
      label.style.marginBottom = "4px";
      label.textContent = displayKey;

      const valueElement = document.createElement("div");
      valueElement.style.color = "rgba(0, 0, 0, 0.87)";
      valueElement.style.fontSize = "0.875rem";
      valueElement.style.fontWeight = "500";
      valueElement.textContent = displayValue;

      itemContainer.appendChild(label);
      itemContainer.appendChild(valueElement);
      accItem.appendChild(itemContainer);
      list.appendChild(accItem);
    });
  }

  // --- ADDRESS: Render formatted address with area and floor as secondary text (same chip style as Contact Information, icon = location_on) ---
  const formattedAddress = formatAddressFromTags(nTags);
  let formattedArea = formatAreaFromTags(nTags);

  // Clean up area text: remove "eldership" and simplify
  if (formattedArea) {
    formattedArea = formattedArea.replace(/\s*eldership\s*/gi, " ").trim();
    formattedArea = formattedArea.replace(/\s+/g, " ");
  }

  // Get floor/level information
  const levelValue = nTags.level || nTags.Level || null;
  const formattedLevel = formatLevel(levelValue);

  // Show Address section if we have address, area, or floor
  if (formattedAddress || formattedArea || formattedLevel) {
    const addressItem = document.createElement("div");
    addressItem.className = "list-group-item";
    addressItem.style.padding = "0";

    const container = document.createElement("div");
    container.style.padding = SECTION_PADDING;
    container.style.borderTop = "1px solid";
    container.style.borderColor = "rgba(0, 0, 0, 0.12)";

    // Layout: Icon on left, title and value on right (title aligned with icon, value below title)
    const layoutContainer = document.createElement("div");
    layoutContainer.style.display = "flex";
    layoutContainer.style.alignItems = "flex-start";
    layoutContainer.style.gap = "12px";

    // Icon container
    const iconContainer = document.createElement("div");
    iconContainer.style.display = "flex";
    iconContainer.style.alignItems = "center";
    iconContainer.style.justifyContent = "center";
    iconContainer.style.width = ICON_SIZE;
    iconContainer.style.height = ICON_SIZE;
    iconContainer.style.borderRadius = ICON_BORDER_RADIUS;
    iconContainer.style.backgroundColor = ICON_BACKGROUND_COLOR;
    iconContainer.style.color = ICON_SECONDARY_COLOR;
    iconContainer.style.flexShrink = "0";

    const icon = document.createElement("span");
    icon.className = "material-icons";
    icon.style.fontSize = "24px";
    icon.style.color = ICON_SECONDARY_COLOR;
    icon.textContent = "location_on";
    iconContainer.appendChild(icon);

    // Content wrapper (title and value)
    const contentWrapper = document.createElement("div");
    contentWrapper.style.flex = "1";
    contentWrapper.style.minWidth = "0";
    contentWrapper.style.display = "flex";
    contentWrapper.style.flexDirection = "column";
    contentWrapper.style.justifyContent = "center";

    // Title - aligned with icon center
    const title = document.createElement("h6");
    title.style.fontSize = "1.125rem";
    title.style.fontWeight = "600";
    title.style.color = "rgba(0, 0, 0, 0.87)";
    title.style.letterSpacing = "-0.01em";
    title.style.margin = "0 0 4px 0"; // Small margin below for value
    title.textContent = "Address";
    contentWrapper.appendChild(title);

    // Address value (if exists)
    if (formattedAddress) {
      const addressText = document.createElement("p");
      addressText.style.margin = "0";
      addressText.style.fontSize = "0.875rem";
      addressText.style.color = "rgba(0, 0, 0, 0.87)";
      addressText.style.lineHeight = "1.5";
      addressText.textContent = formattedAddress;
      contentWrapper.appendChild(addressText);
    }

    // Area value (if exists)
    if (formattedArea) {
      const areaText = document.createElement("p");
      areaText.style.margin = formattedAddress ? "4px 0 0 0" : "0";
      areaText.style.fontSize = "0.875rem";
      areaText.style.color = "rgba(0, 0, 0, 0.6)";
      areaText.style.lineHeight = "1.5";
      areaText.textContent = formattedArea;
      contentWrapper.appendChild(areaText);
    }

    // Floor value (if exists) - shown in lighter text
    if (formattedLevel) {
      const floorText = document.createElement("p");
      floorText.style.margin =
        formattedAddress || formattedArea ? "4px 0 0 0" : "0";
      floorText.style.fontSize = "0.875rem";
      floorText.style.color = "rgba(0, 0, 0, 0.6)";
      floorText.style.lineHeight = "1.5";
      floorText.textContent = formattedLevel; // e.g. "1st floor"
      contentWrapper.appendChild(floorText);
    }

    layoutContainer.appendChild(iconContainer);
    layoutContainer.appendChild(contentWrapper);
    container.appendChild(layoutContainer);
    addressItem.appendChild(container);
    list.appendChild(addressItem);
  }

  // --- BANKING SERVICES: ATM & cash-in deposits (clean grouped display) ---
  if (bankingServices && bankingServices.length > 0) {
    const bankingItem = document.createElement("div");
    bankingItem.className = "list-group-item";
    bankingItem.style.padding = "0";

    const container = document.createElement("div");
    container.style.padding = SECTION_PADDING;
    container.style.paddingBottom = SECTION_PADDING;
    container.style.borderTop = "1px solid";
    container.style.borderColor = "rgba(0, 0, 0, 0.12)";
    container.style.minHeight = "auto";

    const header = document.createElement("h6");
    header.style.fontSize = "1.125rem";
    header.style.fontWeight = "600";
    header.style.color = "rgba(0, 0, 0, 0.87)";
    header.style.letterSpacing = "-0.01em";
    header.style.margin = "0 0 12px 0";
    header.textContent = "Banking services";
    container.appendChild(header);

    const ul = document.createElement("ul");
    ul.style.margin = "0";
    ul.style.paddingLeft = "18px";
    ul.style.fontSize = "0.875rem";
    ul.style.color = "rgba(0, 0, 0, 0.87)";
    ul.style.lineHeight = "1.6";

    bankingServices.forEach((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      ul.appendChild(li);
    });

    container.appendChild(ul);
    bankingItem.appendChild(container);
    list.appendChild(bankingItem);
  }

  // --- FEATURES: Drive-through, Dispensing, etc. ---
  // Reuse the features array that was already created for header chips
  // Only show Features section if there are features to display
  if (features.length > 0) {
    const featuresItem = document.createElement("div");
    featuresItem.className = "list-group-item";
    featuresItem.style.padding = "0";

    const container = document.createElement("div");
    container.style.padding = SECTION_PADDING;
    container.style.paddingBottom = SECTION_PADDING; // Ensure consistent bottom padding
    container.style.borderTop = "1px solid";
    container.style.borderColor = "rgba(0, 0, 0, 0.12)";
    container.style.minHeight = "auto"; // No default height, let content determine

    // Header: "Features" (no icon, matching Opening Hours style)
    const header = document.createElement("h6");
    header.style.fontSize = "1.125rem";
    header.style.fontWeight = "600";
    header.style.color = "rgba(0, 0, 0, 0.87)";
    header.style.letterSpacing = "-0.01em";
    header.style.margin = "0 0 16px 0";
    header.textContent = "Features";
    container.appendChild(header);

    // Features chips (same styling as category chip via CSS vars)
    const featuresContainer = document.createElement("div");
    featuresContainer.className = "tag-chip-group";
    featuresContainer.style.marginBottom = "0"; // Ensure no extra margin at bottom

    features.forEach((feature) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";

      const icon = document.createElement("span");
      icon.className = "material-icons tag-chip__icon";
      icon.textContent = feature.icon;

      const label = document.createElement("span");
      label.textContent = feature.label;

      chip.appendChild(icon);
      chip.appendChild(label);
      featuresContainer.appendChild(chip);
    });

    container.appendChild(featuresContainer);
    featuresItem.appendChild(container);
    list.appendChild(featuresItem);
  }

  // --- AUDIENCE: Render male/female/unisex as a dedicated section (chips) ---
  if (audienceInfo) {
    const audienceItem = document.createElement("div");
    audienceItem.className = "list-group-item";
    audienceItem.style.padding = "0";

    const container = document.createElement("div");
    container.style.padding = SECTION_PADDING;
    container.style.paddingBottom = SECTION_PADDING;
    container.style.borderTop = "1px solid";
    container.style.borderColor = "rgba(0, 0, 0, 0.12)";
    container.style.minHeight = "auto";

    const header = document.createElement("h6");
    header.style.fontSize = "1.125rem";
    header.style.fontWeight = "600";
    header.style.color = "rgba(0, 0, 0, 0.87)";
    header.style.letterSpacing = "-0.01em";
    header.style.margin = "0 0 16px 0";
    header.textContent = "Audience";
    container.appendChild(header);

    const chipsContainer = document.createElement("div");
    chipsContainer.className = "tag-chip-group";
    chipsContainer.style.marginBottom = "0";

    const chip = document.createElement("span");
    chip.className = "tag-chip";

    const icon = document.createElement("span");
    icon.className = "material-icons tag-chip__icon";
    icon.textContent = audienceInfo.icon;

    const label = document.createElement("span");
    label.textContent = audienceInfo.label;

    chip.appendChild(icon);
    chip.appendChild(label);
    chipsContainer.appendChild(chip);

    container.appendChild(chipsContainer);
    audienceItem.appendChild(container);
    list.appendChild(audienceItem);
  }

  // --- CAPACITY: Combine Beds and Rooms into a single Capacity section ---
  const rooms = nTags.rooms || nTags.Rooms || null;
  const beds = nTags.beds || nTags.Beds || null;

  let capacityLabel = null;
  if (rooms && String(rooms).trim() && beds && String(beds).trim()) {
    capacityLabel = `${rooms} rooms • ${beds} beds`;
  } else if (rooms && String(rooms).trim()) {
    capacityLabel = `${rooms} rooms`;
  } else if (beds && String(beds).trim()) {
    capacityLabel = `${beds} beds`;
  }

  if (capacityLabel) {
    const capacityItem = document.createElement("div");
    capacityItem.className =
      "list-group-item d-flex justify-content-between align-items-start";
    capacityItem.innerHTML = `
      <div class="me-2">
        <h6 class="mb-1 fw-semibold">Capacity</h6>
        <p class="small mb-1">${capacityLabel}</p>
      </div>`;
    list.appendChild(capacityItem);
  }

  // --- CULTURAL HERITAGE REGISTRY: Handle ref:lt:kpd specially (same chip style as Contact Information) ---
  const heritageRef =
    nTags["ref:lt:kpd"] || nTags["Ref:Lt:Kpd"] || nTags["ref_lt_kpd"] || null;
  if (heritageRef && String(heritageRef).trim()) {
    const heritageItem = document.createElement("div");
    heritageItem.className = "list-group-item";
    heritageItem.style.padding = "0";

    const container = document.createElement("div");
    container.style.padding = SECTION_PADDING;
    container.style.borderTop = "1px solid";
    container.style.borderColor = "rgba(0, 0, 0, 0.12)";

    // Icon & title: same style as Contact Information, icon glyph = museum (heritage-related)
    const header = createDetailSectionHeader(
      "museum",
      "Cultural heritage registry"
    );
    container.appendChild(header);

    const contentWrapper = document.createElement("div");

    const valueText = document.createElement("p");
    valueText.style.margin = "0";
    valueText.style.fontSize = "0.875rem";
    valueText.style.color = "rgba(0, 0, 0, 0.87)";
    valueText.style.lineHeight = "1.5";
    valueText.textContent = `Register ID: ${String(heritageRef).trim()}`;
    contentWrapper.appendChild(valueText);

    container.appendChild(contentWrapper);
    heritageItem.appendChild(container);
    list.appendChild(heritageItem);
  }

  // --- STARS: Render stars rating similar to wheelchair section ---
  const starsValue = nTags.stars || nTags.Stars || null;
  if (starsValue) {
    const parsedStars = parseFloat(String(starsValue));
    if (!isNaN(parsedStars) && parsedStars > 0) {
      // Format: whole number if integer, otherwise one decimal
      const formattedValue = Number.isInteger(parsedStars)
        ? parsedStars.toString()
        : parsedStars.toFixed(1);
      const starText = parsedStars === 1 ? "Star" : "Stars";

      const starsItem = document.createElement("div");
      starsItem.className = "list-group-item";
      starsItem.style.padding = "0";

      // Main container with consistent padding
      const container = document.createElement("div");
      container.style.padding = SECTION_PADDING;
      container.style.borderTop = "1px solid";
      container.style.borderColor = "rgba(0, 0, 0, 0.12)"; // divider color

      // Header section matching wheelchair style
      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.gap = "12px"; // gap: 1.5
      header.style.marginBottom = "20px"; // mb: 2.5

      // Title matching typography (no icon)
      const title = document.createElement("h6");
      title.style.fontSize = "1.125rem"; // 18px
      title.style.fontWeight = "600";
      title.style.color = "rgba(0, 0, 0, 0.87)"; // text.primary
      title.style.letterSpacing = "-0.01em";
      title.style.margin = "0";
      title.textContent = "Stars";

      header.appendChild(title);

      // Card container for the stars display
      const cardContainer = document.createElement("div");
      cardContainer.style.border = "1px solid";
      cardContainer.style.borderColor = "rgba(0, 0, 0, 0.12)"; // divider
      cardContainer.style.borderRadius = "16px"; // borderRadius: 2
      cardContainer.style.padding = "16px"; // p: 2
      cardContainer.style.display = "flex";
      cardContainer.style.alignItems = "center";
      cardContainer.style.gap = "16px"; // gap: 2

      // Icon container for star (48x48 to match wheelchair section)
      const starIconContainer = document.createElement("div");
      starIconContainer.style.display = "flex";
      starIconContainer.style.alignItems = "center";
      starIconContainer.style.justifyContent = "center";
      starIconContainer.style.width = "48px";
      starIconContainer.style.height = "48px";
      starIconContainer.style.borderRadius = "16px"; // borderRadius: 2
      starIconContainer.style.backgroundColor = "rgba(255, 193, 7, 0.1)"; // MUI yellow with 10% opacity
      starIconContainer.style.flexShrink = "0";

      const starIcon = document.createElement("span");
      starIcon.textContent = "★";
      starIcon.style.color = "#ffc107"; // MUI yellow/amber
      starIcon.style.fontSize = "24px";
      starIcon.style.lineHeight = "1";
      starIcon.setAttribute("aria-hidden", "true");

      starIconContainer.appendChild(starIcon);

      // Content wrapper
      const contentWrapper = document.createElement("div");
      contentWrapper.style.flex = "1";
      contentWrapper.style.minWidth = "0";

      // Label
      const labelElement = document.createElement("div");
      labelElement.style.display = "block";
      labelElement.style.color = "rgba(0, 0, 0, 0.6)"; // text.secondary
      labelElement.style.fontSize = "0.75rem";
      labelElement.style.fontWeight = "500";
      labelElement.style.textTransform = "uppercase";
      labelElement.style.letterSpacing = "0.5px";
      labelElement.style.marginBottom = "4px"; // mb: 0.5
      labelElement.textContent = "Rating";

      // Value text
      const valueText = document.createElement("div");
      valueText.style.fontSize = "0.9375rem";
      valueText.style.fontWeight = "500";
      valueText.style.color = "rgba(0, 0, 0, 0.87)";
      valueText.textContent = `${formattedValue} ${starText}`;

      contentWrapper.appendChild(labelElement);
      contentWrapper.appendChild(valueText);

      cardContainer.appendChild(starIconContainer);
      cardContainer.appendChild(contentWrapper);

      container.appendChild(header);
      container.appendChild(cardContainer);
      starsItem.appendChild(container);
      list.appendChild(starsItem);
    }
  }

  // --- Collect Features (outdoor_seating, internet_access, etc.) ---
  const featureChips = [];

  // Outdoor seating
  const outdoorSeating =
    nTags.outdoor_seating || nTags["outdoor_seating"] || null;
  if (outdoorSeating) {
    const outdoorValue = String(outdoorSeating).toLowerCase().trim();
    if (outdoorValue === "yes" || outdoorValue === "true") {
      featureChips.push("Outdoor seating");
    }
  }

  // Internet access
  const internetAccess =
    nTags.internet_access || nTags["internet_access"] || null;
  const internetFee =
    nTags["internet_access:fee"] || nTags["internet_access_fee"] || null;

  if (internetAccess && String(internetAccess).toLowerCase().trim() !== "no") {
    const accessVal = String(internetAccess).toLowerCase().trim();
    const feeVal = internetFee ? String(internetFee).toLowerCase().trim() : "";

    const isWifi = [
      "wlan",
      "wifi",
      "wlan;customers",
      "wifi;customers",
    ].includes(accessVal);

    if (isWifi) {
      if (feeVal === "no") {
        featureChips.push("Free Wi-Fi");
      } else if (feeVal === "yes") {
        featureChips.push("Paid Wi-Fi");
      } else {
        featureChips.push("Wi-Fi available");
      }
    } else {
      if (feeVal === "no") {
        featureChips.push("Free internet");
      } else if (feeVal === "yes") {
        featureChips.push("Paid internet");
      } else {
        featureChips.push("Internet access");
      }
    }
  } else if (
    internetAccess &&
    String(internetAccess).toLowerCase().trim() === "no"
  ) {
    // Option: show negative info as subtle text (not a chip)
    // For now, we'll skip it to keep only positive features
  }

  // Second-hand goods - only show when "yes"
  const secondHand =
    nTags.second_hand || nTags["second_hand"] || nTags["second-hand"] || null;
  if (secondHand) {
    const secondHandValue = String(secondHand).toLowerCase().trim();
    if (secondHandValue === "yes" || secondHandValue === "true") {
      featureChips.push("Second-hand goods");
    }
    // Skip "no" values - don't show negative features
  }

  // Restrooms - show in Facilities when toilets=yes
  const toilets = nTags.toilets || nTags.Toilets || null;
  if (toilets) {
    const toiletsValue = String(toilets).toLowerCase().trim();
    if (toiletsValue === "yes" || toiletsValue === "true") {
      featureChips.push("Restrooms");
    }
    // Skip "no" values - don't show negative features
  }

  // Air conditioning - show both when explicitly yes and explicitly no
  // OSM: air_conditioning=yes|no (sometimes air-conditioning)
  const airCon =
    nTags.air_conditioning ||
    nTags["air_conditioning"] ||
    nTags["air-conditioning"] ||
    nTags.Air_conditioning ||
    null;
  if (airCon != null && String(airCon).trim() !== "") {
    const airConValue = String(airCon).toLowerCase().trim();
    if (
      airConValue === "yes" ||
      airConValue === "true" ||
      airConValue === "1"
    ) {
      featureChips.push("Air conditioning");
    } else if (
      airConValue === "no" ||
      airConValue === "false" ||
      airConValue === "0"
    ) {
      featureChips.push("No air conditioning");
    }
  }

  // Render Features section if we have any chips
  if (featureChips.length > 0) {
    const featuresItem = document.createElement("div");
    featuresItem.className = "list-group-item";
    featuresItem.style.padding = "0";
    featuresItem.style.marginBottom = "12px";
    featuresItem.style.border = "none"; // Remove Bootstrap list-group-item border

    const container = document.createElement("div");
    container.style.border = "1px solid rgba(0, 0, 0, 0.12)";
    container.style.borderRadius = "16px";
    container.style.padding = SECTION_PADDING;
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "12px";

    // Header with title
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "12px";
    header.style.marginBottom = "4px";

    const title = document.createElement("h6");
    title.style.fontSize = "1.125rem";
    title.style.fontWeight = "600";
    title.style.color = "rgba(0, 0, 0, 0.87)";
    title.style.letterSpacing = "-0.01em";
    title.style.margin = "0";
    title.textContent = "Facilities";

    header.appendChild(title);

    // Chips container (same styling as category chip via CSS vars)
    const chipsContainer = document.createElement("div");
    chipsContainer.className = "tag-chip-group";

    featureChips.forEach((chipLabel) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = chipLabel;

      chipsContainer.appendChild(chip);
    });

    container.appendChild(header);
    container.appendChild(chipsContainer);
    featuresItem.appendChild(container);
    list.appendChild(featuresItem);
  }

  // Helper function to format date from YYYY-MM-DD to "6 Nov 2025" format
  function formatDateForDisplay(dateStr) {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;

      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const day = date.getDate();
      const month = months[date.getMonth()];
      const year = date.getFullYear();

      return `${day} ${month} ${year}`;
    } catch {
      return null;
    }
  }

  // --- LAST CHECKED DATE: Extract and format check_date before generic tags loop ---
  // Exclude check_date:opening_hours as it's handled separately in OpeningHours component
  const checkDateKeys = [
    "check_date",
    "check date",
    "last_checked",
    "last checked",
    "last_updated",
    "last updated",
  ];
  let checkDateValue = null;
  let checkDateKey = null;

  for (const key of checkDateKeys) {
    // Skip check_date:opening_hours - it's displayed in OpeningHours component
    if (
      key === "check_date:opening_hours" ||
      key === "check_date_opening_hours"
    )
      continue;
    if (nTags[key]) {
      checkDateValue = formatDateForDisplay(String(nTags[key]));
      checkDateKey = key;
      if (checkDateValue) break;
    }
  }

  // --- COMMUNICATION TOWER: Simplify technical fields into user-friendly display ---
  const manMade =
    nTags.man_made || nTags["man_made"] || nTags["man-made"] || null;
  const towerType =
    nTags["tower:type"] || nTags["tower_type"] || nTags["tower-type"] || null;
  const towerConstruction =
    nTags["tower:construction"] ||
    nTags["tower_construction"] ||
    nTags["tower-construction"] ||
    null;
  const isCommunicationTower =
    (manMade && String(manMade).toLowerCase().trim() === "mast") ||
    (towerType && String(towerType).toLowerCase().trim() === "communication");

  if (isCommunicationTower) {
    // Collect communication network types
    const communicationNetworks = [];
    const commTags = [
      "communication:gsm",
      "communication:lte",
      "communication:mobile_phone",
      "communication:umts",
      "communication_gsm",
      "communication_lte",
      "communication_mobile_phone",
      "communication_umts",
    ];

    commTags.forEach((tag) => {
      const val = nTags[tag];
      if (val && String(val).toLowerCase().trim() === "yes") {
        const networkType = tag.includes("gsm")
          ? "2G"
          : tag.includes("umts")
          ? "3G"
          : tag.includes("lte")
          ? "4G"
          : tag.includes("mobile_phone") || tag.includes("mobile-phone")
          ? "Mobile"
          : null;
        if (networkType && !communicationNetworks.includes(networkType)) {
          communicationNetworks.push(networkType);
        }
      }
    });

    const towerItem = document.createElement("div");
    towerItem.className = "list-group-item";
    towerItem.style.padding = "0";

    const container = document.createElement("div");
    container.style.padding = SECTION_PADDING;
    container.style.paddingBottom = SECTION_PADDING;
    container.style.borderTop = "1px solid";
    container.style.borderColor = "rgba(0, 0, 0, 0.12)";
    container.style.minHeight = "auto";

    const header = document.createElement("h6");
    header.style.fontSize = "1.125rem";
    header.style.fontWeight = "600";
    header.style.color = "rgba(0, 0, 0, 0.87)";
    header.style.letterSpacing = "-0.01em";
    header.style.margin = "0 0 4px 0";
    header.textContent = "Type";
    container.appendChild(header);

    const typeP = document.createElement("p");
    typeP.className = "small mb-1";
    typeP.style.margin = "0";
    typeP.textContent = "Mobile communication tower";
    container.appendChild(typeP);

    // Add network support info if available
    if (communicationNetworks.length > 0) {
      const supportsP = document.createElement("p");
      supportsP.className = "small mb-1";
      supportsP.style.margin = "4px 0 0 0";
      supportsP.textContent = `Supports: ${communicationNetworks.join(
        " / "
      )} mobile networks`;
      container.appendChild(supportsP);
    }

    towerItem.appendChild(container);
    list.appendChild(towerItem);
  }

  // --- BRAND: Combine brand variants into a single localized display ---
  // Get UI language (default to browser language, fallback to 'en')
  const getUILanguage = () => {
    if (typeof window !== "undefined") {
      const htmlLang = document.documentElement.lang;
      if (htmlLang) return htmlLang.toLowerCase().split("-")[0]; // e.g., "en-US" -> "en"
      const navLang = navigator.language || navigator.userLanguage;
      if (navLang) return navLang.toLowerCase().split("-")[0];
    }
    return "en"; // Default fallback
  };

  const uiLang = getUILanguage();

  // Collect all brand tags (safety check for nTags)
  const brandTags = {};
  let brandWikidata = null;
  if (nTags && typeof nTags === "object") {
    Object.keys(nTags).forEach((key) => {
      const lk = key.toLowerCase();

      // Track technical Wikidata brand id separately (never display raw Q-IDs)
      if (
        lk === "brand:wikidata" ||
        lk === "brand_wikidata" ||
        lk === "brand-wikidata"
      ) {
        const v = nTags[key];
        if (v != null && String(v).trim()) brandWikidata = String(v).trim();
        return;
      }

      // Only accept human-readable brand text:
      // - `brand`
      // - language variants like `brand:en`, `brand:uk`, etc.
      if (lk === "brand") {
        brandTags.default = nTags[key];
        return;
      }

      const langMatch = lk.match(/^brand:([a-z]{2,3})$/i);
      if (langMatch) {
        const lang = langMatch[1].toLowerCase();
        brandTags[lang] = nTags[key];
      }
    });
  }

  // Normalize brand value by removing language prefixes (e.g., "en:TUI Group" -> "TUI Group")
  const normalizeBrand = (raw) => {
    if (!raw) return "";
    const trimmed = String(raw).trim();
    // Strip language prefix like "en:", "uk:", etc.
    return trimmed.replace(/^[a-z]{2}:/i, "");
  };

  // Raw Wikidata Q-IDs are technical metadata and must never be shown to users.
  // Note: this is intentionally strict so brands like "7-Eleven" are NOT hidden.
  const isWikidataQid = (v) => /^Q\d+$/i.test(String(v ?? "").trim());

  // Determine which brand value to show (prioritize UI language, then default, then any available)
  let brandValue = null;
  if (brandTags && typeof brandTags === "object" && !Array.isArray(brandTags)) {
    if (brandTags[uiLang]) {
      brandValue = brandTags[uiLang];
    } else if (brandTags.default || brandTags[""]) {
      brandValue = brandTags.default || brandTags[""];
    } else {
      // Fallback to any available brand value
      const availableBrands = Object.values(brandTags ?? {}).filter(Boolean);
      if (availableBrands.length > 0) {
        brandValue = availableBrands[0];
      }
    }
  }

  // Normalize the brand value to remove language prefixes
  if (brandValue) {
    brandValue = normalizeBrand(brandValue);
  }

  // If we only have `brand:wikidata=Q...`, optionally map it to a readable brand name.
  // If it's unknown, we hide the Brand row rather than showing the Q-ID.
  let uiBrandValue =
    brandValue && String(brandValue).trim() ? String(brandValue).trim() : null;

  // Hard suppression for specific known-bad `brand:wikidata` ids: hide Brand row completely.
  if (brandWikidata && SUPPRESSED_BRAND_WIKIDATA?.has?.(brandWikidata)) {
    uiBrandValue = null;
  }

  if (!uiBrandValue && brandWikidata && BRAND_WIKIDATA_MAP[brandWikidata]) {
    uiBrandValue = String(BRAND_WIKIDATA_MAP[brandWikidata]).trim();
  }

  // Defensive: if data import incorrectly stored a Q-ID in `brand`, never show it.
  // If we can map it, show the mapped name; otherwise hide the Brand row.
  if (uiBrandValue && isWikidataQid(uiBrandValue)) {
    uiBrandValue = BRAND_WIKIDATA_MAP[uiBrandValue]
      ? String(BRAND_WIKIDATA_MAP[uiBrandValue]).trim()
      : null;
  }

  // Show brand if we have a value and it doesn't match the place name
  // Brand is used internally for search/filter, but don't show if title already matches it
  if (uiBrandValue && String(uiBrandValue).trim()) {
    const brandValueTrimmed = String(uiBrandValue).trim();
    const placeName = titleText || "";
    const placeNameTrimmed = placeName.trim();

    // Compare brand with place name (case-insensitive)
    // If they match, don't show brand (it's redundant)
    const brandMatchesName =
      placeNameTrimmed &&
      brandValueTrimmed.toLowerCase() === placeNameTrimmed.toLowerCase();

    if (!brandMatchesName) {
      const brandItem = document.createElement("div");
      brandItem.className = "list-group-item";
      brandItem.style.padding = "0";

      const container = document.createElement("div");
      container.style.padding = SECTION_PADDING;
      container.style.paddingBottom = SECTION_PADDING;
      container.style.borderTop = "1px solid";
      container.style.borderColor = "rgba(0, 0, 0, 0.12)";
      container.style.minHeight = "auto";

      const header = document.createElement("h6");
      header.style.fontSize = "1.125rem";
      header.style.fontWeight = "600";
      header.style.color = "rgba(0, 0, 0, 0.87)";
      header.style.letterSpacing = "-0.01em";
      header.style.margin = "0 0 4px 0";
      header.textContent = "Brand";
      container.appendChild(header);

      const brandP = document.createElement("p");
      brandP.className = "small mb-1";
      brandP.style.margin = "0";
      brandP.textContent = brandValueTrimmed;
      container.appendChild(brandP);

      brandItem.appendChild(container);
      list.appendChild(brandItem);
    }
  }

  // --- Render basic tags (address, amenity, etc.) ---
  Object.entries(nTags).forEach(([key, value]) => {
    const lk = key.trim().toLowerCase();

    // Skip check_date - will be rendered at the bottom
    // Also skip check_date:opening_hours - it's displayed in OpeningHours component
    // Handle various formats: check_date:opening_hours, check_date_opening_hours, check-date:opening-hours
    // Check both lowercase key (lk) and original key for maximum coverage
    if (
      checkDateKeys.includes(lk) ||
      lk === "check_date:opening_hours" ||
      lk === "check_date_opening_hours" ||
      lk === "check-date:opening-hours" ||
      /^check[_-]?date[:_-]opening[_-]hours$/i.test(key) ||
      /^check[_-]?date[:_-]opening[_-]hours$/i.test(lk)
    )
      return;

    const isOpeningHours = /^opening_hours/i.test(key);
    if (isOpeningHours) return; // Skip opening_hours - already rendered above

    // Skip wheelchair/accessibility tags - already rendered in Accessibility section
    const isWheelchair = /^wheelchair/i.test(key);
    if (isWheelchair) return;

    // Skip user_reported_accessibility fields - already rendered in Accessibility section
    if (
      lk === "user_reported_accessibility" ||
      lk === "user_reported_accessibility_comment" ||
      lk === "accessibility_status"
    ) {
      return;
    }

    // Skip toilets:wheelchair - already rendered in Accessibility section
    if (
      lk === "toilets:wheelchair" ||
      lk === "toilets_wheelchair" ||
      lk === "toilets-wheelchair" ||
      lk === "wheelchair:toilets" ||
      lk === "wheelchair_toilets" ||
      lk === "wheelchair-toilets" ||
      /^toilets[:_-]wheelchair$/i.test(key) ||
      /^wheelchair[:_-]toilets$/i.test(key)
    )
      return;
    const lv = String(value).trim().toLowerCase();

    // 🔒 1) Never show the bare "contact" tag at all
    if (lk === "contact") return;

    // 🔒 2) Skip all contact-related fields (we handle them in the Contact block)
    const isWebsiteVariant =
      /^(website|url)(?::\d+)?$/i.test(key) || /^contact:website$/i.test(key);
    if (isWebsiteVariant) return;

    const isPhoneVariant =
      /^(phone|contact:phone|contact:mobile|mobile|contact:fax)$/i.test(key) ||
      /^phone:(mobile|landline|fax|.*)$/i.test(key) ||
      /^phone_(mobile|landline|fax|.*)$/i.test(key) ||
      /^phone-(mobile|landline|fax|.*)$/i.test(key);
    if (isPhoneVariant) return;

    const isEmailVariant = /^(email|contact:email)$/i.test(key);
    if (isEmailVariant) return;

    if (/^contact:/i.test(key)) return; // any other contact:* tags

    // Skip "type" entirely
    if (lk === "type") return;

    // Skip roof levels (technical building metadata like roof:levels=2)
    // Prevents showing "Roof Levels" in the place details overview.
    if (
      /^roof[:_-]?levels([:_-]|$)/i.test(lk) ||
      /^roof[:_-]?levels([:_-]|$)/i.test(key)
    )
      return;

    // Skip "osm_key" and "osm_type" - only useful for mappers
    if (lk === "osm_key" || lk === "osm_type" || key === "Osm Key") return;

    // Skip outdoor_seating and internet_access - already rendered as Features chips
    if (lk === "outdoor_seating" || lk === "outdoor seating") return;
    if (
      lk === "internet_access" ||
      lk === "internet_access:fee" ||
      lk === "internet_access_fee"
    )
      return;

    // Skip air conditioning tag - rendered in Facilities card (including explicit "no")
    if (
      lk === "air_conditioning" ||
      lk === "air-conditioning" ||
      key === "air_conditioning" ||
      key === "air-conditioning"
    ) {
      return;
    }

    // Skip indoor_seating - will be handled in Features section as "Indoor seating available" (only when yes)
    if (
      lk === "indoor_seating" ||
      lk === "indoor-seating" ||
      key === "indoor_seating" ||
      key === "indoor-seating"
    ) {
      return;
    }

    // Skip beds and rooms - already rendered as Capacity section
    if (lk === "beds" || lk === "rooms") return;

    // Skip stars - already rendered as dedicated Stars section
    if (lk === "stars") return;

    // Skip ref:lt:kpd - already rendered as Cultural heritage registry
    if (lk === "ref:lt:kpd" || lk === "ref_lt_kpd") return;

    // Skip all other ref:* tags - too technical for regular users
    if (lk.startsWith("ref:") || key.startsWith("ref:")) return;

    // Skip bare "ref" tag (mapping metadata like "Ref: 18")
    if (lk === "ref") return;

    // Skip network:wikidata (mapping metadata like "Network Wikidata: Q3008464")
    if (lk === "network:wikidata" || key === "network:wikidata") return;

    // Skip Facebook/Instagram/social media tags - already handled in Social Media section
    if (
      lk === "facebook" ||
      lk === "instagram" ||
      lk === "twitter" ||
      lk === "linkedin" ||
      lk === "youtube" ||
      lk === "tiktok" ||
      /^contact:(facebook|instagram|twitter|linkedin|youtube|tiktok)$/i.test(
        key
      )
    ) {
      return;
    }

    // Skip address parts – we already show a formatted address above
    const isAddressField =
      /^addr:(street|housenumber|city|postcode|country_code|town|suburb|country)$/i.test(
        key
      ) ||
      /^(postcode|housenumber|street|countrycode|city)$/i.test(lk) ||
      (lk === "city" && (nTags["addr:city"] || nTags["addr_city"]));
    if (isAddressField) return;

    // Skip area fields – already rendered as "Area"
    const isAreaField = /^(state|county|district|locality)$/i.test(lk);
    if (isAreaField) return;

    // Skip name (already rendered elsewhere)
    if (lk === "name") return;

    // Skip embassy/diplomatic tags from generic rendering — they are treated as category (header chip).
    // Prevents rows like "Embassy: Yes" or "Diplomatic: Embassy".
    if (lk === "embassy" || lk === "diplomatic") return;

    // Skip barber=yes/no/only from generic rendering — it is rendered as a friendly "Barber services" chip instead.
    if (lk === "barber") return;

    // Skip audience tags (male/female/unisex) from generic rendering — rendered as a friendly chip instead.
    if (lk === "male" || lk === "female" || lk === "unisex") return;

    // Skip level (already rendered in Address section)
    if (lk === "level") return;

    // Skip toilets - will be handled in Features section (only show when "yes")
    if (lk === "toilets" || key === "toilets") {
      const toiletsValue = String(value).toLowerCase().trim();
      // Skip "no" values - don't show negative features
      if (toiletsValue === "no" || toiletsValue === "false") {
        return;
      }
      // If "yes", it will be handled in Features section, so skip here too
      return;
    }

    // Skip dispensing - will be handled in Features section
    if (lk === "dispensing") return;

    // Skip drive_through - will be handled in Features section (only show if yes and relevant)
    if (lk === "drive_through" || lk === "drive-through") return;

    // Skip ATM tag - will be handled in Banking services section (only show when value is known)
    if (lk === "atm") return;

    // Skip cash_in tag - will be handled in Banking services section
    if (lk === "cash_in" || lk === "cash-in" || lk === "cash in") return;

    // Skip fee tag - will be handled in Features section as "Free entry" or "Paid entry"
    if (lk === "fee" || key === "fee") {
      return;
    }

    // Skip payment tags - will be handled in Features section as a single chip
    if (
      lk === "payment:credit_cards" ||
      lk === "payment:debit_cards" ||
      lk === "payment:cash" ||
      key === "payment:credit_cards" ||
      key === "payment:debit_cards" ||
      key === "payment:cash"
    ) {
      return;
    }

    // Skip smoking tags - will be handled in Features section
    if (
      lk === "smoking" ||
      lk === "smoking:yes" ||
      lk === "smoking:no" ||
      lk === "smoking:dedicated" ||
      key === "smoking" ||
      key === "smoking:yes" ||
      key === "smoking:no" ||
      key === "smoking:dedicated"
    ) {
      return;
    }

    // Skip diet:vegetarian / vegetarian tags - shown as a Feature chip when relevant
    if (
      /^diet[:_-]vegetarian$/i.test(lk) ||
      /^diet[:_-]vegetarian$/i.test(key) ||
      lk === "vegetarian" ||
      key === "vegetarian"
    ) {
      return;
    }

    // Skip diet:vegan / vegan tags - shown as a Feature chip when relevant
    if (
      /^diet[:_-]vegan$/i.test(lk) ||
      /^diet[:_-]vegan$/i.test(key) ||
      lk === "vegan" ||
      key === "vegan"
    ) {
      return;
    }

    // Skip second_hand - will be handled in Features section (only show when "yes")
    // Hide when "no" as it's not useful for accessibility
    if (
      lk === "second_hand" ||
      lk === "second-hand" ||
      key === "second_hand" ||
      key === "second-hand"
    ) {
      const secondHandValue = String(value).toLowerCase().trim();
      // Skip "no" values - don't show negative features
      if (secondHandValue === "no" || secondHandValue === "false") {
        return;
      }
      // If "yes", it will be handled in Features section, so skip here too
      return;
    }

    // Skip store tag - not useful for users
    if (lk === "store" || key === "store") {
      return;
    }

    // Skip brand tags - will be handled in Brand section (single localized display)
    if (
      lk === "brand" ||
      lk.startsWith("brand:") ||
      key === "brand" ||
      key.startsWith("brand:")
    ) {
      return;
    }

    // Skip localized branch variants (e.g. branch:lt, branch:pl) — keep only the base "branch" field.
    // This prevents rows like "Branch Lt" / "Branch Pl" from showing in Overview.
    if (
      /^branch[:_][a-z]{2,}(-[a-z0-9]+)?$/i.test(lk) ||
      /^branch[:_][a-z]{2,}(-[a-z0-9]+)?$/i.test(key)
    ) {
      return;
    }

    // Skip official name tags - technical/legal OSM data, not needed in main UI
    if (
      lk === "official_name" ||
      lk.startsWith("official_name:") ||
      key === "official_name" ||
      key.startsWith("official_name:") ||
      lk === "official-name" ||
      lk.startsWith("official-name:") ||
      key === "official-name" ||
      key.startsWith("official-name:")
    ) {
      return;
    }

    // Skip technical OSM fields - not useful for users
    // osm_value: OSM tagging info (e.g., landuse=residential, highway=residential) - internal only
    if (lk === "osm_value" || key === "osm_value") {
      return;
    }

    // Skip target/target:* tags - typically internal/technical (e.g. target=lt) and not useful in the UI.
    if (
      lk === "target" ||
      lk.startsWith("target:") ||
      lk.startsWith("target_") ||
      key === "target"
    ) {
      return;
    }

    // extent: bounding box coordinates - purely technical, only used for map zooming
    if (
      lk === "extent" ||
      key === "extent" ||
      lk === "boundingbox" ||
      key === "boundingbox"
    ) {
      return;
    }

    // Skip technical communication tower fields - handled in special Communication Tower section
    if (
      lk === "man_made" ||
      lk === "man-made" ||
      key === "man_made" ||
      key === "man-made"
    ) {
      // Only skip if it's a communication tower (mast), otherwise show it
      const manMadeVal = String(value).toLowerCase().trim();
      if (manMadeVal === "mast") return;
    }
    if (
      lk === "tower:type" ||
      lk === "tower_type" ||
      lk === "tower-type" ||
      key === "tower:type" ||
      key === "tower_type" ||
      key === "tower-type"
    ) {
      return;
    }
    if (
      lk === "tower:construction" ||
      lk === "tower_construction" ||
      lk === "tower-construction" ||
      key === "tower:construction" ||
      key === "tower_construction" ||
      key === "tower-construction"
    ) {
      return;
    }

    // Skip individual communication tags (gsm, lte, umts, mobile_phone) - they're combined in Communication Tower section
    if (
      /^communication:(gsm|lte|umts|mobile_phone|mobile-phone)$/i.test(key) ||
      /^communication_(gsm|lte|umts|mobile_phone|mobile_phone)$/i.test(key)
    ) {
      const commVal = String(value).toLowerCase().trim();
      if (commVal === "yes") return; // Only skip "yes" values, show others if any
    }

    // Height: only show if it's a number and seems useful (not for communication towers)
    if (lk === "height" || key === "height") {
      // Skip height for communication towers (too technical)
      const manMadeVal =
        nTags.man_made || nTags["man_made"] || nTags["man-made"] || null;
      const towerTypeVal =
        nTags["tower:type"] ||
        nTags["tower_type"] ||
        nTags["tower-type"] ||
        null;
      const isCommTower =
        (manMadeVal && String(manMadeVal).toLowerCase().trim() === "mast") ||
        (towerTypeVal &&
          String(towerTypeVal).toLowerCase().trim() === "communication");
      if (isCommTower) return;

      // For other places, format height nicely if it's a number
      const heightNum = parseFloat(value);
      if (!isNaN(heightNum) && heightNum > 0) {
        // Format as "Height: ~18 m" and continue to render it
        // We'll handle the formatting in the display section below
      } else {
        return; // Skip non-numeric height values
      }
    }

    // Skip amenity=yes (useless)
    if (lk === "amenity" && lv === "yes") return;

    // Skip access=yes (default for most places, not useful to show)
    // Only show access info when it's restricted (private, customers, etc.)
    if (lk === "access" && (lv === "yes" || lv === "true")) return;

    // Skip duplicated values equal to the amenity value
    const amenityValue = nTags.amenity
      ? String(nTags.amenity).toLowerCase()
      : null;
    if (lk !== "amenity" && amenityValue && lv === amenityValue) return;

    const containsAltName = /alt\s*name/i.test(key);
    const containsLocalizedVariants =
      /^(name|alt_name|short_name|display_name):/i.test(key);
    const isCountryKey = /^country$/i.test(key);
    const isWikiDataKey = /^wikidata(?::[a-z-]+)?$/i.test(key);

    // Skip technical OSM fields (brand:wikidata, brand:wikipedia, operator:wikidata, operator:wikipedia)
    const isTechnicalField =
      /^(brand|operator):(wikidata|wikipedia)$/i.test(key) ||
      /^(brand|operator)_(wikidata|wikipedia)$/i.test(key);
    if (isTechnicalField) return;

    const isExcluded =
      EXCLUDED_PROPS.has(key) ||
      containsAltName ||
      containsLocalizedVariants ||
      isCountryKey ||
      isWikiDataKey;

    if (isExcluded) return;

    const item = document.createElement("div");
    item.className =
      "list-group-item d-flex justify-content-between align-items-start";

    // Skip raw image URLs – we use Photos block instead
    if (lk === "image") return;

    // Skip mapillary - will be shown in Photos section
    if (lk === "mapillary") return;

    // Skip subject:wikidata - technical ID, not useful for users
    if (lk === "subject:wikidata") return;

    // Handle subject:wikipedia - show as "About the subject"
    if (lk === "subject:wikipedia") {
      const spec = value;
      const m = String(spec).match(/^([a-z-]+)\s*:\s*(.+)$/i);
      if (m) {
        const lang = m[1];
        const title = m[2].replace(/\s/g, "_");
        const href = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(
          title
        )}`;
        const displayTitle = m[2].replace(/_/g, " ");

        // Use consistent structure with other sections
        item.className = "list-group-item";
        item.style.padding = "0";

        const container = document.createElement("div");
        container.style.padding = SECTION_PADDING;
        container.style.paddingBottom = SECTION_PADDING;
        container.style.borderTop = "1px solid";
        container.style.borderColor = "rgba(0, 0, 0, 0.12)";
        container.style.minHeight = "60px"; // Minimum height for consistent spacing

        container.innerHTML = `
        <h6 style="font-size: 1.125rem; font-weight: 600; color: rgba(0, 0, 0, 0.87); letter-spacing: -0.01em; margin: 0 0 4px 0;">About the subject</h6>
        <p class="small mb-1" style="margin: 0;"><a href="${href}" target="_blank" rel="noopener">${displayTitle} (Wikipedia)</a></p>
      `;

        item.appendChild(container);
        list.appendChild(item);
        return;
      }
    }

    // Combine historic=memorial + memorial=* into one readable line
    if (lk === "historic" && lv === "memorial") {
      const memorialType = nTags.memorial || nTags.Memorial || null;
      const memorialLabel = (() => {
        if (!memorialType) return "Memorial";
        const formattedType = String(memorialType)
          .replace(/[_:]/g, " ")
          .split(" ")
          .map((word, index) => {
            if (index === 0) {
              return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            return word.toLowerCase();
          })
          .join(" ");
        return `Memorial – ${formattedType}`;
      })();

      // Use consistent structure with other sections (padding + min height)
      item.className = "list-group-item";
      item.style.padding = "0";

      const container = document.createElement("div");
      container.style.padding = SECTION_PADDING;
      container.style.paddingBottom = SECTION_PADDING;
      container.style.borderTop = "1px solid";
      container.style.borderColor = "rgba(0, 0, 0, 0.12)";
      container.style.minHeight = "60px"; // Minimum height for consistent spacing

      container.innerHTML = `
      <h6 style="font-size: 1.125rem; font-weight: 600; color: rgba(0, 0, 0, 0.87); letter-spacing: -0.01em; margin: 0 0 4px 0;">Type</h6>
      <p style="font-size: 0.875rem; color: rgba(0, 0, 0, 0.87); margin: 0;">${memorialLabel}</p>
    `;

      item.appendChild(container);
      list.appendChild(item);
      return;
    }

    // Skip memorial=* if historic=memorial exists (already combined above)
    if (
      lk === "memorial" &&
      nTags.historic &&
      String(nTags.historic).toLowerCase().trim() === "memorial"
    ) {
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

        // Use consistent structure with other sections
        item.className = "list-group-item";
        item.style.padding = "0";

        const container = document.createElement("div");
        container.style.padding = SECTION_PADDING;
        container.style.paddingBottom = SECTION_PADDING;
        container.style.borderTop = "1px solid";
        container.style.borderColor = "rgba(0, 0, 0, 0.12)";
        container.style.minHeight = "60px"; // Minimum height for consistent spacing

        container.innerHTML = `
        <h6 style="font-size: 1.125rem; font-weight: 600; color: rgba(0, 0, 0, 0.87); letter-spacing: -0.01em; margin: 0 0 4px 0;">Wikipedia</h6>
        <p class="small mb-1" style="margin: 0;"><a href="${href}" target="_blank" rel="noopener">Wikipedia (${lang})</a></p>
      `;

        item.appendChild(container);
        list.appendChild(item);
        return;
      }
    }

    // Handle source:ref - show as a clean "Network" section with a single, descriptive link
    // (avoid "Network Network" where only the second word is clickable)
    if (
      lk === "source:ref" ||
      lk === "source_ref" ||
      key === "source:ref" ||
      key === "source_ref"
    ) {
      const urlValue = String(value).trim();
      if (urlValue) {
        // Clean the URL using cleanUrl function
        const cleanedUrl = cleanUrl(urlValue);
        if (cleanedUrl) {
          // Use consistent structure with other sections
          item.className = "list-group-item";
          item.style.padding = "0";

          const container = document.createElement("div");
          container.style.padding = SECTION_PADDING;
          container.style.paddingBottom = SECTION_PADDING; // Ensure consistent bottom padding
          container.style.borderTop = "1px solid";
          container.style.borderColor = "rgba(0, 0, 0, 0.12)";
          container.style.minHeight = "auto"; // No default height, let content determine

          container.innerHTML = `
          <div>
            <h6 style="font-size: 1.125rem; font-weight: 600; color: rgba(0, 0, 0, 0.87); letter-spacing: -0.01em; margin: 0 0 8px 0;">Network</h6>
            <p style="font-size: 0.875rem; color: rgba(0, 0, 0, 0.87); margin: 0;">
              <a
                href="${cleanedUrl}"
                target="_blank"
                rel="noopener nofollow"
                aria-label="View network (opens in a new tab)"
                style="color: var(--bs-primary); text-decoration: none; display: inline-block;"
              >View network</a>
            </p>
          </div>`;

          item.appendChild(container);
          list.appendChild(item);
          return;
        }
      }
      // If URL cleaning failed, skip this tag
      return;
    }

    // Default label/value
    let displayKey;
    if (key === "display_name") {
      displayKey = "Address";
    } else if (lk === "amenity") {
      displayKey = "Category"; // Rename "Amenity" to "Category"
    } else if (lk === "height") {
      displayKey = "Height"; // Simple label for height
    } else if (lk === "building") {
      displayKey = "Building";
    } else {
      displayKey = key
        .replace(/^Addr_?/i, "")
        .replace(/[_:]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // Format value: convert snake_case to Title Case (e.g., "post_box" -> "Post box")
    // First word capitalized, subsequent words lowercase (as per user example)
    const formatValueForDisplay = (val) => {
      return String(val)
        .replace(/[_:]/g, " ") // Replace underscores and colons with spaces
        .split(" ")
        .map((word, index) => {
          if (!word) return "";
          const lowerWord = word.toLowerCase();
          // Capitalize first letter of first word only
          if (index === 0) {
            return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
          }
          // Keep subsequent words lowercase
          return lowerWord;
        })
        .filter((word) => word)
        .join(" ");
    };

    // Helper to detect and clean URLs in values
    const cleanUrlInValue = (val) => {
      const trimmed = String(val).trim();
      // If it looks like a URL (starts with http/https or contains common URL patterns), clean it
      if (/^(https?|www\.|[\w.-]+\.(com|org|net|io|edu|gov))/i.test(trimmed)) {
        const cleaned = cleanUrl(trimmed);
        return cleaned || trimmed; // Return cleaned URL or original if cleaning failed
      }
      return trimmed;
    };

    // Special formatting for building=yes and height field
    let displayValue;
    if (lk === "building" || key === "building") {
      const s = String(value).trim().toLowerCase();
      displayValue =
        s === "yes" || s === "true" || s === "1"
          ? "Unspecified"
          : formatValueForDisplay(String(value));
    } else if (lk === "branch" || key === "branch") {
      // Branch can contain multiple language values in a single string (e.g. "Vilnius / Wilno").
      // Keep only the first/primary value to effectively show an English version.
      const raw = String(value ?? "").trim();
      const primary =
        raw
          .split(/[\/|;]/)
          .map((p) => p.trim())
          .filter(Boolean)[0] || raw;
      displayValue = formatValueForDisplay(primary);
    } else if (lk === "height" || key === "height") {
      const heightNum = parseFloat(value);
      if (!isNaN(heightNum) && heightNum > 0) {
        displayValue = `~${heightNum} m`;
      } else {
        displayValue = formatValueForDisplay(String(value));
      }
    } else {
      displayValue = String(value)
        .split(";")
        .map((part) => part.trim())
        .filter((part) => part)
        .map((part) => {
          // Clean URLs before formatting
          const cleaned = cleanUrlInValue(part);
          return formatValueForDisplay(cleaned);
        })
        .join(" • ");
    }

    // 🧨 Final safety net:
    // If this generic row would have the label "Contact", skip it completely.
    // This prevents "Contact / Yes" (or any other value) from showing
    // while keeping the dedicated Contact section (website/phone/email).
    if (displayKey.trim() === "Contact") {
      return;
    }

    // Check if this is a place type that should be styled like Wheelchair Access (amenity, tourism, shop, leisure, healthcare, office, historic, sport)
    // SKIP place types - they're now shown in the header as a category chip
    const isPlaceType = [
      "amenity",
      "tourism",
      "shop",
      "leisure",
      "healthcare",
      "office",
      "historic",
      "sport",
    ].includes(lk);

    if (isPlaceType) {
      // Skip rendering place type as a separate section - it's shown in the header as a category chip
      return;
    } else {
      // Default styling for other items (like Cuisine, Brand, etc.)
      item.className = "list-group-item";
      item.style.padding = "0";

      const container = document.createElement("div");
      container.style.padding = SECTION_PADDING;
      container.style.borderTop = "1px solid";
      container.style.borderColor = "rgba(0, 0, 0, 0.12)";
      container.style.minHeight = "60px"; // Minimum height for consistent spacing

      // Helper function to get icon for specific fields
      function getIconForField(fieldName) {
        const fieldIcons = {
          Cuisine: "restaurant_menu",
          Brand: "store",
          Operator: "business",
          Phone: "phone",
          Email: "email",
          Website: "language",
          "Opening Hours": "access_time",
          Description: "description",
          Name: "label",
        };
        return fieldIcons[fieldName] || null;
      }

      const fieldIcon = getIconForField(displayKey);

      // If we have an icon for this field, use the same layout as Address/Category
      if (fieldIcon) {
        // Layout: Icon on left, title and value on right (title aligned with icon, value below title)
        const layoutContainer = document.createElement("div");
        layoutContainer.style.display = "flex";
        layoutContainer.style.alignItems = "flex-start";
        layoutContainer.style.gap = "12px";

        // Icon container
        const iconContainer = document.createElement("div");
        iconContainer.style.display = "flex";
        iconContainer.style.alignItems = "center";
        iconContainer.style.justifyContent = "center";
        iconContainer.style.width = ICON_SIZE;
        iconContainer.style.height = ICON_SIZE;
        iconContainer.style.borderRadius = ICON_BORDER_RADIUS;
        iconContainer.style.backgroundColor = ICON_BACKGROUND_COLOR;
        iconContainer.style.color = ICON_SECONDARY_COLOR;
        iconContainer.style.flexShrink = "0";

        const icon = document.createElement("span");
        icon.className = "material-icons";
        icon.style.fontSize = "24px";
        icon.style.color = ICON_SECONDARY_COLOR;
        icon.textContent = fieldIcon;
        iconContainer.appendChild(icon);

        // Content wrapper (title and value)
        const contentWrapper = document.createElement("div");
        contentWrapper.style.flex = "1";
        contentWrapper.style.minWidth = "0";
        contentWrapper.style.display = "flex";
        contentWrapper.style.flexDirection = "column";
        contentWrapper.style.justifyContent = "center";

        // Title - aligned with icon center
        const title = document.createElement("h6");
        title.style.fontSize = "1.125rem";
        title.style.fontWeight = "600";
        title.style.color = "rgba(0, 0, 0, 0.87)";
        title.style.letterSpacing = "-0.01em";
        title.style.margin = "0 0 4px 0"; // Small margin below for value
        title.textContent = displayKey;
        contentWrapper.appendChild(title);

        // Value text
        const valueText = document.createElement("p");
        valueText.style.margin = "0";
        valueText.style.fontSize = "0.875rem";
        valueText.style.color = "rgba(0, 0, 0, 0.87)";
        valueText.style.lineHeight = "1.5";
        valueText.textContent = displayValue;
        contentWrapper.appendChild(valueText);

        layoutContainer.appendChild(iconContainer);
        layoutContainer.appendChild(contentWrapper);
        container.appendChild(layoutContainer);
      } else {
        // No icon - use simple layout without icon
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.justifyContent = "center";

        const contentWrapper = document.createElement("div");

        // Title
        const title = document.createElement("h6");
        title.style.fontSize = "1.125rem";
        title.style.fontWeight = "600";
        title.style.color = "rgba(0, 0, 0, 0.87)";
        title.style.letterSpacing = "-0.01em";
        title.style.margin = "0 0 8px 0"; // Increased margin-bottom for better spacing
        title.textContent = displayKey;
        contentWrapper.appendChild(title);

        // Value
        const valueText = document.createElement("p");
        valueText.style.margin = "0";
        valueText.style.fontSize = "0.875rem";
        valueText.style.color = "rgba(0, 0, 0, 0.87)";
        valueText.style.lineHeight = "1.5";
        valueText.textContent = displayValue;
        contentWrapper.appendChild(valueText);

        container.appendChild(contentWrapper);
      }

      item.appendChild(container);
    }

    list.appendChild(item);
  });

  // --- DISPENSING: Show prescription medicine availability for pharmacies/clinics ---
  // Note: Dispensing is now shown in Features section if it's "yes" for pharmacies
  // This section is kept for backwards compatibility but should not render if already in features
  const dispensingValueForSection =
    nTags.dispensing || nTags.Dispensing || null;
  const amenityValue = (nTags.amenity || nTags.Amenity || "").toLowerCase();
  const healthcareValue = (
    nTags.healthcare ||
    nTags.Healthcare ||
    ""
  ).toLowerCase();

  // Only show dispensing for pharmacies and healthcare facilities
  // But skip if it's already in the features array (which means it's "yes" for pharmacy)
  const isRelevantForDispensing =
    amenityValue === "pharmacy" ||
    healthcareValue === "pharmacy" ||
    healthcareValue === "clinic" ||
    amenityValue === "clinic";

  // Check if dispensing is already in features (means it's "yes" for pharmacy, so show in Features section instead)
  const isDispensingInFeatures = features.some((f) => f.type === "dispensing");

  if (
    dispensingValueForSection &&
    isRelevantForDispensing &&
    !isDispensingInFeatures
  ) {
    const dispensingItem = document.createElement("div");
    dispensingItem.className = "list-group-item";
    dispensingItem.style.padding = "0";

    const container = document.createElement("div");
    container.style.padding = SECTION_PADDING;
    container.style.borderTop = "1px solid";
    container.style.borderColor = "rgba(0, 0, 0, 0.12)";

    // Layout: Icon on left, title and badge on right
    const layoutContainer = document.createElement("div");
    layoutContainer.style.display = "flex";
    layoutContainer.style.alignItems = "flex-start";
    layoutContainer.style.gap = "12px";

    // Icon container with medical icon
    const iconContainer = document.createElement("div");
    iconContainer.style.display = "flex";
    iconContainer.style.alignItems = "center";
    iconContainer.style.justifyContent = "center";
    iconContainer.style.width = ICON_SIZE;
    iconContainer.style.height = ICON_SIZE;
    iconContainer.style.borderRadius = ICON_BORDER_RADIUS;
    iconContainer.style.backgroundColor = ICON_BACKGROUND_COLOR;
    iconContainer.style.color = ICON_SECONDARY_COLOR;
    iconContainer.style.flexShrink = "0";

    const icon = document.createElement("span");
    icon.className = "material-icons";
    icon.style.fontSize = "24px";
    icon.style.color = ICON_SECONDARY_COLOR;
    // Use MedicalServices icon for dispensing
    icon.textContent = "medical_services";
    iconContainer.appendChild(icon);

    // Content wrapper
    const contentWrapper = document.createElement("div");
    contentWrapper.style.flex = "1";
    contentWrapper.style.minWidth = "0";
    contentWrapper.style.display = "flex";
    contentWrapper.style.flexDirection = "column";
    contentWrapper.style.justifyContent = "center";

    // Title
    const title = document.createElement("h6");
    title.style.fontSize = "1.125rem";
    title.style.fontWeight = "600";
    title.style.color = "rgba(0, 0, 0, 0.87)";
    title.style.letterSpacing = "-0.01em";
    title.style.margin = "0 0 8px 0";
    title.textContent = "Prescription Medicines";
    contentWrapper.appendChild(title);

    // Badge with status - using same styling as category chip in header (reusing existing variables)
    const dispensingLower = String(dispensingValueForSection)
      .toLowerCase()
      .trim();
    const isDispensing = dispensingLower === "yes";
    const badge = document.createElement("div");
    badge.style.display = "inline-block";
    badge.style.height = "24px"; // Same height as category chip
    badge.style.padding = "0 12px"; // px: 1.5 (MUI spacing) - matches category chip
    badge.style.borderRadius = ICON_BORDER_RADIUS; // Reuse existing variable (12px)
    badge.style.fontSize = "0.75rem"; // Same as category chip
    badge.style.fontWeight = "500";
    badge.style.lineHeight = "24px"; // Center text vertically
    badge.style.fontFamily = "inherit";
    badge.style.whiteSpace = "nowrap"; // Prevent text wrapping - keeps it narrow

    if (isDispensing) {
      // Green for available - using similar opacity approach as category chip
      badge.style.backgroundColor = "rgba(76, 175, 80, 0.12)"; // Green with opacity (similar to ICON_BACKGROUND_COLOR approach)
      badge.style.color = "#4caf50"; // Green text
      badge.textContent = "Available";
    } else {
      // Gray for not available - matching secondary text style
      badge.style.backgroundColor = "rgba(0, 0, 0, 0.08)"; // Lighter gray (similar opacity to category chip)
      badge.style.color = "rgba(0, 0, 0, 0.6)"; // Secondary text color
      badge.textContent = "Not available";
    }

    contentWrapper.appendChild(badge);

    layoutContainer.appendChild(iconContainer);
    layoutContainer.appendChild(contentWrapper);
    container.appendChild(layoutContainer);
    dispensingItem.appendChild(container);
    list.appendChild(dispensingItem);
  }

  // Store checkDateValue in globals for footer display (removed from details list)
  // Only store if it's different from opening hours check date to avoid duplication
  // Reuse the formattedOpeningHoursCheckDate that was extracted earlier (around line 2564)

  // Only store generic check_date if it's different from opening hours check date
  if (
    checkDateValue &&
    formattedOpeningHoursCheckDate &&
    checkDateValue === formattedOpeningHoursCheckDate
  ) {
    // Same date as opening hours - don't show duplicate at bottom
    globals.detailsCtx.checkDate = null;
  } else {
    globals.detailsCtx.checkDate = checkDateValue || null;
  }

  globals.detailsCtx.latlng = latlng;
  globals.detailsCtx.placeId = tags.id ?? tags.osm_id ?? tags.place_id;

  // If we are not in an existing "directions" flow, hide the directions UI
  // and close the route drawer, because we only want the floating card.
  if (!keepDirectionsUi) {
    elements.directionsUi.classList.add("d-none");
    if (
      typeof window !== "undefined" &&
      typeof window.closePlaceDetails === "function"
    ) {
      window.closePlaceDetails();
    }
  }

  // Open the floating place-details popup (overview / reviews / photos).
  // Pass category, features, and short_name extracted earlier
  openPlaceDetailsPopup(
    titleText,
    categoryValue,
    null,
    features,
    shouldShowShortName ? shortName : null
  );

  // Build a stable cache key for this place (used for request dedupe/caching only).
  const placeCacheKey = (() => {
    // Prefer explicit osm fields if present.
    const osmType =
      tags?.osm_type || tags?.osmType || tags?.type || tags?.osm_entity_type;
    const osmId = tags?.osm_id || tags?.osmId || tags?.id;
    if (osmType && osmId) return `${osmType}/${osmId}`;

    // Fallback: lat/lng + name (still stable enough within a session).
    const lat = latlng?.lat;
    const lng = latlng?.lng;
    const name = tags?.name ? String(tags.name) : "";
    if (typeof lat === "number" && typeof lng === "number") {
      return `ll/${lat.toFixed(6)},${lng.toFixed(6)}|${name}`;
    }
    return `unknown|${name}`;
  })();

  // Kick off photos immediately (does not depend on reviews/UUID).
  const photosTask = (async () => {
    const keyPhotos = showLoading(Symbol("photos-load"));
    try {
      const queryKey = ["place-photos", placeCacheKey];
      const photos =
        queryClient.getQueryData(queryKey) ??
        (await queryClient.fetchQuery({
          queryKey,
          // Photos can change (user uploads), so keep this cache short.
          staleTime: 5 * 60 * 1000,
          queryFn: () => resolvePlacePhotos(tags, latlng),
        }));

      if (isStale()) return;
      showMainPhoto(photos[0]);
      renderPhotosGrid(photos);
    } catch (err) {
      if (!isStale()) {
        console.warn("Photo resolution failed", err);
        showMainPhoto(null);
        renderPhotosGrid([]);
      }
    } finally {
      hideLoading(keyPhotos);
    }
  })();

  // Reviews depend on a UUID from Supabase (ensurePlaceExists).
  const reviewsTask = (async () => {
    const keyReviews = showLoading(Symbol("reviews-load"));
    globals.reviews = [];

    // Check if placeId is a valid UUID (not an OSM ID like "node/123")
    const isValidUUID = (id) => {
      if (!id || typeof id !== "string") return false;
      // UUID format: 8-4-4-4-12 hex characters
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(id) && !id.includes("/"); // Also reject OSM IDs with "/"
    };

    try {
      let uuid = null;
      try {
        const uuidQueryKey = ["place-uuid", placeCacheKey];
        uuid =
          queryClient.getQueryData(uuidQueryKey) ??
          (await queryClient.fetchQuery({
            queryKey: uuidQueryKey,
            // UUID is stable for a place, safe to cache long-term.
            queryFn: () => ensurePlaceExists(tags, latlng),
          }));
      } catch (err) {
        console.warn("⚠️ ensurePlaceExists failed, skipping reviews:", err);
      }

      if (isStale()) return;

      if (uuid) {
        globals.detailsCtx.placeId = uuid;
        // console.log("✅ globals.detailsCtx.placeId (UUID):", uuid);
      }

      // Only fetch reviews if we have a valid UUID.
      if (isValidUUID(globals.detailsCtx.placeId)) {
        const reviewsQueryKey = ["place-reviews", globals.detailsCtx.placeId];

        // Use React Query's fetchQuery which handles caching properly
        // After submitting a review, we call setQueryData to update the cache,
        // so this will return the fresh data on subsequent opens
        const data = await queryClient.fetchQuery({
          queryKey: reviewsQueryKey,
          staleTime: 30 * 1000,
          queryFn: async () => {
            let retries = 3;
            while (retries-- > 0) {
              const d = await reviewStorage("GET", {
                place_id: globals.detailsCtx.placeId,
              });
              if (d?.length || retries === 0) return d || [];
            }
            return [];
          },
        });

        if (isStale()) return;
        globals.reviews = Array.isArray(data) ? data : [];
      } else {
        console.warn(
          "⚠️ Skipping review fetch: placeId is not a valid UUID:",
          globals.detailsCtx.placeId
        );
      }

      if (isStale()) return;

      // ✅ Render reviews
      renderReviewsList();

      try {
        // Load real user preferences from profiles.accessibility_preferences
        const prefs = await getUserAccessibilityPreferences();
        computePlaceScores(globals.reviews, prefs);
      } catch (err) {
        console.error("❌ computePlaceScores failed:", err);
      }
    } finally {
      hideLoading(keyReviews);
    }
  })();

  // Wait for both async streams to settle before final keyword recompute.
  await Promise.allSettled([photosTask, reviewsTask]);

  // --- Street Imagery (Mapillary) - shown after Photos ---
  if (nTags.mapillary) {
    const viewer = toMapillaryViewerUrl(nTags.mapillary);
    if (viewer) {
      const mapillaryItem = document.createElement("div");
      mapillaryItem.className = "list-group-item";
      mapillaryItem.style.padding = "0";

      const container = document.createElement("div");
      container.style.padding = SECTION_PADDING;
      container.style.paddingBottom = SECTION_PADDING;
      container.style.borderTop = "1px solid";
      container.style.borderColor = "rgba(0, 0, 0, 0.12)";
      container.style.minHeight = "60px"; // keep consistent with other link sections

      container.innerHTML = `
        <h6 style="font-size: 1.125rem; font-weight: 600; color: rgba(0, 0, 0, 0.87); letter-spacing: -0.01em; margin: 0 0 4px 0;">Street Imagery</h6>
        <p style="font-size: 0.875rem; color: rgba(0, 0, 0, 0.87); margin: 0;">
          <a href="${viewer}" target="_blank" rel="noopener nofollow ugc">Open in Mapillary</a>
        </p>
      `;

      mapillaryItem.appendChild(container);
      list.appendChild(mapillaryItem);
    }
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
  // console.group("🧱 Obstacles loaded from Supabase");
  // obstacleFeatures.forEach((row, idx) => {
  //   console.log(
  //     `${idx + 1}. id: ${row.id}, type: ${row.type}, description: ${
  //       row.description
  //     }`
  //   );
  // });
  // console.groupEnd();

  obstacleFeatures.forEach((feature) => {
    let layer = null;
    if (feature.properties.shape === "circle") {
      const [lng, lat] = feature.geometry.coordinates;
      layer = L.circle([lat, lng], {
        radius: feature.properties.radius,
        color: "red",
        pane: "obstaclesPane",
      });
    } else if (feature.properties.shape === "rectangle") {
      const bounds = L.geoJSON(feature).getBounds();
      layer = L.rectangle(bounds, {
        color: "red",
        pane: "obstaclesPane",
      });
    } else if (
      feature.geometry.type === "Point" &&
      feature.properties.shape === "marker"
    ) {
      // Handle caution markers (Point obstacles) - circular badge style like POI
      const [lng, lat] = feature.geometry.coordinates;
      const cautionIcon = L.divIcon({
        className: "caution-badge-wrapper",
        html: `
          <div class="caution-badge">
            <img src="/icons/maki/caution.svg" alt="Caution" />
          </div>
        `,
        iconSize: [33, 33],
        iconAnchor: [16, 30],
        popupAnchor: [0, -20],
        tooltipAnchor: [0, -16],
      });
      layer = L.marker([lat, lng], {
        icon: cautionIcon,
        pane: "obstaclesPane",
        zIndexOffset: 1000,
      });
    } else {
      // For polygons, polylines, etc.
      const geoJsonLayer = L.geoJSON(feature, {
        style: { color: "red" },
        pointToLayer: (feature, latlng) => {
          const cautionIcon = L.divIcon({
            className: "caution-badge-wrapper",
            html: `
              <div class="caution-badge">
                <img src="/icons/maki/caution.svg" alt="Caution" style="width: 16px; height: 16px;" />
              </div>
            `,
            iconSize: [33, 33],
            iconAnchor: [16, 30],
            popupAnchor: [0, -20],
            tooltipAnchor: [0, -16],
          });
          return L.marker(latlng, {
            icon: cautionIcon,
            pane: "obstaclesPane",
            zIndexOffset: 1000,
          });
        },
      });
      layer = geoJsonLayer.getLayers()[0];
      // Set pane for vector layers
      if (
        layer &&
        (layer instanceof L.Polygon || layer instanceof L.Polyline)
      ) {
        layer.options.pane = "obstaclesPane";
      }
    }

    if (layer) {
      layer.options.obstacleId = feature.id;
      hookLayerInteractions(layer, feature.properties);
      // Attach tooltip with vote counts support after layer is added
      layer.once("add", () => {
        attachObstacleTooltip(layer, feature);
      });
      // Add to obstacles layer (not drawnItems, and NOT to cluster group)
      // Note: Must add layer AFTER registering the "add" event listener
      if (obstaclesLayer) {
        obstaclesLayer.addLayer(layer);
        // Initial visibility will be set when obstaclesLayer is added to map
      } else {
        drawnItems.addLayer(layer);
      }
    }
  });

  // Only add drawnItems if obstaclesLayer wasn't created yet (fallback)
  if (!obstaclesLayer) {
    map.addLayer(drawnItems);
  } else if (map) {
    // Add obstacles layer to map only if zoom >= DEFAULT_ZOOM (same threshold as draw controls)
    const showObstacles = map.getZoom() >= DEFAULT_ZOOM;
    if (showObstacles && !map.hasLayer(obstaclesLayer)) {
      obstaclesLayer.addTo(map);
    }
    // If zoom < 17, don't add to map (will be added when zoom >= 17)
  }

  // ✅ Only initialize draw controls and event handlers if user is logged in
  if (currentUser) {
    if (!drawControl) {
      // Use obstaclesLayer for editing if available, otherwise fallback to drawnItems
      const editFeatureGroup = obstaclesLayer || drawnItems;
      drawControl = new L.Control.Draw({
        position: "topright",
        edit: { featureGroup: editFeatureGroup },
        draw: {
          polyline: { shapeOptions: { color: "red" } },
          marker: false,
          polygon: { allowIntersection: false, shapeOptions: { color: "red" } },
          rectangle: { shapeOptions: { color: "red" } },
          circle: { shapeOptions: { color: "red" } },
          circlemarker: false,
        },
      });
    }

    // Set up event handlers if not already done
    if (!obstacleEventHandlersSetup) {
      setupObstacleEventHandlers();
    }
    toggleObstaclesByZoom();
  }
}

function renderDepartureSuggestions(items, { loading = false } = {}) {
  if (!elements.departureSuggestions) return;

  const mySeq = ++departureSuggestionsRenderSeq;

  (async () => {
    try {
      const [ReactMod, ReactDOMMod, CompMod] = await Promise.all([
        import("react"),
        import("react-dom/client"),
        import("./components/DepartureSuggestionsReact"),
      ]);

      // If a newer render was requested, skip this one
      if (mySeq !== departureSuggestionsRenderSeq) return;

      const React = ReactMod.default || ReactMod;
      const { createRoot } = ReactDOMMod;
      const DepartureSuggestionsReact = CompMod.default || CompMod;

      if (!departureSuggestionsRoot) {
        departureSuggestionsRoot = createRoot(elements.departureSuggestions);
      }

      const handleSelect = (item) => {
        toggleDepartureSuggestions(false);
        if (item?.kind === "my_location") {
          ensureFromIsMyLocation({ fit: false }).catch(console.error);
          return;
        }
        selectDepartureSuggestion(item); // existing logic
      };

      const myLocationItem = {
        kind: "my_location",
        name: "Your location",
        subtitle: "Use current location",
      };

      departureSuggestionsRoot.render(
        React.createElement(DepartureSuggestionsReact, {
          items: [myLocationItem, ...(items || [])],
          loading,
          onSelect: handleSelect,
        })
      );

      // Show dropdown for loading + results + “no results”
      toggleDepartureSuggestions(true);
    } catch (err) {
      console.error("❌ Failed to render DepartureSuggestionsReact", err);
    }
  })();
}

function renderDestinationSuggestions(items, { loading = false } = {}) {
  if (!elements.destinationSuggestions) return;

  const mySeq = ++destinationSuggestionsRenderSeq;

  const doRender = async () => {
    try {
      const [ReactMod, ReactDOMMod, CompMod] = await Promise.all([
        import("react"),
        import("react-dom/client"),
        import("./components/DestinationSuggestionsReact"),
      ]);

      // If a newer render was requested, skip this one
      if (mySeq !== destinationSuggestionsRenderSeq) return;

      const React = ReactMod.default || ReactMod;
      const { createRoot } = ReactDOMMod;
      const DestinationSuggestionsReact = CompMod.default || CompMod;

      if (!destinationSuggestionsRoot) {
        destinationSuggestionsRoot = createRoot(
          elements.destinationSuggestions
        );
      }

      const handleSelect = (item) => {
        // hide dropdown and reuse existing selection logic
        toggleDestinationSuggestions(false);
        selectDestinationSuggestion(item);
      };

      destinationSuggestionsRoot.render(
        React.createElement(DestinationSuggestionsReact, {
          items: items || [],
          loading,
          onSelect: handleSelect,
        })
      );

      // Show suggestions for both loading + results / no-results
      toggleDestinationSuggestions(true);
    } catch (err) {
      console.error("❌ Failed to render DestinationSuggestionsReact", err);
    }
  };

  doRender();
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

function setRouteActionsUi(hasRoute) {
  const showBtn = document.getElementById("btn-show-route");
  const clearBtn = document.getElementById("btn-clear-route");
  if (showBtn) showBtn.classList.toggle("d-none", !hasRoute);
  if (clearBtn) clearBtn.classList.toggle("d-none", !hasRoute);
}

function fitRouteToView() {
  if (!routeLayer || !map) return;
  // Leaflet: `LayerGroup` doesn't implement `getBounds()`, but `FeatureGroup` and
  // most vector layers do. Be defensive because `routeLayer` has historically
  // changed shape (geojson layer vs group).
  const bounds =
    typeof routeLayer?.getBounds === "function"
      ? routeLayer.getBounds()
      : typeof routeLayer?.getLayers === "function"
      ? L.featureGroup(routeLayer.getLayers()).getBounds?.()
      : null;
  if (bounds && bounds.isValid()) {
    map.fitBounds(bounds, { padding: [40, 40], animate: true, duration: 0.6 });
  }
}

function clearRouteAll() {
  clearRoute();
  setRouteActionsUi(false);

  if (fromMarker) {
    map.removeLayer(fromMarker);
    fromMarker = null;
  }
  if (toMarker) {
    map.removeLayer(toMarker);
    toMarker = null;
  }

  fromLatLng = null;
  toLatLng = null;

  if (elements.departureSearchInput) elements.departureSearchInput.value = "";
  if (elements.destinationSearchInput)
    elements.destinationSearchInput.value = "";

  // Start is needed again
  setStartHintUi(true);
  elements.departureSearchInput?.focus?.();
}

function swapRouteEndpoints() {
  if (!fromLatLng || !toLatLng) return;

  const oldFrom = fromLatLng;
  const oldTo = toLatLng;

  // Swap coordinates
  fromLatLng = oldTo;
  toLatLng = oldFrom;

  // Swap input text
  const fromText = elements.departureSearchInput?.value ?? "";
  const toText = elements.destinationSearchInput?.value ?? "";
  if (elements.departureSearchInput)
    elements.departureSearchInput.value = toText;
  if (elements.destinationSearchInput)
    elements.destinationSearchInput.value = fromText;

  // Move markers if they exist
  if (fromMarker) fromMarker.setLatLng(fromLatLng);
  if (toMarker) toMarker.setLatLng(toLatLng);

  // Recompute route
  updateRoute({ fit: false });
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
  setRouteActionsUi(false);

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

    // fetchRoute returns null for expected “no route” / abort cases
    if (!geojson) {
      clearRoute();
      setRouteActionsUi(false);
      return;
    }

    // Create route with white outline (halo) for better visibility
    // First, create the white outline layer (thicker, underneath)
    const routeOutline = L.geoJSON(geojson, {
      style: {
        color: "#ffffff",
        weight: 8, // Thicker for the outline
        opacity: 0.8,
        lineCap: "round",
        lineJoin: "round",
      },
      interactive: false,
    });

    // Then, create the blue route layer (thinner, on top)
    const routeLine = L.geoJSON(geojson, {
      style: {
        color: "var(--bs-primary)", // Blue primary color
        weight: 6, // Slightly thicker than before
        opacity: 1.0,
        lineCap: "round",
        lineJoin: "round",
      },
      interactive: false,
    });

    // Keep a single handle for cleanup. Use FeatureGroup so `fitRouteToView()`
    // can reliably call `getBounds()` (LayerGroup doesn't implement it).
    routeLayer = L.featureGroup([routeOutline, routeLine]).addTo(map);

    setRouteActionsUi(true);

    const bounds =
      typeof routeLine?.getBounds === "function"
        ? routeLine.getBounds()
        : typeof routeOutline?.getBounds === "function"
        ? routeOutline.getBounds()
        : null;
    if (fit && bounds && bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [40, 40],
        animate: true,
        duration: 0.6,
      });
    }
  } catch (err) {
    console.error("❌ Route render failed:", err);
    clearRoute();
    setRouteActionsUi(false);

    const msg =
      (err && typeof err === "object" && "message" in err && err.message) ||
      "Route could not be found.";
    toastError(String(msg), { important: true });
  } finally {
    hideLoading(key);
  }
}

function reverseAddressAt(latlng) {
  console.log("🧭 reverseAddressAt called for:", latlng);

  const key = showLoading("reverse");

  return new Promise((resolve) => {
    const fallback = () =>
      latlng && typeof latlng.lat === "number" && typeof latlng.lng === "number"
        ? `${latlng.lat}, ${latlng.lng}`
        : "Unknown location";

    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      hideLoading(key);
      resolve(value);
    };

    // If geocoder is unavailable or reverse never returns, don’t hang the UI.
    const timeout = setTimeout(() => finish(fallback()), 1500);

    try {
      if (!geocoder || typeof geocoder.reverse !== "function") {
        clearTimeout(timeout);
        finish(fallback());
        return;
      }

      const scale =
        map?.options?.crs?.scale && typeof map.options.crs.scale === "function"
          ? map.options.crs.scale(18)
          : 1;

      geocoder.reverse(latlng, scale, (items) => {
        clearTimeout(timeout);
        console.log("📍 reverseAddressAt → got items:", items);

        const best = items?.[0]?.name;
        finish(best || fallback());
      });
    } catch (err) {
      clearTimeout(timeout);
      console.error("❌ reverseAddressAt failed:", err);
      finish(fallback());
    }
  });
}

async function getMyLocationLatLng({ silent = false } = {}) {
  if (myLocationLatLng) return myLocationLatLng;

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    if (!silent) {
      toastWarn("Geolocation not supported. Please set a starting point.", {
        important: true,
      });
    }
    return null;
  }

  // If Permissions API is available, detect "denied" and show a better message.
  // Note: if user denied location, browsers typically won't re-prompt; they must change settings.
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: "geolocation" });
      if (status?.state === "denied") {
        if (!silent) {
          toastWarn(
            "Location access is blocked in your browser. Please enable location permission for this site, then try again.",
            { important: true }
          );
        }
        return null;
      }
      // If state is "prompt", calling getCurrentPosition will prompt again.
    }
  } catch {
    // Ignore permissions API failures and fall back to getCurrentPosition prompt.
  }

  return await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        myLocationLatLng = L.latLng(latitude, longitude);
        resolve(myLocationLatLng);
      },
      (error) => {
        const userDeniedGeolocation = error.code === 1;
        if (!silent) {
          if (userDeniedGeolocation) {
            toastWarn(
              "Location permission denied. Please enable location permission for this site or choose a starting point manually.",
              { important: true }
            );
          } else {
            console.error(error);
            toastError(
              "Could not get your location. Please set a starting point.",
              { important: true }
            );
          }
        }
        resolve(null);
      }
    );
  });
}

async function ensureFromIsMyLocation(opts = {}) {
  const { silent = false, ...setOpts } = opts || {};
  if (fromLatLng && fromLatLng.lat && fromLatLng.lng) return;
  const ll = await getMyLocationLatLng({ silent });
  if (!ll) return;
  await setFrom(ll, "My location", setOpts);
}

function startNeedsInput() {
  return !fromLatLng || !fromLatLng.lat || !fromLatLng.lng;
}

function isValidLatLng(latlng) {
  return (
    !!latlng &&
    typeof latlng.lat === "number" &&
    typeof latlng.lng === "number" &&
    !Number.isNaN(latlng.lat) &&
    !Number.isNaN(latlng.lng)
  );
}

function setStartHintUi(needsStart) {
  // Hint text + optional "Use my location" chip/button
  if (elements.departureSearchInput) {
    if (needsStart) {
      elements.departureSearchInput.setAttribute(
        "placeholder",
        "Choose starting point or click on the map…"
      );
    }
  }

  const btn = document.getElementById("btn-use-my-location");
  if (btn) {
    btn.classList.toggle("d-none", !needsStart);
  }
}

async function openDirectionsToPlace(latlng, { fit = false } = {}) {
  if (!isValidLatLng(latlng)) {
    console.warn(
      "⚠️ openDirectionsToPlace aborted: invalid destination latlng",
      {
        latlng,
      }
    );
    toastError("Could not determine this place’s location for directions.");
    return;
  }

  const directionsUi = await ensureDirectionsUiVisible("Directions");
  if (!directionsUi) {
    toastError("Directions panel is not available yet. Please try again.", {
      important: true,
    });
    return;
  }

  moveDepartureSearchBarUnderTo();

  // Set destination immediately; route will draw as soon as a start is chosen.
  await setTo(latlng, null, { fit });

  // If no start yet, keep it empty + focused and show hints/chip.
  const needsStart = startNeedsInput();
  if (needsStart) {
    elements.departureSearchInput.value = "";
  }
  setStartHintUi(needsStart);

  // Google-like: if start is empty, silently attempt geolocation once.
  if (needsStart && !autoFromGeolocateAttempted) {
    autoFromGeolocateAttempted = true;
    // Silent = don't spam toasts on auto-attempt; user can still click "Your location"/button to retry.
    await ensureFromIsMyLocation({ fit: false, silent: true });
  }

  elements.departureSearchInput.focus();
}

async function setFrom(latlng, text, opts = {}) {
  console.log("➡️ setFrom() called with:", { latlng, text, opts });

  if (!isValidLatLng(latlng)) {
    console.warn("⚠️ setFrom aborted: invalid latlng", { latlng });
    toastWarn("Please choose a valid starting point.", { important: true });
    return;
  }

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

  setStartHintUi(false);
  await updateRoute(opts);
}

async function setTo(latlng, text, opts = {}) {
  console.log("➡️ setTo() called with:", { latlng, text, opts });
  const directionsUi = getDirectionsUiEl();
  console.log(
    "ℹ️ directionsUi visible?",
    directionsUi ? !directionsUi.classList.contains("d-none") : false
  );

  if (!isValidLatLng(latlng)) {
    console.warn("⚠️ setTo aborted: invalid latlng", { latlng });
    toastWarn("Please choose a valid destination.", { important: true });
    return;
  }

  toLatLng = latlng;
  const directionsActive = directionsUi
    ? !directionsUi.classList.contains("d-none")
    : false;
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
  // Restore previously selected marker's accessibility color
  restoreSelectedPlaceMarker();

  showDetailsLoading(
    elements.detailsPanel,
    res.name ?? "Details",
    () => {}, // no-op: we no longer move the search bar for details
    (title) => openPlaceDetailsPopup(title)
  );

  const key = showLoading("place-select");

  try {
    const osmType = res.properties.osm_type;
    const osmId = res.properties.osm_id;
    const osmKey = `${osmType}/${osmId}`;

    // 🗺️ Draw outline or marker – cached by OSM id
    const geojsonGeometry =
      queryClient.getQueryData(["place-geometry", osmKey]) ??
      (await queryClient.fetchQuery({
        queryKey: ["place-geometry", osmKey],
        queryFn: () => fetchPlaceGeometry(osmType, osmId),
      }));

    // 🗺️ Draw outline or marker
    const polyLike =
      geojsonGeometry.features.find(
        (f) => f.geometry && f.geometry.type !== "Point"
      ) || null;

    if (polyLike) {
      selectedPlaceLayer = L.geoJSON(geojsonGeometry, {
        style: {
          color: "var(--bs-primary)",
          weight: 2,
          opacity: 0.8,
          fillColor: "var(--bs-primary)",
          fillOpacity: 0.1,
          dashArray: "6,4",
        },
      });
      map.fitBounds(selectedPlaceLayer.getBounds(), {
        animate: true,
        duration: 0.6,
      });
    } else {
      // Get the computed primary color value (CSS variables don't work in inline HTML)
      const primaryColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--bs-primary")
          .trim() || "#0c77d2";

      // Parse RGB values for opacity
      const rgbMatch = primaryColor.match(
        /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
      );
      const r = rgbMatch ? parseInt(rgbMatch[1], 16) : 12;
      const g = rgbMatch ? parseInt(rgbMatch[2], 16) : 119;
      const b = rgbMatch ? parseInt(rgbMatch[3], 16) : 210;

      // Center first (so the rectangle + marker appear in the right context immediately)
      map.flyTo(L.latLng(res.center), 18, { animate: true, duration: 0.6 });

      // Create floating card marker with halo
      const selectedPlaceIcon = L.divIcon({
        className: "selected-place-marker-wrapper",
        html: `
          <div style="
            position: relative;
            width: 92px;
            height: 92px;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <!-- Big soft halo (radial gradient) -->
            <div style="
              position: absolute;
              inset: -28px;
              border-radius: 50%;
              background: radial-gradient(
                circle,
                rgba(${r}, ${g}, ${b}, 0.25) 0%,
                rgba(${r}, ${g}, ${b}, 0.12) 45%,
                rgba(${r}, ${g}, ${b}, 0) 100%
              );
              z-index: 0;
            "></div>
            
            <!-- Speech bubble: white rounded square with downward pointer -->
            <div style="
              position: relative;
              z-index: 2;
              width: 36px;
              height: 36px;
              border-radius: 16px;
              background: #ffffff;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 6px 14px rgba(0, 0, 0, 0.12);
            ">
              <!-- Blue icon background inside -->
              <div style="
                width: 24px;
                height: 24px;
                border-radius: 8px;
                background: ${primaryColor};
                display: flex;
                align-items: center;
                justify-content: center;
                color: #fff;
              ">
                <span class="material-icons" style="
                  font-size: 18px;
                  color: #fff;
                  line-height: 1;
                ">place</span>
              </div>
              
              <!-- Downward triangle pointer -->
              <div style="
                position: absolute;
                left: 50%;
                transform: translateX(-50%);
                bottom: -6px;
                width: 0;
                height: 0;
                border-left: 6px solid transparent;
                border-right: 6px solid transparent;
                border-top: 6px solid #ffffff;
                filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
              "></div>
            </div>
          </div>
        `,
        iconSize: [92, 92], // Total size including halo
        iconAnchor: [46, 52], // Center horizontally, anchor at bottom of triangle pointer
        popupAnchor: [0, -52],
      });

      const selectionMarker = L.marker(L.latLng(res.center), {
        icon: selectedPlaceIcon,
        keyboard: false,
        interactive: false,
        zIndexOffset: 1000, // Ensure it appears on top of other markers
      });

      selectedPlaceLayer = selectionMarker;
    }

    selectedPlaceLayer.addTo(map);
    // Bring to front to ensure it's visible above other markers
    if (selectedPlaceLayer.bringToFront) {
      selectedPlaceLayer.bringToFront();
    }
    await setTo(L.latLng(res.center), res.name);

    // 🧭 STEP 1: basic Photon tags
    let tags = res.properties.tags || res.properties || {};
    console.log("🔍 Photon basic tags:", tags);

    // Temporarily override selected place marker badge to brand blue
    setSelectedPlaceMarker(osmKey, tags);

    // 🧭 STEP 2: fetch Overpass enrichment
    const enriched =
      queryClient.getQueryData(["place-tags", osmKey]) ??
      (await queryClient.fetchQuery({
        queryKey: ["place-tags", osmKey],
        queryFn: () => fetchPlace(osmType, osmId),
      })); // uses Overpass
    tags = { ...tags, ...enriched };
    console.log("📦 Enriched tags:", tags);

    // 🧭 STEP 2.5: Fetch user_reported_accessibility from database
    // This allows displaying admin-approved inaccuracy reports
    const dbOsmId = `${
      osmType === "N" ? "node" : osmType === "W" ? "way" : "relation"
    }/${osmId}`;
    try {
      const { data: placeData, error } = await supabase
        .from("places")
        .select(
          "user_reported_accessibility, user_reported_accessibility_comment, accessibility_status"
        )
        .eq("osm_id", dbOsmId)
        .maybeSingle();

      if (!error && placeData) {
        if (placeData.user_reported_accessibility) {
          tags.user_reported_accessibility =
            placeData.user_reported_accessibility;
        }
        if (placeData.user_reported_accessibility_comment) {
          tags.user_reported_accessibility_comment =
            placeData.user_reported_accessibility_comment;
        }
        if (placeData.accessibility_status) {
          tags.accessibility_status = placeData.accessibility_status;
        }
      }
    } catch (e) {
      console.warn(
        "[mapMain] selectDestinationSuggestion - Failed to fetch user_reported_accessibility:",
        e
      );
    }

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

let currentUser = null;
let obstacleEventHandlersSetup = false;

export function updateUser(user) {
  currentUser = user;

  // reset prefs cache when user logs in / out so next place open refetches
  userPrefsCache = [];
  userPrefsLoaded = false;
  // If user logged in, initialize draw controls if not already done
  if (user && !drawControl && map) {
    // Use obstaclesLayer for editing if available, otherwise fallback to drawnItems
    const editFeatureGroup = obstaclesLayer || drawnItems;
    drawControl = new L.Control.Draw({
      position: "topright",
      edit: { featureGroup: editFeatureGroup },
      draw: {
        polyline: { shapeOptions: { color: "red" } },
        marker: false,
        polygon: { allowIntersection: false, shapeOptions: { color: "red" } },
        rectangle: { shapeOptions: { color: "red" } },
        circle: { shapeOptions: { color: "red" } },
        circlemarker: false,
      },
    });
    // Set up event handlers for create/edit/delete if not already done
    if (!obstacleEventHandlersSetup) {
      setupObstacleEventHandlers();
    }
    toggleObstaclesByZoom();
  } else if (!user && drawControl && map) {
    // If user logged out, remove draw controls
    // removeControl is safe to call even if control doesn't exist
    try {
      map.removeControl(drawControl);
    } catch (e) {
      // Control might not be on map, ignore error
    }
    if (drawHelpAlertControl) {
      try {
        map.removeControl(drawHelpAlertControl);
      } catch (e) {
        // Control might not be on map, ignore error
      }
      drawHelpAlertControl = null;
    }
  }
}

/**
 * Clear in-memory caches (places cache, user preferences cache, etc.)
 * Exposed globally so it can be called from clearCache utility
 */
export function clearMapCaches() {
  // Clear places cache
  placesCacheById.clear();
  allPlacesFeatures = [];

  // Clear user preferences cache
  userPrefsCache = [];
  userPrefsLoaded = false;

  console.log("✅ Cleared in-memory map caches (places, user preferences)");
}

// Expose globally for cache clearing utility
if (typeof window !== "undefined") {
  window.clearMapCaches = clearMapCaches;
}

function setupObstacleEventHandlers() {
  if (obstacleEventHandlersSetup) return;
  obstacleEventHandlersSetup = true;

  // CREATE
  map.on(L.Draw.Event.CREATED, async (e) => {
    let layerToAdd, featureToStore;
    const cautionHandler = getCautionDrawHandler();
    // Check if this is a caution marker by checking the layer's options
    const isCautionMarker =
      (e.layerType === "marker" || e.layer instanceof L.Marker) &&
      e.layer.options.isCautionMarker === true;

    if (e.layer instanceof L.Circle) {
      featureToStore = makeCircleFeature(e.layer);
      layerToAdd = L.circle(e.layer.getLatLng(), {
        radius: e.layer.getRadius(),
        color: "red",
        pane: "obstaclesPane",
      });
    } else if (isCautionMarker) {
      // Handle caution marker (point obstacle) - use obstacles pane with circular badge
      featureToStore = e.layer.toGeoJSON();
      // Recreate marker with obstacles pane and circular badge style
      const latlng = e.layer.getLatLng();
      const cautionIcon = L.divIcon({
        className: "caution-badge-wrapper",
        html: `
          <div class="caution-badge">
            <img src="/icons/maki/caution.svg" alt="Caution" />
          </div>
        `,
        iconSize: [33, 33],
        iconAnchor: [16, 30],
        popupAnchor: [0, -20],
        tooltipAnchor: [0, -16],
      });
      layerToAdd = L.marker(latlng, {
        icon: cautionIcon,
        pane: "obstaclesPane",
        zIndexOffset: 1000,
        isCautionMarker: true,
      });
    } else {
      featureToStore = e.layer.toGeoJSON();
      // For polygons, polylines, rectangles - add pane option
      if (
        e.layer instanceof L.Polygon ||
        e.layer instanceof L.Polyline ||
        e.layer instanceof L.Rectangle
      ) {
        layerToAdd = e.layer;
        layerToAdd.options.pane = "obstaclesPane";
        // Update the pane if layer already has a renderer
        if (layerToAdd._renderer) {
          layerToAdd._renderer._container.style.zIndex = 650;
        }
      } else {
        layerToAdd = e.layer;
      }
    }

    // Add to obstacles layer (not drawnItems, and NOT to cluster group)
    if (obstaclesLayer) {
      obstaclesLayer.addLayer(layerToAdd);
      // Visibility controlled by zoom - matches DEFAULT_ZOOM threshold for draw controls
    } else {
      drawnItems.addLayer(layerToAdd);
    }

    const result = await showObstacleModal();

    if (!result) {
      if (obstaclesLayer) {
        obstaclesLayer.removeLayer(layerToAdd);
      } else {
        drawnItems.removeLayer(layerToAdd);
      }
      return;
    }

    featureToStore.properties = {
      ...(featureToStore.properties || {}),
      title: result.title,
      shape: e.layerType,
    };

    hookLayerInteractions(layerToAdd, featureToStore.properties);
    // Will attach tooltip with vote counts after obstacle is saved and has place_id

    const key = showLoading("obstacles-put");
    try {
      const { data, error } = await supabase
        .from("obstacles")
        .insert([featureToStore])
        .select();

      if (error) throw error;

      const newObstacle = data[0];

      layerToAdd.options.obstacleId = newObstacle.id;

      obstacleFeatures.push(newObstacle);
      // Attach tooltip with vote counts support
      attachObstacleTooltip(layerToAdd, newObstacle);
      console.log("✅ Inserted new obstacle:", newObstacle.id);
    } catch (err) {
      console.error("❌ Failed to save obstacle:", err);
      if (obstaclesLayer) {
        obstaclesLayer.removeLayer(layerToAdd);
      } else {
        drawnItems.removeLayer(layerToAdd);
      }
      toastError("Could not save obstacle.");
    } finally {
      hideLoading(key);
    }

    // Auto-disable draw mode after placing a caution marker
    if (isCautionMarker && cautionHandler) {
      cautionHandler.disable();
      // Also disable any active mode in the draw control
      if (
        drawControl &&
        drawControl._toolbars &&
        drawControl._toolbars.draw &&
        drawControl._toolbars.draw._activeMode
      ) {
        drawControl._toolbars.draw._activeMode.handler.disable();
      }
      // Remove enabled state from caution button
      const cautionButton = map
        .getContainer()
        .querySelector(".leaflet-draw-toolbar-button-caution");
      if (cautionButton) {
        cautionButton.classList.remove("leaflet-draw-toolbar-button-enabled");
      }
    }
  });

  // EDIT
  map.on(L.Draw.Event.EDITED, async (e) => {
    e.layers.eachLayer(async (layer) => {
      const id = layer.options.obstacleId;

      let updated;

      if (layer instanceof L.Circle) {
        updated = makeCircleFeature(layer);
      } else {
        updated = layer.toGeoJSON();
      }

      const i = obstacleFeatures.findIndex((f) => f.id === id);

      if (i !== -1) {
        updated = {
          ...updated,
          id,
          properties: {
            ...(obstacleFeatures[i].properties || {}),
            radius:
              (updated.properties && updated.properties.radius) ||
              obstacleFeatures[i].properties?.radius,
          },
        };

        const key = showLoading("obstacles-put");
        try {
          const updatedObstacleFeatures = [...obstacleFeatures];
          updatedObstacleFeatures[i] = updated;
          await obstacleStorage("PUT", updated);
          obstacleFeatures[i] = updated;
          hookLayerInteractions(layer, updated.properties);
          console.log("✅ Updated obstacle:", id);
        } catch (err) {
          console.error("❌ Failed to update:", err);
          toastError("Could not update obstacle.");
        } finally {
          hideLoading(key);
        }
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

      const id = layer.options.obstacleId;

      // Safely filter local list
      obstacleFeatures = obstacleFeatures.filter(
        (f) => f.id !== layer.options.obstacleId
      );

      console.log("🚀 Deleting from Supabase with ID:", id);
      await duringLoading("obstacles-put", obstacleStorage("DELETE", { id }));
      console.log("🗑️ Deleted obstacle:", id);
    });
  });
}

export async function initMap(user = null) {
  currentUser = user;
  obstacleEventHandlersSetup = false; // Reset on map init

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
    try {
      const res = await fetch(url);

      // If Photon responds with non-2xx (e.g., 403 or 500), throw a descriptive error.
      if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);

      // Parse JSON — Photon always returns valid GeoJSON FeatureCollection.
      return res.json();
    } catch (error) {
      // Handle network errors (Failed to fetch, CORS, etc.)
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        throw new Error(
          "Network error: Unable to reach geocoding service. Please check your internet connection."
        );
      }
      // Re-throw other errors as-is
      throw error;
    }
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

  // Expose map on window for React components
  if (typeof window !== "undefined") {
    window.map = map;
    window.updateObstacle = updateObstacleInMap;
  }

  const initialName = ls.get(BASEMAP_LS_KEY) || "OSM Greyscale";

  currentBasemapLayer = baseLayers[initialName] || osm;
  currentBasemapLayer.addTo(map);

  // Fade the map in only after the first basemap tiles load (prevents “snap/jump” perception).
  const mapEl =
    typeof document !== "undefined" ? document.getElementById("map") : null;
  if (mapEl) {
    mapEl.classList.remove("is-ready");
    const markReady = () => mapEl.classList.add("is-ready");
    let readyTimeout = setTimeout(markReady, 1500);
    if (currentBasemapLayer && typeof currentBasemapLayer.once === "function") {
      currentBasemapLayer.once("load", () => {
        clearTimeout(readyTimeout);
        markReady();
      });
    }
  }

  // Give Leaflet an immediate, stable view so it can start loading tiles right away.
  // Prefer restoring the user's last view to avoid a large “jump” on every page load.
  const defaultLatLng = [50.4501, 30.5234]; // Kyiv, Ukraine
  const loadLastView = () => {
    try {
      const raw = ls.get(LS_KEYS.MAP_VIEW);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const lat = Number(parsed?.lat);
      const lng = Number(parsed?.lng);
      const zoom = Number(parsed?.zoom);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        !Number.isFinite(zoom)
      )
        return null;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      return { lat, lng, zoom };
    } catch {
      return null;
    }
  };

  const initialView = loadLastView() || {
    lat: defaultLatLng[0],
    lng: defaultLatLng[1],
    zoom: DEFAULT_ZOOM,
  };
  map.setView([initialView.lat, initialView.lng], initialView.zoom, {
    animate: false,
  });

  // Persist view to localStorage so future loads start where the user last left the map.
  const saveLastView = debounce(() => {
    try {
      const c = map.getCenter();
      const z = map.getZoom();
      if (
        !c ||
        !Number.isFinite(c.lat) ||
        !Number.isFinite(c.lng) ||
        !Number.isFinite(z)
      )
        return;
      ls.set(
        LS_KEYS.MAP_VIEW,
        JSON.stringify({ lat: c.lat, lng: c.lng, zoom: z })
      );
    } catch {
      /* ignore */
    }
  }, 500);
  map.on("moveend", saveLastView);

  // If the user starts interacting before geolocation resolves, don't auto-recenter later.
  let userInteracted = false;
  const markUserInteracted = () => {
    userInteracted = true;
  };
  map.on("dragstart", markUserInteracted);
  map.on("zoomstart", markUserInteracted);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        myLocationLatLng = L.latLng(latitude, longitude);
        // Center to user's location (only if they haven't started interacting).
        // To reduce “jumping”, only recenter if we're actually far away from current view.
        if (!userInteracted) {
          const currentCenter = map.getCenter?.();
          const distM =
            currentCenter && typeof currentCenter.distanceTo === "function"
              ? currentCenter.distanceTo([latitude, longitude])
              : Number.POSITIVE_INFINITY;

          const RECENTER_THRESHOLD_M = 800; // avoid tiny moves that feel like jitter
          if (!Number.isFinite(distM) || distM > RECENTER_THRESHOLD_M) {
            const targetZoom = map.getZoom() || DEFAULT_ZOOM;
            // If the map hasn't finished initial render yet, use a non-animated setView().
            if (!map._loaded) {
              map.setView([latitude, longitude], targetZoom, {
                animate: false,
              });
            } else {
              map.flyTo([latitude, longitude], targetZoom, {
                animate: true,
                duration: 0.6,
              });
            }
          }
        }
        // Avoid Leaflet's default marker-icon.png (often 404 in Next builds).
        // Use a lightweight divIcon instead.
        const myLocIcon = L.divIcon({
          className: "abilico-my-location-icon",
          html: `
            <div style="
              width: 14px;
              height: 14px;
              background: var(--bs-primary);
              border: 3px solid #fff;
              border-radius: 9999px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.35);
            "></div>
          `,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        L.marker([latitude, longitude], {
          icon: myLocIcon,
          interactive: false,
          keyboard: false,
        }).addTo(map);
      },
      (error) => {
        const userDeniedGeolocation = error.code === 1;
        if (!userDeniedGeolocation) {
          console.log(error);
          toastError("Could not get your location. Using default location.", {
            important: true,
          });
        }
        // Fall back to default location when geolocation fails or is denied
        if (!userInteracted) {
          map.setView(defaultLatLng, DEFAULT_ZOOM, { animate: false });
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 5 * 60 * 1000,
      }
    );
  } else {
    toastWarn("Geolocation not supported. Using default location.");
  }

  // ============= EVENT LISTENERS =============
  map.whenReady(async () => {
    // Allow React list items to focus a place on the map
    if (typeof window !== "undefined") {
      window.selectPlaceFromListFeature = async (feature) => {
        try {
          if (!feature || !feature.geometry) return;

          const coords = feature.geometry.coordinates || [];
          const [lon, lat] = coords;
          if (
            typeof lat !== "number" ||
            Number.isNaN(lat) ||
            typeof lon !== "number" ||
            Number.isNaN(lon)
          ) {
            return;
          }

          const latlng = L.latLng(lat, lon);
          const props = feature.properties || {};
          let tags = props.tags || props || {};

          // Fetch user_reported_accessibility from database if this place has an osm_id
          // This allows displaying admin-approved inaccuracy reports
          let mergedTags = { ...tags };

          // Construct the osm_id in database format: "node/123456" or "way/789"
          let dbOsmId = null;
          const osmType = props.osm_type || props.type || null;
          const osmIdNum = props.osm_id || props.id || null;

          if (osmType && osmIdNum) {
            dbOsmId = `${osmType}/${osmIdNum}`;
          } else if (
            typeof feature?.id === "string" &&
            feature.id.includes("/")
          ) {
            dbOsmId = feature.id;
          }

          if (dbOsmId) {
            try {
              const { data: placeData, error } = await supabase
                .from("places")
                .select(
                  "user_reported_accessibility, user_reported_accessibility_comment, accessibility_status"
                )
                .eq("osm_id", dbOsmId)
                .maybeSingle();

              if (!error && placeData) {
                if (placeData.user_reported_accessibility) {
                  mergedTags.user_reported_accessibility =
                    placeData.user_reported_accessibility;
                }
                if (placeData.user_reported_accessibility_comment) {
                  mergedTags.user_reported_accessibility_comment =
                    placeData.user_reported_accessibility_comment;
                }
                if (placeData.accessibility_status) {
                  mergedTags.accessibility_status =
                    placeData.accessibility_status;
                }
              }
            } catch (e) {
              console.warn(
                "[mapMain] selectPlaceFromListFeature - Failed to fetch user_reported_accessibility:",
                e
              );
            }
          }

          // Show details panel (Overview/Reviews/Photos)
          await renderDetails(mergedTags, latlng, { keepDirectionsUi: true });

          // Focus map on the selected place
          if (map) {
            const currentZoom = map.getZoom() || DEFAULT_ZOOM;
            const targetZoom = Math.max(currentZoom, 17);
            map.flyTo(latlng, targetZoom, { animate: true, duration: 0.6 });
          }
        } catch (err) {
          console.error("❌ selectPlaceFromListFeature failed:", err);
        }
      };
    }

    // console.log("✅ Leaflet map ready, initializing places...");
    placesPane = map.createPane("places-pane");
    placesPane.style.zIndex = 450;

    // Create dedicated pane for obstacles (above clusters, below popups)
    const obstaclesPane = map.createPane("obstaclesPane");
    obstaclesPane.style.zIndex = 650; // clusters are usually around 600
    obstaclesPane.style.pointerEvents = "auto";

    // Create separate FeatureGroup for obstacles (not in cluster group)
    // Must be FeatureGroup for Leaflet.draw edit control
    obstaclesLayer = new L.FeatureGroup().addTo(map);

    // Initialize place type filter state from localStorage on map load
    placeTypeFilterState = loadPlaceTypeFilterFromLS();

    // Initialize photos-only filter state from localStorage on map load
    try {
      photosOnlyFilterEnabled =
        window.localStorage.getItem("ui.placeList.photosOnly") === "1";
    } catch {
      // ignore storage errors
    }

    // Initialize open-now filter state from localStorage on map load
    try {
      openNowFilterEnabled =
        window.localStorage.getItem("ui.placeList.openNow") === "1";
    } catch {
      // ignore storage errors
    }

    map.addControl(new ZoomMuiControl({ position: "bottomright" }));
    placeClusterLayer.addTo(map);

    // AccessibilityLegend removed - now available in sidebar Filters dialog

    map.on("draw:editstart", () => (drawState.editing = true));
    map.on("draw:editstop", () => (drawState.editing = false));
    map.on("draw:deletestart", () => (drawState.deleting = true));
    map.on("draw:deletestop", () => (drawState.deleting = false));

    // Debounce viewport-driven fetching/rendering to avoid churn while the user is interacting.
    // Use leading: true so loading indicator shows immediately on first drag
    map.on(
      "moveend",
      debounce(refreshPlaces, 20, { leading: true, trailing: true })
    );
    const initialZoom = map.getZoom();
    if (initialZoom >= SHOW_PLACES_ZOOM) {
      // Run once on first load so list & markers appear without dragging
      refreshPlaces();
    }

    await initDrawingObstacles();

    // Add vision accessibility control first (positioned above basemap gallery)
    const visionAccessibilityControl = new VisionAccessibilityControl();
    map.addControl(visionAccessibilityControl);
    window.visionAccessibilityControl = visionAccessibilityControl; // Store globally for updates

    map.addControl(new BasemapGallery({ initial: initialName }));

    // Initialize road accessibility layer (disabled by default)
    initRoadAccessibilityLayer(map);

    // Note: ONNX models are preloaded on hover of the Road Accessibility legend
    // This defers the ~73MB download until user shows interest in the feature

    // Expose road accessibility controls globally for React components
    if (typeof window !== "undefined") {
      window.setRoadAccessibilityEnabled = (enabled) =>
        setRoadAccessibilityEnabled(map, enabled);
      window.setRoadVisualizationMode = setVisualizationMode;
      window.isRoadAccessibilityEnabled = isRoadAccessibilityEnabled;
      window.forceRefreshRoads = () => forceRefreshRoads(map);
      window.setRoadLoadingCallback = setRoadLoadingCallback;
      window.isRoadAccessibilityLoading = isRoadAccessibilityLoading;
      window.setPredictionsEnabled = setPredictionsEnabled;
      window.isPredictionsEnabled = isPredictionsEnabled;
      window.isOnnxModelsReady = isOnnxModelsReady;
      window.preloadOnnxModelsInBackground = preloadOnnxModelsInBackground;
      window.preloadAccessibilityModel = preloadAccessibilityModel;
      window.setPredictionsLoadingCallback = setPredictionsLoadingCallback;
    }

    // Preload accessibility model in background
    preloadAccessibilityModel();

    map.on("baselayerchange", (e) => ls.set(BASEMAP_LS_KEY, e.name));
    map.on("zoomend", toggleObstaclesByZoom);
    map.on("click", async (e) => {
      if (drawState.editing || drawState.deleting) return;
      // Don't show quick route popup if we're selecting location for adding a place
      if (globals._isSelectingPlaceLocation) return;

      const directionsActive =
        elements.directionsUi &&
        !elements.directionsUi.classList.contains("d-none");

      if (directionsActive) {
        const active = document.activeElement;
        const dep = elements.departureSearchInput;
        const dest = elements.destinationSearchInput;

        // If user is focused in a field, set that endpoint.
        if (active === dep) {
          setStartHintUi(false);
          await setFrom(e.latlng, null, { fit: false });
          return;
        }
        if (active === dest) {
          await setTo(e.latlng, null, { fit: false });
          return;
        }

        // If destination is already chosen but start is not, map click sets start.
        if (toLatLng && startNeedsInput()) {
          setStartHintUi(false);
          await setFrom(e.latlng, null, { fit: false });
          return;
        }
      }

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

      // MUI "Searching…" state
      renderDestinationSuggestions([], { loading: true });

      geocoder.geocode(searchQuery, (items) => {
        if (mySeq !== destinationGeocodeReqSeq) return;

        renderDestinationSuggestions(items || [], { loading: false });
      });
    }, 200)
  );

  let departureGeocodeReqSeq = 0;
  elements.departureSearchInput.addEventListener(
    "input",
    debounce((e) => {
      const searchQuery = e.target.value.trim();
      if (!searchQuery) {
        // Google-like: when field is empty, still show "Your location" suggestion.
        renderDepartureSuggestions([], { loading: false });
        return;
      }

      const mySeq = ++departureGeocodeReqSeq;

      // MUI "Searching…" state
      renderDepartureSuggestions([], { loading: true });

      geocoder.geocode(searchQuery, (items) => {
        if (mySeq !== departureGeocodeReqSeq) return;

        renderDepartureSuggestions(items || [], { loading: false });
      });
    }, 200)
  );

  // Google-like: show "Your location" suggestion when focusing the From field (even if empty)
  elements.departureSearchInput.addEventListener("focus", (e) => {
    const q = e?.target?.value?.trim?.() || "";
    if (!q) {
      renderDepartureSuggestions([], { loading: false });
    }
  });

  document.addEventListener("click", hideSuggestionsIfClickedOutside);

  // Details panel buttons are React-rendered; use event delegation so wiring
  // works even if the buttons mount after mapMain initializes.
  document.addEventListener("click", async (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;

    const directionsBtn = t.closest("#btn-directions");
    const legacyStart = t.closest("#btn-start-here");
    const legacyGo = t.closest("#btn-go-here");

    if (!directionsBtn && !legacyStart && !legacyGo) return;

    if (
      typeof window !== "undefined" &&
      typeof window.closePlacePopup === "function"
    ) {
      window.closePlacePopup();
    }

    if (directionsBtn) {
      await openDirectionsToPlace(globals.detailsCtx.latlng, { fit: false });
      return;
    }
    if (legacyStart) {
      await ensureDirectionsUiVisible("Directions");
      moveDepartureSearchBarUnderTo();
      await setFrom(globals.detailsCtx.latlng);
      elements.departureSearchInput.focus();
      return;
    }
    if (legacyGo) {
      await ensureDirectionsUiVisible("Directions");
      moveDepartureSearchBarUnderTo();
      await setTo(globals.detailsCtx.latlng);
      elements.departureSearchInput.focus();
    }
  });

  document.addEventListener("click", async (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (!t.closest("#btn-use-my-location")) return;
    await ensureFromIsMyLocation({ fit: false });
  });

  // Route actions: show/clear
  document.addEventListener("click", (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;

    if (t.closest("#btn-swap-route")) {
      swapRouteEndpoints();
      return;
    }

    if (t.closest("#btn-show-route")) {
      fitRouteToView();
      return;
    }

    if (t.closest("#btn-clear-route")) {
      clearRouteAll();
    }
  });

  // ✅ Set up review form handler using event delegation (for old HTML form, kept for backward compatibility)
  // This works even if the form is created dynamically after login
  // NOTE: The React ReviewForm also has id="review-form" but handles its own submission
  // We differentiate by checking for the #review-text textarea (only in old HTML form)
  elements.detailsPanel.addEventListener("submit", async (e) => {
    // Only handle review form submissions (old HTML form)
    if (e.target.id !== "review-form") return;

    // Skip if this is the React ReviewForm (it has its own handler)
    // The old HTML form has a #review-text textarea, React form doesn't
    const textarea = e.target.querySelector("#review-text");
    if (!textarea) {
      return;
    }

    e.preventDefault();

    // ✅ Check authentication before allowing review submission
    if (!currentUser) {
      toastError("Please log in to submit a review.");
      return;
    }

    const text = textarea.value.trim();
    if (!text) return;

    const submitBtn = e.target.querySelector("#submit-review-btn");
    try {
      console.log("🧭 Review submit ctx:", globals.detailsCtx);

      // Helper to validate UUID
      const isValidUUID = (id) => {
        if (!id || typeof id !== "string") return false;
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(id) && !id.includes("/");
      };

      let placeId =
        globals.detailsCtx.placeId ??
        (await ensurePlaceExists(
          globals.detailsCtx.tags,
          globals.detailsCtx.latlng
        ));

      // If placeId is not a valid UUID, try to get it from ensurePlaceExists
      if (!isValidUUID(placeId)) {
        placeId = await ensurePlaceExists(
          globals.detailsCtx.tags,
          globals.detailsCtx.latlng
        );
      }

      // Only proceed if we have a valid UUID
      if (!isValidUUID(placeId)) {
        toastError("Could not identify place. Please try again.");
        return;
      }

      const newReview = { text, place_id: placeId };

      await withButtonLoading(
        submitBtn,
        reviewStorage("POST", newReview),
        "Saving…"
      );

      // ✅ Fetch fresh reviews from server
      const reviewsQueryKey = ["place-reviews", placeId];
      globals.reviews = await reviewStorage("GET", { place_id: placeId });

      // ✅ Update React Query cache with the fresh data (replaces any stale data)
      queryClient.setQueryData(reviewsQueryKey, globals.reviews);

      renderReviewsList();

      textarea.value = "";

      recomputePlaceAccessibilityKeywords().catch(console.error);
    } catch (error) {
      console.error("❌ Failed to save review:", error);
      toastError("Could not save your review. Please try again.");
    }
  });

  // ✅ Function to ensure reviews are loaded for the current place
  // This is called when the reviews tab is clicked to ensure reviews are fetched
  window.ensureReviewsLoaded = async function () {
    try {
      // Check if we already have reviews loaded for the current place
      const currentPlaceId = globals.detailsCtx?.placeId;
      if (!currentPlaceId) {
        // Try to get placeId from tags and latlng if available
        const tags = globals.detailsCtx?.tags;
        const latlng = globals.detailsCtx?.latlng;
        if (tags && latlng) {
          const uuid = await ensurePlaceExists(tags, latlng);
          if (uuid) {
            globals.detailsCtx.placeId = uuid;
          }
        }
      }

      const placeId = globals.detailsCtx?.placeId;
      if (!placeId) {
        console.warn("⚠️ ensureReviewsLoaded: No placeId available");
        return;
      }

      // Check if placeId is a valid UUID
      const isValidUUID = (id) => {
        if (!id || typeof id !== "string") return false;
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(id) && !id.includes("/");
      };

      if (!isValidUUID(placeId)) {
        console.warn(
          "⚠️ ensureReviewsLoaded: placeId is not a valid UUID:",
          placeId
        );
        return;
      }

      // Check if reviews are already loaded in globals for this place
      if (Array.isArray(globals.reviews) && globals.reviews.length > 0) {
        // Check if the first review belongs to the current place
        const firstReview = globals.reviews[0];
        if (firstReview && firstReview.place_id === placeId) {
          // Reviews are already loaded for this place, just render them
          renderReviewsList();
          return;
        }
      }

      // Check if reviews are cached in queryClient
      const reviewsQueryKey = ["place-reviews", placeId];

      // Use React Query's fetchQuery which handles caching properly
      const keyReviews = showLoading(Symbol("reviews-load"));
      try {
        const data = await queryClient.fetchQuery({
          queryKey: reviewsQueryKey,
          staleTime: 30 * 1000,
          queryFn: async () => {
            let retries = 3;
            while (retries-- > 0) {
              const d = await reviewStorage("GET", {
                place_id: placeId,
              });
              if (d?.length || retries === 0) return d || [];
              await new Promise((r) => setTimeout(r, 500));
            }
            return [];
          },
        });

        globals.reviews = Array.isArray(data) ? data : [];
        renderReviewsList();

        // Compute place scores if we have reviews
        if (globals.reviews.length > 0) {
          try {
            const prefs = await getUserAccessibilityPreferences();
            computePlaceScores(globals.reviews, prefs);
          } catch (err) {
            console.error("❌ computePlaceScores failed:", err);
          }
        }
      } finally {
        hideLoading(keyReviews);
      }
    } catch (error) {
      console.error("❌ ensureReviewsLoaded failed:", error);
    }
  };

  // ✅ Listen for review submissions from React ReviewForm component
  window.addEventListener("review-submitted", async (e) => {
    const placeId = e.detail?.placeId || globals.detailsCtx?.placeId;
    if (!placeId) return;

    try {
      // ✅ Fetch fresh reviews from server
      const reviewsQueryKey = ["place-reviews", placeId];
      globals.reviews = await reviewStorage("GET", { place_id: placeId });

      // ✅ Update React Query cache with the fresh data (replaces any stale data)
      queryClient.setQueryData(reviewsQueryKey, globals.reviews);

      renderReviewsList();
      recomputePlaceAccessibilityKeywords(true).catch(console.error);
    } catch (error) {
      console.error("❌ Failed to refresh reviews:", error);
    }
  });

  // ✅ Global — must be OUTSIDE the submit handler
  document.addEventListener("accessibilityFilterChanged", (e) => {
    const incoming = e.detail;
    console.log("🎯 accessibilityFilterChanged received:", incoming);

    if (!incoming || !incoming.length) {
      accessibilityFilter = new Set(ALL_ACCESSIBILITY_TIERS);
    } else {
      accessibilityFilter = new Set(incoming);
    }

    console.log(
      "🎯 accessibilityFilter updated to:",
      Array.from(accessibilityFilter)
    );
    refreshPlaces();
  });

  // Listen for ML predictions toggle changes from React
  document.addEventListener("mlPredictionsEnabledChanged", (e) => {
    const enabled = e.detail;
    console.log("🤖 mlPredictionsEnabledChanged received:", enabled);
    placePredictionsEnabled = enabled;
    // Refresh markers to show/hide predictions
    if (map) {
      refreshPlaceMarkerPredictions();
    }
  });

  // Listen for React nested filter updates
  document.addEventListener("placeTypeFilterChanged", (ev) => {
    // We re-read from LS so both sides stay in sync
    placeTypeFilterState = loadPlaceTypeFilterFromLS();
    // Rebuild places layer in the current viewport using cached features
    // so markers hide/show without refetching Overpass.
    if (map) {
      refreshPlaces(); // refresh will respect isFeatureAllowedByTypeFilter
    }
  });

  // Listen for photos-only filter updates from React
  document.addEventListener("photosOnlyFilterChanged", (ev) => {
    const { enabled, photoByKey } = ev.detail || {};
    photosOnlyFilterEnabled = !!enabled;

    // Build a Set of placeKeys that have photos for fast lookup
    photosOnlyPlaceKeys.clear();
    if (photoByKey && typeof photoByKey === "object") {
      for (const [placeKey, photo] of Object.entries(photoByKey)) {
        if (photo && (photo.thumb || photo.src || photo.pageUrl)) {
          photosOnlyPlaceKeys.add(placeKey);
        }
      }
    }

    console.log(
      `📷 photosOnlyFilterChanged: enabled=${photosOnlyFilterEnabled}, placesWithPhotos=${photosOnlyPlaceKeys.size}`
    );

    // Rebuild places layer in the current viewport using cached features
    if (map) {
      refreshPlaces();
    }
  });

  // Listen for open-now filter updates from React
  document.addEventListener("openNowFilterChanged", (ev) => {
    const { enabled } = ev.detail || {};
    openNowFilterEnabled = !!enabled;

    console.log(`🕐 openNowFilterChanged: enabled=${openNowFilterEnabled}`);

    // Rebuild places layer in the current viewport using cached features
    if (map) {
      refreshPlaces();
    }
  });

  // ✅ Listen for user-added place events to refresh the map
  if (typeof window !== "undefined") {
    window.addEventListener("user-place-added", (ev) => {
      console.log("📍 User place added, refreshing map...", ev.detail);
      // Invalidate cache to force fresh fetch including new user place
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      const boundsKey = serializeBounds(bounds, zoom);

      // User place affects the Supabase fetch, so invalidate those queries.
      queryClient.invalidateQueries({ queryKey: ["user-places"] });

      // Keep existing behavior (safe): also invalidate the exact OSM places key for this viewport.
      const placesQueryKey = ["places", boundsKey, zoom, accessibilityKey()];
      queryClient.invalidateQueries({ queryKey: placesQueryKey });
      // Refresh places on map
      refreshPlaces();
    });

    // ✅ Cross-tab sync: when an admin approves/rejects/deletes a user place in /admin-panel,
    // broadcast via localStorage so any open map tabs immediately refresh.
    window.addEventListener("storage", (ev) => {
      try {
        if (ev.key !== "abilico:user-places-updated") return;
        if (!map) return;

        console.log("🔄 User places updated in another tab, refreshing map...");
        queryClient.invalidateQueries({ queryKey: ["user-places"] });
        refreshPlaces();
      } catch (e) {
        console.warn("storage listener failed:", e);
      }
    });
  }

  // 1) load user profile to get preferences

  // const {
  //   data: { user },
  // } = await supabase.auth.getUser();

  // let prefs = [];
  // if (user) {
  //   const { data: profile } = await supabase
  //     .from("profiles")
  //     .select("accessibility_preferences")
  //     .eq("id", user.id)
  //     .maybeSingle();

  //   prefs = profile?.accessibility_preferences || [];
  // }

  // // 2) collect osm_ids for places in viewport (you already have placeKeyFromFeature(feature))
  // const osmIds = features
  //   .map((f) => placeKeyFromFeature(f))
  //   .filter(Boolean);

  // // 3) ask Supabase for scores
  // const ratingMap = await fetchPlaceRatingsForUser(osmIds, prefs);

  // ratingMap["N/123456"].personal_score -> personalised rating for that place
  // ratingMap["N/123456"].avg_overall   -> global average
}