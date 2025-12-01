import { supabase } from "./supabaseClient.js";

/**
 * Handles voting on places (confirm or issue reports)
 * @param {"POST"|"PUT"|"DELETE"} method
 * @param {Object} voteData - { place_id, vote_type: 'confirm' | 'issue', comment? }
 */
export async function placeVotes(method = "POST", voteData) {
  try {
    if (method === "POST") {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User must be logged in to vote");
      }

      const { data, error } = await supabase
        .from("place_votes")
        .insert([
          {
            place_id: voteData.place_id,
            user_id: user.id,
            vote_type: voteData.vote_type, // 'confirm' or 'issue'
            comment: voteData.comment || null,
          },
        ])
        .select();
      
      if (error) throw error;
      console.log("✅ Vote submitted:", data);
      return data;
    }

    if (method === "PUT") {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User must be logged in to update vote");
      }

      const { id, ...updateFields } = voteData;
      const { data, error } = await supabase
        .from("place_votes")
        .update(updateFields)
        .eq("id", id)
        .eq("user_id", user.id) // Ensure user can only update their own vote
        .select();
      
      if (error) throw error;
      console.log("✏️ Vote updated:", data);
      return data;
    }

    if (method === "DELETE") {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User must be logged in to delete vote");
      }

      const { error } = await supabase
        .from("place_votes")
        .delete()
        .eq("id", voteData.id)
        .eq("user_id", user.id); // Ensure user can only delete their own vote
      
      if (error) throw error;
      console.log("🗑️ Vote deleted:", voteData.id);
      return true;
    }

    if (method === "GET") {
      const { place_id, user_id } = voteData || {};
      let query = supabase.from("place_votes").select("*");
      
      if (place_id) {
        query = query.eq("place_id", place_id);
      }
      if (user_id) {
        query = query.eq("user_id", user_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  } catch (e) {
    console.error("❌ Place votes operation failed:", e);
    throw e;
  }
}

