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
 * @param {string} [placeData.overall_accessibility] - Overall accessibility level
 * @param {string} [placeData.step_free_entrance] - Step-free entrance (yes/no/not-sure)
 * @param {string} [placeData.accessible_toilet] - Accessible toilet (yes/no/not-sure)
 * @param {string} [placeData.accessibility_comments] - Additional accessibility comments
 * @param {string[]} [placeData.photos] - Array of photo URLs
 * @param {string} [placeData.submitter_name] - Name of person submitting
 * @param {string} [placeData.submitter_email] - Email of person submitting
 * @returns {Promise<{id: string, error: null}|{id: null, error: Error}>}
 */
export async function addUserPlace(placeData) {
  try {
    const {
      name,
      lat,
      lon,
      place_type,
      country = null,
      city = null,
      overall_accessibility = null,
      step_free_entrance = null,
      accessible_toilet = null,
      accessibility_comments = null,
      photos = null,
      submitter_name = null,
      submitter_email = null,
    } = placeData;

    if (!name || !lat || !lon || !place_type) {
      throw new Error("Missing required fields: name, lat, lon, place_type");
    }

    // Build payload with only fields that exist (handle missing columns gracefully)
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

    // Add optional fields only if they have values
    // Note: Only include fields that exist in your database schema
    // If you get column errors, comment out the fields that don't exist yet
    if (overall_accessibility) payload.overall_accessibility = overall_accessibility;
    if (step_free_entrance) payload.step_free_entrance = step_free_entrance;
    if (accessible_toilet) payload.accessible_toilet = accessible_toilet;
    // Uncomment this line after you add the 'accessibility_comments' column to your places table:
    // if (accessibility_comments) payload.accessibility_comments = accessibility_comments;
    if (photos && Array.isArray(photos) && photos.length > 0) {
      // Store as JSON array or array depending on your column type
      payload.photos = photos;
    }
    if (submitter_name) payload.submitter_name = submitter_name;
    if (submitter_email) payload.submitter_email = submitter_email;

    let { data, error } = await supabase
      .from("places")
      .insert([payload])
      .select("id")
      .single();

    // If error is about missing column, try again without optional fields
    if (error && error.message?.includes("column") && error.message?.includes("not found")) {
      console.warn("Some columns don't exist, retrying with basic fields only:", error.message);
      
      // Retry with only basic fields
      const basicPayload = {
        name,
        lat,
        lon,
        place_type,
        country,
        city,
        osm_id: null,
        source: "user",
        accessibility_keywords: null,
      };
      
      const retryResult = await supabase
        .from("places")
        .insert([basicPayload])
        .select("id")
        .single();
      
      if (retryResult.error) {
        throw retryResult.error;
      }
      
      data = retryResult.data;
      error = null;
    }

    if (error) throw error;

    return { id: data.id, error: null };
  } catch (error) {
    console.error("❌ Failed to add user place:", error);
    return { id: null, error };
  }
}

