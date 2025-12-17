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

async function renderReviewsList() {
  const listEl = elements.reviewsList;
  if (!listEl) return;

  listEl.innerHTML = "";

  if (!globals.reviews || globals.reviews.length === 0) {
    const emptyMsg = document.createElement("li");
    emptyMsg.className = "list-group-item text-muted";
    emptyMsg.textContent = "No reviews yet.";
    listEl.appendChild(emptyMsg);
    return;
  }

  // Load user's accessibility preferences to highlight matching categories
  const userPreferences = await getUserAccessibilityPreferences();
  const userPrefsSet = new Set(userPreferences || []);

  globals.reviews.forEach((review) => {
    const li = document.createElement("li");
    li.className = "list-group-item text-wrap";
    li.dataset.reviewId = review.id;

    const isEditing = editingReviewId === review.id;

    if (isEditing) {
      // === Inline edit mode ===
      const form = document.createElement("form");
      form.className = "d-grid gap-2";

      // Show rating in edit mode (read-only display)
      const ratingValue = review.rating || review.overall_rating;
      if (ratingValue && ratingValue >= 1 && ratingValue <= 5) {
        const ratingContainer = document.createElement("div");
        ratingContainer.className = "mb-2 d-flex align-items-center gap-1";

        const starsContainer = document.createElement("span");
        starsContainer.className = "text-warning";
        starsContainer.style.fontSize = "1.1rem";
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
        ratingText.className = "text-muted ms-1";
        ratingText.style.fontSize = "0.9rem";
        ratingText.textContent = ratingValue;

        ratingContainer.appendChild(starsContainer);
        ratingContainer.appendChild(ratingText);
        form.appendChild(ratingContainer);
      }

      const textarea = document.createElement("textarea");
      textarea.className = "form-control";
      textarea.value = review.comment || "";
      textarea.required = false; // Comment is optional
      textarea.rows = 3;
      textarea.setAttribute("aria-label", "Edit your review comment");
      form.appendChild(textarea);

      const footerRow = document.createElement("div");
      footerRow.className =
        "d-flex justify-content-between align-items-center mt-1 gap-2";

      const meta = document.createElement("small");
      meta.className = "text-muted";

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
      actions.className = "btn-group btn-group-sm";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn-outline-secondary btn-sm";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => {
        editingReviewId = null;
        renderReviewsList();
        // Re-render badges/summary for consistency
        recomputePlaceAccessibilityKeywords().catch(console.error);
      });

      const saveBtn = document.createElement("button");
      saveBtn.type = "submit";
      saveBtn.className = "btn btn-primary btn-sm";
      saveBtn.textContent = "Save";

      actions.appendChild(cancelBtn);
      actions.appendChild(saveBtn);
      footerRow.appendChild(meta);
      footerRow.appendChild(actions);
      form.appendChild(footerRow);

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
      badgesWrap.setAttribute("aria-label", "Detected accessibility mentions");
      li.appendChild(badgesWrap);
    } else {
      // === Normal (read-only) mode ===

      // Reviewer header with profile icon and name
      const reviewerHeader = document.createElement("div");
      reviewerHeader.className = "d-flex align-items-center gap-2 mb-2";

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

      // Profile icon/avatar with initials
      const avatar = document.createElement("div");
      avatar.className =
        "rounded-circle d-flex align-items-center justify-content-center text-white fw-bold";
      avatar.style.width = "32px";
      avatar.style.height = "32px";
      avatar.style.fontSize = "0.875rem";
      avatar.style.flexShrink = "0";

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

      // Reviewer name
      const nameElement = document.createElement("span");
      nameElement.className = "fw-semibold";
      nameElement.textContent = reviewerName;

      reviewerHeader.appendChild(avatar);
      reviewerHeader.appendChild(nameElement);
      li.appendChild(reviewerHeader);

      // Rating display - show stars based on rating value
      const ratingValue = review.rating || review.overall_rating;
      if (ratingValue && ratingValue >= 1 && ratingValue <= 5) {
        const ratingContainer = document.createElement("div");
        ratingContainer.className = "mb-2 d-flex align-items-center gap-1";

        // Create star rating display (filled and empty stars)
        const starsContainer = document.createElement("div");
        starsContainer.className = "text-warning";
        starsContainer.style.fontSize = "1.1rem";
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

        // Add numeric rating next to stars
        const ratingText = document.createElement("span");
        ratingText.className = "text-muted ms-1";
        ratingText.style.fontSize = "0.9rem";
        ratingText.textContent = ratingValue;

        ratingContainer.appendChild(starsContainer);
        ratingContainer.appendChild(ratingText);
        li.appendChild(ratingContainer);
      }

      // Main comment text - only show if comment exists
      const commentText = review.comment || "";
      if (commentText.trim()) {
        const textP = document.createElement("p");
        textP.className = "mb-1";
        textP.textContent = commentText;
        li.appendChild(textP);
      } else if (!ratingValue) {
        // If no rating and no comment, show a placeholder
        const noContentP = document.createElement("p");
        noContentP.className = "mb-1 text-muted fst-italic";
        noContentP.textContent = "No comment provided.";
        li.appendChild(noContentP);
      }

      // Category ratings details section (if review has category_ratings)
      const categoryRatings = review.category_ratings;
      if (categoryRatings && typeof categoryRatings === 'object' && !Array.isArray(categoryRatings) && categoryRatings !== null && Object.keys(categoryRatings).length > 0) {
        const detailsContainer = document.createElement("div");
        detailsContainer.className = "mt-2 mb-2";

        // Create a button to toggle details visibility
        const detailsBtn = document.createElement("button");
        detailsBtn.type = "button";
        detailsBtn.className = "btn btn-link btn-sm p-0 text-decoration-none";
        detailsBtn.style.fontSize = "0.875rem";
        detailsBtn.innerHTML = '<span class="details-icon">▶</span> Show category details';
        detailsBtn.setAttribute("aria-expanded", "false");
        detailsBtn.setAttribute("aria-label", "Toggle category rating details");

        // Create collapsible details content
        const detailsContent = document.createElement("div");
        detailsContent.className = "mt-2";
        detailsContent.style.fontSize = "0.875rem";
        detailsContent.style.display = "none"; // Initially hidden

        // Create list of category ratings
        const categoryList = document.createElement("div");
        categoryList.className = "d-flex flex-column gap-1";

        Object.entries(categoryRatings).forEach(([categoryId, rating]) => {
          if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
            const categoryItem = document.createElement("div");
            categoryItem.className = "d-flex justify-content-between align-items-center";
            
            // Check if this category is in user's preferences
            const isUserPreference = userPrefsSet.has(categoryId);
            
            // Apply highlighting style if it matches user preferences
            if (isUserPreference) {
              categoryItem.style.backgroundColor = "#e3f2fd"; // Light blue background
              categoryItem.style.padding = "4px 8px";
              categoryItem.style.borderRadius = "4px";
              categoryItem.style.borderLeft = "3px solid #2196f3"; // Blue left border
            }

            // Category label
            const label = document.createElement("span");
            label.className = isUserPreference ? "fw-semibold" : "text-muted";
            label.style.color = isUserPreference ? "#1976d2" : ""; // Blue text for user preferences
            label.textContent = ACCESSIBILITY_CATEGORY_LABELS[categoryId] || categoryId;

            // Rating display (stars)
            const ratingDisplay = document.createElement("div");
            ratingDisplay.className = "d-flex align-items-center gap-1";

            const starsContainer = document.createElement("span");
            starsContainer.className = "text-warning";
            starsContainer.style.fontSize = "0.9rem";

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
            ratingText.className = "text-muted ms-1";
            ratingText.style.fontSize = "0.8rem";
            ratingText.textContent = rating;

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
        li.appendChild(detailsContainer);

        // Toggle functionality
        detailsBtn.addEventListener("click", () => {
          const isExpanded = detailsBtn.getAttribute("aria-expanded") === "true";

          if (isExpanded) {
            // Collapse
            detailsContent.style.display = "none";
            detailsBtn.setAttribute("aria-expanded", "false");
            detailsBtn.innerHTML = '<span class="details-icon">▶</span> Show category details';
          } else {
            // Expand
            detailsContent.style.display = "block";
            detailsBtn.setAttribute("aria-expanded", "true");
            detailsBtn.innerHTML = '<span class="details-icon">▼</span> Hide category details';
          }
        });
      }

      // Meta + actions row
      const footer = document.createElement("div");
      footer.className =
        "d-flex justify-content-between align-items-center mt-1 gap-2";

      const meta = document.createElement("small");
      meta.className = "text-muted";

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
        }
      }

      footer.appendChild(meta);

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
        actions.className = "btn-group btn-group-sm";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn btn-outline-secondary btn-sm";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", () => handleEditReview(review));

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-outline-danger btn-sm";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => handleDeleteReview(review));

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        footer.appendChild(actions);
      }

      li.appendChild(footer);

      // Placeholder for accessibility keyword badges
      const badgesWrap = document.createElement("div");
      badgesWrap.className = "mt-1 d-flex flex-wrap gap-1 review-badges";
      badgesWrap.setAttribute("aria-label", "Detected accessibility mentions");
      li.appendChild(badgesWrap);
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

  // --- ADDRESS: Render formatted address (single line) ---
  const formattedAddress = formatAddressFromTags(nTags);
  if (formattedAddress) {
    const addressItem = document.createElement("div");
    addressItem.className =
      "list-group-item d-flex justify-content-between align-items-start";
    addressItem.innerHTML = `
      <div class="me-2">
        <h6 class="mb-1 fw-semibold">Address</h6>
        <p class="small mb-1">${formattedAddress}</p>
      </div>`;
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

  // --- AREA: Optionally render area information (district, county) ---
  const formattedArea = formatAreaFromTags(nTags);
  if (formattedArea) {
    const areaItem = document.createElement("div");
    areaItem.className =
      "list-group-item d-flex justify-content-between align-items-start";
    areaItem.innerHTML = `
      <div class="me-2">
        <h6 class="mb-1 fw-semibold" style="font-size: 0.875rem; color: #666;">Area</h6>
        <p class="small mb-1" style="color: #666;">${formattedArea}</p>
      </div>`;
    list.appendChild(areaItem);
  }

  // --- Render basic tags (address, amenity, etc.) ---
Object.entries(nTags).forEach(([key, value]) => {
  const isOpeningHours = /^opening_hours/i.test(key);
  if (isOpeningHours) return; // Skip opening_hours - already rendered above

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
  } else {
    displayKey = key
      .replace(/^Addr_?/i, "")
      .replace(/[_:]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const displayValue = String(value)
    .replace(/[_:]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // 🧨 Final safety net:
  // If this generic row would have the label "Contact", skip it completely.
  // This prevents "Contact / Yes" (or any other value) from showing
  // while keeping the dedicated Contact section (website/phone/email).
  if (displayKey.trim() === "Contact") {
    return;
  }

  item.innerHTML = `
    <div class="me-2">
      <h6 class="mb-1 fw-semibold">${displayKey}</h6>
      <p class="small mb-1">${displayValue}</p>
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
