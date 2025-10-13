export async function fetchPlaces(bounds) {
  const s = bounds.getSouth();
  const w = bounds.getWest();
  const n = bounds.getNorth();
  const e = bounds.getEast();
  const boundingBox = `${s},${w},${n},${e}`;

  const overpassUrl = "https://overpass-api.de/api/interpreter";

  const EXCLUDED =
    "bench|waste_basket|bicycle_parking|vending_machine|fountain|ice_cream";

  const query = `
    [out:json][maxsize:1073741824];
    (
      node["amenity"]["name"]["amenity"!~"${EXCLUDED}"](${boundingBox});
      node["shop"]["name"](${boundingBox});
      node["tourism"]["name"](${boundingBox});
      node["leisure"]["name"](${boundingBox});
      node["healthcare"]["name"](${boundingBox});
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
    console.log(data);
    return osmtogeojson(data);
  } catch (error) {
    console.error("Places fetch error:", error);
  }
}
