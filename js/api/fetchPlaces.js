export async function fetchPlaces(bounds, currentAmenityType) {
  const boundingBox = [
    bounds.getSouth(),
    bounds.getWest(),
    bounds.getNorth(),
    bounds.getEast(),
  ].join(",");

  const overpassUrl = "https://overpass-api.de/api/interpreter";

  let selectors = ["[amenity]"]; // default: any amenity
  if (currentAmenityType) selectors = [`[amenity=${currentAmenityType}]`];

  const excluded =
    "bench|waste_basket|bicycle_parking|vending_machine|fountain|ice_cream";

  selectors.push(`[amenity!~"${excluded}"]`);

  const selectorString = selectors.join("");

  console.log({ selectorString });

  const query = `
    [out:json][maxsize:1073741824];
    (
      node(${boundingBox})${selectorString};
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
