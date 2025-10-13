const overpassUrl = "https://overpass-api.de/api/interpreter";

export async function fetchPlace(osmType, osmId) {
  const type = { N: "node", W: "way", R: "relation" }[osmType];

  const query = `
    [out:json];
    ${type}(${osmId});
    out center tags;
  `;

  try {
    const res = await fetch(overpassUrl, { method: "POST", body: query });

    if (!res.ok) throw new Error("Overpass " + res.status);
    const data = await res.json();

    return data.elements[0].tags;
  } catch (e) {
    console.error("fetchOsmById failed:", e);
    return null;
  }
}

export async function fetchPlaces(bounds) {
  const s = bounds.getSouth();
  const w = bounds.getWest();
  const n = bounds.getNorth();
  const e = bounds.getEast();
  const boundingBox = `${s},${w},${n},${e}`;

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
