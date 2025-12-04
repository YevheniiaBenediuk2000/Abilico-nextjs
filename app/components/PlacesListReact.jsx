"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import FilterListIcon from "@mui/icons-material/FilterList";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FavoriteIcon from "@mui/icons-material/Favorite";
import Tooltip from "@mui/material/Tooltip";
import AccessibilityLegendReact from "./AccessibilityLegendReact";

import {
  BADGE_COLOR_BY_TIER,
  SHOW_PLACES_ZOOM,
} from "../constants/constants.mjs";
import { resolvePlacePhotos } from "../modules/fetchPhotos.mjs";
import { supabase } from "../api/supabaseClient";
import { ensurePlaceExists, reviewStorage } from "../api/reviewStorage";
import { computePlaceScores } from "../api/placeRatings";

/** Local copy of the accessibility tier logic to avoid importing Leaflet code */
function getAccessibilityTier(tags = {}) {
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
  if (raw.includes("limited")) return "limited";
  if (raw === "no" || raw.includes("false")) return "no";
  return "unknown";
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km) {
  if (km == null || Number.isNaN(km)) return "";
  if (km < 1) {
    const m = Math.round(km * 1000);
    return `${m} m`;
  }
  return `${km.toFixed(1)} km`;
}

function derivePlaceInfo(feature, center) {
  const props = feature.properties || {};
  const tags = props.tags || props;

  const coord = feature.geometry?.coordinates || [];
  const [lon, lat] = coord;
  const hasCoord =
    typeof lat === "number" &&
    !Number.isNaN(lat) &&
    typeof lon === "number" &&
    !Number.isNaN(lon);

  const distKm =
    center && hasCoord ? haversineKm(center.lat, center.lng, lat, lon) : null;

  const name =
    tags.name ||
    tags["addr:housename"] ||
    tags.amenity ||
    tags.shop ||
    tags.tourism ||
    tags.leisure ||
    tags.office ||
    tags.historic ||
    "Unnamed place";

  const majorKey =
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

  const subKey =
    tags[majorKey] ||
    tags.amenity ||
    tags.shop ||
    tags.tourism ||
    tags.leisure ||
    tags.healthcare ||
    tags.office ||
    tags.historic ||
    tags.natural ||
    tags.sport ||
    "";

  const category =
    tags.amenity ||
    tags.shop ||
    tags.tourism ||
    tags.leisure ||
    tags.office ||
    tags.historic ||
    tags.natural ||
    "";

  const addrParts = [
    tags["addr:street"],
    tags["addr:housenumber"],
    tags["addr:city"],
  ].filter(Boolean);
  const address = addrParts.join(" ");

  const accTier = getAccessibilityTier(tags);
  const accColor = BADGE_COLOR_BY_TIER[accTier] || BADGE_COLOR_BY_TIER.unknown;

  // Stable-ish key for caching photos per place
  // IMPORTANT: Must match placeKeyFromFeature() in mapMain.js format
  // User-added places: "user/{uuid}"
  // OSM places: "{osm_type}/{osm_id}"
  const placeKey =
    // User-added places have source = 'user' and id (UUID)
    (props.source === "user" && props.id && `user/${props.id}`) ||
    // OSM places have osm_type and osm_id
    (props.osm_type && props.osm_id && `${props.osm_type}/${props.osm_id}`) ||
    // Fallback: try id or feature.id
    (props.id && String(props.id)) ||
    (feature.id && String(feature.id)) ||
    null;

  return {
    feature,
    tags,
    name,
    category,
    address,
    distKm,
    accTier,
    accColor,
    typeMajor: majorKey,
    typeSub: subKey || "other",
    placeKey,
    latlng: hasCoord ? { lat, lng: lon } : null,
  };
}

/** Helper: build nested structure { groupLabel -> { subLabel -> Set(osmValues) } } */
function buildTypeTree(items) {
  const tree = {};
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

  items.forEach((item) => {
    const major = item.typeMajor || "other";
    const majorLabel = labelForMajor[major] || "Other";
    const subRaw = (item.typeSub || "other").toString();
    const subLabel = subRaw.replace(/[_-]/g, " ");

    if (!tree[majorLabel]) tree[majorLabel] = {};
    if (!tree[majorLabel][subLabel]) tree[majorLabel][subLabel] = new Set();
    tree[majorLabel][subLabel].add(subRaw); // keep raw osm value(s)
  });

  return tree;
}

// localStorage key for place-type filter
const PLACE_TYPE_FILTER_LS_KEY = "ui.placeType.filter";
const PHOTOS_ONLY_LS_KEY = "ui.placeList.photosOnly";

function loadInitialTypeFilter() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLACE_TYPE_FILTER_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function saveTypeFilter(obj) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLACE_TYPE_FILTER_LS_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

function NestedPlaceTypeFilter({ items }) {
  // Build tree from items
  const tree = useMemo(() => buildTypeTree(items), [items]);

  // Compute default selection = all subcategories checked
  const defaultState = useMemo(() => {
    const state = {};
    Object.entries(tree).forEach(([groupLabel, subs]) => {
      state[groupLabel] = {};
      Object.keys(subs).forEach((subLabel) => {
        state[groupLabel][subLabel] = true;
      });
    });
    return state;
  }, [tree]);

  const [selection, setSelection] = useState(() => {
    const fromLs = loadInitialTypeFilter();
    if (!fromLs) return defaultState;
    // merge with default (so new categories get added)
    const merged = { ...defaultState };
    Object.entries(fromLs).forEach(([group, subs]) => {
      if (!merged[group]) merged[group] = {};
      Object.entries(subs).forEach(([sub, val]) => {
        if (merged[group].hasOwnProperty(sub)) {
          merged[group][sub] = !!val;
        } else {
          merged[group][sub] = !!val;
        }
      });
    });
    return merged;
  });

  // Persist & notify mapMain
  useEffect(() => {
    if (!selection || typeof selection !== 'object') return;
    saveTypeFilter(selection);

    // Build payload for non-React consumers
    const active = [];
    Object.entries(selection).forEach(([groupLabel, subs]) => {
      if (!subs || typeof subs !== 'object') return;
      Object.entries(subs).forEach(([subLabel, isOn]) => {
        if (!isOn) return;
        active.push({ groupLabel, subLabel });
      });
    });

    // Dispatch an event so mapMain.js can filter markers
    if (typeof document !== "undefined") {
      document.dispatchEvent(
        new CustomEvent("placeTypeFilterChanged", { detail: { active } })
      );
    }
  }, [selection]);

  // group-level helpers
  const isGroupAllChecked = (groupLabel) => {
    if (!selection || typeof selection !== 'object') return false;
    const subs = selection[groupLabel] || {};
    const values = Object.values(subs);
    if (!values.length) return false;
    return values.every(Boolean);
  };

  const isGroupSomeChecked = (groupLabel) => {
    if (!selection || typeof selection !== 'object') return false;
    const subs = selection[groupLabel] || {};
    const values = Object.values(subs);
    return values.some(Boolean);
  };

  const toggleGroup = (groupLabel) => {
    setSelection((prev) => {
      if (!prev || typeof prev !== 'object') return {};
      const next = { ...prev };
      const subs = next[groupLabel] || {};
      const allChecked = Object.values(subs).every(Boolean);
      const newSubs = {};
      Object.keys(subs).forEach((subLabel) => {
        newSubs[subLabel] = !allChecked; // if all checked -> uncheck all; else check all
      });
      next[groupLabel] = newSubs;
      return next;
    });
  };

  const toggleSub = (groupLabel, subLabel) => {
    setSelection((prev) => {
      if (!prev || typeof prev !== 'object') return {};
      return {
        ...prev,
        [groupLabel]: {
          ...(prev[groupLabel] || {}),
          [subLabel]: !(prev[groupLabel]?.[subLabel] ?? true),
        },
      };
    });
  };

  if (!Object.keys(tree).length) return null;

  return (
    <Box mb={1.5}>
      <Typography variant="caption" color="text.secondary">
        Filter by place type
      </Typography>
      <Box
        mt={0.5}
        sx={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        {Object.entries(tree).map(([groupLabel, subs]) => {
          const allChecked = isGroupAllChecked(groupLabel);
          const someChecked = isGroupSomeChecked(groupLabel);
          const groupChecked = allChecked;
          return (
            <Accordion
              key={groupLabel}
              disableGutters
              elevation={0}
              square
              defaultExpanded={false}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon fontSize="small" />}
                sx={{
                  minHeight: 36,
                  "& .MuiAccordionSummary-content": { my: 0 },
                }}
              >
                <FormControlLabel
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.stopPropagation()}
                  control={
                    <Checkbox
                      size="small"
                      checked={groupChecked}
                      indeterminate={!allChecked && someChecked}
                      onChange={() => toggleGroup(groupLabel)}
                    />
                  }
                  label={
                    <Typography variant="body2" fontWeight={500}>
                      {groupLabel}
                    </Typography>
                  }
                />
              </AccordionSummary>
              <AccordionDetails sx={{ py: 0.5 }}>
                <Stack spacing={0.5}>
                  {Object.keys(subs)
                    .sort()
                    .map((subLabel) => (
                      <FormControlLabel
                        key={subLabel}
                        control={
                          <Checkbox
                            size="small"
                            checked={selection[groupLabel]?.[subLabel] ?? true}
                            onChange={() => toggleSub(groupLabel, subLabel)}
                          />
                        }
                        label={
                          <Typography variant="body2">
                            {subLabel.charAt(0).toUpperCase() +
                              subLabel.slice(1)}
                          </Typography>
                        }
                      />
                    ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>
    </Box>
  );
}

export default function PlacesListReact({ data, onSelect, hideControls = false, onUnsave = null, isOpen = true }) {
  const { features = [], center, zoom } = data || {};
  const [sortBy, setSortBy] = useState("distance"); // "distance" | "name" | "bestForMe"
  const [filtersOpen, setFiltersOpen] = useState(false);
  // ✅ NEW: remember which city Best for me resolved to
  const [currentBestForMeCity, setCurrentBestForMeCity] = useState(null);
  // ✅ NEW: user prefs + scores
  const [userPrefs, setUserPrefs] = useState([]);
  const [scoresByPlaceKey, setScoresByPlaceKey] = useState({});
  const [loadingBestForMe, setLoadingBestForMe] = useState(false);

  const [bestForMeCityPlaces, setBestForMeCityPlaces] = useState([]);

  const [photoByKey, setPhotoByKey] = useState({});
  const photoCacheRef = useRef({});

  const [keywordsByPlaceKey, setKeywordsByPlaceKey] = useState({});

  // Listen for real-time keyword updates from ML inference
  useEffect(() => {
    const handleKeywordUpdate = (e) => {
      const { osmId, keywords } = e.detail || {};

      // We rely on osmId ("node/12345") because that's what the List uses as keys
      // If we only have placeId (UUID), we might need to map it, but `recompute...` now passes osmId too.
      if (osmId && keywords) {
        console.log("⚡ List View received keyword update for:", osmId);
        setKeywordsByPlaceKey((prev) => ({
          ...prev,
          [osmId]: keywords,
        }));
      }
    };

    window.addEventListener("keywords-updated", handleKeywordUpdate);
    return () => {
      window.removeEventListener("keywords-updated", handleKeywordUpdate);
    };
  }, []);

  useEffect(() => {
    photoCacheRef.current = photoByKey;
  }, [photoByKey]);

  const [photosOnly, setPhotosOnly] = useState(() => {
    // Disable photosOnly filter when hideControls is true (e.g., saved places page)
    if (hideControls) return false;
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(PHOTOS_ONLY_LS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // Don't update localStorage when hideControls is true
    if (hideControls) return;
    if (typeof window === "undefined") return;
    try {
      if (photosOnly) {
        window.localStorage.setItem(PHOTOS_ONLY_LS_KEY, "1");
      } else {
        window.localStorage.removeItem(PHOTOS_ONLY_LS_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, [photosOnly, hideControls]);

  // raw items (with type metadata)
  const rawItems = useMemo(() => {
    const base = (features || []).map((f) => derivePlaceInfo(f, center));
    if (!base.length) return [];
    const sorted = [...base];

    // When hideControls is true, don't sort (show in original order)
    if (hideControls) {
      return sorted;
    }

    if (sortBy === "distance") {
      sorted.sort((a, b) => {
        if (a.distKm == null && b.distKm == null) return 0;
        if (a.distKm == null) return 1;
        if (b.distKm == null) return -1;
        return a.distKm - b.distKm;
      });
    } else if (sortBy === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "bestForMe") {
      sorted.sort((a, b) => {
        const scoreAData = scoresByPlaceKey[a.placeKey] || {};
        const scoreBData = scoresByPlaceKey[b.placeKey] || {};

        // Prefer personalScore; fall back to globalScore; fall back to 0
        const scoreA = scoreAData.personalScore ?? scoreAData.globalScore ?? 0;
        const scoreB = scoreBData.personalScore ?? scoreBData.globalScore ?? 0;

        // Higher score = better → sort descending
        if (scoreA === scoreB) {
          // tie-break by distance (closer first)
          if (a.distKm == null && b.distKm == null) return 0;
          if (a.distKm == null) return 1;
          if (b.distKm == null) return -1;
          return a.distKm - b.distKm;
        }

        return scoreB - scoreA;
      });
    }

    return sorted;
  }, [features, center, sortBy, scoresByPlaceKey]);

  // Fetch accessibility keywords for visible places
  useEffect(() => {
    if (!rawItems.length) return;
    let cancelled = false;

    async function fetchKeywords() {
      // 1. Collect OSM IDs (placeKeys) from current list items
      const osmKeys = rawItems
        .map((item) => item.placeKey) // e.g., "node/12345"
        .filter(Boolean);

      if (!osmKeys.length) return;

      // 2. Fetch from Supabase
      // Note: We match on 'osm_id' column which stores "type/id"
      const { data, error } = await supabase
        .from("places")
        .select("osm_id, accessibility_keywords")
        .in("osm_id", osmKeys);

      if (error) {
        console.error("❌ Failed to fetch keywords for list:", error);
        return;
      }

      if (cancelled) return;

      // 3. Update state
      if (data && data.length > 0) {
        const newMap = {};
        data.forEach((row) => {
          // ensure row.accessibility_keywords is a valid array
          if (row.osm_id && Array.isArray(row.accessibility_keywords)) {
            newMap[row.osm_id] = row.accessibility_keywords;
          }
        });

        setKeywordsByPlaceKey((prev) => ({ ...prev, ...newMap }));
      }
    }

    fetchKeywords();

    return () => {
      cancelled = true;
    };
  }, [rawItems]); // Re-run when the list of places changes

  // Load thumbnails for the closest / first items
  useEffect(() => {
    if (!rawItems.length || !isOpen) return;

    let cancelled = false;
    // When hideControls is true (saved places), load photos for all places
    // Otherwise, limit to first 24 for performance
    const MAX_PLACES_WITH_PHOTOS = hideControls ? rawItems.length : 24;

    (async () => {
      const candidates = rawItems
        .filter((item) => item.placeKey && item.latlng)
        .slice(0, MAX_PLACES_WITH_PHOTOS);

      for (const item of candidates) {
        const key = item.placeKey;
        if (!key) continue;

        // Skip if we already attempted this place
        if (photoCacheRef.current[key] !== undefined) continue;

        try {
          // First, check if photos are already in the database (from tags.photos)
          const dbPhotos = item.tags?.photos;
          let first = null;

          if (dbPhotos && Array.isArray(dbPhotos) && dbPhotos.length > 0) {
            // Use the first photo from database
            const photoUrl = dbPhotos[0];
            // Handle both string URLs and objects with url/src properties
            if (typeof photoUrl === "string") {
              first = { src: photoUrl, thumb: photoUrl };
            } else if (photoUrl && (photoUrl.url || photoUrl.src || photoUrl.thumb)) {
              first = {
                src: photoUrl.url || photoUrl.src || photoUrl.thumb,
                thumb: photoUrl.thumb || photoUrl.url || photoUrl.src,
                title: photoUrl.title || photoUrl.caption || null,
              };
            }
          }

          // If no database photos, try to fetch from external sources
          if (!first) {
            const photos = await resolvePlacePhotos(item.tags, item.latlng);
            if (cancelled) return;

            first = Array.isArray(photos) && photos.length ? photos[0] : null;
          }

          setPhotoByKey((prev) => {
            if (prev[key] !== undefined) return prev;
            return { ...prev, [key]: first };
          });
        } catch (err) {
          console.error("Failed to resolve photos for place", key, err);
          if (cancelled) return;

          setPhotoByKey((prev) => {
            if (prev[key] !== undefined) return prev;
            return { ...prev, [key]: null };
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rawItems, isOpen]);

  // ✅ Load user accessibility preferences (once) when Best for me is used
  useEffect(() => {
    if (sortBy !== "bestForMe") return; // only needed when user clicks the chip

    if (userPrefs.length > 0) return; // already loaded

    let cancelled = false;

    async function loadPrefs() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          console.log(
            "👤 Not logged in – Best for me will fall back to global rating / distance."
          );
          return;
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("accessibility_preferences")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.error("❌ Failed to load accessibility_preferences:", error);
          return;
        }

        if (!cancelled) {
          const prefs = profile?.accessibility_preferences || [];
          console.log("👤 Loaded prefs for Best for me:", prefs);
          setUserPrefs(prefs);
        }
      } catch (err) {
        console.error("❌ Error loading accessibility_preferences:", err);
      }
    }

    loadPrefs();
    return () => {
      cancelled = true;
    };
  }, [sortBy, userPrefs.length]);

  // ✅ When Best for me is active, compute per-place scores and cache them
  useEffect(() => {
    if (sortBy !== "bestForMe") return;

    if (!features || features.length === 0) return;

    let cancelled = false;

    async function loadScores() {
      setLoadingBestForMe(true);
      try {
        // Build a base list of places (same as rawItems base)
        const baseItems = (features || []).map((f) =>
          derivePlaceInfo(f, center)
        );

        const candidates = baseItems.filter(
          (item) => item.placeKey && item.latlng
        );

        // If no prefs (user not logged in or didn't set them), we'll still
        // compute globalScore; personalScore will just be null.
        const prefs = userPrefs || [];

        // Helper function to mark a place as having null scores
        const markNullScores = (key) => {
          if (!cancelled) {
            setScoresByPlaceKey((prev) => {
              if (prev[key] !== undefined) return prev;
              return {
                ...prev,
                [key]: { personalScore: null, globalScore: null },
              };
            });
          }
        };

        // 🔍 Collect all multi-level places we encounter (for city-wide debug log)
        const debugMultiLevel = [];

        for (const item of candidates) {
          if (cancelled) break;

          const key = item.placeKey;

          // Skip if we already have scores for this place
          if (scoresByPlaceKey[key] !== undefined) continue;

          try {
            let placeId;
            try {
              placeId = await ensurePlaceExists(item.tags, item.latlng);
            } catch (err) {
              console.warn(
                "⚠️ Best for me: could not ensure place exists for",
                key,
                err?.message ?? err
              );
              // mark as known but unsortable and skip to next place
              markNullScores(key);
              continue;
            }

            if (!placeId) {
              console.warn("⚠️ ensurePlaceExists returned no placeId for", key);
              markNullScores(key);
              continue;
            }

            let reviews = [];
            try {
              reviews = await reviewStorage("GET", { place_id: placeId });
            } catch (err) {
              console.error(
                "❌ reviewStorage(GET) failed for place",
                key,
                err?.message ?? err
              );
              markNullScores(key);
              continue;
            }

            try {
              const { personalScore, globalScore, perCategory } =
                computePlaceScores(reviews || [], prefs);

              // 🔍 Detect multi-level (more than just "overall")
              const hasMultiLevel =
                perCategory &&
                Object.keys(perCategory).filter((k) => k !== "overall").length >
                  0;

              if (hasMultiLevel) {
                const cityTag =
                  item.tags["addr:city"] ||
                  item.tags.city ||
                  item.tags["addr:town"] ||
                  item.tags["addr:suburb"] ||
                  null;
                const debugEntry = {
                  placeKey: key,
                  placeName: item.name,
                  placeId,
                  city: cityTag,
                  address: item.address || null,
                  category: item.category || null,
                  perCategory,
                  personalScore,
                  globalScore,
                  reviewsCount: reviews?.length ?? 0,
                  prefs,
                };

                debugMultiLevel.push(debugEntry);

                // Per-place log (optional, nice for detailed inspection)
                console.log(
                  "🧩 BestForMe – multi-level place detected",
                  debugEntry
                );
              }

              if (!cancelled) {
                setScoresByPlaceKey((prev) => {
                  if (prev[key] !== undefined) return prev;
                  return {
                    ...prev,
                    // keep perCategory too for debugging
                    [key]: { personalScore, globalScore, perCategory },
                  };
                });
              }
            } catch (err) {
              console.error(
                "❌ computePlaceScores failed for place",
                key,
                err?.message ?? err
              );
              markNullScores(key);
              continue;
            }
          } catch (err) {
            console.error(
              "❌ Unexpected failure in loadScores for place",
              key,
              err?.message ?? err
            );
            markNullScores(key);
          }
        }

        // 🏙️ After processing all candidates, detect "current city"
        // from all baseItems in the viewport, then load ALL multi-level
        // places for that city from the DB (not just in the viewport).
        if (!cancelled) {
          const cityCounts = {};

          baseItems.forEach((item) => {
            const t = item.tags || {};
            const city =
              t["addr:city"] ||
              t.city ||
              t["addr:town"] ||
              t["addr:suburb"] ||
              null;

            if (!city) return;
            cityCounts[city] = (cityCounts[city] || 0) + 1;
          });

          const sortedCities = Object.entries(cityCounts).sort(
            (a, b) => b[1] - a[1]
          );

          const detectedCity = sortedCities[0]?.[0] || null;

          // ✅ NEW: store detected city in state so the list can use it
          setCurrentBestForMeCity(detectedCity);

          if (!detectedCity) {
            console.log("🏙️ BestForMe – could not detect city from viewport", {
              cityCounts,
              viewportCenter: center || null,
            });
          } else {
            console.log(
              "🏙️ BestForMe – detected city from viewport:",
              detectedCity
            );

            try {
              // 🔽 1) Load all reviews that have category_ratings
              //     We go FROM reviews and INNER JOIN places via FK.
              //     We'll filter by distance from viewport center instead of exact city match.
              const { data: rows, error } = await supabase
                .from("reviews")
                .select(
                  `
                  id,
                  place_id,
                  rating,
                  overall_rating,
                  category_ratings,
                  created_at,
                  user_id,
                  places!inner (
                    id,
                    name,
                    city,
                    lat,
                    lon
                  )
                `
                )
                .not("category_ratings", "is", null);

              if (error) {
                console.error(
                  "❌ BestForMe – failed to load city-wide multi-level places",
                  error
                );
              } else {
                // 🔽 2) Group reviews by place_id
                const byPlace = new Map();

                (rows || []).forEach((row) => {
                  const pid = row.place_id;
                  if (!pid) return;

                  if (!byPlace.has(pid)) {
                    byPlace.set(pid, {
                      placeId: pid,
                      placeName: row.places?.name || "Unnamed place",
                      city: row.places?.city || detectedCity,
                      address: row.places?.address || null,
                      lat: row.places?.lat ?? null,
                      lon: row.places?.lon ?? null,
                      reviews: [],
                    });
                  }

                  // keep the review data in a format computePlaceScores understands
                  byPlace.get(pid).reviews.push({
                    id: row.id,
                    rating: row.rating,
                    overall_rating: row.overall_rating,
                    category_ratings: row.category_ratings,
                    created_at: row.created_at,
                    user_id: row.user_id,
                  });
                });

                // 🔽 3) For each place, compute multi-level scores (perCategory, etc.)
                //     and filter by distance from viewport center
                const maxDistanceKm = 20; // radius around map center
                const cityPlacesWithScores = [];

                for (const entry of byPlace.values()) {
                  const reviewsForPlace = entry.reviews;

                  const { personalScore, globalScore, perCategory } =
                    computePlaceScores(reviewsForPlace || [], userPrefs || []);

                  // Only keep places that actually have multi-level categories
                  const hasMultiLevel =
                    perCategory &&
                    Object.keys(perCategory).filter((k) => k !== "overall")
                      .length > 0;

                  if (!hasMultiLevel) continue;

                  // Distance filter – we have viewport center + place lat/lon
                  const lat = entry.lat;
                  const lon = entry.lon;

                  if (center && lat != null && lon != null) {
                    const distKm = haversineKm(
                      center.lat,
                      center.lng,
                      lat,
                      lon
                    );
                    if (distKm > maxDistanceKm) continue;
                  }

                  cityPlacesWithScores.push({
                    ...entry,
                    personalScore,
                    globalScore,
                    perCategory,
                    reviewsCount: reviewsForPlace.length,
                  });
                }
                
                // after the loop over byPlace.values()
                if (!cancelled) {
                  setBestForMeCityPlaces(cityPlacesWithScores);
                }
                
                console.log("🏙️ BestForMe – ALL multi-level places in city", {
                  detectedCity,
                  viewportCenter: center || null,
                  totalPlacesWithMultiLevel: cityPlacesWithScores.length,
                  places: cityPlacesWithScores,
                });

                // 🔽 4) Final log: ALL places in that city with multi-level rankings
                console.log("🏙️ BestForMe – ALL multi-level places in city", {
                  detectedCity,
                  viewportCenter: center || null,
                  totalPlacesWithMultiLevel: cityPlacesWithScores.length,
                  places: cityPlacesWithScores,
                });
              }
            } catch (err) {
              console.error(
                "❌ BestForMe – unexpected error while loading city-wide multi-level places",
                err
              );
            }
          }
        }
      } finally {
        if (!cancelled) {
          setLoadingBestForMe(false);
        }
      }
    }

    loadScores();
    return () => {
      cancelled = true;
    };
  }, [sortBy, features, center, userPrefs, scoresByPlaceKey]);

  // Place-type filter state for *list* (mirrors NestedPlaceTypeFilter localStorage)
  // Disable filters when hideControls is true (e.g., saved places page)
  const [activeTypeFilters, setActiveTypeFilters] = useState(() => {
    if (hideControls) return null; // No filters when controls are hidden
    const fromLs = loadInitialTypeFilter();
    return fromLs;
  });

  // Listen to filter changes broadcast from the nested filter component
  useEffect(() => {
    // Don't listen to filter changes when hideControls is true
    if (hideControls) return;
    
    const handler = (ev) => {
      // we don't actually use the compact "active" list here, we just reload from LS
      const fromLs = loadInitialTypeFilter();
      setActiveTypeFilters(fromLs);
    };
    document.addEventListener("placeTypeFilterChanged", handler);
    return () =>
      document.removeEventListener("placeTypeFilterChanged", handler);
  }, [hideControls]);

  // Apply place-type filters to rawItems
  const items = useMemo(() => {
    if (!rawItems.length) return [];

    let filtered = rawItems;

    if (activeTypeFilters) {
      // Build an easy lookup of selected sublabels by group
      const selected = new Map();
      Object.entries(activeTypeFilters).forEach(([groupLabel, subs]) => {
        const activeSubLabels = Object.entries(subs || {})
          .filter(([, isOn]) => !!isOn)
          .map(([subLabel]) => subLabel);
        if (activeSubLabels.length) selected.set(groupLabel, activeSubLabels);
      });

      // if nothing is selected at all -> show nothing
      if (selected.size === 0) {
        filtered = [];
      } else {
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

        filtered = rawItems.filter((item) => {
          const majorLabel = labelForMajor[item.typeMajor] || "Other";
          const subLabel = (item.typeSub || "other")
            .toString()
            .replace(/[_-]/g, " ");
          const allowedSubs = selected.get(majorLabel);
          if (!allowedSubs) return false;
          return allowedSubs.includes(subLabel);
        });
      }
    }

    // 👇 NEW: keep only places where we already found at least one photo
    // Skip this filter when hideControls is true
    if (photosOnly && !hideControls) {
      filtered = filtered.filter((item) => {
        if (!item.placeKey) return false;
        const photo = photoByKey[item.placeKey];
        return !!(photo && (photo.thumb || photo.src || photo.pageUrl));
      });
    }

    // 👇 NEW: when Best for me is active:
    // keep ONLY places that have multi-level ratings AND belong to the detected city
    // Skip this filter when hideControls is true
    if (sortBy === "bestForMe" && !hideControls) {
      filtered = filtered.filter((item) => {
        const scoreData = scoresByPlaceKey[item.placeKey];
        if (!scoreData || !scoreData.perCategory) return false;

        const categories = Object.keys(scoreData.perCategory || {});
        const hasMultiLevel = categories.some((k) => k !== "overall");
        if (!hasMultiLevel) return false;

        // If we don't know the city yet, don't filter by it
        if (!currentBestForMeCity) return true;

        const cityTag =
          item.tags["addr:city"] ||
          item.tags.city ||
          item.tags["addr:town"] ||
          item.tags["addr:suburb"] ||
          null;

        if (!cityTag) return false;

        return (
          cityTag.toLowerCase().trim() ===
          currentBestForMeCity.toLowerCase().trim()
        );
      });
    }

    // Remove duplicates by placeKey to avoid React key conflicts
    const seenKeys = new Set();
    const uniqueFiltered = filtered.filter((item) => {
      const key = item.placeKey;
      if (!key) return true; // Keep items without keys (they'll use idx as fallback)
      if (seenKeys.has(key)) {
        console.warn(`⚠️ Skipping duplicate placeKey in list: ${key}`);
        return false; // Skip duplicates
      }
      seenKeys.add(key);
      return true;
    });

    return uniqueFiltered;
  }, [
    rawItems,
    activeTypeFilters,
    photosOnly,
    photoByKey,
    sortBy,
    scoresByPlaceKey,
    currentBestForMeCity,
  ]);

  const hasPlaces = items.length > 0;

  return (
    <>
      {/* Header */}
      <Box
        pb={0.4}
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={1}
      >
        {!hideControls && (
          <Box>
            <Typography sx={{ mb: 0.9 }} variant="subtitle1" fontWeight={600}>
              Places in view
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {hasPlaces
                ? `${items.length} place${items.length === 1 ? "" : "s"}`
                : zoom && zoom < SHOW_PLACES_ZOOM
                ? "Zoom in to see accessible places"
                : "No places match your filters here"}
            </Typography>
          </Box>
        )}

        {!hideControls && rawItems.length > 0 && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 1,
            }}
          >
            {/* Filters Button */}
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              startIcon={<FilterListIcon />}
              onClick={() => setFiltersOpen(true)}
            >
              Filters
            </Button>

            {/* horizontal Sort by row */}
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="caption" color="text.secondary">
                Sort by
              </Typography>
              <Stack direction="row" spacing={0.5}>
                <Chip
                  size="small"
                  label="Distance"
                  variant={sortBy === "distance" ? "filled" : "outlined"}
                  onClick={() => setSortBy("distance")}
                />
                <Chip
                  size="small"
                  label="Name"
                  variant={sortBy === "name" ? "filled" : "outlined"}
                  onClick={() => setSortBy("name")}
                />
                <Chip
                  size="small"
                  label="Best for me"
                  variant={sortBy === "bestForMe" ? "filled" : "outlined"}
                  onClick={() => setSortBy("bestForMe")}
                />
              </Stack>
            </Stack>
          </Box>
        )}
      </Box>

      {/* Body */}
      <Box sx={{ flexGrow: 1, pt: 0.5 }}>
        {!hasPlaces ? (
          <Box px={2} py={2}>
            <Typography variant="body2" color="text.secondary">
              {zoom && zoom < SHOW_PLACES_ZOOM
                ? "Zoom in on the map to load accessible points of interest."
                : photosOnly
                ? 'No places with photos here yet. Try moving the map, zooming in, or turning off "Only with photos".'
                : "Try moving the map or adjusting the accessibility / type filters."}
            </Typography>
          </Box>
        ) : (
          <List disablePadding dense>
            <Box sx={{ flexGrow: 1, pt: 0.5 }}>
              {!hasPlaces ? (
                <Box px={2} py={2}>
                  <Typography variant="body2" color="text.secondary">
                    {zoom && zoom < SHOW_PLACES_ZOOM
                      ? "Zoom in on the map to load accessible points of interest."
                      : "Try moving the map or adjusting the accessibility / type filters."}
                  </Typography>
                </Box>
              ) : (
                <List disablePadding dense>
                  {items.map((item, idx) => {
                    const photo = item.placeKey
                      ? photoByKey[item.placeKey]
                      : undefined;
                    const thumbSrc = photo && (photo.thumb || photo.src || "");

                    // Get keywords for this item
                    const keywords = item.placeKey
                      ? keywordsByPlaceKey[item.placeKey]
                      : null;

                    // Ensure unique key: use placeKey if available, otherwise fallback to idx
                    // Add idx to placeKey to ensure uniqueness even if placeKey is duplicated (shouldn't happen after filtering)
                    const uniqueKey = item.placeKey
                      ? `${item.placeKey}-${idx}`
                      : `item-${idx}`;
                    return (
                      <Box key={uniqueKey}>
                        <Divider component="li" />
                        <ListItem 
                          disablePadding 
                          sx={{ alignItems: "stretch" }}
                          secondaryAction={
                            onUnsave && item.feature?.properties?.savedPlaceId ? (
                              <Tooltip title="Remove from saved">
                                <IconButton
                                  edge="end"
                                  aria-label="Remove from saved"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUnsave(item.feature);
                                  }}
                                  sx={{ 
                                    color: "error.main",
                                    mr: 1
                                  }}
                                >
                                  <FavoriteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            ) : null
                          }
                        >
                          <ListItemButton
                            alignItems="flex-start"
                            onClick={() => onSelect?.(item.feature)}
                            sx={{ py: 1.5 }}
                          >
                            <Box
                              display="flex"
                              gap={1.5}
                              alignItems="flex-start"
                              width="100%"
                            >
                              {thumbSrc && (
                                <Box
                                  component="img"
                                  src={thumbSrc}
                                  alt={photo?.title || item.name}
                                  loading="lazy"
                                  sx={{
                                    mt: "6px",
                                    width: 64,
                                    height: 64,
                                    borderRadius: 1,
                                    objectFit: "cover",
                                    flexShrink: 0,
                                    bgcolor: "grey.200",
                                  }}
                                />
                              )}

                              <ListItemText
                                primary={
                                  <Box
                                    display="flex"
                                    alignItems="center"
                                    justifyContent="space-between"
                                    gap={1}
                                  >
                                    <Typography
                                      variant="subtitle2"
                                      fontWeight={600}
                                      noWrap
                                    >
                                      {item.name}
                                    </Typography>
                                    {item.distKm != null && (
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ whiteSpace: "nowrap" }}
                                      >
                                        {formatDistance(item.distKm)}
                                      </Typography>
                                    )}
                                  </Box>
                                }
                                secondary={
                                  <Box mt={0.5}>
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      display="block"
                                      noWrap
                                    >
                                      {item.category || "Point of interest"}
                                    </Typography>
                                    {item.address && (
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        display="block"
                                        noWrap
                                      >
                                        {item.address}
                                      </Typography>
                                    )}
                                    <Box mt={0.75}>
                                      <Chip
                                        size="small"
                                        label={
                                          item.accTier === "unknown"
                                            ? "Accessibility: unknown"
                                            : `Accessibility: ${item.accTier}`
                                        }
                                        sx={{
                                          bgcolor: item.accColor,
                                          color: "#fff",
                                          fontSize: "0.7rem",
                                          height: 22,
                                        }}
                                      />
                                    </Box>

                                    {/* Render Top 2 Keywords if available */}
                                    {keywords && keywords.length > 0 && (
                                      <Box
                                        mt={0.5}
                                        display="flex"
                                        flexWrap="wrap"
                                        gap={0.5}
                                      >
                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                          sx={{
                                            alignSelf: "center",
                                            fontSize: "0.65rem",
                                          }}
                                        >
                                          Extracted accessibility tags from
                                          reviews:
                                        </Typography>

                                        {keywords.map((k, i) => (
                                          <Chip
                                            key={i}
                                            size="small"
                                            label={k.label}
                                            variant="outlined"
                                            sx={{
                                              fontSize: "0.65rem",
                                              height: 22,
                                              borderColor: "rgba(0,0,0,0.12)",
                                            }}
                                          />
                                        ))}
                                      </Box>
                                    )}
                                  </Box>
                                }
                                primaryTypographyProps={{ component: "div" }}
                                secondaryTypographyProps={{ component: "div" }}
                              />
                            </Box>
                          </ListItemButton>
                        </ListItem>
                      </Box>
                    );
                  })}
                </List>
              )}
            </Box>
          </List>
        )}
      </Box>

      {/* Filters Dialog */}
      <Dialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
          >
            <Typography variant="h6">Filters</Typography>
            <IconButton
              aria-label="close"
              onClick={() => setFiltersOpen(false)}
              sx={{ color: (theme) => theme.palette.grey[500] }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 1 }}>
            {/* Place Accessibility Filters */}
            <Box>
              <AccessibilityLegendReact />
            </Box>

            {/* Place Type Filters */}
            {rawItems.length > 0 && (
              <Box>
                <NestedPlaceTypeFilter items={rawItems} />
              </Box>
            )}

            {/* Photos filter – same state as header toggle */}
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={photosOnly}
                    onChange={(e) => setPhotosOnly(e.target.checked)}
                  />
                }
                label={
                  <Typography variant="body2" color="text.secondary">
                    Only with photos
                  </Typography>
                }
              />
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}
