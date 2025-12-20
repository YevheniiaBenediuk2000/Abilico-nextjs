import turfcircle from "@turf/circle";
import turfbuffer from "@turf/buffer";

import { toastError, toastWarn } from "../utils/toast.mjs";

let routeAbortController = null;

export async function fetchRoute(coordinates, obstacleFeatures) {
  if (routeAbortController) {
    routeAbortController.abort();
  }
  routeAbortController = new AbortController();
  const { signal } = routeAbortController;

  const url =
    "https://api.openrouteservice.org/v2/directions/wheelchair/geojson";

  // Filter and process obstacles - exclude invalid ones and caution markers (Point obstacles)
  // Caution markers (Point obstacles) should not affect route calculation
  const obstacleCoordinates = (obstacleFeatures || [])
    .filter((f) => {
      // Skip if geometry is missing or invalid
      if (!f.geometry || !f.geometry.type || !f.geometry.coordinates) {
        return false;
      }
      
      // Skip Point obstacles (caution markers) - they should not affect route calculation
      if (f.geometry.type === "Point") {
        return false;
      }
      
      // Validate coordinates are numbers
      const coords = f.geometry.coordinates;
      if (Array.isArray(coords)) {
        const isValid = coords.every((coord) => {
          if (Array.isArray(coord)) {
            return coord.every((c) => typeof c === "number" && !isNaN(c));
          }
          return typeof coord === "number" && !isNaN(coord);
        });
        if (!isValid) {
          return false;
        }
      }
      
      return true;
    })
    .flatMap((f) => {
    if (f.geometry.type === "Polygon") {
      return [f.geometry.coordinates];
    } else if (f.geometry.type === "MultiPolygon") {
      return f.geometry.coordinates;
    } else if (f.geometry.type === "LineString") {
        try {
      const buffer = turfbuffer(f, 1, { units: "meters", steps: 16 });
          if (buffer && buffer.geometry && buffer.geometry.coordinates) {
      return [buffer.geometry.coordinates];
    }
        } catch (err) {
          console.warn("Failed to buffer LineString obstacle:", err);
        }
        return [];
      }
      return [];
    });

  // Only include avoid_polygons if there are valid obstacles (excluding Point/caution markers)
  const requestBody = {
    coordinates,
    ...(obstacleCoordinates.length > 0 && {
    options: {
      avoid_polygons: {
        type: "MultiPolygon",
        coordinates: obstacleCoordinates,
      },
    },
    }),
  };

  console.log("🧭 RequestBody to ORS:", {
    coordinates: requestBody.coordinates,
    hasAvoidPolygons: obstacleCoordinates.length > 0,
    obstacleCount: obstacleCoordinates.length,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: process.env.NEXT_PUBLIC_ORS_API_KEY,
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
