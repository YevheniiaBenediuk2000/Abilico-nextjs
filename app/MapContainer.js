"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "./styles/ui.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "./styles/poi-badge.css";
import "./styles/road-accessibility.css";
import { supabase } from "./api/supabaseClient.js";

import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import LockIcon from "@mui/icons-material/Lock";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import Tooltip from "@mui/material/Tooltip";
import AccessibleForwardIcon from "@mui/icons-material/AccessibleForward";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import SearchIcon from "@mui/icons-material/Search";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import InputAdornment from "@mui/material/InputAdornment";
import Drawer from "@mui/material/Drawer";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Divider from "@mui/material/Divider";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Chip from "@mui/material/Chip";
import Checkbox from "@mui/material/Checkbox";
import FormGroup from "@mui/material/FormGroup";
import Rating from "@mui/material/Rating";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import AccessibilityNewIcon from "@mui/icons-material/AccessibilityNew";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import Collapse from "@mui/material/Collapse";

import PlacesListReact from "./components/PlacesListReact";
import ReviewForm from "./components/ReviewForm";
import ObstaclePopupDialog from "./components/ObstaclePopupDialog";
import AccessibilityInfoLegend from "./components/AccessibilityInfoLegend";
import RoadAccessibilityLegend, {
  VIZ_MODES,
} from "./components/RoadAccessibilityLegend";
import { ensurePlaceExists } from "./api/reviewStorage.js";
import globals from "./constants/globalVariables.js";
import { PRIMARY_BLUE } from "./constants/constants.mjs";

// Accessibility level colors
const GREEN = "#4caf50";
const ORANGE = "#ff9800";
const RED = "#f44336";

// Accessibility level labels
const ACCESSIBILITY_LABEL_DESIGNATED = "Designated";
const ACCESSIBILITY_LABEL_ACCESSIBLE = "Accessible";
const ACCESSIBILITY_LABEL_LIMITED = "Limited";
const ACCESSIBILITY_LABEL_NOT_ACCESSIBLE = "Not Accessible";
import { toastError, toastSuccess } from "./utils/toast.mjs";
import {
  TAG_CHIP_ICON_STYLE,
  TAG_CHIP_SX,
  TAG_CHIP_WITH_ICON_SX,
} from "./constants/tagChips";
// Import cache clearing utilities (automatically exposes window.clearAllCaches, etc.)
import "./utils/clearCache.mjs";

function DetailsTabPanel({ value, active, children }) {
  const hidden = active !== value;
  const [shouldHide, setShouldHide] = useState(hidden);

  useEffect(() => {
    if (hidden) {
      // Delay hiding to allow fade-out animation
      const timer = setTimeout(() => setShouldHide(true), 150);
      return () => clearTimeout(timer);
    } else {
      // Show immediately
      setShouldHide(false);
    }
  }, [hidden]);

  return (
    <div
      role="tabpanel"
      id={`tab-${value}`} // keeps tab-overview / tab-reviews / tab-photos
      aria-labelledby={`${value}-tab`}
      hidden={shouldHide}
      className={`details-tab-panel ${shouldHide ? "d-none" : ""}`}
      style={{
        opacity: hidden ? 0 : 1,
        transition: "opacity 150ms ease-out",
      }}
    >
      {children}
    </div>
  );
}

export default function MapContainer({
  user: initialUser,
  isPlacesListOpen = false,
  onPlacesListClose = () => {},
}) {
  const [user, setUser] = useState(initialUser);
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const mapResizeCleanupRef = useRef(null);
  const [showObstacleManagementOverlay, setShowObstacleManagementOverlay] =
    useState(true);
  const [obstacleOverlayPrefLoaded, setObstacleOverlayPrefLoaded] =
    useState(false);

  useEffect(() => {
    // Persist dismissal across reloads
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const dismissed =
          window.localStorage.getItem("abilico_obstacle_overlay_dismissed") ===
          "1";
        setShowObstacleManagementOverlay(!dismissed);
      }
    } catch {
      // If localStorage is blocked, fall back to default behavior (show overlay)
      setShowObstacleManagementOverlay(true);
    } finally {
      setObstacleOverlayPrefLoaded(true);
    }
  }, []);

  const [detailsTab, setDetailsTab] = useState("overview");
  const [placesListData, setPlacesListData] = useState(null);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [detailsTitle, setDetailsTitle] = useState("Details");

  const [placePopupOpen, setPlacePopupOpen] = useState(false);
  const [placePopupTitle, setPlacePopupTitle] = useState("Details");
  const [placeShortName, setPlaceShortName] = useState(null);
  const [placeCategory, setPlaceCategory] = useState(null);
  const [placeDistance, setPlaceDistance] = useState(null);
  const [placeFeatures, setPlaceFeatures] = useState([]);

  const [obstacleDialogOpen, setObstacleDialogOpen] = useState(false);
  const [selectedObstacle, setSelectedObstacle] = useState(null);

  const [inaccuracyModalOpen, setInaccuracyModalOpen] = useState(false);
  const [selectedInaccuracyReason, setSelectedInaccuracyReason] = useState("");
  const [inaccuracyScreen, setInaccuracyScreen] = useState(1); // 1 = reason selection, 2 = accessibility details, 3 = details
  const [selectedRealityStatus, setSelectedRealityStatus] = useState("");
  const [selectedSpecificIssues, setSelectedSpecificIssues] = useState([]);
  const [inaccuracyComment, setInaccuracyComment] = useState("");
  const [expandedDetails, setExpandedDetails] = useState(false);

  const [isPlaceSaved, setIsPlaceSaved] = useState(false);
  const [savedPlaceId, setSavedPlaceId] = useState(null);
  const [saveSnackbarOpen, setSaveSnackbarOpen] = useState(false);
  const [saveSnackbarMessage, setSaveSnackbarMessage] = useState("");
  const [lastCheckedDate, setLastCheckedDate] = useState(null);

  // Reviews UX: reading mode in-tab + separate write flow (modal/sheet)
  const [reviewWriteOpen, setReviewWriteOpen] = useState(false);
  const [reviewStats, setReviewStats] = useState({ count: 0, avg: 0 });

  // Road accessibility layer state
  const [roadAccessibilityEnabled, setRoadAccessibilityEnabled] =
    useState(false);
  const [roadVizMode, setRoadVizMode] = useState(VIZ_MODES.OVERALL);
  const [roadAccessibilityLoading, setRoadAccessibilityLoading] =
    useState(false);
  const [predictionsEnabled, setPredictionsEnabled] = useState(true);
  const [predictionsLoading, setPredictionsLoading] = useState(false);
  const [onnxReady, setOnnxReady] = useState(false);

  // Set up road accessibility loading callback
  // Use polling to handle race condition with mapMain.js initialization
  useEffect(() => {
    let mounted = true;
    let intervalId = null;

    const trySetCallback = () => {
      if (typeof window !== "undefined" && window.setRoadLoadingCallback) {
        window.setRoadLoadingCallback(setRoadAccessibilityLoading);
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        return true;
      }
      return false;
    };

    // Try immediately
    if (!trySetCallback()) {
      // If not available yet, poll every 100ms
      intervalId = setInterval(() => {
        if (!mounted) {
          clearInterval(intervalId);
          return;
        }
        trySetCallback();
      }, 100);
    }

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
      if (typeof window !== "undefined" && window.setRoadLoadingCallback) {
        window.setRoadLoadingCallback(null);
      }
    };
  }, []);

  // Set up predictions loading callback
  useEffect(() => {
    let mounted = true;
    let intervalId = null;

    const trySetCallback = () => {
      if (
        typeof window !== "undefined" &&
        window.setPredictionsLoadingCallback
      ) {
        window.setPredictionsLoadingCallback(setPredictionsLoading);
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        return true;
      }
      return false;
    };

    // Try immediately
    if (!trySetCallback()) {
      // If not available yet, poll every 100ms
      intervalId = setInterval(() => {
        if (!mounted) {
          clearInterval(intervalId);
          return;
        }
        trySetCallback();
      }, 100);
    }

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
      if (
        typeof window !== "undefined" &&
        window.setPredictionsLoadingCallback
      ) {
        window.setPredictionsLoadingCallback(null);
      }
    };
  }, []);

  // Check ONNX models ready state when road layer is enabled
  useEffect(() => {
    if (roadAccessibilityEnabled && predictionsEnabled) {
      const checkOnnxReady = () => {
        if (typeof window !== "undefined" && window.isOnnxModelsReady) {
          const ready = window.isOnnxModelsReady();
          setOnnxReady(ready);
        }
      };

      // Check immediately and then every second
      checkOnnxReady();
      const intervalId = setInterval(checkOnnxReady, 1000);

      return () => clearInterval(intervalId);
    }
  }, [roadAccessibilityEnabled, predictionsEnabled]);

  // Expose a global function so mapMain.js can open the details drawer
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Right drawer – used only for routes now
      window.openPlaceDetails = (titleText) => {
        if (titleText) setDetailsTitle(titleText);
        setDetailsDrawerOpen(true);
      };
      window.closePlaceDetails = () => {
        setDetailsDrawerOpen(false);
        if (
          typeof window !== "undefined" &&
          typeof window.restoreDestinationSearchBarHome === "function"
        ) {
          window.restoreDestinationSearchBarHome();
        }
      };

      // NEW: floating place-details popup
      window.openPlacePopup = (
        titleText,
        category = null,
        distance = null,
        features = [],
        shortName = null
      ) => {
        if (titleText) setPlacePopupTitle(titleText);
        setPlaceShortName(shortName);
        setPlaceCategory(category);
        setPlaceDistance(distance);
        setPlaceFeatures(features || []);
        // Reset review UI state when switching places
        setReviewWriteOpen(false);
        setReviewStats({ count: 0, avg: 0 });
        setPlacePopupOpen(true);
      };
      window.closePlacePopup = () => {
        setPlacePopupOpen(false);
        // Clear vision accessibility control when place popup is closed
        if (
          typeof window !== "undefined" &&
          window.visionAccessibilityControl
        ) {
          window.visionAccessibilityControl.clear();
        }
      };

      // Obstacle popup dialog
      window.openObstacleDialog = (obstacle) => {
        setSelectedObstacle(obstacle);
        setObstacleDialogOpen(true);
      };
      window.closeObstacleDialog = () => {
        setObstacleDialogOpen(false);
        setSelectedObstacle(null);
      };
    }

    return () => {
      if (typeof window !== "undefined") {
        delete window.openPlaceDetails;
        delete window.closePlaceDetails;
        delete window.openPlacePopup;
        delete window.closePlacePopup;
      }
    };
  }, []);

  // Keep review summary in sync with mapMain.js (which renders the list into #reviews-list)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncFromGlobals = () => {
      try {
        const g = window.globals;
        const ratings = (g?.reviews || [])
          .map((r) => Number(r?.rating ?? r?.overall_rating))
          .filter((n) => Number.isFinite(n) && n > 0);
        const count = ratings.length;
        const avg = count ? ratings.reduce((s, n) => s + n, 0) / count : 0;
        setReviewStats({ count, avg });
      } catch {
        // ignore
      }
    };

    const onReviewsUpdated = (e) => {
      const detail = e?.detail;
      if (detail && typeof detail === "object") {
        const count = Number(detail.count) || 0;
        const avg = Number(detail.avg) || 0;
        setReviewStats({ count, avg });
      } else {
        syncFromGlobals();
      }
    };

    const onReviewSubmitted = () => {
      // Close the write modal after a successful submission
      setReviewWriteOpen(false);
      // If mapMain hasn't emitted the updated stats yet, sync as a fallback
      setTimeout(syncFromGlobals, 250);
    };

    window.addEventListener("reviews-updated", onReviewsUpdated);
    window.addEventListener("review-submitted", onReviewSubmitted);
    return () => {
      window.removeEventListener("reviews-updated", onReviewsUpdated);
      window.removeEventListener("review-submitted", onReviewSubmitted);
    };
  }, []);

  // Load reviews when the reviews tab is clicked
  useEffect(() => {
    if (
      detailsTab === "reviews" &&
      typeof window !== "undefined" &&
      typeof window.ensureReviewsLoaded === "function"
    ) {
      // Call ensureReviewsLoaded to fetch reviews if they haven't been loaded yet
      window.ensureReviewsLoaded().catch((error) => {
        console.error("❌ Failed to load reviews when tab clicked:", error);
      });
    }
  }, [detailsTab]);

  const handleDetailsDrawerClose = () => {
    setDetailsDrawerOpen(false);
    if (
      typeof window !== "undefined" &&
      window.restoreDestinationSearchBarHome
    ) {
      window.restoreDestinationSearchBarHome();
    }
  };

  // Receive "places in viewport" data from mapMain.js
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.setPlacesListData = (payload) => {
      setPlacesListData(payload);
    };

    return () => {
      if (window.setPlacesListData) {
        delete window.setPlacesListData;
      }
    };
  }, []);

  // Track user session changes
  useEffect(() => {
    // Get initial user, handling errors gracefully
    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (error) {
          // Silently handle auth errors - user might not be logged in
          console.debug("Auth check:", error.message);
          setUser(null);
        } else {
          setUser(data?.user ?? null);
        }
      })
      .catch((err) => {
        // Handle any unexpected errors
        console.debug("Auth check error:", err);
        setUser(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      // ✅ Dynamically import Leaflet + plugins
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      await import("leaflet.markercluster/dist/MarkerCluster.css");
      await import("leaflet.markercluster/dist/MarkerCluster.Default.css");
      await import("leaflet-draw");
      await import("leaflet-draw/dist/leaflet.draw.css");
      await import("leaflet-control-geocoder");
      await import("leaflet-control-geocoder/dist/Control.Geocoder.css");

      // ✅ Bootstrap JS
      await import("bootstrap/dist/js/bootstrap.bundle.min.js");
      window.bootstrap = await import("bootstrap");

      // ✅ Now that everything is rendered and loaded, run your main logic
      const { initMap, updateUser } = await import("./mapMain.js");
      if (isMounted) {
        await initMap(user); // <— pass user to initMap
        // Store updateUser function globally so we can call it when user changes
        window.updateMapUser = updateUser;

        // Smooth + reliable: invalidate size when the map container actually changes size.
        // This avoids multiple delayed invalidateSize() calls that can look like "jumping".
        const attachResizeObserver = () => {
          if (typeof window === "undefined") return () => {};
          const map = window.map;
          const el = document.getElementById("map");
          if (!map || !el || typeof map.invalidateSize !== "function")
            return () => {};

          let raf1 = 0;
          let raf2 = 0;
          const scheduleInvalidate = () => {
            if (raf1) cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
            // Double-rAF to wait for layout + paint before measuring.
            raf1 = requestAnimationFrame(() => {
              raf2 = requestAnimationFrame(() => {
                try {
                  map.invalidateSize({ pan: false, animate: false });
                } catch (error) {
                  console.warn("Failed to invalidate map size:", error);
                }
              });
            });
          };

          // Run once immediately after init.
          scheduleInvalidate();

          let ro = null;
          if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(() => scheduleInvalidate());
            ro.observe(el);
          }

          window.addEventListener("resize", scheduleInvalidate);

          return () => {
            if (ro) ro.disconnect();
            window.removeEventListener("resize", scheduleInvalidate);
            if (raf1) cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
          };
        };

        // Replace any previous observer (defensive for hot reload / remount edge cases).
        if (mapResizeCleanupRef.current) {
          try {
            mapResizeCleanupRef.current();
          } catch {
            // ignore
          }
        }
        mapResizeCleanupRef.current = attachResizeObserver();

        // Check if there's a place to select from saved places
        if (
          typeof window !== "undefined" &&
          (typeof sessionStorage !== "undefined" ||
            typeof localStorage !== "undefined")
        ) {
          // Check both sessionStorage (same tab) and localStorage (cross-tab for new tab opens)
          const selectedPlaceId =
            sessionStorage?.getItem("selectedPlaceId") ||
            localStorage?.getItem("selectedPlaceId");
          const fromSavedPlaces =
            sessionStorage?.getItem("fromSavedPlaces") ||
            localStorage?.getItem("fromSavedPlaces");

          if (selectedPlaceId && fromSavedPlaces) {
            const lat = parseFloat(
              sessionStorage?.getItem("selectedPlaceLat") ||
                localStorage?.getItem("selectedPlaceLat")
            );
            const lon = parseFloat(
              sessionStorage?.getItem("selectedPlaceLon") ||
                localStorage?.getItem("selectedPlaceLon")
            );

            // Clear both sessionStorage and localStorage
            if (sessionStorage) {
              sessionStorage.removeItem("selectedPlaceId");
              sessionStorage.removeItem("selectedPlaceLat");
              sessionStorage.removeItem("selectedPlaceLon");
              sessionStorage.removeItem("selectedPlaceName");
              sessionStorage.removeItem("fromSavedPlaces");
            }
            if (localStorage) {
              localStorage.removeItem("selectedPlaceId");
              localStorage.removeItem("selectedPlaceLat");
              localStorage.removeItem("selectedPlaceLon");
              localStorage.removeItem("selectedPlaceName");
              localStorage.removeItem("fromSavedPlaces");
            }

            // Wait for map to be fully ready (tiles loaded), then select the place
            const selectPlaceWhenReady = async () => {
              // Wait for both map and function to be available
              if (!window.map || !window.selectPlaceFromListFeature) {
                // If not ready, wait a bit and try again
                setTimeout(selectPlaceWhenReady, 300);
                return;
              }

              // Wait for map tiles to load (map 'load' event)
              const waitForMapLoad = () => {
                return new Promise((resolve) => {
                  // Check if map has tiles loaded by checking if it has a center
                  // and if the container has rendered tiles
                  const hasTiles = window.map
                    .getContainer()
                    .querySelector('img[src*="tile"]');

                  if (hasTiles || window.map._loaded) {
                    // Map already loaded
                    resolve();
                  } else {
                    // Wait for load event
                    window.map.once("load", resolve);
                    // Fallback timeout after 5 seconds
                    setTimeout(resolve, 5000);
                  }
                });
              };

              try {
                // Wait for map to finish loading tiles
                await waitForMapLoad();

                // Fetch place details from database (including user-reported accessibility if columns exist)
                const { data: placeData, error } = await supabase
                  .from("places")
                  .select("*")
                  .eq("id", selectedPlaceId)
                  .single();

                if (error || !placeData) {
                  console.error("Error fetching place:", error);
                  return;
                }

                // Start with database tags
                let tags = {
                  id: placeData.id,
                  name: placeData.name,
                  city: placeData.city,
                  country: placeData.country,
                  source: placeData.source || "user",
                };

                // Only include optional fields when present (avoid rendering "Null"/placeholders)
                if (placeData.place_type) tags.place_type = placeData.place_type;
                if (placeData.accessibility_status) {
                  tags.accessibility_status = placeData.accessibility_status;
                }
                if (
                  placeData.accessibility_keywords &&
                  (Array.isArray(placeData.accessibility_keywords)
                    ? placeData.accessibility_keywords.length > 0
                    : true)
                ) {
                  tags.accessibility_keywords = placeData.accessibility_keywords;
                }
                if (
                  placeData.photos &&
                  (Array.isArray(placeData.photos) ? placeData.photos.length > 0 : true)
                ) {
                  tags.photos = placeData.photos;
                }

                // If admin opened this place from the reports table, a report may be provided via storage
                // so we can display it under the same place details view (without relying on RLS).
                let adminSelectedReport = null;
                try {
                  const raw =
                    sessionStorage?.getItem("adminSelectedPlaceReport") ||
                    localStorage?.getItem("adminSelectedPlaceReport");
                  if (raw) adminSelectedReport = JSON.parse(raw);
                } catch (e) {
                  console.warn("Failed to parse adminSelectedPlaceReport:", e);
                }

                // Clear the report payload after reading (avoid leaking across unrelated opens)
                try {
                  sessionStorage?.removeItem("adminSelectedPlaceReport");
                  localStorage?.removeItem("adminSelectedPlaceReport");
                } catch {
                  // ignore
                }

                if (
                  adminSelectedReport &&
                  adminSelectedReport.place_id &&
                  adminSelectedReport.place_id === selectedPlaceId
                ) {
                  tags.selected_place_report = adminSelectedReport;
                }

                // If this is an OSM place, fetch full OSM tags from Overpass
                if (placeData.osm_id) {
                  let osmType = null;
                  let osmId = null;

                  // Extract osm_type and osm_id from osm_id field (format: "node/123" or "way/456")
                  if (
                    typeof placeData.osm_id === "string" &&
                    placeData.osm_id.includes("/")
                  ) {
                    const parts = placeData.osm_id.split("/");
                    osmType = parts[0]; // "node", "way", or "relation"
                    osmId = parts[1];
                  }

                  if (osmType && osmId) {
                    // Map OSM type to Overpass format (N, W, R)
                    const osmTypeMap = { node: "N", way: "W", relation: "R" };
                    const overpassType =
                      osmTypeMap[osmType] || osmType.toUpperCase()[0];

                    try {
                      // Import and use fetchPlace to get full OSM tags
                      const { fetchPlace } = await import(
                        "./api/fetchPlaces.js"
                      );
                      const osmTags = await fetchPlace(overpassType, osmId);

                      if (osmTags && Object.keys(osmTags).length > 0) {
                        // Merge OSM tags with database tags (OSM tags take precedence)
                        tags = { ...tags, ...osmTags };
                        tags.osm_id = placeData.osm_id;
                        tags.source = placeData.source || "osm";
                      }
                    } catch (fetchError) {
                      console.warn(
                        "Failed to fetch OSM tags, using database data only:",
                        fetchError
                      );
                      // Continue with database tags only
                      tags.osm_id = placeData.osm_id;
                    }
                  } else {
                    tags.osm_id = placeData.osm_id;
                  }
                }

                // For user-added places, add amenity from place_type
                if (placeData.source === "user" && placeData.place_type) {
                  tags.amenity = placeData.place_type;
                }

                // Extract wheelchair status from accessibility_keywords or accessibility_status
                // This is the original/OSM status (not user-reported)
                if (
                  placeData.accessibility_keywords &&
                  typeof placeData.accessibility_keywords === "object"
                ) {
                  if (placeData.accessibility_keywords.wheelchair) {
                    tags.wheelchair =
                      placeData.accessibility_keywords.wheelchair;
                  }
                } else if (placeData.accessibility_status) {
                  // Fallback to accessibility_status if accessibility_keywords doesn't exist
                  tags.wheelchair = placeData.accessibility_status;
                }

                // Add user-reported accessibility (from approved reports) as separate field
                // This allows displaying both original and user-reported status
                if (placeData.user_reported_accessibility) {
                  tags.user_reported_accessibility =
                    placeData.user_reported_accessibility;
                }
                if (placeData.user_reported_accessibility_comment) {
                  tags.user_reported_accessibility_comment =
                    placeData.user_reported_accessibility_comment;
                }

                const feature = {
                  type: "Feature",
                  properties: {
                    id: placeData.id,
                    osm_id: placeData.osm_id || null,
                    osm_type:
                      placeData.osm_id &&
                      typeof placeData.osm_id === "string" &&
                      placeData.osm_id.includes("/")
                        ? placeData.osm_id.split("/")[0]
                        : null,
                    name: placeData.name,
                    tags: tags,
                    source: tags.source || "user",
                    place_type: placeData.place_type,
                  },
                  geometry: {
                    type: "Point",
                    coordinates: [placeData.lon || lon, placeData.lat || lat],
                  },
                };

                // Use existing selectPlaceFromListFeature function - it handles everything
                await window.selectPlaceFromListFeature(feature);
              } catch (err) {
                console.error("Error selecting place from saved:", err);
              }
            };

            // Start waiting for map to be ready
            selectPlaceWhenReady();
          }
        }
      }
    })();

    return () => {
      isMounted = false;
      if (mapResizeCleanupRef.current) {
        try {
          mapResizeCleanupRef.current();
        } catch {
          // ignore
        }
        mapResizeCleanupRef.current = null;
      }
    };
  }, []); // Only run once on mount

  // Update user state in mapMain when user changes
  useEffect(() => {
    if (window.updateMapUser) {
      window.updateMapUser(user);
    }
  }, [user]);

  // Allow non-React modules (fetchPhotos.mjs, etc.) to switch tabs
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.setDetailsTab = (tab) => {
      setDetailsTab(tab);
    };

    return () => {
      if (window.setDetailsTab) {
        delete window.setDetailsTab;
      }
    };
  }, []);

  // Check if current place is saved when place popup opens or place changes
  // Also update lastCheckedDate from globals
  useEffect(() => {
    // Update lastCheckedDate from globals
    if (globals.detailsCtx.checkDate) {
      setLastCheckedDate(globals.detailsCtx.checkDate);
    } else {
      setLastCheckedDate(null);
    }

    const checkIfPlaceSaved = async () => {
      if (!placePopupOpen || !user || !globals.detailsCtx.placeId) {
        setIsPlaceSaved(false);
        setSavedPlaceId(null);
        return;
      }

      // Skip if placeId is not a UUID (e.g., OSM ID like "node/123")
      const placeId = globals.detailsCtx.placeId;
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          placeId
        );
      if (!isUUID) {
        setIsPlaceSaved(false);
        setSavedPlaceId(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("saved_places")
          .select("id")
          .eq("user_id", user.id)
          .eq("place_id", placeId)
          .maybeSingle();

        // Handle errors - PGRST116 is "not found" which is expected
        if (error) {
          // Only log if it's a real error (not "not found" and has meaningful content)
          if (error.code !== "PGRST116") {
            // Check if error has meaningful content
            const hasMessage = error.message && error.message.trim().length > 0;
            const hasCode = error.code && error.code.trim().length > 0;
            const errorStr = JSON.stringify(error);
            const hasContent =
              errorStr &&
              errorStr !== "{}" &&
              errorStr !== "null" &&
              errorStr !== '{"code":""}';

            // Only log if error has meaningful content
            if (hasMessage || (hasCode && hasContent)) {
              console.error("Error checking saved place:", error);
            }
          }
          setIsPlaceSaved(false);
          setSavedPlaceId(null);
          return;
        }

        setIsPlaceSaved(!!data);
        setSavedPlaceId(data?.id || null);
      } catch (err) {
        // Only log if error has meaningful content
        const hasMessage = err?.message && err.message.trim().length > 0;
        const errStr = err?.toString() || JSON.stringify(err);
        const hasContent =
          errStr &&
          errStr !== "{}" &&
          errStr !== "null" &&
          errStr !== "[object Object]";

        if (hasMessage || hasContent) {
          console.error("Error checking saved place:", err);
        }
        setIsPlaceSaved(false);
        setSavedPlaceId(null);
      }
    };

    checkIfPlaceSaved();
  }, [placePopupOpen, user, globals.detailsCtx.placeId]);

  const handlePlaceFromListSelect = (feature) => {
    if (
      typeof window !== "undefined" &&
      typeof window.selectPlaceFromListFeature === "function"
    ) {
      window.selectPlaceFromListFeature(feature);
    }
  };

  const handleSubmitInaccuracyReport = async () => {
    try {
      // Check if user is logged in
      if (!user) {
        toastError("Please log in to submit a report.");
        return;
      }

      // Get or create place ID
      let placeId = globals.detailsCtx.placeId;

      if (!placeId) {
        if (!globals.detailsCtx.tags || !globals.detailsCtx.latlng) {
          toastError(
            "Place information is missing. Please select a place again."
          );
          return;
        }

        // Normalize latlng
        let normalizedLatlng = globals.detailsCtx.latlng;
        if (normalizedLatlng && typeof normalizedLatlng === "object") {
          if (
            normalizedLatlng.lat !== undefined &&
            normalizedLatlng.lng !== undefined
          ) {
            normalizedLatlng = {
              lat: Number(normalizedLatlng.lat),
              lng: Number(normalizedLatlng.lng),
            };
          }
        }

        if (!normalizedLatlng?.lat || !normalizedLatlng?.lng) {
          toastError("Invalid location data. Please select a place again.");
          return;
        }

        try {
          placeId = await ensurePlaceExists(
            globals.detailsCtx.tags,
            normalizedLatlng
          );

          if (placeId) {
            globals.detailsCtx.placeId = placeId;
          }
        } catch (ensureErr) {
          console.error("Failed to ensure place exists:", ensureErr);
          toastError(
            `Could not create or find place: ${ensureErr.message || ensureErr}`
          );
          return;
        }
      }

      if (!placeId) {
        toastError("Could not determine place ID");
        return;
      }

      // Map reason values to database values
      const reasonMap = {
        accessibility: "accessibility_info_wrong",
        closed: "permanently_closed",
        category: "wrong_type",
        duplicate: "duplicate",
        address: "location_wrong",
        other: "other",
      };

      const mappedReason = reasonMap[selectedInaccuracyReason];
      if (!mappedReason) {
        toastError("Invalid reason selected");
        return;
      }

      // Map accessibility issues to database values
      const issueMap = {
        entrance_not_accessible: "entrance_not_accessible",
        steps_at_entrance: "steps_at_entrance",
        no_accessible_toilet: "no_accessible_toilet",
        ramp_too_steep: "ramp_too_steep",
        door_too_narrow: "door_narrow_or_heavy",
        other_accessibility: "other",
      };

      const mappedIssues =
        selectedInaccuracyReason === "accessibility" &&
        selectedSpecificIssues.length > 0
          ? selectedSpecificIssues.map((issue) => issueMap[issue] || issue)
          : null;

      // Prepare report data
      const reportData = {
        place_id: placeId,
        user_id: user.id,
        reason: mappedReason,
        accessibility_reality:
          selectedInaccuracyReason === "accessibility" && selectedRealityStatus
            ? selectedRealityStatus
            : null,
        accessibility_issues: mappedIssues,
        // For "closed or moved", submit immediately with no comment field.
        comment:
          selectedInaccuracyReason === "closed"
            ? null
            : inaccuracyComment.trim() || null,
      };

      console.log("Submitting report data:", reportData);

      // Submit report to Supabase
      const { data, error } = await supabase
        .from("place_reports")
        .insert(reportData)
        .select();

      if (error) {
        console.error("Failed to submit report:", error);
        console.error("Error details:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        // Handle unique constraint violation (user already reported this place)
        if (
          error.code === "23505" ||
          error.message?.includes("unique") ||
          error.message?.includes("duplicate")
        ) {
          toastError("You have already submitted a report for this place.");
        } else {
          toastError(
            `Could not submit report: ${error.message || "Please try again."}`
          );
        }
        return;
      }

      if (!data || data.length === 0) {
        console.error("No data returned from insert");
        toastError("Could not submit report. Please try again.");
        return;
      }

      // Immediately reflect the submitted report in the place details UI (main view)
      // without waiting for admin approval. The details renderer will hide it if later rejected.
      try {
        if (typeof document !== "undefined") {
          const inserted = data[0];
          document.dispatchEvent(
            new CustomEvent("placeReportSubmitted", {
              detail: { placeId, report: inserted },
            })
          );
        }
      } catch (e) {
        // Non-fatal: UI will still show the toast and the report will appear on next open.
        console.warn("Failed to dispatch placeReportSubmitted event:", e);
      }

      // Success
      toastSuccess("Report submitted successfully. Thank you!", {
        autohide: true,
        delay: 5000, // Auto-dismiss after 5 seconds
      });

      // Reset form and close modal
      setInaccuracyModalOpen(false);
      setSelectedInaccuracyReason("");
      setInaccuracyScreen(1);
      setSelectedRealityStatus("");
      setSelectedSpecificIssues([]);
      setInaccuracyComment("");
    } catch (err) {
      console.error("Error submitting report:", err);
      toastError("An unexpected error occurred. Please try again.");
    }
  };

  const handleToggleSavePlace = async () => {
    // Check if user is logged in
    if (!user) {
      // Show login dialog - we'll need to handle this
      // For now, redirect to auth page
      router.push("/auth");
      return;
    }

    // Get or create place ID
    let placeId = globals.detailsCtx.placeId;

    if (!placeId) {
      if (!globals.detailsCtx.tags || !globals.detailsCtx.latlng) {
        toastError(
          "Place information is missing. Please select a place again."
        );
        return;
      }

      // Normalize latlng
      let normalizedLatlng = globals.detailsCtx.latlng;
      if (normalizedLatlng && typeof normalizedLatlng === "object") {
        if (
          normalizedLatlng.lat !== undefined &&
          normalizedLatlng.lng !== undefined
        ) {
          normalizedLatlng = {
            lat: Number(normalizedLatlng.lat),
            lng: Number(normalizedLatlng.lng),
          };
        }
      }

      if (!normalizedLatlng?.lat || !normalizedLatlng?.lng) {
        toastError("Invalid location data. Please select a place again.");
        return;
      }

      try {
        placeId = await ensurePlaceExists(
          globals.detailsCtx.tags,
          normalizedLatlng
        );

        if (placeId) {
          globals.detailsCtx.placeId = placeId;
        }
      } catch (ensureErr) {
        console.error("Failed to ensure place exists:", ensureErr);
        toastError(
          `Could not create or find place: ${ensureErr.message || ensureErr}`
        );
        return;
      }
    }

    if (!placeId) {
      toastError("Could not determine place ID");
      return;
    }

    try {
      if (isPlaceSaved && savedPlaceId) {
        // Unsave the place
        const { error } = await supabase
          .from("saved_places")
          .delete()
          .eq("id", savedPlaceId);

        if (error) {
          console.error("Failed to unsave place:", error);
          toastError("Could not remove place from saved. Please try again.");
          return;
        }

        setIsPlaceSaved(false);
        setSavedPlaceId(null);
        setSaveSnackbarMessage("Removed from your saved places");
        setSaveSnackbarOpen(true);
      } else {
        // Save the place
        const { data, error } = await supabase
          .from("saved_places")
          .insert({
            user_id: user.id,
            place_id: placeId,
          })
          .select()
          .single();

        if (error) {
          console.error("Failed to save place:", error);
          if (error.code === "23505" || error.message?.includes("unique")) {
            // Already saved, just update state
            const { data: existing } = await supabase
              .from("saved_places")
              .select("id")
              .eq("user_id", user.id)
              .eq("place_id", placeId)
              .single();

            if (existing) {
              setIsPlaceSaved(true);
              setSavedPlaceId(existing.id);
              setSaveSnackbarMessage("Saved to your places");
              setSaveSnackbarOpen(true);
            }
          } else {
            toastError("Could not save place. Please try again.");
          }
          return;
        }

        setIsPlaceSaved(true);
        setSavedPlaceId(data?.id || null);
        setSaveSnackbarMessage("Saved to your places");
        setSaveSnackbarOpen(true);
      }
    } catch (err) {
      console.error("Error toggling save place:", err);
      toastError("An unexpected error occurred. Please try again.");
    }
  };

  return (
    <div>
      {/* === Map container === */}
      <div
        id="map"
        className="abilico-map"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      ></div>

      {/* === Places list Drawer (controlled by AppBar burger) === */}
      <Drawer
        variant={isMobile ? "temporary" : "persistent"}
        anchor="left"
        open={isPlacesListOpen}
        onClose={onPlacesListClose}
        ModalProps={{
          keepMounted: true, // (optional) keeps it mounted for better perf
        }}
        hideBackdrop={!isMobile}
        PaperProps={{
          sx: (theme) => ({
            width: { xs: "100%", md: 360 },
            maxWidth: { xs: "100%", md: "80vw" },
            pt: 1,
            px: 2,
            boxShadow: {
              xs: theme.shadows[16],
              sm: theme.shadows[16],
              md: "none",
            }, // Add shadow on mobile for depth
            borderRight: {
              xs: "none",
              sm: "none",
              md: "1px solid rgba(0,0,0,0.12)",
            }, // Remove border on mobile
            top: { xs: 56, sm: 64, md: 64 }, // Start below header on mobile
            height: {
              xs: "calc(100vh - 56px)",
              sm: "calc(100vh - 64px)",
              md: "calc(100% - 64px)",
            }, // Full height minus header
          }),
        }}
      >
        {placesListData ? (
          <PlacesListReact
            data={placesListData}
            onSelect={handlePlaceFromListSelect}
            isOpen={isPlacesListOpen}
          />
        ) : (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Zoom in on the map to see accessible places.
            </Typography>
          </Box>
        )}
      </Drawer>

      {/* === Details + Directions Drawer (MUI instead of Bootstrap Offcanvas) === */}
      <Drawer
        variant="persistent"
        anchor="right"
        open={detailsDrawerOpen}
        onClose={handleDetailsDrawerClose}
        ModalProps={{ keepMounted: true }}
        hideBackdrop
        PaperProps={{
          sx: (theme) => ({
            // A bit wider on desktop so route inputs/details breathe more
            width: { xs: "100vw", sm: 420, md: 520 },
            maxWidth: "80vw",
            px: 0,
            py: 0,
            bgcolor: "transparent",
            boxShadow: "none", // ✅ remove the right-hand shadow
            borderLeft: "none",
            // Base: behave like a normal persistent drawer on mobile
            top: 56,
            right: 0,
            height: "calc(100% - 56px)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            [theme.breakpoints.up("sm")]: {
              // Desktop/tablet: add a little breathing room from the viewport edge + header
              right: theme.spacing(2),
              // Slightly taller than before (smaller top/bottom inset)
              top: `calc(64px + ${theme.spacing(1)})`,
              height: `calc(100% - 64px - ${theme.spacing(2)})`,
            },
          }),
        }}
      >
        {/* keep these IDs so existing JS (mapMain, modules) can still find them */}
        <div id="placeOffcanvasRoute">
          <Box
            className="offcanvas-body"
            sx={{
              flex: 1,
              overflowY: "auto",
              p: 2,
            }}
          >
            {/* === Directions UI === */}
            <div id="directions-ui" className="d-none directions-panel">
              <div className="directions-panel__header">
                <div className="directions-panel__title">
                  <span className="directions-panel__title-text">
                    Directions
                  </span>
                  <span className="directions-panel__badge">Accessible</span>
                </div>
                <div className="directions-panel__header-actions">
                  <Tooltip title="Wheelchair mode" placement="top" arrow>
                    <IconButton
                      aria-label="Wheelchair mode"
                      size="small"
                      className="directions-panel__mode-btn"
                    >
                      <AccessibleForwardIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Close" placement="top" arrow>
                    <IconButton
                      aria-label="Close directions"
                      size="small"
                      className="directions-panel__close-btn"
                      onClick={handleDetailsDrawerClose}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>

              <div className="route-inputs" aria-label="Route inputs">
                <div className="route-field">
                  <div
                    className="route-field__marker route-field__marker--from"
                    aria-hidden="true"
                  >
                    A
                  </div>
                  <div className="route-field__content">
                    <label
                      className="form-label"
                      htmlFor="departure-search-input"
                    >
                      From
                    </label>
                    <div
                      id="departure-search-bar"
                      className="position-relative"
                    >
                      <TextField
                        size="small"
                        id="departure-search-input"
                        type="search"
                        variant="outlined"
                        fullWidth
                        placeholder="Choose starting point or click on the map…"
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <SearchIcon className="route-search-icon" />
                            </InputAdornment>
                          ),
                        }}
                        slotProps={{
                          input: {
                            "aria-label": "Search places",
                            "aria-controls": "departure-suggestions",
                          },
                        }}
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            bgcolor: "#fff",
                            borderRadius: 2,
                          },
                        }}
                      />

                      <div
                        className="w-100 d-none search-suggestions"
                        aria-label="Search suggestions"
                        id="departure-suggestions"
                      ></div>
                    </div>

                    <div className="route-field__chips">
                      <button
                        id="btn-use-my-location"
                        type="button"
                        className="btn btn-sm d-none route-chip"
                        aria-label="Use my location as the start point"
                      >
                        Use my location
                      </button>
                    </div>
                  </div>
                </div>

                <div className="route-field route-field--to">
                  <div
                    className="route-field__marker route-field__marker--to"
                    aria-hidden="true"
                  >
                    B
                  </div>
                  <div className="route-field__content">
                    <label
                      className="form-label"
                      htmlFor="destination-search-input"
                    >
                      To
                    </label>
                    {/* destination-search-bar is moved here by mapMain.js (after the label above) */}
                  </div>
                </div>

                <Tooltip
                  title="Swap start and destination"
                  placement="left"
                  arrow
                >
                  <IconButton
                    id="btn-swap-route"
                    className="route-inputs__swap"
                    aria-label="Swap start and destination"
                    size="small"
                  >
                    <SwapVertIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </div>

              <div
                className="route-actions-bottom"
                role="group"
                aria-label="Route actions"
              >
                <button
                  id="btn-clear-route"
                  type="button"
                  className="btn btn-sm d-none route-btn route-btn--secondary"
                  aria-label="Clear route"
                >
                  Clear
                </button>
                <button
                  id="btn-show-route"
                  type="button"
                  className="btn btn-sm d-none route-btn route-btn--primary"
                  aria-label="Show route on the map"
                >
                  Show route
                </button>
              </div>
            </div>
          </Box>
        </div>
      </Drawer>

      {/* Floating place details popup over the map */}
      <Box
        sx={(theme) => ({
          position: "absolute",
          zIndex: theme.zIndex.modal,
          top: { xs: 2, sm: 10 }, // below the app bar
          // 👇 stick to the left, but when the list drawer is open on desktop,
          // shift to the right of the 360px drawer
          left: {
            xs: 8, // small padding from the left on mobile
            sm: isPlacesListOpen ? 360 + 8 : 8,
          },
          right: "auto",
          transform: "none", // no centering
          width: {
            xs: "calc(100% - 32px)", // full width minus side padding on mobile
            sm: isPlacesListOpen
              ? `min(420px, calc(100% - ${360 + 32}px))` // leave room for the drawer + margins
              : "min(420px, calc(100% - 32px))",
          },
          pointerEvents: "none", // clicks go through wrapper
          display: placePopupOpen ? "block" : "none",
        })}
      >
        <div id="placeOffcanvas">
          <Card
            sx={{
              pointerEvents: "auto",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <CardContent sx={{ pt: 2, pb: 1 }}>
              {/* Header */}
              <Box sx={{ mb: 2 }}>
                {/* Top row: Title and action buttons */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    mb: 1,
                  }}
                >
                  <Box sx={{ flex: 1, mr: 1 }}>
                    <Typography
                      variant="h5"
                      component="h2"
                      sx={{
                        fontWeight: 600,
                        fontSize: "1.5rem",
                        lineHeight: 1.2,
                        color: "text.primary",
                        mb: placeShortName ? 0.5 : 0,
                      }}
                    >
                      {placePopupTitle}
                    </Typography>
                    {placeShortName &&
                      placeShortName.trim() !== placePopupTitle.trim() && (
                        <Chip
                          label={placeShortName.toUpperCase()}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: "0.6875rem",
                            fontWeight: 500,
                            bgcolor: "rgba(0, 0, 0, 0.06)",
                            color: "text.secondary",
                            "& .MuiChip-label": {
                              px: 1,
                            },
                          }}
                          title={`Abbreviation: ${placeShortName}`}
                          aria-label={`Abbreviation: ${placeShortName}`}
                        />
                      )}
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      flexShrink: 0,
                    }}
                  >
                    <Tooltip
                      title={isPlaceSaved ? "Remove from saved" : "Save place"}
                    >
                      <IconButton
                        aria-label={
                          isPlaceSaved ? "Remove from saved" : "Save place"
                        }
                        size="small"
                        onClick={handleToggleSavePlace}
                        sx={{
                          color: isPlaceSaved ? "error.main" : "action.active",
                        }}
                      >
                        {isPlaceSaved ? (
                          <FavoriteIcon fontSize="small" />
                        ) : (
                          <FavoriteBorderIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                    <IconButton
                      aria-label="Close place details"
                      size="small"
                      onClick={() => {
                        setPlacePopupOpen(false);
                        if (
                          typeof window !== "undefined" &&
                          typeof window.restoreDestinationSearchBarHome ===
                            "function"
                        ) {
                          window.restoreDestinationSearchBarHome();
                        }
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>

                {/* Bottom row: Category chip, feature chips, and distance */}
                {(placeCategory ||
                  (placeFeatures && placeFeatures.length > 0) ||
                  placeDistance) && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      flexWrap: "wrap",
                    }}
                  >
                    {placeCategory && (
                      <Chip
                        label={placeCategory}
                        size="small"
                        sx={TAG_CHIP_SX}
                      />
                    )}
                    {/* Feature chips (Drive-through, Dispensing, etc.) */}
                    {placeFeatures &&
                      placeFeatures.map((feature, index) => (
                        <Chip
                          key={index}
                          icon={
                            <span
                              className="material-icons"
                              style={TAG_CHIP_ICON_STYLE}
                            >
                              {feature.icon}
                            </span>
                          }
                          label={feature.label}
                          size="small"
                          sx={TAG_CHIP_WITH_ICON_SX}
                        />
                      ))}
                    {placeDistance && (
                      <Typography
                        variant="body2"
                        sx={{
                          color: "text.secondary",
                          fontSize: "0.875rem",
                          fontWeight: 400,
                        }}
                      >
                        {placeDistance}
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>

              {/* MAIN PHOTO – moved from drawer */}
              <figure className="figure d-none" id="main-photo-wrapper">
                <img
                  id="main-photo"
                  className="figure-img img-fluid shadow-sm mb-1"
                  alt=""
                />
                <figcaption
                  id="main-photo-caption"
                  className="figure-caption small text-muted"
                ></figcaption>
              </figure>

              {/* DETAILS PANEL – moved from drawer */}
              <div id="details-panel" className="d-none">
                <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
                  <Tabs
                    value={detailsTab}
                    onChange={(_, newValue) => setDetailsTab(newValue)}
                    aria-label="Place details tabs"
                    variant="fullWidth"
                  >
                    <Tab
                      id="overview-tab"
                      label="Overview"
                      value="overview"
                      aria-controls="tab-overview"
                    />
                    <Tab
                      id="reviews-tab"
                      label="Reviews"
                      value="reviews"
                      aria-controls="tab-reviews"
                    />
                    <Tab
                      id="photos-tab"
                      label="Photos"
                      value="photos"
                      aria-controls="tab-photos"
                    />
                  </Tabs>
                </Box>

                <div className="pt-3" id="detailsTabsContent">
                  {/* OVERVIEW TAB */}
                  <DetailsTabPanel value="overview" active={detailsTab}>
                    <div className="d-grid gap-2 mb-3">
                      <button
                        id="btn-directions"
                        type="button"
                        className="btn btn-directions"
                        aria-label="Get directions to this place"
                      >
                        Directions
                      </button>
                    </div>
                    <div className="card shadow-sm">
                      <div
                        className="list-group list-group-flush"
                        id="details-list"
                      ></div>
                    </div>
                  </DetailsTabPanel>

                  {/* REVIEWS TAB */}
                  <DetailsTabPanel value="reviews" active={detailsTab}>
                    <div className="card shadow-sm">
                      <div className="card-body">
                        {/* Title row: Reviews on left, stars + text on right */}
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 2,
                            mb: 2,
                          }}
                        >
                          <Typography variant="h6">Reviews</Typography>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                              flexWrap: "wrap",
                            }}
                          >
                            {!reviewStats.count ? (
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 0.5,
                                }}
                              >
                                <StarBorderIcon
                                  sx={{
                                    fontSize: "0.875rem",
                                    color: "text.secondary",
                                    display: "block",
                                    lineHeight: 1,
                                  }}
                                />
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{
                                    fontSize: "0.75rem",
                                    lineHeight: 1,
                                  }}
                                >
                                  No reviews yet
                                </Typography>
                              </Box>
                            ) : (
                              <>
                                <Rating
                                  value={reviewStats.avg}
                                  precision={0.1}
                                  readOnly
                                  size="small"
                                />
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  {reviewStats.avg.toFixed(1)} •{" "}
                                  {reviewStats.count}{" "}
                                  {reviewStats.count === 1
                                    ? "review"
                                    : "reviews"}
                                </Typography>
                              </>
                            )}
                          </Box>
                        </Box>

                        {/* CTA button to write a review */}
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 2,
                            mb: 2,
                          }}
                        >
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => {
                              if (user) setReviewWriteOpen(true);
                              else router.push("/auth");
                            }}
                            sx={{
                              borderRadius: "25px",
                              textTransform: "none",
                              fontWeight: 500,
                              px: 2,
                              py: 0.75,
                            }}
                          >
                            Write a review
                          </Button>
                        </Box>

                        {/* Reviews list */}
                        <ul id="reviews-list" className="list-group"></ul>
                      </div>
                    </div>
                  </DetailsTabPanel>

                  {/* PHOTOS TAB */}
                  <DetailsTabPanel value="photos" active={detailsTab}>
                    <div id="photos-empty" className="text-muted small d-none">
                      No photos found for this place.
                    </div>
                    <div id="photos-grid" className="row g-2"></div>
                  </DetailsTabPanel>
                </div>
              </div>
            </CardContent>
            <CardActions
              sx={{
                justifyContent: "space-between",
                alignItems: "center",
                px: 2,
                pb: 2,
              }}
            >
              {/* Left: Last checked date */}
              {lastCheckedDate && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    flex: 1,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: "0.75rem",
                      color: "text.secondary",
                      fontWeight: 400,
                    }}
                  >
                    Last checked: {lastCheckedDate}
                  </Typography>
                </Box>
              )}
              {/* Right: Found an inaccuracy link */}
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  setInaccuracyModalOpen(true);
                  setInaccuracyScreen(1);
                  setSelectedInaccuracyReason("");
                  setSelectedRealityStatus("");
                  setSelectedSpecificIssues([]);
                  setInaccuracyComment("");
                }}
                sx={{ textTransform: "none", ml: "auto" }}
              >
                Found an inaccuracy?
              </Button>
            </CardActions>
          </Card>
        </div>
      </Box>

      {/* === Obstacle Modal === */}
      <div
        className="modal fade"
        id="obstacleModal"
        tabIndex="-1"
        aria-hidden="true"
        aria-labelledby="obstacleModalLabel"
      >
        <div className="modal-dialog">
          <form className="modal-content" id="obstacle-form">
            <div className="modal-header">
              <h5 className="modal-title">Obstacle details</h5>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body">
              <input
                id="obstacle-title"
                className="form-control"
                placeholder="e.g., Damaged curb ramp"
                required
              />
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                data-bs-dismiss="modal"
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-outline-primary"
                id="obstacle-edit-btn"
                style={{ display: "none" }}
              >
                Edit
              </button>
              <button type="submit" className="btn btn-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* === Draw Help Alert (template for DrawHelpAlert control) === */}
      <div id="draw-help-alert" className="d-none">
        <Card>
          <CardContent
            sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}
          >
            <span className="fs-5" aria-hidden="true">
              🧱
            </span>

            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle1" component="h6" gutterBottom>
                Draw obstacles
              </Typography>
              <Typography variant="body2" color="text.secondary">
                You can mark areas the route should avoid.
              </Typography>
            </Box>

            <IconButton
              size="small"
              aria-label="Dismiss draw help"
              data-role="draw-help-close"
              sx={{ mt: -0.5 }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </CardContent>
        </Card>
      </div>

      {/* === Global Loading Bar === */}
      <div
        id="global-loading"
        className="position-fixed top-0 start-0 w-100 d-none"
        style={{ zIndex: 2000 }}
      >
        <div className="progress rounded-0" style={{ height: "0.24rem" }}>
          <div
            className="progress-bar progress-bar-striped progress-bar-animated"
            style={{ width: "100%" }}
          ></div>
        </div>
      </div>

      {/* === Obstacle Management Overlay (for non-logged-in users) === */}
      {!user && obstacleOverlayPrefLoaded && showObstacleManagementOverlay && (
        <div
          id="obstacle-management-overlay"
          className={`position-absolute${
            detailsDrawerOpen ? " obstacle-overlay--with-drawer" : ""
          }`}
        >
          <Card
            sx={{
              // Keep this overlay compact while staying usable on small screens
              width: { xs: "calc(100vw - 32px)", sm: 240 },
              maxWidth: 240,
            }}
          >
            <CardContent>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  mb: 0.5,
                }}
              >
                <LockIcon fontSize="small" aria-hidden="true" />
                <Typography
                  variant="subtitle2"
                  component="h6"
                  sx={{ lineHeight: 1.2, flexGrow: 1, fontSize: "0.95rem" }}
                >
                  Log in to manage obstacles
                </Typography>
                <IconButton
                  size="small"
                  aria-label="Close"
                  onClick={() => {
                    setShowObstacleManagementOverlay(false);
                    try {
                      if (
                        typeof window !== "undefined" &&
                        window.localStorage
                      ) {
                        window.localStorage.setItem(
                          "abilico_obstacle_overlay_dismissed",
                          "1"
                        );
                      }
                    } catch {
                      // ignore
                    }
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            </CardContent>
            <CardActions sx={{ pt: 0, pb: 1.5, justifyContent: "center" }}>
              <Button
                variant="contained"
                color="primary"
                size="small"
                sx={{
                  minWidth: 112,
                  px: 2.5,
                  py: 0.75,
                  borderRadius: 999, // pill
                  fontSize: "0.75rem",
                  letterSpacing: "0.04em",
                }}
                onClick={() => router.push("/auth")}
              >
                LOG IN
              </Button>
            </CardActions>
          </Card>
        </div>
      )}

      {/* Obstacle Popup Dialog */}
      <ObstaclePopupDialog
        open={obstacleDialogOpen}
        onClose={() => {
          setObstacleDialogOpen(false);
          setSelectedObstacle(null);
        }}
        obstacle={selectedObstacle}
        onObstacleUpdate={(updatedObstacle) => {
          // Update obstacle in mapMain if needed
          if (typeof window !== "undefined" && window.updateObstacle) {
            window.updateObstacle(updatedObstacle);
          }
        }}
      />

      {/* === Write Review Modal / Sheet === */}
      <Dialog
        open={reviewWriteOpen}
        onClose={() => setReviewWriteOpen(false)}
        fullScreen={isMobile}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle
          sx={{
            pr: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <span>Write a review</span>
          <IconButton
            aria-label="Close"
            onClick={() => setReviewWriteOpen(false)}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {user ? (
            <ReviewForm />
          ) : (
            <Box sx={{ textAlign: "center", py: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Log in to write a review
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Create an account to share your experience.
              </Typography>
              <Button variant="contained" onClick={() => router.push("/auth")}>
                Log in / Sign up
              </Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setReviewWriteOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Inaccuracy Report Modal */}
      <Dialog
        open={inaccuracyModalOpen}
        onClose={() => {
          setInaccuracyModalOpen(false);
          setSelectedInaccuracyReason("");
          setInaccuracyScreen(1);
          setSelectedRealityStatus("");
          setSelectedSpecificIssues([]);
          setInaccuracyComment("");
          setExpandedDetails(false);
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            minHeight: "500px",
          },
        }}
      >
        {inaccuracyScreen === 1 ? (
          <>
            <DialogTitle
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                pt: 3,
                pb: 2,
                minHeight: 72,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <ReportProblemIcon
                  sx={{ color: PRIMARY_BLUE, fontSize: "1.5rem" }}
                />
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 600, lineHeight: 1.5 }}
                >
                  Choose what's wrong
                </Typography>
              </Box>
              <IconButton
                onClick={() => {
                  setInaccuracyModalOpen(false);
                  setSelectedInaccuracyReason("");
                  setInaccuracyScreen(1);
                  setSelectedRealityStatus("");
                  setSelectedSpecificIssues([]);
                  setInaccuracyComment("");
                }}
                size="small"
                sx={{
                  color: "text.secondary",
                  "&:hover": {
                    bgcolor: "action.hover",
                    color: "text.primary",
                  },
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ pt: 3.5 }}>
              <Paper
                elevation={0}
                sx={{
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 3,
                  p: 3,
                }}
              >
                <RadioGroup
                  value={selectedInaccuracyReason}
                  onChange={(e) => setSelectedInaccuracyReason(e.target.value)}
                >
                  <Stack spacing={2}>
                    <FormControlLabel
                      value="accessibility"
                      control={
                        <Radio
                          sx={{
                            color: PRIMARY_BLUE,
                            "&.Mui-checked": {
                              color: PRIMARY_BLUE,
                            },
                            "& .MuiSvgIcon-root": {
                              fontSize: 20,
                            },
                          }}
                        />
                      }
                      label={
                        <Typography
                          variant="body1"
                          sx={{ fontSize: "1rem", fontWeight: 400 }}
                        >
                          Accessibility info is wrong
                        </Typography>
                      }
                      sx={{
                        m: 0,
                        py: 1.5,
                        px: 2,
                        borderRadius: 1.5,
                        transition: "all 0.2s ease-in-out",
                        "&:hover": {
                          bgcolor: "rgba(0, 0, 0, 0.02)",
                        },
                      }}
                    />
                    <FormControlLabel
                      value="closed"
                      control={
                        <Radio
                          sx={{
                            color: PRIMARY_BLUE,
                            "&.Mui-checked": {
                              color: PRIMARY_BLUE,
                            },
                            "& .MuiSvgIcon-root": {
                              fontSize: 20,
                            },
                          }}
                        />
                      }
                      label={
                        <Typography
                          variant="body1"
                          sx={{ fontSize: "1rem", fontWeight: 400 }}
                        >
                          Place is permanently closed or moved
                        </Typography>
                      }
                      sx={{
                        m: 0,
                        py: 1.5,
                        px: 2,
                        borderRadius: 1.5,
                        transition: "all 0.2s ease-in-out",
                        "&:hover": {
                          bgcolor: "rgba(0, 0, 0, 0.02)",
                        },
                      }}
                    />
                    <FormControlLabel
                      value="category"
                      control={
                        <Radio
                          sx={{
                            color: PRIMARY_BLUE,
                            "&.Mui-checked": {
                              color: PRIMARY_BLUE,
                            },
                            "& .MuiSvgIcon-root": {
                              fontSize: 20,
                            },
                          }}
                        />
                      }
                      label={
                        <Typography
                          variant="body1"
                          sx={{ fontSize: "1rem", fontWeight: 400 }}
                        >
                          Wrong category or type of place
                        </Typography>
                      }
                      sx={{
                        m: 0,
                        py: 1.5,
                        px: 2,
                        borderRadius: 1.5,
                        transition: "all 0.2s ease-in-out",
                        "&:hover": {
                          bgcolor: "rgba(0, 0, 0, 0.02)",
                        },
                      }}
                    />
                    <FormControlLabel
                      value="duplicate"
                      control={
                        <Radio
                          sx={{
                            color: PRIMARY_BLUE,
                            "&.Mui-checked": {
                              color: PRIMARY_BLUE,
                            },
                            "& .MuiSvgIcon-root": {
                              fontSize: 20,
                            },
                          }}
                        />
                      }
                      label={
                        <Typography
                          variant="body1"
                          sx={{ fontSize: "1rem", fontWeight: 400 }}
                        >
                          Duplicate place
                        </Typography>
                      }
                      sx={{
                        m: 0,
                        py: 1.5,
                        px: 2,
                        borderRadius: 1.5,
                        transition: "all 0.2s ease-in-out",
                        "&:hover": {
                          bgcolor: "rgba(0, 0, 0, 0.02)",
                        },
                      }}
                    />
                    <FormControlLabel
                      value="address"
                      control={
                        <Radio
                          sx={{
                            color: PRIMARY_BLUE,
                            "&.Mui-checked": {
                              color: PRIMARY_BLUE,
                            },
                            "& .MuiSvgIcon-root": {
                              fontSize: 20,
                            },
                          }}
                        />
                      }
                      label={
                        <Typography
                          variant="body1"
                          sx={{ fontSize: "1rem", fontWeight: 400 }}
                        >
                          Wrong address or pin location
                        </Typography>
                      }
                      sx={{
                        m: 0,
                        py: 1.5,
                        px: 2,
                        borderRadius: 1.5,
                        transition: "all 0.2s ease-in-out",
                        "&:hover": {
                          bgcolor: "rgba(0, 0, 0, 0.02)",
                        },
                      }}
                    />
                    <FormControlLabel
                      value="other"
                      control={
                        <Radio
                          sx={{
                            color: PRIMARY_BLUE,
                            "&.Mui-checked": {
                              color: PRIMARY_BLUE,
                            },
                            "& .MuiSvgIcon-root": {
                              fontSize: 20,
                            },
                          }}
                        />
                      }
                      label={
                        <Typography
                          variant="body1"
                          sx={{ fontSize: "1rem", fontWeight: 400 }}
                        >
                          Other
                        </Typography>
                      }
                      sx={{
                        m: 0,
                        py: 1.5,
                        px: 2,
                        borderRadius: 1.5,
                        transition: "all 0.2s ease-in-out",
                        "&:hover": {
                          bgcolor: "rgba(0, 0, 0, 0.02)",
                        },
                      }}
                    />
                  </Stack>
                </RadioGroup>
              </Paper>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3.5, pt: 2 }}>
              <Button
                onClick={() => {
                  setInaccuracyModalOpen(false);
                  setSelectedInaccuracyReason("");
                  setInaccuracyScreen(1);
                  setSelectedRealityStatus("");
                  setSelectedSpecificIssues([]);
                  setInaccuracyComment("");
                  setExpandedDetails(false);
                }}
                sx={{
                  textTransform: "none",
                  color: "text.secondary",
                  "&:hover": {
                    bgcolor: "action.hover",
                  },
                }}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  if (selectedInaccuracyReason === "closed") {
                    // Closed/moved: no comments step, submit immediately.
                    handleSubmitInaccuracyReport();
                    return;
                  }
                  if (selectedInaccuracyReason === "accessibility") {
                    setInaccuracyScreen(2);
                    return;
                  }
                  // Other reasons: go to optional details/comments screen
                  setInaccuracyScreen(3);
                }}
                disabled={!selectedInaccuracyReason}
                sx={{
                  textTransform: "none",
                  bgcolor: PRIMARY_BLUE,
                  "&:hover": {
                    bgcolor: PRIMARY_BLUE,
                    opacity: 0.9,
                  },
                  "&.Mui-disabled": {
                    bgcolor: "action.disabledBackground",
                    color: "action.disabled",
                  },
                }}
              >
                {selectedInaccuracyReason === "closed" ? "Submit" : "Next"}
              </Button>
            </DialogActions>
          </>
        ) : inaccuracyScreen === 2 ? (
          <>
            <DialogTitle
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                pb: 2.5,
                pt: 4,
                px: 3,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <AccessibilityNewIcon
                  sx={{ color: PRIMARY_BLUE, fontSize: "1.5rem" }}
                />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Fix accessibility info
                </Typography>
              </Box>
              <IconButton
                onClick={() => {
                  setInaccuracyModalOpen(false);
                  setSelectedInaccuracyReason("");
                  setInaccuracyScreen(1);
                  setSelectedRealityStatus("");
                  setSelectedSpecificIssues([]);
                  setInaccuracyComment("");
                  setExpandedDetails(false);
                }}
                size="small"
                sx={{
                  color: "text.secondary",
                  "&:hover": {
                    bgcolor: "action.hover",
                    color: "text.primary",
                  },
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ pt: 2.5, px: 3, pb: 2.5 }}>
              <Stack spacing={2.5}>
                {/* Accessibility Level */}
                <Paper
                  elevation={0}
                  sx={{
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 3,
                    p: 2.5,
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{
                      mb: 2,
                      fontWeight: 600,
                      color: "text.primary",
                      textTransform: "uppercase",
                      fontSize: "0.75rem",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Accessibility Level
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      gap: 1,
                      flexWrap: "wrap",
                      justifyContent: "center",
                    }}
                  >
                    <Chip
                      label={ACCESSIBILITY_LABEL_DESIGNATED}
                      onClick={() => setSelectedRealityStatus("designated")}
                      sx={{
                        height: 32,
                        backgroundColor:
                          selectedRealityStatus === "designated"
                            ? GREEN
                            : "transparent",
                        color:
                          selectedRealityStatus === "designated"
                            ? "white"
                            : GREEN,
                        borderColor: GREEN,
                        borderWidth: 1.5,
                        borderStyle: "solid",
                        fontWeight:
                          selectedRealityStatus === "designated" ? 600 : 400,
                        "&:hover": {
                          backgroundColor: GREEN,
                          color: "white",
                        },
                      }}
                    />
                    <Chip
                      label={ACCESSIBILITY_LABEL_ACCESSIBLE}
                      onClick={() => setSelectedRealityStatus("yes")}
                      sx={{
                        height: 32,
                        backgroundColor:
                          selectedRealityStatus === "yes"
                            ? GREEN
                            : "transparent",
                        color:
                          selectedRealityStatus === "yes" ? "white" : GREEN,
                        borderColor: GREEN,
                        borderWidth: 1.5,
                        borderStyle: "solid",
                        fontWeight: selectedRealityStatus === "yes" ? 600 : 400,
                        "&:hover": {
                          backgroundColor: GREEN,
                          color: "white",
                        },
                      }}
                    />
                    <Chip
                      label={ACCESSIBILITY_LABEL_LIMITED}
                      onClick={() => setSelectedRealityStatus("limited")}
                      sx={{
                        height: 32,
                        backgroundColor:
                          selectedRealityStatus === "limited"
                            ? ORANGE
                            : "transparent",
                        color:
                          selectedRealityStatus === "limited"
                            ? "white"
                            : ORANGE,
                        borderColor: ORANGE,
                        borderWidth: 1.5,
                        borderStyle: "solid",
                        fontWeight:
                          selectedRealityStatus === "limited" ? 600 : 400,
                        "&:hover": {
                          backgroundColor: ORANGE,
                          color: "white",
                        },
                      }}
                    />
                    <Chip
                      label={ACCESSIBILITY_LABEL_NOT_ACCESSIBLE}
                      onClick={() => setSelectedRealityStatus("no")}
                      sx={{
                        height: 32,
                        backgroundColor:
                          selectedRealityStatus === "no" ? RED : "transparent",
                        color: selectedRealityStatus === "no" ? "white" : RED,
                        borderColor: RED,
                        borderWidth: 1.5,
                        borderStyle: "solid",
                        fontWeight: selectedRealityStatus === "no" ? 600 : 400,
                        "&:hover": {
                          backgroundColor: RED,
                          color: "white",
                        },
                      }}
                    />
                  </Box>
                </Paper>

                {/* Details (optional) */}
                <Paper
                  elevation={0}
                  sx={{
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <Box
                    onClick={() => setExpandedDetails(!expandedDetails)}
                    sx={{
                      p: 2.5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      transition: "background-color 0.2s",
                      "&:hover": {
                        bgcolor: "rgba(0, 0, 0, 0.02)",
                      },
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 600,
                        color: PRIMARY_BLUE,
                        textTransform: "uppercase",
                        fontSize: "0.75rem",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Details{" "}
                      <Typography
                        component="span"
                        sx={{
                          color: PRIMARY_BLUE,
                          textTransform: "none",
                          fontWeight: 600,
                          fontSize: "0.75rem",
                          letterSpacing: "0.5px",
                        }}
                      >
                        (optional)
                      </Typography>
                    </Typography>
                    {expandedDetails ? (
                      <ExpandLessIcon
                        sx={{ color: PRIMARY_BLUE, fontSize: "1.25rem" }}
                      />
                    ) : (
                      <ExpandMoreIcon
                        sx={{ color: PRIMARY_BLUE, fontSize: "1.25rem" }}
                      />
                    )}
                  </Box>
                  <Collapse in={expandedDetails} timeout="auto" unmountOnExit>
                    <Box sx={{ px: 2.5, pb: 2.5 }}>
                      <Stack spacing={1.5}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={selectedSpecificIssues.includes(
                                "entrance_not_accessible"
                              )}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSpecificIssues([
                                    ...selectedSpecificIssues,
                                    "entrance_not_accessible",
                                  ]);
                                } else {
                                  setSelectedSpecificIssues(
                                    selectedSpecificIssues.filter(
                                      (issue) =>
                                        issue !== "entrance_not_accessible"
                                    )
                                  );
                                }
                              }}
                              sx={{
                                color: PRIMARY_BLUE + "80",
                                "&.Mui-checked": {
                                  color: PRIMARY_BLUE,
                                },
                              }}
                            />
                          }
                          label={
                            <Typography
                              variant="body1"
                              sx={{ fontSize: "1rem", fontWeight: 400 }}
                            >
                              Entrance not wheelchair accessible
                            </Typography>
                          }
                          sx={{
                            m: 0,
                            py: 1,
                            px: 1.5,
                            borderRadius: 1.5,
                            transition: "all 0.2s ease-in-out",
                            "&:hover": {
                              bgcolor: "rgba(0, 0, 0, 0.02)",
                            },
                          }}
                        />
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={selectedSpecificIssues.includes(
                                "steps_at_entrance"
                              )}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSpecificIssues([
                                    ...selectedSpecificIssues,
                                    "steps_at_entrance",
                                  ]);
                                } else {
                                  setSelectedSpecificIssues(
                                    selectedSpecificIssues.filter(
                                      (issue) => issue !== "steps_at_entrance"
                                    )
                                  );
                                }
                              }}
                              sx={{
                                color: PRIMARY_BLUE + "80",
                                "&.Mui-checked": {
                                  color: PRIMARY_BLUE,
                                },
                              }}
                            />
                          }
                          label={
                            <Typography
                              variant="body1"
                              sx={{ fontSize: "1rem", fontWeight: 400 }}
                            >
                              There are steps at the entrance
                            </Typography>
                          }
                          sx={{
                            m: 0,
                            py: 1,
                            px: 1.5,
                            borderRadius: 1.5,
                            transition: "all 0.2s ease-in-out",
                            "&:hover": {
                              bgcolor: "rgba(0, 0, 0, 0.02)",
                            },
                          }}
                        />
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={selectedSpecificIssues.includes(
                                "no_accessible_toilet"
                              )}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSpecificIssues([
                                    ...selectedSpecificIssues,
                                    "no_accessible_toilet",
                                  ]);
                                } else {
                                  setSelectedSpecificIssues(
                                    selectedSpecificIssues.filter(
                                      (issue) =>
                                        issue !== "no_accessible_toilet"
                                    )
                                  );
                                }
                              }}
                              sx={{
                                color: PRIMARY_BLUE + "80",
                                "&.Mui-checked": {
                                  color: PRIMARY_BLUE,
                                },
                              }}
                            />
                          }
                          label={
                            <Typography
                              variant="body1"
                              sx={{ fontSize: "1rem", fontWeight: 400 }}
                            >
                              No accessible toilet
                            </Typography>
                          }
                          sx={{
                            m: 0,
                            py: 1,
                            px: 1.5,
                            borderRadius: 1.5,
                            transition: "all 0.2s ease-in-out",
                            "&:hover": {
                              bgcolor: "rgba(0, 0, 0, 0.02)",
                            },
                          }}
                        />
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={selectedSpecificIssues.includes(
                                "ramp_too_steep"
                              )}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSpecificIssues([
                                    ...selectedSpecificIssues,
                                    "ramp_too_steep",
                                  ]);
                                } else {
                                  setSelectedSpecificIssues(
                                    selectedSpecificIssues.filter(
                                      (issue) => issue !== "ramp_too_steep"
                                    )
                                  );
                                }
                              }}
                              sx={{
                                color: PRIMARY_BLUE + "80",
                                "&.Mui-checked": {
                                  color: PRIMARY_BLUE,
                                },
                              }}
                            />
                          }
                          label={
                            <Typography
                              variant="body1"
                              sx={{ fontSize: "1rem", fontWeight: 400 }}
                            >
                              Ramp is too steep or unusable
                            </Typography>
                          }
                          sx={{
                            m: 0,
                            py: 1,
                            px: 1.5,
                            borderRadius: 1.5,
                            transition: "all 0.2s ease-in-out",
                            "&:hover": {
                              bgcolor: "rgba(0, 0, 0, 0.02)",
                            },
                          }}
                        />
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={selectedSpecificIssues.includes(
                                "door_too_narrow"
                              )}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSpecificIssues([
                                    ...selectedSpecificIssues,
                                    "door_too_narrow",
                                  ]);
                                } else {
                                  setSelectedSpecificIssues(
                                    selectedSpecificIssues.filter(
                                      (issue) => issue !== "door_too_narrow"
                                    )
                                  );
                                }
                              }}
                              sx={{
                                color: PRIMARY_BLUE + "80",
                                "&.Mui-checked": {
                                  color: PRIMARY_BLUE,
                                },
                              }}
                            />
                          }
                          label={
                            <Typography
                              variant="body1"
                              sx={{ fontSize: "1rem", fontWeight: 400 }}
                            >
                              Door is too narrow or heavy
                            </Typography>
                          }
                          sx={{
                            m: 0,
                            py: 1,
                            px: 1.5,
                            borderRadius: 1.5,
                            transition: "all 0.2s ease-in-out",
                            "&:hover": {
                              bgcolor: "rgba(0, 0, 0, 0.02)",
                            },
                          }}
                        />
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={selectedSpecificIssues.includes(
                                "other_accessibility"
                              )}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSpecificIssues([
                                    ...selectedSpecificIssues,
                                    "other_accessibility",
                                  ]);
                                } else {
                                  setSelectedSpecificIssues(
                                    selectedSpecificIssues.filter(
                                      (issue) => issue !== "other_accessibility"
                                    )
                                  );
                                }
                              }}
                              sx={{
                                color: PRIMARY_BLUE + "80",
                                "&.Mui-checked": {
                                  color: PRIMARY_BLUE,
                                },
                              }}
                            />
                          }
                          label={
                            <Typography
                              variant="body1"
                              sx={{ fontSize: "1rem", fontWeight: 400 }}
                            >
                              Other accessibility issue
                            </Typography>
                          }
                          sx={{
                            m: 0,
                            py: 1,
                            px: 1.5,
                            borderRadius: 1.5,
                            transition: "all 0.2s ease-in-out",
                            "&:hover": {
                              bgcolor: "rgba(0, 0, 0, 0.02)",
                            },
                          }}
                        />
                      </Stack>
                    </Box>
                  </Collapse>
                </Paper>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, pt: 2 }}>
              <Button
                onClick={() => {
                  setInaccuracyScreen(1);
                }}
                sx={{
                  textTransform: "none",
                  color: "text.secondary",
                  "&:hover": {
                    bgcolor: "action.hover",
                  },
                }}
              >
                Back
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  setInaccuracyScreen(3);
                }}
                sx={{
                  textTransform: "none",
                  bgcolor: PRIMARY_BLUE,
                  "&:hover": {
                    bgcolor: PRIMARY_BLUE,
                    opacity: 0.9,
                  },
                }}
              >
                Next
              </Button>
            </DialogActions>
          </>
        ) : (
          <>
            <DialogTitle>Add details (optional)</DialogTitle>
            <DialogContent>
              <TextField
                multiline
                rows={4}
                fullWidth
                placeholder="Example: Main entrance has 3 stairs and no ramp. Side entrance is accessible but usually locked."
                value={inaccuracyComment}
                onChange={(e) => setInaccuracyComment(e.target.value)}
                sx={{ mt: 1 }}
              />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button
                onClick={() => {
                  if (selectedInaccuracyReason === "accessibility") {
                    setInaccuracyScreen(2);
                  } else {
                    setInaccuracyScreen(1);
                  }
                }}
                sx={{ textTransform: "none" }}
              >
                Back
              </Button>
              <Button
                variant="contained"
                onClick={handleSubmitInaccuracyReport}
                sx={{ textTransform: "none" }}
              >
                Submit report
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Save/Unsave Snackbar */}
      <Snackbar
        open={saveSnackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSaveSnackbarOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSaveSnackbarOpen(false)}
          severity="success"
          variant="filled"
          sx={{ width: "100%" }}
          action={
            isPlaceSaved ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  setSaveSnackbarOpen(false);
                  router.push("/saved-places");
                }}
                sx={{ textTransform: "none" }}
              >
                View saved
              </Button>
            ) : null
          }
        >
          {saveSnackbarMessage}
        </Alert>
      </Snackbar>

      {/* Accessibility Info Legend */}
      <AccessibilityInfoLegend />

      {/* Road Accessibility Legend */}
      <RoadAccessibilityLegend
        enabled={roadAccessibilityEnabled}
        onToggle={(enabled) => {
          setRoadAccessibilityEnabled(enabled);
          if (
            typeof window !== "undefined" &&
            window.setRoadAccessibilityEnabled
          ) {
            window.setRoadAccessibilityEnabled(enabled);
          }
        }}
        vizMode={roadVizMode}
        onVizModeChange={(mode) => {
          setRoadVizMode(mode);
          if (
            typeof window !== "undefined" &&
            window.setRoadVisualizationMode
          ) {
            window.setRoadVisualizationMode(mode);
          }
        }}
        loading={roadAccessibilityLoading}
        predictionsEnabled={predictionsEnabled}
        predictionsLoading={predictionsLoading}
        onPredictionsToggle={(enabled) => {
          setPredictionsEnabled(enabled);
          if (typeof window !== "undefined" && window.setPredictionsEnabled) {
            window.setPredictionsEnabled(enabled);
          }
        }}
        onnxReady={onnxReady}
      />
    </div>
  );
}
