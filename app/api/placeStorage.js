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
 * @param {string} [placeData.submitted_by_name] - Name of person submitting
 * @param {string} [placeData.submitted_by_email] - Email of person submitting
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
      accessibility_keywords = null,
      accessibility_comments = null,
      photos = null,
      submitted_by_name = null,
      submitted_by_email = null,
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
      accessibility_keywords: accessibility_keywords || null, // Store accessibility data as JSONB
    };

    // Add optional fields only if they have values
    // ⚠️ IMPORTANT: Only uncomment fields that exist in your database schema!
    
    // These accessibility columns don't exist in your table yet - COMMENTED OUT
    // Uncomment these lines AFTER adding the columns to your database:
    // if (overall_accessibility) payload.overall_accessibility = overall_accessibility;
    // if (step_free_entrance) payload.step_free_entrance = step_free_entrance;
    // if (accessible_toilet) payload.accessible_toilet = accessible_toilet;
    
    // This column EXISTS in your table (according to your schema)
    if (accessibility_comments) payload.accessibility_comments = accessibility_comments;
    
    // Photos: Store array of URLs as JSONB
    // Note: The actual image files are stored in Supabase Storage bucket "place-photos"
    // This column (photos jsonb) stores only the URLs to those files, like:
    // ["https://your-project.supabase.co/storage/v1/object/public/place-photos/file1.jpg", ...]
    if (photos && Array.isArray(photos) && photos.length > 0) {
      // Store as JSONB array - Supabase will automatically serialize the array to JSON
      payload.photos = photos;
    }
    
    // Note: Column names use "submitted_by_" prefix (not "submitter_")
    if (submitted_by_name) payload.submitted_by_name = submitted_by_name;
    if (submitted_by_email) payload.submitted_by_email = submitted_by_email;

    console.log("📦 Payload being sent:", JSON.stringify(payload, null, 2));
    
    let { data, error } = await supabase
      .from("places")
      .insert([payload])
      .select("id")
      .single();

    // If error, log details and try to handle gracefully
    if (error) {
      console.error("❌ Supabase error details:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        fullError: JSON.stringify(error, null, 2),
      });

      // If error is about missing column, try again without optional fields
      if (
        error.message?.includes("column") && 
        (error.message?.includes("not found") || error.message?.includes("does not exist"))
      ) {
        console.warn("⚠️ Some columns don't exist, retrying with basic fields only");
        
        // Retry with only basic fields that definitely exist
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
        
        console.log("📦 Retry payload (basic fields only):", JSON.stringify(basicPayload, null, 2));
        
        const retryResult = await supabase
          .from("places")
          .insert([basicPayload])
          .select("id")
          .single();
        
        if (retryResult.error) {
          console.error("❌ Retry also failed:", retryResult.error);
          throw retryResult.error;
        }
        
        console.log("✅ Successfully saved with basic fields only");
        data = retryResult.data;
        error = null;
      } else {
        // Other errors - throw them
        throw error;
      }
    }

    if (error) throw error;

    console.log("✅ Successfully added place:", data);
    return { id: data.id, error: null };
  } catch (error) {
    // Log detailed error information
    const errorDetails = {
      message: error?.message || "Unknown error",
      details: error?.details || null,
      hint: error?.hint || null,
      code: error?.code || null,
      fullError: error,
    };
    
    console.error("❌ Failed to add user place:", errorDetails);
    console.error("❌ Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    return { 
      id: null, 
      error: errorDetails.message || "Failed to save place" 
    };
  }
}

