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
import AccessibilityLegendReact from "./AccessibilityLegendReact";

import {
  BADGE_COLOR_BY_TIER,
  SHOW_PLACES_ZOOM,
} from "../constants/constants.mjs";
import { resolvePlacePhotos } from "../modules/fetchPhotos.mjs";

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
  if (raw.includes("limited") || raw.includes("partial")) return "limited";
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
  const placeKey =
    (props.osm_type && props.osm_id && `${props.osm_type}/${props.osm_id}`) ||
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
    if (!fromLs || typeof fromLs !== "object") return defaultState;
    // merge with default (so new categories get added)
    const merged = { ...defaultState };
    Object.entries(fromLs).forEach(([group, subs]) => {
      if (!merged[group]) merged[group] = {};
      if (!subs || typeof subs !== "object") return;
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
    saveTypeFilter(selection);

    // Build payload for non-React consumers
    const active = [];
    Object.entries(selection || {}).forEach(([groupLabel, subs]) => {
      if (!subs || typeof subs !== "object") return;
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
    const subs = selection?.[groupLabel];
    if (!subs || typeof subs !== "object") return false;
    const values = Object.values(subs);
    if (!values.length) return false;
    return values.every(Boolean);
  };

  const isGroupSomeChecked = (groupLabel) => {
    const subs = selection?.[groupLabel];
    if (!subs || typeof subs !== "object") return false;
    const values = Object.values(subs);
    return values.some(Boolean);
  };

  const toggleGroup = (groupLabel) => {
    setSelection((prev) => {
      const next = { ...prev };
      const subs = next[groupLabel] || {};
      if (!subs || typeof subs !== "object") return next;
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
    setSelection((prev) => ({
      ...prev,
      [groupLabel]: {
        ...(prev[groupLabel] || {}),
        [subLabel]: !(prev[groupLabel]?.[subLabel] ?? true),
      },
    }));
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

export default function PlacesListReact({ data, onSelect }) {
  const { features = [], center, zoom } = data || {};
  const [sortBy, setSortBy] = useState("distance"); // "distance" | "name"
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [photoByKey, setPhotoByKey] = useState({});
  const photoCacheRef = useRef({});

  useEffect(() => {
    photoCacheRef.current = photoByKey;
  }, [photoByKey]);

  const [photosOnly, setPhotosOnly] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(PHOTOS_ONLY_LS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
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
  }, [photosOnly]);

  // raw items (with type metadata)
  const rawItems = useMemo(() => {
    const base = (features || []).map((f) => derivePlaceInfo(f, center));
    if (!base.length) return [];
    const sorted = [...base];

    if (sortBy === "distance") {
      sorted.sort((a, b) => {
        if (a.distKm == null && b.distKm == null) return 0;
        if (a.distKm == null) return 1;
        if (b.distKm == null) return -1;
        return a.distKm - b.distKm;
      });
    } else if (sortBy === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }

    return sorted;
  }, [features, center, sortBy]);

  // Load thumbnails for the closest / first items
  useEffect(() => {
    if (!rawItems.length) return;

    let cancelled = false;
    const MAX_PLACES_WITH_PHOTOS = 24;

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
          const photos = await resolvePlacePhotos(item.tags, item.latlng);
          if (cancelled) return;

          const first =
            Array.isArray(photos) && photos.length ? photos[0] : null;

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
  }, [rawItems]);

  // Place-type filter state for *list* (mirrors NestedPlaceTypeFilter localStorage)
  const [activeTypeFilters, setActiveTypeFilters] = useState(() => {
    const fromLs = loadInitialTypeFilter();
    return fromLs;
  });

  // Listen to filter changes broadcast from the nested filter component
  useEffect(() => {
    const handler = (ev) => {
      // we don't actually use the compact "active" list here, we just reload from LS
      const fromLs = loadInitialTypeFilter();
      setActiveTypeFilters(fromLs);
    };
    document.addEventListener("placeTypeFilterChanged", handler);
    return () =>
      document.removeEventListener("placeTypeFilterChanged", handler);
  }, []);

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
    if (photosOnly) {
      filtered = filtered.filter((item) => {
        if (!item.placeKey) return false;
        const photo = photoByKey[item.placeKey];
        return !!(photo && (photo.thumb || photo.src || photo.pageUrl));
      });
    }

    return filtered;
  }, [rawItems, activeTypeFilters, photosOnly, photoByKey]);

  const hasPlaces = items.length > 0;

  return (
    <>
      {/* Header */}
      <Box
        pb={0.75}
        borderBottom="1px solid rgba(0,0,0,0.08)"
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={1}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
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

        {rawItems.length > 0 && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 0.5,
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
              </Stack>
            </Stack>

            {/* "Only with photos" toggle, now below the Sort by row */}
            <FormControlLabel
              sx={{ m: 0 }}
              control={
                <Checkbox
                  size="small"
                  checked={photosOnly}
                  onChange={(e) => setPhotosOnly(e.target.checked)}
                />
              }
              label={
                <Typography variant="caption" color="text.secondary">
                  Only with photos
                </Typography>
              }
            />
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

                    return (
                      <Box key={item.placeKey || idx}>
                        <Divider component="li" />
                        <ListItem disablePadding sx={{ alignItems: "stretch" }}>
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
          <Box display="flex" alignItems="center" justifyContent="space-between">
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
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}
