import { supabase } from "./supabaseClient.js";

/**
 * Ensures the OSM place exists in Supabase and returns its UUID.
 * Race-safe: handles concurrent inserts gracefully.
 * @param {Object} tags - OSM tags object from fetchPlace
 * @param {Object} latlng - { lat, lng } of the place
 */
export async function ensurePlaceExists(tags = {}, latlng = null) {
  // 🧠 Safely extract OSM identity
  let osmType =
    tags.osm_type ||
    tags.type ||
    tags.source_type ||
    tags.osm_type_guess ||
    null;
  let osmId = tags.osm_id || tags.id || tags.place_id || null;

  // Handle case where osmId might already include the type (e.g., "node/123456")
  if (osmId && typeof osmId === "string" && osmId.includes("/")) {
    const parts = osmId.split("/");
    if (parts.length === 2) {
      osmType = parts[0]; // e.g., "node", "way", "relation"
      osmId = parts[1]; // e.g., "123456"
    }
  }

  // If still no type, try to infer from ID format or use "unknown"
  if (!osmType) {
    // Check if ID looks like a numeric OSM ID
    if (osmId && /^\d+$/.test(String(osmId))) {
      osmType = "node"; // Default to node for numeric IDs
    } else {
      osmType = "unknown";
    }
  }

  // If still no ID, use coordinates as fallback (if available)
  if (!osmId) {
    if (latlng?.lat && latlng?.lng) {
      osmId = `${latlng.lat.toFixed(5)},${latlng.lng.toFixed(5)}`;
    } else {
      console.warn("ensurePlaceExists: missing osm_id in tags", tags);
      return null;
    }
  }

  const osmKey = `${osmType}/${osmId}`;

  // 1) Try to find an existing place first
  const { data: existing, error: selectError } = await supabase
    .from("places")
    .select("id")
    .eq("osm_id", osmKey) // your unique index is places_osm_id_key
    .maybeSingle();

  if (existing?.id) {
    return existing.id;
  }

  if (selectError && selectError.code !== "PGRST116") {
    // PGRST116 = no rows; anything else is a real error worth logging
    console.error(
      "ensurePlaceExists: select error for osm_id",
      osmKey,
      selectError
    );
    // Don't throw here - continue to try insert
  }

  // 2) Not found → use upsert to avoid 409 conflicts
  const payload = {
    osm_id: osmKey,
    name: tags.name ?? tags.amenity ?? "Unnamed",
    country: tags["addr:country"] ?? null,
    city: tags["addr:city"] ?? null,
    lat: latlng?.lat ?? null,
    lon: latlng?.lng ?? null,
  };

  // Use upsert with onConflict to handle race conditions gracefully
  const { data: upserted, error: upsertError } = await supabase
    .from("places")
    .upsert(payload, {
      onConflict: "osm_id", // your unique index is places_osm_id_key on osm_id
      ignoreDuplicates: false, // update existing rows with new data
    })
    .select("id")
    .maybeSingle();

  if (upsertError) {
    // If upsert fails, try one more time to select the existing row
    const { data: fallback, error: fallbackError } = await supabase
      .from("places")
      .select("id")
      .eq("osm_id", osmKey)
      .maybeSingle();

    if (fallback?.id) {
      return fallback.id;
    }

    console.error(
      "ensurePlaceExists: upsert and fallback select both failed for osm_id",
      osmKey,
      upsertError,
      fallbackError
    );
    return null;
  }

  return upserted?.id ?? null;
}

/**
 * Handles CRUD operations for reviews in Supabase.
 * @param {"GET"|"POST"|"PUT"|"DELETE"} method
 * @param {Object} reviewData
 */
export async function reviewStorage(method = "GET", reviewData) {
  try {
    if (method === "GET") {
      // console.log("🧠 reviewStorage(GET) starting", reviewData);

      if (!reviewData?.place_id) {
        console.warn("⚠️ reviewStorage(GET) called without place_id");
        return [];
      }

      const { data: reviewsData, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("place_id", reviewData.place_id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("❌ reviewStorage GET error:", error?.message ?? error);
        return []; // Important: don't throw, return empty array
      }

      if (!reviewsData || reviewsData.length === 0) {
        return [];
      }

      // Fetch profiles for all users who have reviews
      const userIds = [
        ...new Set(reviewsData.map((r) => r.user_id).filter(Boolean)),
      ];
      let profilesMap = new Map();

      if (userIds.length > 0) {
        console.log("🔍 Fetching profiles for user_ids:", userIds);
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);

        if (profilesError) {
          console.error("❌ Error fetching profiles:", profilesError);
        } else {
          console.log("✅ Fetched profiles:", profilesData);
          if (profilesData && profilesData.length > 0) {
            profilesData.forEach((profile) => {
              console.log(
                `  - Profile ID: ${profile.id}, Full Name: "${profile.full_name}"`
              );
              profilesMap.set(profile.id, profile);
            });
          } else {
            console.warn("⚠️ No profiles found for user_ids:", userIds);
          }
        }
      } else {
        console.warn("⚠️ No user_ids found in reviews");
      }

      // Attach profile information to each review
      const reviewsWithProfiles = reviewsData.map((review) => {
        const profile = review.user_id
          ? profilesMap.get(review.user_id) || null
          : null;
        console.log(
          `📝 Review ${review.id}: user_id=${review.user_id}, profile=`,
          profile
        );
        return {
          ...review,
          profile: profile,
        };
      });

      return reviewsWithProfiles;
    }

    if (method === "POST") {
      const overall = reviewData.overall_rating ?? reviewData.rating ?? null;

      // Validate overall_rating is a valid number between 1-5
      // The database check constraint requires an integer between 1-5
      // Round to nearest integer since Rating component allows half-stars (precision={0.5})
      const overallRating =
        overall != null ? Math.round(Number(overall)) : null;
      if (
        overallRating === null ||
        isNaN(overallRating) ||
        overallRating < 1 ||
        overallRating > 5
      ) {
        throw new Error(
          `Invalid overall_rating: ${overall}. Must be a number between 1 and 5.`
        );
      }

      const payload = {
        comment: reviewData.text ?? null,
        place_id: reviewData.place_id ?? null,
        rating: overallRating, // legacy, real
        overall_rating: overallRating, // smallint 1–5 (required by check constraint, must be integer)
        category_ratings: reviewData.category_ratings || null,
        image_url: reviewData.image_url || null,
        user_id: reviewData.user_id || null, // if you added this column
      };

      console.log("📦 Payload sent to Supabase:", payload);

      const { data, error } = await supabase
        .from("reviews")
        .insert([payload])
        .select();

      if (error) throw error;
      console.log("✅ Review inserted:", data);
      return data;
    }

    if (method === "PUT") {
      // 🛠 Update an existing review by ID
      const { id, text, rating, image_url } = reviewData || {};
      if (!id) {
        console.warn("⚠️ reviewStorage(PUT) called without id");
        return [];
      }

      const updateFields = {};
      if (typeof text === "string") updateFields.comment = text;
      if (rating !== undefined) updateFields.rating = rating;
      if (image_url !== undefined) updateFields.image_url = image_url;

      const { data, error } = await supabase
        .from("reviews")
        .update(updateFields)
        .eq("id", id)
        .select();

      if (error) throw error;
      console.log("✏️ Updated review:", data);
      return data;
    }

    if (method === "DELETE") {
      if (!reviewData?.id) {
        console.warn("⚠️ reviewStorage(DELETE) called without id");
        return false;
      }

      const { error } = await supabase
        .from("reviews")
        .delete()
        .eq("id", reviewData.id);

      if (error) throw error;
      console.log("🗑️ Deleted review:", reviewData.id);
      return true;
    }

    console.warn("⚠️ reviewStorage called with unknown method:", method);
    return [];
  } catch (e) {
    console.error("❌ Review storage failed:", e?.message ?? e);
    if (method === "DELETE") return false;
    return []; // Always return array for GET, empty array on error
  }
}