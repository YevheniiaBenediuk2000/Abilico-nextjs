import debounce from "lodash.debounce";

import elements from "./constants/domElements.js";
import {
  fetchPlace,
  fetchPlaceGeometry,
  fetchPlaces,
} from "./api/fetchPlaces.js";
import { fetchUserPlaces } from "./api/fetchUserPlaces.js";
import { fetchRoute } from "./api/fetchRoute.js";
import { obstacleStorage } from "./api/obstacleStorage.js";
import {
  DEFAULT_ZOOM,
  EXCLUDED_PROPS,
  placeClusterConfig,
  SHOW_PLACES_ZOOM,
} from "./constants/constants.mjs";
import { toastError, toastWarn } from "./utils/toast.mjs";
import { waypointDivIcon, WP_COLORS } from "./utils/wayPoints.mjs";
import {
  DRAW_HELP_LS_KEY,
  DrawHelpAlert,
} from "./leaflet-controls/DrawHelpAlert.mjs";
import { ls } from "./utils/localStorage.mjs";
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
import { formatAddressFromTags, formatAreaFromTags, formatLevel } from "./utils/formatAddress.mjs";
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

// DEBUG: confirm import really works
// console.log("🔍 computePlaceScores import is:", computePlaceScores);

// Expose globals on window for React components to access
if (typeof window !== "undefined") {
  window.globals = globals;
}

let accessibilityFilter = new Set([
  "designated",
  "yes",
  "limited",
  "unknown",
  "no",
]);

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

let editingReviewId = null;

// place-type filter state used on the map side
let placeTypeFilterState = null; // { [groupLabel]: { [subLabel]: boolean } } or null = all on

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
    if (group && typeof group === 'object') {
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
  // This allows users to deselect everything to see no places
  // But if no filters are defined at all (empty object), show all (fallback to default behavior)
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

  // build subLabel exactly like in PlacesListReact
  const subRaw =
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
    "other";

  const subLabel = subRaw.toString().replace(/[_-]/g, " ");

  const group = placeTypeFilterState[groupLabel];
  if (!group) return false;

  const val = group[subLabel];
  // if subLabel never existed in this group, treat as off
  return !!val;
}

function placeKeyFromFeature(feature) {
  const p = feature.properties || {};

  // User-added places have id (UUID) and source = 'user', but no osm_id/osm_type
  if (p.source === "user" && p.id) {
    return `user/${p.id}`; // e.g. "user/uuid-here"
  }

  // OSM places have osm_type and osm_id
  const osmType = p.osm_type || p.type;
  const osmId = p.osm_id || p.id;

  if (!osmType || !osmId) return null;
  return `${osmType}/${osmId}`; // e.g. "N/123456789"
}

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

      if (
        typeof window !== "undefined" &&
        typeof window.closePlacePopup === "function"
      ) {
        window.closePlacePopup();
      }
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

      if (
        typeof window !== "undefined" &&
        typeof window.closePlacePopup === "function"
      ) {
        window.closePlacePopup();
      }
    } finally {
      map.closePopup(clickPopup);
    }
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

function openPlaceDetailsPopup(titleText) {
  if (
    typeof window !== "undefined" &&
    typeof window.openPlacePopup === "function"
  ) {
    window.openPlacePopup(titleText);
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
        layer._bsTooltip.show();
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
  layer.on("click", () => {
    if (drawState.deleting || drawState.editing) return;
    // ✅ Only allow editing if user is logged in
    if (!currentUser) {
      // For non-logged-in users, show a read-only popup with obstacle info
      const title = tooltipTextFromProps(props);
      const popupContent = L.DomUtil.create("div", "p-2");
      popupContent.innerHTML = `
        <h6 class="mb-2">${title}</h6>
        <p class="small text-muted mb-2">🔒 Log in to edit or delete obstacles</p>
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
  } else {
    if (drawHelpAlertControl && !ls.get(DRAW_HELP_LS_KEY)) {
      map.removeControl(drawHelpAlertControl);
      drawHelpAlertControl = null;
    }

    map.removeControl(drawControl);
  }
}

function serializeBounds(bounds) {
  const s = bounds.getSouth();
  const w = bounds.getWest();
  const n = bounds.getNorth();
  const e = bounds.getEast();
  const round = (v) => Number(v.toFixed(4)); // ~10m precision
  return [round(s), round(w), round(n), round(e)];
}

function accessibilityKey() {
  return Array.from(accessibilityFilter).sort().join(",");
}

let placesReqSeq = 0;
async function refreshPlaces() {
  const mySeq = ++placesReqSeq; // capture this call’s id

  const bounds = map.getBounds();
  const zoom = map.getZoom();
  const key = showLoading("places");

  try {
    const queryKey = [
      "places",
      serializeBounds(bounds),
      zoom,
      accessibilityKey(),
    ];

    // ✅ 1. Try to reuse from cache (no network at all if present)
    let geojson = queryClient.getQueryData(queryKey);

    // ✅ 2. If not cached yet, fetch & cache via react-query
    if (!geojson) {
      geojson = await queryClient.fetchQuery({
        queryKey,
        queryFn: () => fetchPlaces(bounds, zoom, { accessibilityFilter }),
      });
    }

    // If this response is for an old call, ignore it
    if (mySeq !== placesReqSeq) return;

    // ✅ 3. Fetch user-added places from Supabase and merge them
    // IMPORTANT: OSM places have priority - never overwrite them with user places
    const userPlacesGeoJSON = await fetchUserPlaces(bounds);
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

    // ✅ 2) Compute which cached features are inside current bounds
    const featuresInView = allPlacesFeatures.filter((f) => {
      const g = f.geometry;
      if (!g) return false;
      if (g.type !== "Point" || !Array.isArray(g.coordinates)) return false;

      const [lng, lat] = g.coordinates;
      return bounds.contains(L.latLng(lat, lng));
    });

    const geojsonForView = {
      type: "FeatureCollection",
      features: featuresInView,
    };

    placeClusterLayer.clearLayers();

    const placesLayer = L.geoJSON(geojson, {
      filter: (feature) => {
        // called for each feature; return true to keep it
        return isFeatureAllowedByTypeFilter(feature);
      },
      pointToLayer: (feature, latlng) => {
        const tags = feature.properties.tags || feature.properties;
        const marker = L.marker(latlng, {
          pane: "places-pane",
          icon: makePoiIcon(tags),
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

    // 🔗 Notify React list overlay about places in the current viewport
    try {
      if (
        typeof window !== "undefined" &&
        typeof window.setPlacesListData === "function"
      ) {
        const center = map.getCenter();
        const features =
          geojson && Array.isArray(geojson.features) ? geojson.features : [];

        window.setPlacesListData({
          features,
          center: center ? { lat: center.lat, lng: center.lng } : null,
          zoom,
        });
      }
    } catch (err) {
      console.error("❌ Failed to update places list overlay:", err);
    }
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

  listEl.innerHTML = "";

  if (!globals.reviews || globals.reviews.length === 0) {
    const emptyContainer = document.createElement("div");
    emptyContainer.style.padding = "24px";
    emptyContainer.style.textAlign = "center";
    
    const emptyMsg = document.createElement("div");
    emptyMsg.style.color = "rgba(0, 0, 0, 0.6)";
    emptyMsg.style.fontSize = "0.875rem";
    emptyMsg.style.fontStyle = "italic";
    emptyMsg.textContent = "No reviews yet. Be the first to share your experience!";
    
    emptyContainer.appendChild(emptyMsg);
    listEl.appendChild(emptyContainer);
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
      cardContainer.style.borderColor = "rgba(10, 63, 137, 0.3)";
      cardContainer.style.borderRadius = "16px";
      cardContainer.style.padding = "20px";
      cardContainer.style.backgroundColor = "#ffffff";
      cardContainer.style.boxShadow = "0 2px 8px rgba(10, 63, 137, 0.15)";
      
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
        textarea.style.borderColor = "rgba(10, 63, 137, 0.5)";
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
      saveBtn.style.background = "rgba(10, 63, 137, 0.87)";
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
        saveBtn.style.backgroundColor = "rgba(10, 63, 137, 1)";
      });
      saveBtn.addEventListener("mouseleave", () => {
        saveBtn.style.backgroundColor = "rgba(10, 63, 137, 0.87)";
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
        cardContainer.style.borderColor = "rgba(10, 63, 137, 0.3)";
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
      if (categoryRatings && typeof categoryRatings === 'object' && !Array.isArray(categoryRatings) && categoryRatings !== null && Object.keys(categoryRatings).length > 0) {
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
        detailsBtn.style.color = "rgba(10, 63, 137, 0.87)";
        detailsBtn.style.fontWeight = "500";
        detailsBtn.style.display = "flex";
        detailsBtn.style.alignItems = "center";
        detailsBtn.style.gap = "6px";
        detailsBtn.style.transition = "color 0.2s";
        detailsBtn.innerHTML = '<span style="font-size: 0.75rem;">▶</span> Show category details';
        detailsBtn.setAttribute("aria-expanded", "false");
        detailsBtn.setAttribute("aria-label", "Toggle category rating details");

        detailsBtn.addEventListener("mouseenter", () => {
          detailsBtn.style.color = "rgba(10, 63, 137, 1)";
        });
        detailsBtn.addEventListener("mouseleave", () => {
          detailsBtn.style.color = "rgba(10, 63, 137, 0.87)";
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
          if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
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
              categoryItem.style.backgroundColor = "rgba(10, 63, 137, 0.08)";
              categoryItem.style.borderLeft = "3px solid rgba(10, 63, 137, 0.5)";
            } else {
              categoryItem.style.backgroundColor = "transparent";
            }

            // Category label - improved styling
            const label = document.createElement("span");
            label.style.fontWeight = isUserPreference ? "600" : "500";
            label.style.fontSize = "0.875rem";
            label.style.color = isUserPreference ? "rgba(10, 63, 137, 0.87)" : "rgba(0, 0, 0, 0.87)";
            label.textContent = ACCESSIBILITY_CATEGORY_LABELS[categoryId] || categoryId;

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
          const isExpanded = detailsBtn.getAttribute("aria-expanded") === "true";

          if (isExpanded) {
            // Collapse
            detailsContent.style.display = "none";
            detailsBtn.setAttribute("aria-expanded", "false");
            detailsBtn.innerHTML = '<span style="font-size: 0.75rem;">▶</span> Show category details';
          } else {
            // Expand
            detailsContent.style.display = "block";
            detailsBtn.setAttribute("aria-expanded", "true");
            detailsBtn.innerHTML = '<span style="font-size: 0.75rem;">▼</span> Hide category details';
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
      badgesWrapReadOnly.className = "mt-1 d-flex flex-wrap gap-1 review-badges";
      badgesWrapReadOnly.style.marginTop = "12px";
      badgesWrapReadOnly.setAttribute("aria-label", "Detected accessibility mentions");
      cardContainer.appendChild(badgesWrapReadOnly);
      
      li.appendChild(cardContainer);
    }

    listEl.appendChild(li);
  });
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
  const lv = String(value || "").toLowerCase().replace(/[_-]/g, "-");
  
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
  globals.detailsCtx.tags = tags;
  const titleText = tags.name || tags.amenity || "Details";

  elements.detailsPanel.classList.remove("d-none");
  const list = elements.detailsPanel.querySelector("#details-list");
  list.innerHTML = "";

  const nTags = normalizeTagsCase(tags);

  // 🔥 Remove raw "contact" tag (e.g. contact=yes) so it doesn't render as "Contact / Yes"
  if ("contact" in nTags) {
    delete nTags.contact;
  }
  if ("Contact" in nTags) {   // safety in case normalizeTagsCase kept a capital key
    delete nTags.Contact;
  }
  
  // CONTACT INFO - Extract website, phone, and email from tags
  const websiteLinks = splitMulti(nTags.website || nTags["contact:website"] || "")

  // Remove raw "contact" tag (e.g. contact=yes) from generic details,
  // we only want the rich Contact section (website/phone/email).
  for (const key of Object.keys(nTags)) {
    if (key && key.trim().toLowerCase() === "contact") {
      delete nTags[key];
    }
  }
  
  // Extract phone numbers (phone, contact:phone, contact:mobile, etc.)
  const phoneNumbers = [];
  const phoneKeys = ["phone", "contact:phone", "contact:mobile", "mobile", "contact:fax"];
  phoneKeys.forEach((key) => {
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
  if (websiteLinks.length > 0 || phoneNumbers.length > 0 || emailAddresses.length > 0) {
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
          fallbackHtml.push(`<div class="me-2"><h6 class="mb-1 fw-semibold">Website</h6><p class="small mb-1">${websiteLinks.map(u => `<a href="${u}" target="_blank" rel="noopener nofollow">${linkLabel(u)}</a>`).join(" · ")}</p></div>`);
        }
        if (phoneNumbers.length > 0) {
          fallbackHtml.push(`<div class="me-2"><h6 class="mb-1 fw-semibold">Phone</h6><p class="small mb-1">${phoneNumbers.map(p => `<a href="tel:${p.replace(/[\s\-\(\)]/g, '')}">${p}</a>`).join(" · ")}</p></div>`);
        }
        if (emailAddresses.length > 0) {
          fallbackHtml.push(`<div class="me-2"><h6 class="mb-1 fw-semibold">Email</h6><p class="small mb-1">${emailAddresses.map(e => `<a href="mailto:${e}">${e}</a>`).join(" · ")}</p></div>`);
        }
        contactContainer.innerHTML = fallbackHtml.join("");
      }
    })();
  }

  // OPENING HOURS - Render with React component
  const openingHours = nTags.opening_hours || nTags["opening_hours"] || null;
  if (openingHours) {
    const hoursContainer = document.createElement("div");
    hoursContainer.className = "list-group-item";
    hoursContainer.style.padding = "16px";
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
    const raw = (tags.wheelchair ?? "")
      .toString()
      .toLowerCase();

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
    designated: "#16a34a", // green
    yes: "#6cc24a", // lighter green
    limited: "#ffc107", // amber/orange
    unknown: "#6c757d", // grey
    no: "#dc3545", // red
  };

  const wheelchairTags = {};
  Object.entries(nTags).forEach(([key, value]) => {
    const lk = key.trim().toLowerCase();
    // Collect all wheelchair-related tags
    if (/^wheelchair/i.test(lk)) {
      wheelchairTags[key] = value;
    }
  });

  // Main wheelchair tag (wheelchair=yes/no/limited/etc) - always show (will show "Unknown" if missing)
  const wheelchair = wheelchairTags.wheelchair || wheelchairTags.Wheelchair || null;
  const tier = getAccessibilityTier({ wheelchair });
  const label = TIER_LABELS[tier] || "Unknown";
  const color = TIER_COLORS[tier] || TIER_COLORS.unknown;

  const accItem = document.createElement("div");
  accItem.className = "list-group-item";
  accItem.style.padding = "0";
  
  // Main container with consistent padding
  const container = document.createElement("div");
  container.style.padding = "24px"; // padding: 3 (MUI spacing)
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
  
  // Card container for the status chip
  const cardContainer = document.createElement("div");
  cardContainer.style.border = "1px solid";
  cardContainer.style.borderColor = "rgba(0, 0, 0, 0.12)"; // divider
  cardContainer.style.borderRadius = "16px"; // borderRadius: 2
  cardContainer.style.padding = "16px"; // p: 2
  cardContainer.style.display = "flex";
  cardContainer.style.alignItems = "center";
  cardContainer.style.gap = "16px"; // gap: 2
  
  // Icon container for status (48x48 to match ContactInfo items)
  const statusIconContainer = document.createElement("div");
  statusIconContainer.style.display = "flex";
  statusIconContainer.style.alignItems = "center";
  statusIconContainer.style.justifyContent = "center";
  statusIconContainer.style.width = "48px";
  statusIconContainer.style.height = "48px";
  statusIconContainer.style.borderRadius = "16px"; // borderRadius: 2
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
  statusIconContainer.style.backgroundColor = hexToRgba(color, 0.1); // 10% opacity
  statusIconContainer.style.flexShrink = "0";
  
  const statusIcon = document.createElement("div");
  statusIcon.style.width = "24px";
  statusIcon.style.height = "24px";
  statusIcon.style.display = "inline-block";
  statusIcon.style.backgroundColor = color;
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
  labelElement.textContent = "Wheelchair Access";
  
  // Chip/badge with color and label
  const chip = document.createElement("div");
  chip.style.display = "inline-block";
  chip.style.padding = "0.375rem 0.75rem";
  chip.style.borderRadius = "1rem";
  chip.style.backgroundColor = color;
  chip.style.color = "white";
  chip.style.fontSize = "0.9375rem";
  chip.style.fontWeight = "500";
  chip.style.lineHeight = "1.25";
  chip.style.fontFamily = "inherit";
  chip.textContent = label;
  
  contentWrapper.appendChild(labelElement);
  contentWrapper.appendChild(chip);
  
  cardContainer.appendChild(statusIconContainer);
  cardContainer.appendChild(contentWrapper);
  
  container.appendChild(header);
  container.appendChild(cardContainer);
  accItem.appendChild(container);
  list.appendChild(accItem);

  // Render other wheelchair tags if any exist (but skip the main wheelchair tag we already rendered)
  if (Object.keys(wheelchairTags).length > 0) {

    // Wheelchair description if available
    const wheelchairDesc = wheelchairTags["wheelchair:description"] || wheelchairTags["Wheelchair:description"];
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
      if (key.toLowerCase() === "wheelchair" || key.toLowerCase() === "wheelchair:description") {
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
        yes: "Yes",
        designated: "Designated",
        limited: "Limited",
        no: "No",
        unknown: "Unknown",
      };
      const displayValue = wheelchairLabels[String(value).toLowerCase()] || String(value);

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

  // --- ADDRESS: Render formatted address with area as secondary text ---
  const formattedAddress = formatAddressFromTags(nTags);
  if (formattedAddress) {
    const formattedArea = formatAreaFromTags(nTags);
    
    // Clean up area text: remove "eldership" and simplify
    let cleanArea = formattedArea;
    if (cleanArea) {
      cleanArea = cleanArea.replace(/\s*eldership\s*/gi, " ").trim();
      cleanArea = cleanArea.replace(/\s+/g, " "); // Remove extra spaces
    }
    
    const addressItem = document.createElement("div");
    addressItem.className =
      "list-group-item d-flex justify-content-between align-items-start";
    
    // Create icon HTML using mask technique (similar to wheelchair icon)
    const iconHtml = `
      <div style="
        width: 20px;
        height: 20px;
        display: inline-block;
        flex-shrink: 0;
        margin-top: 2px;
        background-color: #0a3f89;
        mask-image: url('/icons/maki/marker.svg');
        mask-size: contain;
        mask-repeat: no-repeat;
        mask-position: center;
        -webkit-mask-image: url('/icons/maki/marker.svg');
        -webkit-mask-size: contain;
        -webkit-mask-repeat: no-repeat;
        -webkit-mask-position: center;
      "></div>`;
    
    let addressHtml = `
      <div class="me-2" style="display: flex; align-items: flex-start; gap: 8px;">
        ${iconHtml}
        <div style="flex: 1; min-width: 0;">
        <h6 class="mb-1 fw-semibold">Address</h6>
        <p class="small mb-1">${formattedAddress}</p>`;
    
    if (cleanArea) {
      addressHtml += `
        <p class="small mb-1" style="color: #666;">${cleanArea}</p>`;
    }
    
    addressHtml += `
        </div>
      </div>`;
    addressItem.innerHTML = addressHtml;
    list.appendChild(addressItem);
  }

  // --- FLOOR: Render floor/level information (only if level exists) ---
  const levelValue = nTags.level || nTags.Level || null;
  const formattedLevel = formatLevel(levelValue);
  if (formattedLevel) {
    const floorItem = document.createElement("div");
    floorItem.className =
      "list-group-item d-flex justify-content-between align-items-start";
    floorItem.innerHTML = `
      <div class="me-2">
        <h6 class="mb-1 fw-semibold">Floor</h6>
        <p class="small mb-1">${formattedLevel}</p>
      </div>`;
    list.appendChild(floorItem);
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

  // --- CULTURAL HERITAGE REGISTRY: Handle ref:lt:kpd specially ---
  const heritageRef = nTags["ref:lt:kpd"] || nTags["Ref:Lt:Kpd"] || nTags["ref_lt_kpd"] || null;
  if (heritageRef && String(heritageRef).trim()) {
    const heritageItem = document.createElement("div");
    heritageItem.className =
      "list-group-item d-flex justify-content-between align-items-start";
    heritageItem.innerHTML = `
      <div class="me-2">
        <h6 class="mb-1 fw-semibold">Cultural heritage registry</h6>
        <p class="small mb-1">Register ID: ${String(heritageRef).trim()}</p>
      </div>`;
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
      container.style.padding = "24px"; // padding: 3 (MUI spacing)
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
  const outdoorSeating = nTags.outdoor_seating || nTags["outdoor_seating"] || null;
  if (outdoorSeating) {
    const outdoorValue = String(outdoorSeating).toLowerCase().trim();
    if (outdoorValue === "yes" || outdoorValue === "true") {
      featureChips.push("Outdoor seating");
    }
  }
  
  // Internet access
  const internetAccess = nTags.internet_access || nTags["internet_access"] || null;
  const internetFee = nTags["internet_access:fee"] || nTags["internet_access_fee"] || null;
  
  if (internetAccess && String(internetAccess).toLowerCase().trim() !== "no") {
    const accessVal = String(internetAccess).toLowerCase().trim();
    const feeVal = internetFee ? String(internetFee).toLowerCase().trim() : "";
    
    const isWifi = ["wlan", "wifi", "wlan;customers", "wifi;customers"].includes(accessVal);
    
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
  } else if (internetAccess && String(internetAccess).toLowerCase().trim() === "no") {
    // Option: show negative info as subtle text (not a chip)
    // For now, we'll skip it to keep only positive features
  }
  
  // Render Features section if we have any chips
  if (featureChips.length > 0) {
    const featuresItem = document.createElement("div");
    featuresItem.className = "list-group-item";
    featuresItem.style.padding = "0";
    featuresItem.style.marginBottom = "12px";
      
      const container = document.createElement("div");
    container.style.border = "1px solid";
    container.style.borderColor = "rgba(0, 0, 0, 0.12)";
    container.style.borderRadius = "16px";
    container.style.padding = "16px";
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
      title.textContent = "Features";
      
      header.appendChild(title);
      
    // Chips container
    const chipsContainer = document.createElement("div");
    chipsContainer.style.display = "flex";
    chipsContainer.style.flexWrap = "wrap";
    chipsContainer.style.gap = "8px";
    
    featureChips.forEach((chipLabel) => {
      const chip = document.createElement("div");
      chip.style.display = "inline-block";
      chip.style.padding = "0.375rem 0.75rem";
      chip.style.borderRadius = "1rem";
      chip.style.backgroundColor = "rgba(10, 63, 137, 0.08)";
      chip.style.color = "rgba(10, 63, 137, 0.87)";
      chip.style.fontSize = "0.8125rem";
      chip.style.fontWeight = "500";
      chip.style.lineHeight = "1.25";
      chip.style.fontFamily = "inherit";
      chip.style.border = "1px solid rgba(10, 63, 137, 0.2)";
      chip.style.cursor = "default";
      chip.style.width = "fit-content";
      chip.textContent = chipLabel;
      
      chipsContainer.appendChild(chip);
    });
      
      container.appendChild(header);
    container.appendChild(chipsContainer);
    featuresItem.appendChild(container);
    list.appendChild(featuresItem);
  }

  // --- Render basic tags (address, amenity, etc.) ---
Object.entries(nTags).forEach(([key, value]) => {
  const isOpeningHours = /^opening_hours/i.test(key);
  if (isOpeningHours) return; // Skip opening_hours - already rendered above

  // Skip wheelchair/accessibility tags - already rendered in Accessibility section
  const isWheelchair = /^wheelchair/i.test(key);
  if (isWheelchair) return;

  const lk = key.trim().toLowerCase();
  const lv = String(value).trim().toLowerCase();

  // 🔒 1) Never show the bare "contact" tag at all
  if (lk === "contact") return;

  // 🔒 2) Skip all contact-related fields (we handle them in the Contact block)
  const isWebsiteVariant =
    /^(website|url)(?::\d+)?$/i.test(key) || /^contact:website$/i.test(key);
  if (isWebsiteVariant) return;

  const isPhoneVariant =
    /^(phone|contact:phone|contact:mobile|mobile|contact:fax)$/i.test(key);
  if (isPhoneVariant) return;

  const isEmailVariant = /^(email|contact:email)$/i.test(key);
  if (isEmailVariant) return;

  if (/^contact:/i.test(key)) return; // any other contact:* tags

  // Skip "type" entirely
  if (lk === "type") return;

  // Skip "osm_key" and "osm_type" - only useful for mappers
  if (lk === "osm_key" || lk === "osm_type" || key === "Osm Key") return;

  // Skip outdoor_seating and internet_access - already rendered as Features chips
  if (lk === "outdoor_seating" || lk === "outdoor seating") return;
  if (lk === "internet_access" || lk === "internet_access:fee" || lk === "internet_access_fee") return;
  
  // Skip beds and rooms - already rendered as Capacity section
  if (lk === "beds" || lk === "rooms") return;
  
  // Skip stars - already rendered as dedicated Stars section
  if (lk === "stars") return;
  
  // Skip ref:lt:kpd - already rendered as Cultural heritage registry
  if (lk === "ref:lt:kpd" || lk === "ref_lt_kpd") return;
  
  // Skip all other ref:* tags - too technical for regular users
  if (lk.startsWith("ref:") || key.startsWith("ref:")) return;

  // Skip address parts – we already show a formatted address above
  const isAddressField =
    /^addr:(street|housenumber|city|postcode|country_code|town|suburb|country)$/i.test(
      key
    ) ||
    /^(postcode|housenumber|street|countrycode|city)$/i.test(lk) ||
    (lk === "city" && (nTags["addr:city"] || nTags["addr_city"]));
  if (isAddressField) return;

  // Skip area fields – already rendered as “Area”
  const isAreaField = /^(state|county|district|locality)$/i.test(lk);
  if (isAreaField) return;

  // Skip name + level (already rendered elsewhere)
  if (lk === "name" || lk === "level") return;

  // Skip amenity=yes (useless)
  if (lk === "amenity" && lv === "yes") return;

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


  // Default label/value
  let displayKey;
  if (key === "display_name") {
    displayKey = "Address";
  } else if (lk === "amenity") {
    displayKey = "Category"; // Rename "Amenity" to "Category"
  } else {
    displayKey = key
      .replace(/^Addr_?/i, "")
      .replace(/[_:]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const displayValue = String(value)
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part)
    .join(" • ")
    .replace(/[_:]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // 🧨 Final safety net:
  // If this generic row would have the label "Contact", skip it completely.
  // This prevents "Contact / Yes" (or any other value) from showing
  // while keeping the dedicated Contact section (website/phone/email).
  if (displayKey.trim() === "Contact") {
    return;
  }

  // Check if this is a place type that should have an icon (amenity, tourism, shop, leisure, healthcare, office, historic, sport)
  const isPlaceType = ["amenity", "tourism", "shop", "leisure", "healthcare", "office", "historic", "sport"].includes(lk);
  let iconHtml = "";
  
  if (isPlaceType) {
    const iconName = getMuiIconForPlaceType(lk, value);
    // Use Material Icons font (should be loaded via MUI)
    iconHtml = `
      <span class="material-icons" style="
        font-size: 20px;
        color: #0a3f89;
        vertical-align: middle;
        margin-right: 8px;
        display: inline-block;
      ">${iconName}</span>`;
  }

  item.innerHTML = `
    <div class="me-2" style="display: flex; align-items: flex-start; gap: 8px;">
      ${iconHtml ? `<div style="flex-shrink: 0; margin-top: 2px;">${iconHtml}</div>` : ""}
      <div style="flex: 1; min-width: 0;">
      <h6 class="mb-1 fw-semibold">${displayKey}</h6>
      <p class="small mb-1">${displayValue}</p>
      </div>
    </div>`;
  list.appendChild(item);
});

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
  openPlaceDetailsPopup(titleText);

  let uuid = null;

  try {
    uuid = await ensurePlaceExists(tags, latlng);
    if (uuid) {
      globals.detailsCtx.placeId = uuid;
      console.log("✅ globals.detailsCtx.placeId (UUID):", uuid);
    } else {
      console.warn("⚠️ ensurePlaceExists returned null/undefined");
    }
  } catch (err) {
    console.warn("⚠️ ensurePlaceExists failed, skipping reviews:", err);
    // Don't set placeId to null - keep the OSM ID so ReviewForm can retry
    // globals.detailsCtx.placeId remains as the OSM ID from line 1205
  }

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
    }
  } finally {
    hideLoading(key);
  }

  // ✅ Render reviews
  renderReviewsList();

  try {
    console.log("🧮 Before computePlaceScores, reviews:", globals.reviews);

    // Load real user preferences from profiles.accessibility_preferences
    const prefs = await getUserAccessibilityPreferences();

    const { perCategory, personalScore, globalScore } = computePlaceScores(
      globals.reviews,
      prefs
    );

    console.log("🧮 Accessibility stats for current place:", {
      perCategory,
      personalScore,
      globalScore,
      prefs,
    });
  } catch (err) {
    console.error("❌ computePlaceScores failed:", err);
  }

  // --- Photos ---
  try {
    const keyPhotos = showLoading("photos-load");
    const photos = await resolvePlacePhotos(tags, latlng);

    // console.log(
    //   "📷 resolvePlacePhotos returned",
    //   photos.length,
    //   "items:",
    //   photos
    // );
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
      });
    } else if (feature.properties.shape === "rectangle") {
      const bounds = L.geoJSON(feature).getBounds();
      layer = L.rectangle(bounds, { color: "red" });
    } else {
      layer = L.geoJSON(feature, { style: { color: "red" } }).getLayers()[0];
    }

    layer.options.obstacleId = feature.id;
    drawnItems.addLayer(layer);
    hookLayerInteractions(layer, feature.properties);
    // Attach tooltip with vote counts support after layer is added
    layer.once("add", () => {
      attachObstacleTooltip(layer, feature);
    });
  });

  map.addLayer(drawnItems);

  // ✅ Only initialize draw controls and event handlers if user is logged in
  if (currentUser) {
    if (!drawControl) {
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
        selectDepartureSuggestion(item); // existing logic
      };

      departureSuggestionsRoot.render(
        React.createElement(DepartureSuggestionsReact, {
          items: items || [],
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
      map.fitBounds(bounds, { padding: [40, 40] });
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
    const enriched =
      queryClient.getQueryData(["place-tags", osmKey]) ??
      (await queryClient.fetchQuery({
        queryKey: ["place-tags", osmKey],
        queryFn: () => fetchPlace(osmType, osmId),
      })); // uses Overpass
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

let currentUser = null;
let obstacleEventHandlersSetup = false;

export function updateUser(user) {
  currentUser = user;

  // reset prefs cache when user logs in / out so next place open refetches
  userPrefsCache = [];
  userPrefsLoaded = false;
  // If user logged in, initialize draw controls if not already done
  if (user && !drawControl && map) {
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

  // Expose map on window for React components
  if (typeof window !== "undefined") {
    window.map = map;
    window.updateObstacle = updateObstacleInMap;
  }

  const initialName = ls.get(BASEMAP_LS_KEY) || "OSM Greyscale";

  currentBasemapLayer = baseLayers[initialName] || osm;
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
          const tags = props.tags || props || {};

          // Show details panel (Overview/Reviews/Photos)
          await renderDetails(tags, latlng, { keepDirectionsUi: true });

          // Focus map on the selected place
          if (map) {
            const currentZoom = map.getZoom() || DEFAULT_ZOOM;
            const targetZoom = Math.max(currentZoom, 17);
            map.setView(latlng, targetZoom);
          }
        } catch (err) {
          console.error("❌ selectPlaceFromListFeature failed:", err);
        }
      };
    }

    // console.log("✅ Leaflet map ready, initializing places...");
    placesPane = map.createPane("places-pane");
    placesPane.style.zIndex = 450;

    // Initialize place type filter state from localStorage on map load
    placeTypeFilterState = loadPlaceTypeFilterFromLS();

    map.addControl(new ZoomMuiControl({ position: "bottomright" }));
    placeClusterLayer.addTo(map);

    // AccessibilityLegend removed - now available in sidebar Filters dialog

    map.on("draw:editstart", () => (drawState.editing = true));
    map.on("draw:editstop", () => (drawState.editing = false));
    map.on("draw:deletestart", () => (drawState.deleting = true));
    map.on("draw:deletestop", () => (drawState.deleting = false));

    map.on("moveend", debounce(refreshPlaces, 20));
    const initialZoom = map.getZoom();
    if (initialZoom >= SHOW_PLACES_ZOOM) {
      // Run once on first load so list & markers appear without dragging
      refreshPlaces();
    }

    await initDrawingObstacles();

    map.addControl(new BasemapGallery({ initial: initialName }));

    map.on("baselayerchange", (e) => ls.set(BASEMAP_LS_KEY, e.name));
    map.on("zoomend", toggleObstaclesByZoom);
    map.on("click", (e) => {
      if (drawState.editing || drawState.deleting) return;
      // Don't show quick route popup if we're selecting location for adding a place
      if (globals._isSelectingPlaceLocation) return;
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
        toggleDepartureSuggestions(false);
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

  document.addEventListener("click", hideSuggestionsIfClickedOutside);

  elements.detailsPanel
    .querySelector("#btn-start-here")
    .addEventListener("click", async () => {
      elements.directionsUi.classList.remove("d-none");
      moveDepartureSearchBarUnderTo();
      mountInOffcanvas("Directions");
      if (
        typeof window !== "undefined" &&
        typeof window.closePlacePopup === "function"
      ) {
        window.closePlacePopup();
      }
      await setFrom(globals.detailsCtx.latlng);
      elements.departureSearchInput.focus();
    });

  elements.detailsPanel
    .querySelector("#btn-go-here")
    .addEventListener("click", async () => {
      elements.directionsUi.classList.remove("d-none");
      moveDepartureSearchBarUnderTo();
      mountInOffcanvas("Directions");
      if (
        typeof window !== "undefined" &&
        typeof window.closePlacePopup === "function"
      ) {
        window.closePlacePopup();
      }
      await setTo(globals.detailsCtx.latlng);
      elements.departureSearchInput.focus();
    });

  // ✅ Set up review form handler using event delegation (for old HTML form, kept for backward compatibility)
  // This works even if the form is created dynamically after login
  elements.detailsPanel.addEventListener("submit", async (e) => {
    // Only handle review form submissions (old HTML form)
    if (e.target.id !== "review-form") return;

    e.preventDefault();

    // ✅ Check authentication before allowing review submission
    if (!currentUser) {
      toastError("Please log in to submit a review.");
      return;
    }

    const textarea = e.target.querySelector("#review-text");
    if (!textarea) return;

    const text = textarea.value.trim();
    if (!text) return;

    const submitBtn = e.target.querySelector("#submit-review-btn");
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
        submitBtn,
        reviewStorage("POST", newReview),
        "Saving…"
      );

      // ✅ Reload and render updated reviews list
      globals.reviews = await reviewStorage("GET", { place_id: placeId });
      renderReviewsList();

      textarea.value = "";

      recomputePlaceAccessibilityKeywords().catch(console.error);
    } catch (error) {
      console.error("❌ Failed to save review:", error);
      toastError("Could not save your review. Please try again.");
    }
  });

  // ✅ Listen for review submissions from React ReviewForm component
  window.addEventListener("review-submitted", async (e) => {
    const placeId = e.detail?.placeId || globals.detailsCtx?.placeId;
    if (!placeId) return;

    try {
      // Reload and render updated reviews list
      globals.reviews = await reviewStorage("GET", { place_id: placeId });
      renderReviewsList();
      recomputePlaceAccessibilityKeywords(true).catch(console.error);
    } catch (error) {
      console.error("❌ Failed to refresh reviews:", error);
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

  // ✅ Listen for user-added place events to refresh the map
  if (typeof window !== "undefined") {
    window.addEventListener("user-place-added", (ev) => {
      console.log("📍 User place added, refreshing map...", ev.detail);
      // Invalidate cache to force fresh fetch including new user place
      const bounds = map.getBounds();
      const queryKey = [
        "places",
        serializeBounds(bounds),
        map.getZoom(),
        accessibilityKey(),
      ];
      queryClient.invalidateQueries({ queryKey });
      // Refresh places on map
      refreshPlaces();
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
