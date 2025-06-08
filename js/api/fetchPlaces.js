async function fetchPlaces(bounds) {
  const boundingBox = [
    bounds.getSouth(),
    bounds.getWest(),
    bounds.getNorth(),
    bounds.getEast(),
  ].join(",");

  const overpassUrl = "https://overpass-api.de/api/interpreter";

  const query = `
    [out:json][maxsize:1073741824];
    (
      node(${boundingBox})
      [amenity]
      [amenity!~"bench|waste_basket|bicycle_parking|vending_machine|fountain|ice_cream"];
    );
    out center tags;
  `;

  try {
    const response = await fetch(overpassUrl, {
      method: "POST",
      body: query,
    });

    if (!response.ok) throw new Error("Overpass error " + response.status);

    const data = await response.json();

    return osmtogeojson(data);
  } catch (error) {
    console.error("Places fetch error:", error);
  }
}
