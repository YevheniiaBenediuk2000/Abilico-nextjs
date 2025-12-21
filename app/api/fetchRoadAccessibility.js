/**
 * Fetch road/path accessibility features from OpenStreetMap
 * Includes: surface type, incline, width, smoothness, elevation, etc.
 */

import pRetry from "p-retry";
import osmtogeojson from "osmtogeojson";
import { pRetryConfig } from "../constants/constants.mjs";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const HEADERS = {
  "Content-Type": "text/plain;charset=UTF-8",
  Accept: "application/json",
  "User-Agent":
    "Abilico/1.0 (https://github.com/YevheniiaBenediuk2000/Abilico)",
};

// Road accessibility feature colors
export const SURFACE_COLORS = {
  // Smooth surfaces (wheelchair-friendly)
  asphalt: "#2ecc71",
  paved: "#27ae60",
  concrete: "#27ae60",
  "concrete:plates": "#2ecc71",
  "concrete:lanes": "#2ecc71",
  paving_stones: "#3498db",
  sett: "#f39c12",

  // Moderate surfaces
  compacted: "#f1c40f",
  fine_gravel: "#f39c12",
  gravel: "#e67e22",

  // Rough surfaces (wheelchair-unfriendly)
  unpaved: "#e74c3c",
  ground: "#d35400",
  dirt: "#c0392b",
  grass: "#c0392b",
  mud: "#8e44ad",
  sand: "#e74c3c",
  cobblestone: "#e67e22",

  // Default
  unknown: "#95a5a6",
};

export const INCLINE_COLORS = {
  flat: "#2ecc71", // 0-2%
  gentle: "#f1c40f", // 2-5%
  moderate: "#e67e22", // 5-8%
  steep: "#e74c3c", // 8-12%
  very_steep: "#8e44ad", // >12%
};

export const WIDTH_COLORS = {
  wide: "#2ecc71", // >1.8m
  adequate: "#f1c40f", // 1.2-1.8m
  narrow: "#e67e22", // 0.9-1.2m
  very_narrow: "#e74c3c", // <0.9m
};

export const SMOOTHNESS_COLORS = {
  excellent: "#2ecc71",
  good: "#27ae60",
  intermediate: "#f1c40f",
  bad: "#e67e22",
  very_bad: "#e74c3c",
  horrible: "#c0392b",
  very_horrible: "#8e44ad",
  impassable: "#2c3e50",
};

let roadAbortController = null;
let roadIdsAbortController = null;

/**
 * Build the Overpass query selectors for road accessibility features
 * @param {string} bbox - Bounding box string "south,west,north,east"
 * @returns {string} Query selectors
 */
function buildRoadQuerySelectors(bbox) {
  return `
      way["highway"~"^(footway|path|pedestrian|cycleway|steps|corridor|crossing|sidewalk|living_street|residential|service|track)$"](${bbox});
      way["footway"](${bbox});
      way["sidewalk"~"^(yes|left|right|both|separate)$"](${bbox});
      way["surface"](${bbox});
      way["smoothness"](${bbox});
      way["incline"](${bbox});
      way["width"](${bbox});
      way["kerb"](${bbox});
      way["tactile_paving"](${bbox});
      way["ramp"](${bbox});
      way["lit"](${bbox});
  `;
}

/**
 * Fetch only road/path IDs (lightweight query) for caching strategy.
 * @param {Object} bounds - { south, west, north, east }
 * @returns {Promise<Array<{type: string, id: number}>>} Array of OSM element IDs
 */
export async function fetchRoadIds(bounds) {
  if (roadIdsAbortController) {
    roadIdsAbortController.abort();
  }
  roadIdsAbortController = new AbortController();
  const { signal } = roadIdsAbortController;

  const { south, west, north, east } = bounds;
  const bbox = `${south},${west},${north},${east}`;

  const query = `
    [out:json][timeout:30];
    (
      ${buildRoadQuerySelectors(bbox)}
    );
    out ids;
  `;

  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      return await pRetry(async () => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: HEADERS,
          body: query,
          signal,
        });

        if (!response.ok) {
          throw new Error(`Overpass error ${response.status} @ ${endpoint}`);
        }

        const data = await response.json();
        const ids = (data.elements || []).map((el) => ({
          type: el.type,
          id: el.id,
        }));
        return ids;
      }, pRetryConfig);
    } catch (error) {
      if (error?.name === "AbortError") {
        return [];
      }
      lastError = error;
      console.warn(`[Overpass] ${endpoint} failed for road IDs:`, error);
    }
  }

  console.error("Road IDs fetch failed on all endpoints:", lastError);
  return [];
}

/**
 * Fetch full road data by their IDs.
 * Used after fetchRoadIds to get details only for roads not in cache.
 * @param {Array<{type: string, id: number}>} ids - Array of OSM element IDs
 * @returns {Promise<Object>} GeoJSON FeatureCollection with enriched accessibility data
 */
export async function fetchRoadsByIds(ids) {
  if (!ids || ids.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  // Group by type (should all be ways for roads)
  const ways = ids.filter((i) => i.type === "way").map((i) => i.id);
  const nodes = ids.filter((i) => i.type === "node").map((i) => i.id);
  const relations = ids.filter((i) => i.type === "relation").map((i) => i.id);

  const queryParts = [];
  if (ways.length) queryParts.push(`way(id:${ways.join(",")})`);
  if (nodes.length) queryParts.push(`node(id:${nodes.join(",")})`);
  if (relations.length) queryParts.push(`relation(id:${relations.join(",")})`);

  if (queryParts.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const query = `
    [out:json][timeout:60];
    (
      ${queryParts.join(";\n      ")};
    );
    out body geom;
  `;

  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      return await pRetry(async () => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: HEADERS,
          body: query,
        });

        if (!response.ok) {
          throw new Error(`Overpass error ${response.status} @ ${endpoint}`);
        }

        const data = await response.json();
        const geojson = osmtogeojson(data);

        // Enrich with accessibility scores
        return enrichAccessibilityFeatures(geojson);
      }, pRetryConfig);
    } catch (error) {
      lastError = error;
      console.warn(`[Overpass] ${endpoint} failed for roads by ID:`, error);
    }
  }

  console.error("Roads by ID fetch failed on all endpoints:", lastError);
  return { type: "FeatureCollection", features: [] };
}

/**
 * Fetch road/path data with accessibility features from OSM
 * @param {Object} bounds - { south, west, north, east }
 * @returns {Promise<Object>} - GeoJSON FeatureCollection
 */
export async function fetchRoadAccessibility(bounds) {
  if (roadAbortController) {
    roadAbortController.abort();
  }
  roadAbortController = new AbortController();
  const { signal } = roadAbortController;

  const { south, west, north, east } = bounds;
  const bbox = `${south},${west},${north},${east}`;

  // Query for ways with accessibility-relevant tags
  const query = `
    [out:json][timeout:60];
    (
      way["highway"~"^(footway|path|pedestrian|cycleway|steps|corridor|crossing|sidewalk|living_street|residential|service|track)$"](${bbox});
      way["footway"](${bbox});
      way["sidewalk"~"^(yes|left|right|both|separate)$"](${bbox});
      way["surface"](${bbox});
      way["smoothness"](${bbox});
      way["incline"](${bbox});
      way["width"](${bbox});
      way["kerb"](${bbox});
      way["tactile_paving"](${bbox});
      way["ramp"](${bbox});
      way["lit"](${bbox});
    );
    out body geom;
  `;

  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      return await pRetry(async () => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: HEADERS,
          body: query,
          signal,
        });

        if (!response.ok) {
          throw new Error(`Overpass error ${response.status} @ ${endpoint}`);
        }

        const data = await response.json();
        const geojson = osmtogeojson(data);

        // Enrich features with accessibility scores
        return enrichAccessibilityFeatures(geojson);
      }, pRetryConfig);
    } catch (error) {
      if (error?.name === "AbortError") {
        return { type: "FeatureCollection", features: [] };
      }
      lastError = error;
      console.warn(`[Overpass] ${endpoint} failed for roads:`, error);
    }
  }

  console.error("Road fetch failed on all endpoints:", lastError);
  return { type: "FeatureCollection", features: [] };
}

/**
 * Enrich GeoJSON features with computed accessibility scores
 */
function enrichAccessibilityFeatures(geojson) {
  const enrichedFeatures = geojson.features.map((feature) => {
    const props = feature.properties || {};

    // Calculate accessibility scores
    const surfaceScore = calculateSurfaceScore(props.surface);
    const inclineScore = calculateInclineScore(props.incline);
    const widthScore = calculateWidthScore(props.width);
    const smoothnessScore = calculateSmoothnessScore(props.smoothness);

    // Overall accessibility score (0-100)
    const accessibilityScore = calculateOverallScore({
      surfaceScore,
      inclineScore,
      widthScore,
      smoothnessScore,
      hasLighting: props.lit === "yes",
      hasTactilePaving: props.tactile_paving === "yes",
      hasKerb: props.kerb && props.kerb !== "no",
      hasRamp: props.ramp && props.ramp !== "no",
      isSteps: props.highway === "steps",
    });

    return {
      ...feature,
      properties: {
        ...props,
        _accessibilityScore: accessibilityScore,
        _surfaceScore: surfaceScore,
        _inclineScore: inclineScore,
        _widthScore: widthScore,
        _smoothnessScore: smoothnessScore,
        _surfaceColor: getSurfaceColor(props.surface),
        _inclineColor: getInclineColor(props.incline),
        _widthColor: getWidthColor(props.width),
        _smoothnessColor: getSmoothnessColor(props.smoothness),
        _overallColor: getOverallColor(accessibilityScore),
      },
    };
  });

  return {
    ...geojson,
    features: enrichedFeatures,
  };
}

/**
 * Calculate surface accessibility score (0-100)
 */
export function calculateSurfaceScore(surface) {
  if (!surface) return null;

  const scores = {
    asphalt: 100,
    paved: 95,
    concrete: 95,
    "concrete:plates": 90,
    "concrete:lanes": 90,
    paving_stones: 80,
    metal: 85,
    wood: 70,
    sett: 50,
    compacted: 60,
    fine_gravel: 40,
    gravel: 30,
    unpaved: 25,
    ground: 20,
    dirt: 20,
    grass: 15,
    mud: 5,
    sand: 10,
    cobblestone: 35,
    earth: 20,
    clay: 25,
    rock: 15,
  };

  return scores[surface.toLowerCase()] ?? 50;
}

/**
 * Calculate incline accessibility score (0-100)
 */
export function calculateInclineScore(incline) {
  if (!incline) return null;

  // Parse incline value
  let percent = parseIncline(incline);
  if (percent === null) return null;

  percent = Math.abs(percent);

  // ADA recommends max 8.33% (1:12), ADAAG allows 5% for long ramps
  if (percent <= 2) return 100; // Flat
  if (percent <= 5) return 80; // Gentle
  if (percent <= 8) return 50; // Moderate
  if (percent <= 12) return 25; // Steep
  return 10; // Very steep
}

/**
 * Parse incline string to percentage
 */
function parseIncline(incline) {
  if (typeof incline !== "string") return null;

  const s = incline.toLowerCase().trim();

  // Direction-only values
  if (s === "up" || s === "down" || s === "steep") return null;

  // Percentage format: "5%", "-8%"
  const percentMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  if (percentMatch) {
    return parseFloat(percentMatch[1]);
  }

  // Ratio format: "1:12" means 1/12 = 8.33%
  const ratioMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (ratioMatch) {
    const a = parseFloat(ratioMatch[1]);
    const b = parseFloat(ratioMatch[2]);
    if (b !== 0) return (a / b) * 100;
  }

  // Degree format: "5°"
  const degreeMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*°$/);
  if (degreeMatch) {
    const degrees = parseFloat(degreeMatch[1]);
    return Math.tan((degrees * Math.PI) / 180) * 100;
  }

  // Plain number
  const num = parseFloat(s);
  if (!isNaN(num)) return num;

  return null;
}

/**
 * Calculate width accessibility score (0-100)
 */
export function calculateWidthScore(width) {
  if (!width) return null;

  const meters = parseWidth(width);
  if (meters === null) return null;

  // ADA minimum clear width: 0.915m (36"), preferred: 1.525m (60")
  if (meters >= 1.8) return 100; // Wide - excellent
  if (meters >= 1.2) return 75; // Adequate
  if (meters >= 0.9) return 40; // Narrow
  return 10; // Very narrow
}

/**
 * Parse width string to meters
 */
function parseWidth(width) {
  if (typeof width !== "string") return null;

  const s = width.toLowerCase().trim();

  // Extract number
  const numMatch = s.match(/(\d+(?:[.,]\d+)?)/);
  if (!numMatch) return null;

  let value = parseFloat(numMatch[1].replace(",", "."));

  // Convert units
  if (s.includes("cm")) value /= 100;
  else if (s.includes("mm")) value /= 1000;
  else if (s.includes("ft") || s.includes("'")) value *= 0.3048;
  else if (s.includes("in") || s.includes('"')) value *= 0.0254;

  return value;
}

/**
 * Calculate smoothness accessibility score (0-100)
 */
export function calculateSmoothnessScore(smoothness) {
  if (!smoothness) return null;

  const scores = {
    excellent: 100,
    good: 85,
    intermediate: 60,
    bad: 35,
    very_bad: 15,
    horrible: 5,
    very_horrible: 2,
    impassable: 0,
  };

  return scores[smoothness.toLowerCase()] ?? 50;
}

/**
 * Calculate overall accessibility score
 */
export function calculateOverallScore(factors) {
  const {
    surfaceScore,
    inclineScore,
    widthScore,
    smoothnessScore,
    hasLighting,
    hasTactilePaving,
    hasKerb,
    hasRamp,
    isSteps,
  } = factors;

  // If it's steps and no ramp, heavily penalize
  if (isSteps && !hasRamp) {
    return 5;
  }

  // Collect available scores with weights
  const scores = [];
  if (surfaceScore !== null) scores.push({ score: surfaceScore, weight: 0.3 });
  if (inclineScore !== null) scores.push({ score: inclineScore, weight: 0.35 });
  if (widthScore !== null) scores.push({ score: widthScore, weight: 0.2 });
  if (smoothnessScore !== null)
    scores.push({ score: smoothnessScore, weight: 0.15 });

  if (scores.length === 0) return null;

  // Normalize weights
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  let baseScore = scores.reduce(
    (sum, s) => sum + (s.score * s.weight) / totalWeight,
    0
  );

  // Bonus points for positive features
  if (hasLighting) baseScore = Math.min(100, baseScore + 3);
  if (hasTactilePaving) baseScore = Math.min(100, baseScore + 5);
  if (hasRamp) baseScore = Math.min(100, baseScore + 10);

  // Penalty for dropped kerb issues
  if (hasKerb === false) baseScore = Math.max(0, baseScore - 10);

  return Math.round(baseScore);
}

/**
 * Get color for surface type
 */
export function getSurfaceColor(surface) {
  if (!surface) return SURFACE_COLORS.unknown;
  return SURFACE_COLORS[surface.toLowerCase()] || SURFACE_COLORS.unknown;
}

/**
 * Get color for incline
 */
export function getInclineColor(incline) {
  if (!incline) return null;

  const percent = parseIncline(incline);
  if (percent === null) return null;

  const absPercent = Math.abs(percent);
  if (absPercent <= 2) return INCLINE_COLORS.flat;
  if (absPercent <= 5) return INCLINE_COLORS.gentle;
  if (absPercent <= 8) return INCLINE_COLORS.moderate;
  if (absPercent <= 12) return INCLINE_COLORS.steep;
  return INCLINE_COLORS.very_steep;
}

/**
 * Get color for width
 */
export function getWidthColor(width) {
  if (!width) return null;

  const meters = parseWidth(width);
  if (meters === null) return null;

  if (meters >= 1.8) return WIDTH_COLORS.wide;
  if (meters >= 1.2) return WIDTH_COLORS.adequate;
  if (meters >= 0.9) return WIDTH_COLORS.narrow;
  return WIDTH_COLORS.very_narrow;
}

/**
 * Get color for smoothness
 */
export function getSmoothnessColor(smoothness) {
  if (!smoothness) return null;
  return SMOOTHNESS_COLORS[smoothness.toLowerCase()] || null;
}

/**
 * Get color based on overall accessibility score
 */
export function getOverallColor(score) {
  if (score === null) return "#95a5a6"; // Gray for unknown

  if (score >= 80) return "#2ecc71"; // Green - excellent
  if (score >= 60) return "#27ae60"; // Dark green - good
  if (score >= 40) return "#f1c40f"; // Yellow - moderate
  if (score >= 20) return "#e67e22"; // Orange - poor
  return "#e74c3c"; // Red - very poor
}

/**
 * Get incline category label
 */
export function getInclineLabel(incline) {
  const percent = parseIncline(incline);
  if (percent === null) return "Unknown";

  const absPercent = Math.abs(percent);
  if (absPercent <= 2) return "Flat (≤2%)";
  if (absPercent <= 5) return "Gentle (2-5%)";
  if (absPercent <= 8) return "Moderate (5-8%)";
  if (absPercent <= 12) return "Steep (8-12%)";
  return `Very Steep (${Math.round(absPercent)}%)`;
}

/**
 * Get width category label
 */
export function getWidthLabel(width) {
  const meters = parseWidth(width);
  if (meters === null) return "Unknown";

  if (meters >= 1.8) return `Wide (${meters.toFixed(1)}m)`;
  if (meters >= 1.2) return `Adequate (${meters.toFixed(1)}m)`;
  if (meters >= 0.9) return `Narrow (${meters.toFixed(1)}m)`;
  return `Very Narrow (${meters.toFixed(1)}m)`;
}

/**
 * Get surface friendliness label
 */
export function getSurfaceLabel(surface) {
  if (!surface) return "Unknown";

  const friendly = [
    "asphalt",
    "paved",
    "concrete",
    "concrete:plates",
    "concrete:lanes",
  ];
  const moderate = [
    "paving_stones",
    "metal",
    "wood",
    "compacted",
    "fine_gravel",
  ];
  const poor = ["gravel", "sett", "cobblestone"];
  const bad = [
    "unpaved",
    "ground",
    "dirt",
    "grass",
    "mud",
    "sand",
    "earth",
    "clay",
    "rock",
  ];

  const s = surface.toLowerCase();
  if (friendly.includes(s)) return `${surface} (Smooth)`;
  if (moderate.includes(s)) return `${surface} (Moderate)`;
  if (poor.includes(s)) return `${surface} (Rough)`;
  if (bad.includes(s)) return `${surface} (Difficult)`;
  return surface;
}
