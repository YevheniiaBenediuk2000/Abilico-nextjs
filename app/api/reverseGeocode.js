/**
 * Reverse geocode coordinates to get address details (city, country, etc.)
 * Uses Nominatim (OpenStreetMap's geocoding service)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{city: string | null, country: string | null}>}
 */
export async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Abilico/1.0', // Required by Nominatim
      },
    });

    if (!response.ok) {
      throw new Error(`Reverse geocoding failed: ${response.status}`);
    }

    const data = await response.json();
    const address = data.address || {};

    // Extract city - try different possible fields
    const city =
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.county ||
      address.state_district ||
      null;

    // Extract country
    const country = address.country || null;

    return {
      city: city ? String(city).trim() : null,
      country: country ? String(country).trim() : null,
    };
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    // Return nulls on error - don't break the flow
    return { city: null, country: null };
  }
}

