async function fetchRoute(start, end) {
  const url =
    "https://api.openrouteservice.org/v2/directions/wheelchair/geojson";

  const requestBody = {
    coordinates: [start, end],
    options: { avoid_polygons: avoidPolygon },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: ORS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    console.log("Alternative Route:", data);

    const routeGeometry = data.features[0].geometry; // LineString coordinates
    // Use your mapping library (e.g., Leaflet/Mapbox) to draw the route
    console.log("Route Geometry:", routeGeometry);

    return data;
  } catch (error) {
    console.error("Routing error:", error);
  }
}
