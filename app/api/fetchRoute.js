import turfcircle from "@turf/circle";
import turfbuffer from "@turf/buffer";

import { toastError, toastWarn } from "../utils/toast.mjs";

let routeAbortController = null;

/**
 * Builds a valid GeoJSON MultiPolygon for ORS avoid_polygons parameter.
 * Ensures correct nesting: MultiPolygon → Polygon → LinearRing → [lon, lat]
 *
 * @param {Array} obstacleFeatures - Array of obstacle GeoJSON features
 * @returns {Object|null} - Valid MultiPolygon GeoJSON or null if no valid obstacles
 */
function buildAvoidPolygons(obstacleFeatures = []) {
  const polygons = [];
  console.log(
    `🔍 buildAvoidPolygons: Processing ${obstacleFeatures.length} obstacles`
  );

  for (const f of obstacleFeatures) {
    if (!f?.geometry) continue;

    let geom = f.geometry;

    // Handle Point obstacles - convert to Polygon
    // All Point obstacles should be avoided (caution markers, circles, etc.)
    if (geom.type === "Point") {
      const radius = f.properties?.radius;
      const shape = f.properties?.shape;

      let circleRadius;

      if (shape === "circle" && radius) {
        // Circular obstacles use their specified radius
        circleRadius = radius;
      } else {
        // All other Point obstacles (markers, caution signs, etc.)
        // TESTING: Using 10 meter radius to make it clearly visible if route avoids it
        // TODO: Reduce back to 1.0 meter for production
        circleRadius = 10.0;
      }

      // Convert circle to polygon using turfcircle
      try {
        const [lng, lat] = geom.coordinates;
        const circle = turfcircle([lng, lat], circleRadius, {
          units: "meters",
          steps: 64,
        });
        if (circle?.geometry?.coordinates) {
          geom = circle.geometry;
        } else {
          continue;
        }
      } catch (err) {
        console.warn(
          "Failed to convert Point obstacle to polygon:",
          err,
          f.properties
        );
        continue;
      }
    }

    // Validate coordinates are numbers
    const coords = geom.coordinates;
    if (Array.isArray(coords)) {
      const isValid = coords.every((coord) => {
        if (Array.isArray(coord)) {
          return coord.every((c) => {
            if (Array.isArray(c)) {
              return c.every((val) => typeof val === "number" && !isNaN(val));
            }
            return typeof c === "number" && !isNaN(c);
          });
        }
        return typeof coord === "number" && !isNaN(coord);
      });
      if (!isValid) {
        continue;
      }
    }

    // Buffer LineStrings into polygons
    if (geom.type === "LineString") {
      try {
        const buffered = turfbuffer(f, 1, { units: "meters", steps: 16 });
        if (buffered?.geometry?.coordinates) {
          geom = buffered.geometry;
        } else {
          continue;
        }
      } catch (err) {
        console.warn("Failed to buffer LineString obstacle:", err);
        continue;
      }
    }

    // Normalize to Polygon format: each polygon is wrapped in an array
    // MultiPolygon structure: [[[ring1], [ring2]], [[ring3]]]
    // We need: [[[ring1], [ring2]], [[ring3]]] where each outer array is one polygon
    if (geom.type === "Polygon") {
      // Polygon.coordinates is already [[ring1], [ring2], ...]
      // Wrap it: [[[ring1], [ring2], ...]]
      polygons.push(geom.coordinates);
    } else if (geom.type === "MultiPolygon") {
      // MultiPolygon.coordinates is already [[[ring1], [ring2]], [[ring3]]]
      // Each element is already a polygon, so we can spread them
      polygons.push(...geom.coordinates);
    }
  }

  // Return valid MultiPolygon GeoJSON or null
  const result = polygons.length
    ? { type: "MultiPolygon", coordinates: polygons }
    : null;

  console.log(
    `✅ buildAvoidPolygons: Created MultiPolygon with ${polygons.length} polygon(s)`
  );
  return result;
}

export async function fetchRoute(coordinates, obstacleFeatures) {
  if (routeAbortController) {
    routeAbortController.abort();
  }
  routeAbortController = new AbortController();
  const { signal } = routeAbortController;

  // Use local API route to proxy requests to OpenRouteService (avoids CORS issues)
  const url = "/api/route-directions";

  // Build valid MultiPolygon for ORS avoid_polygons
  const avoidPolygons = buildAvoidPolygons(obstacleFeatures);

  const requestBody = {
    coordinates,
    ...(avoidPolygons && {
      options: {
        avoid_polygons: avoidPolygons,
      },
    }),
  };

  // Log the payload for debugging
  if (avoidPolygons) {
    console.log(
      "🧭 ORS avoid_polygons:",
      JSON.stringify(avoidPolygons, null, 2)
    );
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    const data = await response.json();

    if (!response.ok) {
      const code = data?.error?.code;
      const message = data?.error?.message || "Route could not be found.";

      if (code === 2004) {
        toastWarn(
          "The distance between points is too long (over 300 km). Please choose closer locations.",
          { important: true }
        );
        return null;
      }

      // Expected routing failures (e.g., no wheelchair route available) should not throw
      // to avoid noisy error overlays in dev.
      toastError(message, { important: true });
      return null;
    }

    console.log("Alternative Route:", data);

    const routeGeometry = data.features[0].geometry; // LineString coordinates
    // Use your mapping library (e.g., Leaflet/Mapbox) to draw the route
    console.log("Route Geometry:", routeGeometry);

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      return null;
    }
    // Network / parsing errors only (unexpected). Keep console error for debugging.
    console.error(error);
    toastError(error?.message || "Routing error.", { important: true });
    return null;
  }
}
