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

  const obstacleCoordinates = obstacleFeatures.flatMap((f) => {
    if (f.geometry.type === "Polygon") {
      return [f.geometry.coordinates];
    } else if (f.geometry.type === "MultiPolygon") {
      return f.geometry.coordinates;
    } else if (f.geometry.type === "Point") {
      const poly = turfcircle(f.geometry.coordinates, f.properties.radius, {
        steps: 32,
        units: "meters",
      });
      return [poly.geometry.coordinates];
    } else if (f.geometry.type === "LineString") {
      const buffer = turfbuffer(f, 1, { units: "meters", steps: 16 });
      return [buffer.geometry.coordinates];
    }
  });

  const requestBody = {
    coordinates,
    options: {
      avoid_polygons: {
        type: "MultiPolygon",
        coordinates: obstacleCoordinates,
      },
    },
  };

  // console.log("🧭 RequestBody to ORS:", JSON.stringify(requestBody, null, 2));

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
