import { supabase } from "./supabaseClient.js";

/**
 * Inserts a user-added place into the places table.
 * User places have osm_id = null and source = 'user'.
 * @param {Object} placeData - Place data to insert
 * @param {string} placeData.name - Name of the place
 * @param {number} placeData.lat - Latitude
 * @param {number} placeData.lon - Longitude
 * @param {string} placeData.place_type - Type of place (e.g., "housing", "hotel", "stop", "shelter")
 * @param {string} [placeData.country] - Optional country
 * @param {string} [placeData.city] - Optional city
 * @returns {Promise<{id: string, error: null}|{id: null, error: Error}>}
 */
export async function addUserPlace(placeData) {
  try {
    const { name, lat, lon, place_type, country = null, city = null } = placeData;

    if (!name || !lat || !lon || !place_type) {
      throw new Error("Missing required fields: name, lat, lon, place_type");
    }

    const payload = {
      name,
      lat,
      lon,
      place_type,
      country,
      city,
      osm_id: null, // User places have no OSM ID
      source: "user", // Mark as user-added
      accessibility_keywords: null,
    };

    const { data, error } = await supabase
      .from("places")
      .insert([payload])
      .select("id")
      .single();

    if (error) throw error;

    return { id: data.id, error: null };
  } catch (error) {
    console.error("❌ Failed to add user place:", error);
    return { id: null, error };
  }
}

