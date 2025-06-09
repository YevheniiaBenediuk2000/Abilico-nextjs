export async function fetchRoute(coordinates, obstacleFeatures) {
  const url =
    "https://api.openrouteservice.org/v2/directions/wheelchair/geojson";

  const obstacleCoordinates = obstacleFeatures.map((f) => {
    if (f.geometry.type === "Polygon") {
      return [f.geometry.coordinates];
    } else if (f.geometry.type === "MultiPolygon") {
      return f.geometry.coordinates;
    }
  });

  const requestBody = {
    coordinates,
    options: {
      avoid_polygons: {
        type: "MultiPolygon",
        coordinates: obstacleCoordinates.flat(),
      },
    },
  };

  try {
    const ORS_API_KEY =
      "5b3ce3597851110001cf624808521bae358447e592780fc0039f7235";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: ORS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.error.code === 2004) {
        showModal(
          "The distance between points is too long (over 300 km). Please choose closer locations."
        );
      }

      throw new Error(await data.error.message);
    }

    console.log("Alternative Route:", data);

    const routeGeometry = data.features[0].geometry; // LineString coordinates
    // Use your mapping library (e.g., Leaflet/Mapbox) to draw the route
    console.log("Route Geometry:", routeGeometry);

    return data;
  } catch (error) {
    console.error(error);
  }
}
