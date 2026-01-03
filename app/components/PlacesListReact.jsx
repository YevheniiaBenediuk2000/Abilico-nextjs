"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OpeningHoursLib from "opening_hours";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import FilterListIcon from "@mui/icons-material/FilterList";
import FavoriteIcon from "@mui/icons-material/Favorite";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import AccessibilityLegendReact from "./AccessibilityLegendReact";
import { iconFor } from "../icons/makiIconFor.mjs";

import {
  BADGE_COLOR_BY_TIER,
  SHOW_PLACES_ZOOM,
} from "../constants/constants.mjs";
import {
  TAG_CHIP_ICON_STYLE,
  TAG_CHIP_WITH_ICON_SX,
} from "../constants/tagChips";
import { resolvePlacePhotos } from "../modules/fetchPhotos.mjs";
import { supabase } from "../api/supabaseClient";
import { ensurePlaceExists, reviewStorage } from "../api/reviewStorage";
import { computePlaceScores } from "../api/placeRatings";
import { formatAddressFromTags } from "../utils/formatAddress.mjs";

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

/**
 * Check if a place is currently open based on opening_hours tag.
 * Returns: { isOpen: boolean, hasHours: boolean }
 * - isOpen: true if open now, false if closed or unknown
 * - hasHours: true if the place has valid opening_hours data
 */
function isPlaceOpenNow(tags = {}) {
  const openingHours = tags.opening_hours || tags["opening_hours"];
  if (!openingHours) {
    return { isOpen: false, hasHours: false };
  }

  try {
    const oh = new OpeningHoursLib(openingHours, null, { locale: "en" });
    const now = new Date();
    const isUnknown = oh.getUnknown(now);
    if (isUnknown) {
      return { isOpen: false, hasHours: true };
    }
    const isOpen = oh.getState(now);
    return { isOpen, hasHours: true };
  } catch (e) {
    // Failed to parse opening_hours - treat as unknown
    return { isOpen: false, hasHours: true };
  }
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

  const humanize = (v) => {
    const s = String(v ?? "")
      .replace(/[_-]/g, " ")
      .trim();
    if (!s) return "";
    // Avoid showing boolean-ish values like "yes" as labels.
    if (s.toLowerCase() === "yes" || s.toLowerCase() === "true" || s === "1")
      return "";
    return s;
  };

  const resolveDiplomaticLabel = () => {
    const embassyRaw = tags.embassy ?? null;
    const embassyLower =
      embassyRaw != null ? String(embassyRaw).trim().toLowerCase() : "";
    if (embassyLower) {
      if (embassyLower === "yes") return "Embassy";
      if (embassyLower.includes("consulate")) return "Consulate";
      return humanize(embassyLower) || null;
    }

    const officeLower = String(tags.office ?? "")
      .trim()
      .toLowerCase();
    const diplomaticRaw = tags.diplomatic ?? null;
    const diplomaticLower =
      diplomaticRaw != null ? String(diplomaticRaw).trim().toLowerCase() : "";
    if (officeLower === "diplomatic" && diplomaticLower) {
      if (diplomaticLower === "embassy") return "Embassy";
      if (diplomaticLower.includes("consulate")) return "Consulate";
      return humanize(diplomaticLower) || null;
    }

    return null;
  };

  const diplomaticLabel = resolveDiplomaticLabel();

  const resolveVegetarianLabel = () => {
    // diet:vegetarian=yes|only|no (legacy: vegetarian=yes|only|no)
    const raw =
      tags["diet:vegetarian"] ??
      tags["diet_vegetarian"] ??
      tags["diet-vegetarian"] ??
      tags.vegetarian ??
      null;
    const v = raw != null ? String(raw).trim().toLowerCase() : "";
    if (!v || v === "no" || v === "false" || v === "0") return null;

    const amenityLower = String(tags.amenity ?? "")
      .trim()
      .toLowerCase();
    const shopLower = String(tags.shop ?? "")
      .trim()
      .toLowerCase();
    const relevantAmenities = new Set([
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
    const relevantShops = new Set([
      "supermarket",
      "convenience",
      "greengrocer",
      "health_food",
      "deli",
      "bakery",
    ]);
    const isRelevant =
      relevantAmenities.has(amenityLower) || relevantShops.has(shopLower);
    if (!isRelevant) return null;

    if (v === "only") return "Vegetarian only";
    if (v === "yes" || v === "true" || v === "1") return "Vegetarian options";
    return null;
  };

  const vegetarianLabel = resolveVegetarianLabel();

  const resolveVeganLabel = () => {
    // diet:vegan=yes|only|no (legacy: vegan=yes|only|no)
    const raw =
      tags["diet:vegan"] ??
      tags["diet_vegan"] ??
      tags["diet-vegan"] ??
      tags.vegan ??
      null;
    const v = raw != null ? String(raw).trim().toLowerCase() : "";
    if (!v || v === "no" || v === "false" || v === "0") return null;

    const amenityLower = String(tags.amenity ?? "")
      .trim()
      .toLowerCase();
    const shopLower = String(tags.shop ?? "")
      .trim()
      .toLowerCase();
    const relevantAmenities = new Set([
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
    const relevantShops = new Set([
      "supermarket",
      "convenience",
      "greengrocer",
      "health_food",
      "deli",
      "bakery",
    ]);
    const isRelevant =
      relevantAmenities.has(amenityLower) || relevantShops.has(shopLower);
    if (!isRelevant) return null;

    if (v === "only") return "Vegan only";
    if (v === "yes" || v === "true" || v === "1") return "Vegan options";
    return null;
  };

  const veganLabel = resolveVeganLabel();

  const typeLabel =
    diplomaticLabel ||
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
    "Point of interest";

  const majorKey =
    (tags.amenity && "amenity") ||
    (tags.shop && "shop") ||
    (tags.tourism && "tourism") ||
    (tags.leisure && "leisure") ||
    (tags.healthcare && "healthcare") ||
    (tags.office && "office") ||
    // embassy/diplomatic without office=* should still group under Office for filtering/UI
    (diplomaticLabel && "office") ||
    (tags.historic && "historic") ||
    (tags.natural && "natural") ||
    (tags.sport && "sport") ||
    (tags.building && "building") ||
    "other";

  const subKey =
    (majorKey === "office" && !tags.office && diplomaticLabel
      ? "diplomatic"
      : tags[majorKey]) ||
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

  // Category label for the list UI:
  // - never show raw boolean-ish values like "yes"
  // - map building=yes to "Building" (consistent with typeLabel)
  const category =
    diplomaticLabel ||
    humanize(tags.amenity) ||
    humanize(tags.shop) ||
    humanize(tags.tourism) ||
    humanize(tags.leisure) ||
    humanize(tags.healthcare) ||
    humanize(tags.office) ||
    humanize(tags.historic) ||
    humanize(tags.natural) ||
    humanize(tags.sport) ||
    (String(tags.building ?? "")
      .toLowerCase()
      .trim() === "yes"
      ? "Building"
      : humanize(tags.building)) ||
    "";

  const address = formatAddressFromTags(tags);

  // Prefer name/brand/operator; otherwise show a useful label instead of "Unnamed place".
  const name =
    tags.name ||
    tags.brand ||
    tags.operator ||
    tags["addr:housename"] ||
    (address ? `${typeLabel} — ${address}` : typeLabel);

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
    veganLabel,
    vegetarianLabel,
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
    building: "Buildings",
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
const OPEN_NOW_LS_KEY = "ui.placeList.openNow";
const ACCESSIBILITY_FILTER_LS_KEY = "ui.placeAccessibility.filter";
const ALL_ACCESSIBILITY_TIERS = [
  "designated",
  "yes",
  "limited",
  "unknown",
  "no",
];

// Mapping from group labels to MAKI icon names
const GROUP_ICON_MAP = {
  Amenities: "information",
  Shops: "shop",
  Tourism: "attraction",
  Leisure: "park",
  Office: "commercial",
  Historic: "monument",
  Other: "information",
  Healthcare: "hospital",
  Natural: "park",
  Sport: "pitch",
  Buildings: "building",
};

const makiIconUrl = (name) => `/icons/maki/${encodeURIComponent(name)}.svg`;

// Map group labels back to major keys for icon lookup
const GROUP_TO_MAJOR_KEY = {
  Amenities: "amenity",
  Shops: "shop",
  Tourism: "tourism",
  Leisure: "leisure",
  Office: "office",
  Historic: "historic",
  Other: "other",
  Healthcare: "healthcare",
  Natural: "natural",
  Sport: "sport",
  Buildings: "building",
};

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

  // Track which categories are expanded
  const [expanded, setExpanded] = useState(() => {
    const expandedState = {};
    Object.keys(tree).forEach((groupLabel) => {
      expandedState[groupLabel] = false; // Start collapsed
    });
    return expandedState;
  });

  const toggleExpanded = (groupLabel) => {
    setExpanded((prev) => ({
      ...prev,
      [groupLabel]: !prev[groupLabel],
    }));
  };

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
    if (!selection || typeof selection !== "object") return;
    saveTypeFilter(selection);

    // Build payload for non-React consumers
    const active = [];
    Object.entries(selection).forEach(([groupLabel, subs]) => {
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
    if (!selection || typeof selection !== "object" || selection === null)
      return false;
    const subs = selection[groupLabel];
    if (
      !subs ||
      typeof subs !== "object" ||
      subs === null ||
      Array.isArray(subs)
    )
      return false;
    const values = Object.values(subs || {});
    if (!values.length) return false;
    return values.every(Boolean);
  };

  const isGroupSomeChecked = (groupLabel) => {
    if (!selection || typeof selection !== "object" || selection === null)
      return false;
    const subs = selection[groupLabel];
    if (
      !subs ||
      typeof subs !== "object" ||
      subs === null ||
      Array.isArray(subs)
    )
      return false;
    const values = Object.values(subs || {});
    return values.some(Boolean);
  };

  const toggleGroup = (groupLabel) => {
    setSelection((prev) => {
      if (!prev || typeof prev !== "object" || prev === null) return {};
      const next = { ...prev };
      const subs = next[groupLabel];
      if (
        !subs ||
        typeof subs !== "object" ||
        subs === null ||
        Array.isArray(subs)
      )
        return next;
      const allChecked = Object.values(subs || {}).every(Boolean);
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
      if (!prev || typeof prev !== "object") return {};
      return {
        ...prev,
        [groupLabel]: {
          ...(prev[groupLabel] || {}),
          [subLabel]: !(prev[groupLabel]?.[subLabel] ?? true),
        },
      };
    });
  };

  // Clear all place types (sets all subtypes to false)
  const clearAllPlaceTypes = () => {
    setSelection((prev) => {
      if (!prev || typeof prev !== "object") return {};
      const next = { ...prev };
      Object.keys(next).forEach((groupLabel) => {
        const group = next[groupLabel];
        if (group && typeof group === "object" && !Array.isArray(group)) {
          const newSubs = {};
          Object.keys(group).forEach((subLabel) => {
            newSubs[subLabel] = false;
          });
          next[groupLabel] = newSubs;
        }
      });
      return next;
    });
  };

  // Clear a specific group (sets all subtypes in that group to false)
  const clearGroup = (groupLabel) => {
    setSelection((prev) => {
      if (!prev || typeof prev !== "object") return {};
      const next = { ...prev };
      const group = next[groupLabel];
      if (group && typeof group === "object" && !Array.isArray(group)) {
        const newSubs = {};
        Object.keys(group).forEach((subLabel) => {
          newSubs[subLabel] = false;
        });
        next[groupLabel] = newSubs;
      }
      return next;
    });
  };

  // Check if any place type is selected (for showing "Clear place types" button)
  const hasAnyPlaceTypeSelected = useMemo(() => {
    if (!selection || typeof selection !== "object") return false;
    return Object.values(selection || {}).some((group) => {
      if (!group || typeof group !== "object" || Array.isArray(group))
        return false;
      return Object.values(group || {}).some(Boolean);
    });
  }, [selection]);

  if (!Object.keys(tree).length) return null;

  return (
    <Box mb={1.5}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1.5,
        }}
      >
        <Typography
          variant="overline"
          sx={{
            color: "text.primary",
            fontWeight: 600,
            letterSpacing: 1,
            fontSize: "0.7rem",
          }}
        >
          FILTER BY PLACE TYPE
        </Typography>
        {hasAnyPlaceTypeSelected && (
          <Link
            component="button"
            onClick={clearAllPlaceTypes}
            sx={{
              fontSize: "0.7rem",
              color: "text.secondary",
              textDecoration: "none",
              cursor: "pointer",
              "&:hover": {
                textDecoration: "underline",
                color: "text.primary",
              },
            }}
          >
            Clear place types
          </Link>
        )}
      </Box>
      <Paper
        elevation={0}
        sx={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            p: 2.5,
          }}
        >
          {/* First row: Amenities, Tourism, Shops */}
          {(() => {
            const firstRowCategories = ["Amenities", "Tourism", "Shops"].filter(
              (label) => tree[label]
            );
            if (firstRowCategories.length === 0) return null;

            // Check if any category in this row is expanded
            const hasExpanded = firstRowCategories.some(
              (label) => expanded[label]
            );

            return (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: hasExpanded ? "column" : "row",
                  gap: 2,
                  justifyContent: hasExpanded ? "flex-start" : "center",
                  flexWrap: "wrap",
                  width: "100%",
                }}
              >
                {firstRowCategories.map((groupLabel) => {
                  const subs = tree[groupLabel];
                  const allChecked = isGroupAllChecked(groupLabel);
                  const groupChecked = allChecked;

                  // Count selected subcategories
                  const groupSelection = selection && selection[groupLabel];
                  const selectedCount = (
                    groupSelection &&
                    typeof groupSelection === "object" &&
                    groupSelection !== null &&
                    !Array.isArray(groupSelection)
                      ? Object.values(groupSelection || {})
                      : []
                  ).filter(Boolean).length;
                  const totalCount = Object.keys(subs).length;

                  return (
                    <Box
                      key={groupLabel}
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.75,
                        flex: hasExpanded ? "1 1 100%" : "0 1 auto",
                        width: hasExpanded ? "100%" : "auto",
                      }}
                    >
                      <Box
                        display="flex"
                        alignItems="center"
                        gap={1}
                        justifyContent="space-between"
                      >
                        <Box display="flex" alignItems="center" gap={1}>
                          <Box
                            onClick={() => toggleGroup(groupLabel)}
                            sx={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 0.75,
                              cursor: "pointer",
                              py: 0.5,
                              px: 1.25,
                              borderRadius: 3,
                              bgcolor: groupChecked
                                ? "primary.main"
                                : "transparent",
                              border: `1px solid ${
                                groupChecked
                                  ? "primary.main"
                                  : "rgba(0,0,0,0.12)"
                              }`,
                              transition: "all 0.2s ease-in-out",
                              "&:hover": {
                                bgcolor: groupChecked
                                  ? "primary.dark"
                                  : "action.hover",
                                borderColor: "primary.main",
                              },
                            }}
                          >
                            {GROUP_ICON_MAP[groupLabel] && (
                              <Box
                                component="img"
                                src={makiIconUrl(GROUP_ICON_MAP[groupLabel])}
                                alt={groupLabel}
                                sx={{
                                  width: 16,
                                  height: 16,
                                  objectFit: "contain",
                                  flexShrink: 0,
                                  opacity: groupChecked ? 1 : 0.7,
                                  filter: groupChecked
                                    ? "brightness(0) invert(1)"
                                    : "none",
                                }}
                              />
                            )}
                            <Typography
                              variant="body2"
                              fontWeight={500}
                              sx={{
                                color: groupChecked ? "white" : "text.primary",
                                fontSize: "0.875rem",
                              }}
                            >
                              {groupLabel}
                            </Typography>
                          </Box>
                          {selectedCount < totalCount && (
                            <>
                              <Chip
                                label={`${selectedCount} selected`}
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: "0.65rem",
                                  bgcolor: "action.selected",
                                  color: "text.secondary",
                                  fontWeight: 400,
                                }}
                              />
                              {selectedCount > 0 && (
                                <Link
                                  component="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    clearGroup(groupLabel);
                                  }}
                                  sx={{
                                    fontSize: "0.65rem",
                                    color: "text.secondary",
                                    textDecoration: "none",
                                    cursor: "pointer",
                                    ml: 0.5,
                                    "&:hover": {
                                      textDecoration: "underline",
                                      color: "text.primary",
                                    },
                                  }}
                                >
                                  Clear
                                </Link>
                              )}
                            </>
                          )}
                        </Box>
                        <IconButton
                          size="small"
                          onClick={() => toggleExpanded(groupLabel)}
                          sx={{
                            p: 0.5,
                            color: "text.secondary",
                          }}
                        >
                          {expanded[groupLabel] ? (
                            <KeyboardArrowUpIcon fontSize="small" />
                          ) : (
                            <KeyboardArrowDownIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Box>
                      {expanded[groupLabel] && (
                        <Box
                          sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 0.75,
                            justifyContent: "flex-start",
                            alignContent: "flex-start",
                            width: "100%",
                            mt: 0.5,
                            pl: 1.5,
                          }}
                        >
                          {Object.keys(subs)
                            .sort()
                            .map((subLabel) => {
                              const rawValues = Array.from(subs[subLabel]);
                              const rawValue =
                                rawValues[0] || subLabel.replace(/\s/g, "_");
                              const majorKey =
                                GROUP_TO_MAJOR_KEY[groupLabel] || "other";
                              const tags = { [majorKey]: rawValue };
                              let iconUrl = iconFor(tags);
                              // Fallback to information icon if iconFor returns null/undefined
                              if (!iconUrl) {
                                iconUrl = "/icons/maki/information.svg";
                              }
                              const isSelected =
                                selection[groupLabel]?.[subLabel] ?? true;

                              return (
                                <Chip
                                  key={subLabel}
                                  icon={
                                    <Box
                                      component="img"
                                      src={iconUrl}
                                      alt={subLabel}
                                      sx={{
                                        width: 14,
                                        height: 14,
                                        objectFit: "contain",
                                        display: "block",
                                        flexShrink: 0,
                                      }}
                                      onError={(e) => {
                                        // Fallback to information icon if image fails to load
                                        e.target.src =
                                          "/icons/maki/information.svg";
                                      }}
                                    />
                                  }
                                  label={
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontSize: "0.8125rem",
                                        color: isSelected
                                          ? "white"
                                          : "text.primary",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {subLabel.charAt(0).toUpperCase() +
                                        subLabel.slice(1)}
                                    </Typography>
                                  }
                                  onClick={() =>
                                    toggleSub(groupLabel, subLabel)
                                  }
                                  sx={{
                                    height: 28,
                                    bgcolor: isSelected
                                      ? "primary.main"
                                      : "transparent",
                                    color: isSelected
                                      ? "white"
                                      : "text.primary",
                                    border: `1px solid ${
                                      isSelected
                                        ? "primary.main"
                                        : "rgba(0,0,0,0.12)"
                                    }`,
                                    borderRadius: 3,
                                    cursor: "pointer",
                                    "&:hover": {
                                      bgcolor: isSelected
                                        ? "primary.dark"
                                        : "action.hover",
                                      borderColor: "primary.main",
                                    },
                                    "& .MuiChip-icon": {
                                      marginLeft: 0.75,
                                      marginRight: 0.5,
                                      opacity: isSelected ? 1 : 0.7,
                                      filter: isSelected
                                        ? "brightness(0) invert(1)"
                                        : "none",
                                      width: 14,
                                      height: 14,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    },
                                    "& .MuiChip-label": {
                                      paddingLeft: iconUrl ? 0 : 0.75,
                                      paddingRight: 1,
                                      display: "flex",
                                      alignItems: "center",
                                    },
                                  }}
                                />
                              );
                            })}
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            );
          })()}

          {/* Second row: Leisure, Historic (centered) */}
          {(() => {
            const secondRowCategories = ["Leisure", "Historic"].filter(
              (label) => tree[label]
            );
            if (secondRowCategories.length === 0) return null;

            // Check if any category in this row is expanded
            const hasExpanded = secondRowCategories.some(
              (label) => expanded[label]
            );

            return (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: hasExpanded ? "column" : "row",
                  gap: 2,
                  justifyContent: hasExpanded ? "flex-start" : "center",
                  flexWrap: "wrap",
                  width: "100%",
                }}
              >
                {secondRowCategories.map((groupLabel) => {
                  const subs = tree[groupLabel];
                  const allChecked = isGroupAllChecked(groupLabel);
                  const groupChecked = allChecked;

                  // Count selected subcategories
                  const groupSelection = selection && selection[groupLabel];
                  const selectedCount = (
                    groupSelection &&
                    typeof groupSelection === "object" &&
                    groupSelection !== null &&
                    !Array.isArray(groupSelection)
                      ? Object.values(groupSelection || {})
                      : []
                  ).filter(Boolean).length;
                  const totalCount = Object.keys(subs).length;

                  return (
                    <Box
                      key={groupLabel}
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                        flex: hasExpanded ? "1 1 100%" : "0 1 auto",
                        width: hasExpanded ? "100%" : "auto",
                      }}
                    >
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <Box
                          onClick={() => toggleGroup(groupLabel)}
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 0.75,
                            cursor: "pointer",
                            py: 0.5,
                            px: 1.25,
                            borderRadius: 3,
                            bgcolor: groupChecked
                              ? "primary.main"
                              : "transparent",
                            border: `1px solid ${
                              groupChecked ? "primary.main" : "rgba(0,0,0,0.12)"
                            }`,
                            transition: "all 0.2s ease-in-out",
                            "&:hover": {
                              bgcolor: groupChecked
                                ? "primary.dark"
                                : "action.hover",
                              borderColor: "primary.main",
                            },
                          }}
                        >
                          {GROUP_ICON_MAP[groupLabel] && (
                            <Box
                              component="img"
                              src={makiIconUrl(GROUP_ICON_MAP[groupLabel])}
                              alt={groupLabel}
                              sx={{
                                width: 16,
                                height: 16,
                                objectFit: "contain",
                                flexShrink: 0,
                                opacity: groupChecked ? 1 : 0.7,
                                filter: groupChecked
                                  ? "brightness(0) invert(1)"
                                  : "none",
                              }}
                            />
                          )}
                          <Typography
                            variant="body2"
                            fontWeight={500}
                            sx={{
                              color: groupChecked ? "white" : "text.primary",
                              fontSize: "0.875rem",
                            }}
                          >
                            {groupLabel}
                          </Typography>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={() => toggleExpanded(groupLabel)}
                          sx={{
                            p: 0.25,
                            color: "text.secondary",
                            ml: -0.5,
                          }}
                        >
                          {expanded[groupLabel] ? (
                            <KeyboardArrowUpIcon fontSize="small" />
                          ) : (
                            <KeyboardArrowDownIcon fontSize="small" />
                          )}
                        </IconButton>
                        {selectedCount < totalCount && (
                          <>
                            <Chip
                              label={`${selectedCount} selected`}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: "0.65rem",
                                bgcolor: "action.selected",
                                color: "text.secondary",
                                fontWeight: 400,
                                ml: 0.5,
                              }}
                            />
                            {selectedCount > 0 && (
                              <Link
                                component="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  clearGroup(groupLabel);
                                }}
                                sx={{
                                  fontSize: "0.65rem",
                                  color: "text.secondary",
                                  textDecoration: "none",
                                  cursor: "pointer",
                                  ml: 0.5,
                                  "&:hover": {
                                    textDecoration: "underline",
                                    color: "text.primary",
                                  },
                                }}
                              >
                                Clear
                              </Link>
                            )}
                          </>
                        )}
                      </Box>
                      {expanded[groupLabel] && (
                        <Box
                          sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 0.75,
                            justifyContent: "flex-start",
                            alignContent: "flex-start",
                            width: "100%",
                            mt: 0.5,
                            pl: 1.5,
                          }}
                        >
                          {Object.keys(subs)
                            .sort()
                            .map((subLabel) => {
                              const rawValues = Array.from(subs[subLabel]);
                              const rawValue =
                                rawValues[0] || subLabel.replace(/\s/g, "_");
                              const majorKey =
                                GROUP_TO_MAJOR_KEY[groupLabel] || "other";
                              const tags = { [majorKey]: rawValue };
                              let iconUrl = iconFor(tags);
                              // Fallback to information icon if iconFor returns null/undefined
                              if (!iconUrl) {
                                iconUrl = "/icons/maki/information.svg";
                              }
                              const isSelected =
                                selection[groupLabel]?.[subLabel] ?? true;

                              return (
                                <Chip
                                  key={subLabel}
                                  icon={
                                    <Box
                                      component="img"
                                      src={iconUrl}
                                      alt={subLabel}
                                      sx={{
                                        width: 14,
                                        height: 14,
                                        objectFit: "contain",
                                        display: "block",
                                        flexShrink: 0,
                                      }}
                                      onError={(e) => {
                                        // Fallback to information icon if image fails to load
                                        e.target.src =
                                          "/icons/maki/information.svg";
                                      }}
                                    />
                                  }
                                  label={
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontSize: "0.8125rem",
                                        color: isSelected
                                          ? "white"
                                          : "text.primary",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {subLabel.charAt(0).toUpperCase() +
                                        subLabel.slice(1)}
                                    </Typography>
                                  }
                                  onClick={() =>
                                    toggleSub(groupLabel, subLabel)
                                  }
                                  sx={{
                                    height: 28,
                                    bgcolor: isSelected
                                      ? "primary.main"
                                      : "transparent",
                                    color: isSelected
                                      ? "white"
                                      : "text.primary",
                                    border: `1px solid ${
                                      isSelected
                                        ? "primary.main"
                                        : "rgba(0,0,0,0.12)"
                                    }`,
                                    borderRadius: 3,
                                    cursor: "pointer",
                                    "&:hover": {
                                      bgcolor: isSelected
                                        ? "primary.dark"
                                        : "action.hover",
                                      borderColor: "primary.main",
                                    },
                                    "& .MuiChip-icon": {
                                      marginLeft: 0.75,
                                      marginRight: 0.5,
                                      opacity: isSelected ? 1 : 0.7,
                                      filter: isSelected
                                        ? "brightness(0) invert(1)"
                                        : "none",
                                      width: 14,
                                      height: 14,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    },
                                    "& .MuiChip-label": {
                                      paddingLeft: iconUrl ? 0 : 0.75,
                                      paddingRight: 1,
                                      display: "flex",
                                      alignItems: "center",
                                    },
                                  }}
                                />
                              );
                            })}
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            );
          })()}
        </Box>
      </Paper>
    </Box>
  );
}

export default function PlacesListReact({
  data,
  onSelect,
  hideControls = false,
  onUnsave = null,
  isOpen = true,
}) {
  const { features = [], center, zoom } = data || {};
  const [sortBy, setSortBy] = useState("distance"); // "distance" | "name" | "accessibility" | "overall" | "bestForMe"
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortAnchorEl, setSortAnchorEl] = useState(null);
  const [filterResetKey, setFilterResetKey] = useState(0); // Key to force re-render of filter components
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Check if any accessibility filters are active (not all tiers selected)
  const hasAccessibilityFiltersActive = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem(ACCESSIBILITY_FILTER_LS_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return false;
      // Check if the selected tiers are different from all tiers
      const selectedSet = new Set(parsed);
      const allTiersSet = new Set(ALL_ACCESSIBILITY_TIERS);
      // If they have different lengths or different items, filters are active
      if (selectedSet.size !== allTiersSet.size) return true;
      return !ALL_ACCESSIBILITY_TIERS.every((tier) => selectedSet.has(tier));
    } catch {
      return false;
    }
  }, [filterResetKey]);

  // Clear ONLY accessibility filters
  const clearAccessibilityFilters = () => {
    if (typeof window === "undefined") return;

    try {
      // reset to all tiers selected
      window.localStorage.setItem(
        ACCESSIBILITY_FILTER_LS_KEY,
        JSON.stringify(ALL_ACCESSIBILITY_TIERS)
      );

      // notify AccessibilityLegendReact + map
      document.dispatchEvent(
        new CustomEvent("accessibilityFilterChanged", {
          detail: ALL_ACCESSIBILITY_TIERS,
        })
      );

      // force remount of the legend so UI resets
      setFilterResetKey((prev) => prev + 1);
    } catch (err) {
      console.error("Failed to clear accessibility filters:", err);
    }
  };
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
  const keywordsFetchErrorLoggedRef = useRef(false);

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

  const [openNowOnly, setOpenNowOnly] = useState(() => {
    // Disable openNowOnly filter when hideControls is true (e.g., saved places page)
    if (hideControls) return false;
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(OPEN_NOW_LS_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Clear all filters function
  const clearAllFilters = () => {
    if (typeof window === "undefined") return;

    try {
      // Clear accessibility filters - set to all tiers
      window.localStorage.setItem(
        ACCESSIBILITY_FILTER_LS_KEY,
        JSON.stringify(ALL_ACCESSIBILITY_TIERS)
      );
      // Dispatch event to notify AccessibilityLegendReact and mapMain
      document.dispatchEvent(
        new CustomEvent("accessibilityFilterChanged", {
          detail: ALL_ACCESSIBILITY_TIERS,
        })
      );

      // Clear place type filters - remove from localStorage (will default to all checked)
      window.localStorage.removeItem(PLACE_TYPE_FILTER_LS_KEY);
      // Update local state to null (which means all filters are on)
      setActiveTypeFilters(null);

      // Clear photos only filter
      window.localStorage.removeItem(PHOTOS_ONLY_LS_KEY);
      setPhotosOnly(false);

      // Clear open now filter
      window.localStorage.removeItem(OPEN_NOW_LS_KEY);
      setOpenNowOnly(false);

      // Force re-render of filter components (they will rebuild with defaults and dispatch events)
      setFilterResetKey((prev) => prev + 1);
    } catch (err) {
      console.error("Failed to clear filters:", err);
    }
  };

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

      // Dispatch event to notify mapMain.js about the filter change
      document.dispatchEvent(
        new CustomEvent("photosOnlyFilterChanged", {
          detail: {
            enabled: photosOnly,
            photoByKey: photoCacheRef.current,
          },
        })
      );
    } catch {
      // ignore storage errors
    }
  }, [photosOnly, hideControls]);

  // Also dispatch when photoByKey changes and photosOnly is enabled
  useEffect(() => {
    if (hideControls) return;
    if (typeof window === "undefined") return;
    if (!photosOnly) return; // Only update map when filter is active

    // Dispatch updated photo data to mapMain.js
    document.dispatchEvent(
      new CustomEvent("photosOnlyFilterChanged", {
        detail: {
          enabled: photosOnly,
          photoByKey,
        },
      })
    );
  }, [photoByKey, photosOnly, hideControls]);

  // Persist and dispatch openNowOnly filter changes
  useEffect(() => {
    if (hideControls) return;
    if (typeof window === "undefined") return;
    try {
      if (openNowOnly) {
        window.localStorage.setItem(OPEN_NOW_LS_KEY, "1");
      } else {
        window.localStorage.removeItem(OPEN_NOW_LS_KEY);
      }

      // Dispatch event to notify mapMain.js about the filter change
      document.dispatchEvent(
        new CustomEvent("openNowFilterChanged", {
          detail: {
            enabled: openNowOnly,
          },
        })
      );
    } catch {
      // ignore storage errors
    }
  }, [openNowOnly, hideControls]);

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
    } else if (sortBy === "accessibility") {
      // Sort by accessibility tier: designated > yes > limited > no > unknown
      const tierOrder = {
        designated: 0,
        yes: 1,
        limited: 2,
        no: 3,
        unknown: 4,
      };
      sorted.sort((a, b) => {
        const orderA = tierOrder[a.accTier] ?? 4;
        const orderB = tierOrder[b.accTier] ?? 4;
        if (orderA === orderB) {
          return a.name.localeCompare(b.name); // tie-break by name
        }
        return orderA - orderB;
      });
    } else if (sortBy === "overall") {
      // Sort by overall rating (highest first - best practice)
      sorted.sort((a, b) => {
        const scoreAData = scoresByPlaceKey[a.placeKey] || {};
        const scoreBData = scoresByPlaceKey[b.placeKey] || {};

        const scoreA = scoreAData.globalScore ?? null;
        const scoreB = scoreBData.globalScore ?? null;

        // Places with ratings come first
        if (scoreA == null && scoreB == null) return 0;
        if (scoreA == null) return 1; // no rating goes to bottom
        if (scoreB == null) return -1; // no rating goes to bottom

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

  // Check if any place in the current area has a photo
  const hasAnyPhotoInArea = useMemo(
    () =>
      rawItems.some((item) => {
        if (!item.placeKey) return false;
        const photo = photoByKey[item.placeKey];
        return !!(photo && (photo.thumb || photo.src || photo.pageUrl));
      }),
    [rawItems, photoByKey]
  );

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
      let data = null;
      let error = null;
      try {
        const res = await supabase
          .from("places")
          .select("osm_id, accessibility_keywords")
          .in("osm_id", osmKeys);
        data = res?.data ?? null;
        error = res?.error ?? null;
      } catch (e) {
        error = e;
      }

      if (error) {
        // This is a non-critical enhancement. Avoid noisy Next overlay from console.error.
        if (!keywordsFetchErrorLoggedRef.current) {
          keywordsFetchErrorLoggedRef.current = true;
          const msg =
            error?.message ||
            error?.details ||
            error?.hint ||
            (typeof error === "string" ? error : null) ||
            (error && typeof error === "object"
              ? JSON.stringify(error)
              : String(error));
          console.warn(
            "⚠️ Could not fetch accessibility keywords for list:",
            msg
          );
        }
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
            } else if (
              photoUrl &&
              (photoUrl.url || photoUrl.src || photoUrl.thumb)
            ) {
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

  // ✅ Load overall ratings when sorting by overall
  useEffect(() => {
    if (sortBy !== "overall") return;

    if (!features || features.length === 0) return;

    let cancelled = false;

    async function loadOverallRatings() {
      try {
        const baseItems = (features || []).map((f) =>
          derivePlaceInfo(f, center)
        );

        const candidates = baseItems.filter(
          (item) => item.placeKey && item.latlng
        );

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
                "⚠️ Overall rating: could not ensure place exists for",
                key,
                err?.message ?? err
              );
              continue;
            }

            if (!placeId) continue;

            let reviews = [];
            try {
              reviews = await reviewStorage("GET", { place_id: placeId });
            } catch (err) {
              console.error(
                "❌ reviewStorage(GET) failed for place",
                key,
                err?.message ?? err
              );
              continue;
            }

            try {
              const { globalScore } = computePlaceScores(reviews || [], []);

              if (!cancelled) {
                setScoresByPlaceKey((prev) => {
                  if (prev[key] !== undefined) return prev;
                  return {
                    ...prev,
                    [key]: { globalScore, personalScore: null },
                  };
                });
              }
            } catch (err) {
              console.error(
                "❌ computePlaceScores failed for place",
                key,
                err?.message ?? err
              );
              continue;
            }
          } catch (err) {
            console.error(
              "❌ Unexpected failure in loadOverallRatings for place",
              key,
              err?.message ?? err
            );
          }
        }
      } catch (err) {
        console.error("❌ Error loading overall ratings:", err);
      }
    }

    loadOverallRatings();
    return () => {
      cancelled = true;
    };
  }, [sortBy, features, center, scoresByPlaceKey]);

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
      // If the saved filter is incomplete (e.g. only has "Shops"), do NOT hide other groups.
      // Only hide things the user explicitly turned off.
      let anyOn = false;
      Object.values(activeTypeFilters || {}).forEach((subs) => {
        if (!subs || typeof subs !== "object" || Array.isArray(subs)) return;
        if (Object.values(subs || {}).some(Boolean)) anyOn = true;
      });

      // If nothing is selected at all -> show nothing (user explicitly deselected everything)
      if (!anyOn) {
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

          const group = activeTypeFilters[majorLabel];
          // Group missing from saved filter => allow (avoid hiding categories unexpectedly)
          if (!group || typeof group !== "object" || Array.isArray(group)) {
            return true;
          }

          const val = group[subLabel];
          // Subtype missing from saved filter => allow (avoid hiding new types)
          if (typeof val === "undefined") return true;

          return !!val;
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

    // 👇 NEW: keep only places that are currently open
    // Skip this filter when hideControls is true
    if (openNowOnly && !hideControls) {
      filtered = filtered.filter((item) => {
        const { isOpen } = isPlaceOpenNow(item.tags || {});
        return isOpen;
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
    openNowOnly,
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
            <Typography
              sx={{
                fontSize: "1.125rem", // 18px
                fontWeight: 600,
                color: "rgba(0, 0, 0, 0.87)",
                marginBottom: "0.75rem",
              }}
            >
              Places in this area
            </Typography>
            <Typography
              sx={{
                fontSize: "0.875rem", // 14px
                color: "rgba(0, 0, 0, 0.6)",
                lineHeight: 1.5,
                marginBottom: hasPlaces ? 0 : "1.25rem",
              }}
            >
              {hasPlaces
                ? `${items.length} place${items.length === 1 ? "" : "s"}`
                : zoom && zoom < SHOW_PLACES_ZOOM
                ? "Zoom in on the map to see accessible places."
                : "No places match your filters in this area."}
            </Typography>
          </Box>
        )}

        {!hideControls && rawItems.length > 0 && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
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
              sx={{ textTransform: "none" }}
            >
              Filter
            </Button>

            {/* Sort Button */}
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              startIcon={<SwapVertIcon />}
              onClick={(e) => setSortAnchorEl(e.currentTarget)}
              sx={{ textTransform: "none" }}
            >
              Sort
            </Button>
          </Box>
        )}
      </Box>

      {/* Body */}
      <Box sx={{ flexGrow: 1, pt: 0.5 }}>
        {!hasPlaces ? (
          <Box px={2} py={2}>
            <Typography
              sx={{
                fontSize: "0.875rem", // 14px
                color: "rgba(0, 0, 0, 0.6)",
                lineHeight: 1.5,
              }}
            >
              {zoom && zoom < SHOW_PLACES_ZOOM
                ? "Zoom in on the map to see accessible places."
                : photosOnly
                ? 'No places with photos here yet. Try moving the map, zooming in, or turning off "Only places with photos".'
                : "Try moving the map, changing accessibility filters, or clearing filters."}
            </Typography>
          </Box>
        ) : (
          <List disablePadding dense>
            <Box sx={{ flexGrow: 1, pt: 0.5 }}>
              {!hasPlaces ? (
                <Box px={2} py={2}>
                  <Typography
                    sx={{
                      fontSize: "0.875rem", // 14px
                      color: "rgba(0, 0, 0, 0.6)",
                      lineHeight: 1.5,
                    }}
                  >
                    {zoom && zoom < SHOW_PLACES_ZOOM
                      ? "Zoom in on the map to see accessible places."
                      : "Try moving the map, changing accessibility filters, or clearing filters."}
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
                            onUnsave &&
                            item.feature?.properties?.savedPlaceId ? (
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
                                    mr: 1,
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
                                    width: 96,
                                    height: 96,
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
                                    {item.veganLabel && (
                                      <Box mt={0.5}>
                                        <Chip
                                          size="small"
                                          icon={
                                            <span
                                              className="material-icons"
                                              style={TAG_CHIP_ICON_STYLE}
                                            >
                                              spa
                                            </span>
                                          }
                                          label={item.veganLabel}
                                          sx={TAG_CHIP_WITH_ICON_SX}
                                        />
                                      </Box>
                                    )}
                                    {item.vegetarianLabel && (
                                      <Box mt={0.5}>
                                        <Chip
                                          size="small"
                                          icon={
                                            <span
                                              className="material-icons"
                                              style={TAG_CHIP_ICON_STYLE}
                                            >
                                              spa
                                            </span>
                                          }
                                          label={item.vegetarianLabel}
                                          sx={TAG_CHIP_WITH_ICON_SX}
                                        />
                                      </Box>
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
        PaperProps={{
          sx: {
            borderRadius: 4,
            minHeight: "60vh",
          },
        }}
      >
        <DialogTitle
          sx={{
            pb: 1.5,
            borderBottom: "1px solid rgba(0,0,0,0.12)",
          }}
        >
          <Box
            display="flex"
            alignItems="flex-start"
            justifyContent="space-between"
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: "text.primary",
                fontSize: "1.25rem",
              }}
            >
              Filters
            </Typography>
            <Box display="flex" alignItems="center" gap={1}>
              <Button
                variant="text"
                size="small"
                onClick={clearAllFilters}
                sx={{
                  color: "primary.main",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                  textTransform: "none",
                  minWidth: "auto",
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 1.5,
                  "&:hover": {
                    bgcolor: "action.hover",
                    textDecoration: "none",
                  },
                }}
              >
                Reset
              </Button>
              <IconButton
                aria-label="close"
                onClick={() => setFiltersOpen(false)}
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
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 1 }}>
            {/* Place Accessibility Filters */}
            <Box key={`accessibility-${filterResetKey}`} sx={{ mb: 1.5 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: 1.5,
                }}
              >
                <Typography
                  variant="overline"
                  sx={{
                    color: "text.primary",
                    fontWeight: 600,
                    letterSpacing: 1,
                    fontSize: "0.7rem",
                  }}
                >
                  PLACE ACCESSIBILITY
                </Typography>

                <Link
                  component="button"
                  onClick={clearAccessibilityFilters}
                  sx={{
                    fontSize: "0.7rem",
                    color: "text.secondary",
                    textDecoration: "none",
                    cursor: "pointer",
                    mt: 0.5,
                    "&:hover": {
                      textDecoration: "underline",
                      color: "text.primary",
                    },
                  }}
                >
                  Clear accessibility
                </Link>
              </Box>

              <Paper
                elevation={0}
                sx={{
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 3,
                  p: 2.5,
                }}
              >
                <AccessibilityLegendReact hideTitle={true} />
              </Paper>
            </Box>

            {/* Place Type Filters */}
            {rawItems.length > 0 && (
              <Box key={`place-type-${filterResetKey}`}>
                <NestedPlaceTypeFilter items={rawItems} />
              </Box>
            )}

            {/* Photos filter */}
            <Box sx={{ mt: 1.5, mb: 1.5 }}>
              <Typography
                variant="overline"
                sx={{
                  color: "text.primary",
                  fontWeight: 600,
                  letterSpacing: 1,
                  fontSize: "0.7rem",
                  mb: 0.75,
                  display: "block",
                }}
              >
                PHOTOS
              </Typography>

              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={photosOnly}
                    onChange={(e) => setPhotosOnly(e.target.checked)}
                    disabled={!hasAnyPhotoInArea}
                  />
                }
                label={
                  <Typography
                    variant="body2"
                    color={
                      !hasAnyPhotoInArea ? "text.disabled" : "text.secondary"
                    }
                  >
                    Only places with photos
                    {!hasAnyPhotoInArea && " – no photos in this area yet"}
                  </Typography>
                }
              />
            </Box>

            {/* Open Now filter */}
            <Box sx={{ mt: 1.5, mb: 1.5 }}>
              <Typography
                variant="overline"
                sx={{
                  color: "text.primary",
                  fontWeight: 600,
                  letterSpacing: 1,
                  fontSize: "0.7rem",
                  mb: 0.75,
                  display: "block",
                }}
              >
                OPENING HOURS
              </Typography>

              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={openNowOnly}
                    onChange={(e) => setOpenNowOnly(e.target.checked)}
                  />
                }
                label={
                  <Typography variant="body2" color="text.secondary">
                    Open now
                  </Typography>
                }
              />
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: 3,
            minWidth: 400,
          },
        }}
      >
        <DialogContent
          sx={{
            pt: 3,
            pb: 2,
            px: 3,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              bgcolor: "warning.light",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          />
          <Box sx={{ textAlign: "center" }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                color: "text.primary",
                mb: 1,
              }}
            >
              Reset Filters?
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
              }}
            >
              Are you sure you want to reset all filters? This will clear your
              accessibility and place type selections.
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              gap: 1.5,
              width: "100%",
              mt: 1,
            }}
          >
            <Button
              variant="outlined"
              fullWidth
              onClick={() => setResetConfirmOpen(false)}
              sx={{
                borderRadius: 2,
                textTransform: "none",
                py: 1,
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              fullWidth
              color="primary"
              onClick={() => {
                clearAllFilters();
                setResetConfirmOpen(false);
              }}
              sx={{
                borderRadius: 2,
                textTransform: "none",
                py: 1,
              }}
            >
              Reset
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Sort Menu */}
      <Menu
        anchorEl={sortAnchorEl}
        open={Boolean(sortAnchorEl)}
        onClose={() => setSortAnchorEl(null)}
      >
        <MenuItem
          selected={sortBy === "distance"}
          onClick={() => {
            setSortBy("distance");
            setSortAnchorEl(null);
          }}
        >
          Distance
        </MenuItem>
        <MenuItem
          selected={sortBy === "name"}
          onClick={() => {
            setSortBy("name");
            setSortAnchorEl(null);
          }}
        >
          Name
        </MenuItem>
        <MenuItem
          selected={sortBy === "accessibility"}
          onClick={() => {
            setSortBy("accessibility");
            setSortAnchorEl(null);
          }}
        >
          Accessibility Status
        </MenuItem>
        <MenuItem
          selected={sortBy === "overall"}
          onClick={() => {
            setSortBy("overall");
            setSortAnchorEl(null);
          }}
        >
          Overall Rating
        </MenuItem>
        <MenuItem
          selected={sortBy === "bestForMe"}
          onClick={() => {
            setSortBy("bestForMe");
            setSortAnchorEl(null);
          }}
        >
          Best for me
        </MenuItem>
      </Menu>
    </>
  );
}
