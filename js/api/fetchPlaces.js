export async function fetchPlaces(
  bounds,
  currentAmenityType,
  currentAccessibility
) {
  // ♿ NEW — map a checkbox value to the Overpass selector(s) we must emit
  const ACCESS_TAG_SELECTORS = {
    wheelchair: ["[wheelchair=yes]"],
    ramp: ["[ramp=yes]"],
    tactile_paving: ["[tactile_paving=yes]"],

    "toilets:wheelchair": [
      "[toilets:wheelchair=yes]",
      "[wheelchair_toilet=yes]",
    ],

    "capacity:disabled": [
      "[capacity:disabled>0]",
      "[parking:side:capacity:disabled>0]",
    ],

    "information=tactile_map": ["[information=tactile_map]"],
    "information=tactile_model": ["[information=tactile_model]"],

    "traffic_signals:sound": ["[traffic_signals:sound=yes]"],
    "traffic_signals:vibration": ["[traffic_signals:vibration=yes]"],

    "wheelchair:description:en": ["[wheelchair:description:en]"],
    "blind:description:en": ["[blind:description:en]"],
    "deaf:description:en": ["[deaf:description:en]"],
  };

  const boundingBox = [
    bounds.getSouth(),
    bounds.getWest(),
    bounds.getNorth(),
    bounds.getEast(),
  ].join(",");

  const overpassUrl = "https://overpass-api.de/api/interpreter";

  let selectors = ["[amenity]"]; // default: any amenity
  if (currentAmenityType) selectors = [`[amenity=${currentAmenityType}]`];

  currentAccessibility.forEach((tag) => {
    const clauses = ACCESS_TAG_SELECTORS[tag] || [`[${tag}=yes]`];
    selectors.push(...clauses);
  });

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
