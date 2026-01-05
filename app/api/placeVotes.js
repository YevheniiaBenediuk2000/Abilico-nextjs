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

      // Check if user already voted on this place
      const { data: existingVote, error: checkError } = await supabase
        .from("place_votes")
        .select("id, vote_type")
        .eq("place_id", voteData.place_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (checkError && checkError.code !== "PGRST116") {
        // PGRST116 means no rows found, which is fine
        throw checkError;
      }

      if (existingVote) {
        const error = new Error("You have already voted on this obstacle");
        error.code = "DUPLICATE_VOTE";
        error.isDuplicate = true;
        // Store existing vote info for debugging
        if (existingVote) {
          error.details = `Existing vote: ${existingVote.vote_type}`;
        }
        throw error;
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
      
      if (error) {
        // Check for unique constraint violation (PostgreSQL error code 23505)
        const isDuplicate = 
          error.code === "23505" ||
          error.code === "PGRST301" || // PostgREST duplicate key error
          error.message?.toLowerCase().includes("unique") ||
          error.message?.toLowerCase().includes("duplicate") ||
          error.details?.toLowerCase().includes("unique") ||
          error.details?.toLowerCase().includes("duplicate") ||
          error.hint?.toLowerCase().includes("unique");
        
        if (isDuplicate) {
          const duplicateError = new Error("You have already voted on this obstacle");
          duplicateError.code = "DUPLICATE_VOTE";
          duplicateError.isDuplicate = true;
          throw duplicateError;
        }
        throw error;
      }
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
    // Normalize error to ensure it has proper properties
    let normalizedError;
    let isDuplicateError = false;
    
    // Check if it's already a normalized duplicate error
    if (e instanceof Error) {
      normalizedError = e;
      isDuplicateError = 
        normalizedError.code === "DUPLICATE_VOTE" ||
        normalizedError.isDuplicate === true ||
        normalizedError.message?.includes("already voted");
      
      // Ensure code is set for duplicate errors
      if (isDuplicateError && !normalizedError.code) {
        normalizedError.code = "DUPLICATE_VOTE";
      }
    } else {
      // Check if it's a Supabase error indicating a duplicate
      // Try to access properties that might be non-enumerable
      const errorCode = e?.code || e?.Code || (typeof e === "object" ? Object.getOwnPropertyNames(e).find(prop => prop.toLowerCase() === "code" ? e[prop] : null) : null);
      const errorMessage = e?.message || e?.Message || String(e || "");
      
      isDuplicateError = 
        errorCode === "23505" ||
        errorCode === "PGRST301" ||
        String(errorMessage || "").toLowerCase().includes("unique") ||
        String(errorMessage || "").toLowerCase().includes("duplicate") ||
        String(errorMessage || "").toLowerCase().includes("already exists");
      
      if (isDuplicateError) {
        normalizedError = new Error("You have already voted on this obstacle");
        normalizedError.code = "DUPLICATE_VOTE";
        normalizedError.isDuplicate = true;
      } else {
        // Convert non-Error objects to Error
        const errorStr = errorMessage || (typeof e === "object" ? JSON.stringify(e) : String(e));
        normalizedError = new Error(errorStr || "Place votes operation failed");
        normalizedError.originalError = e;
      }
    }
    
    // Only log unexpected errors (not duplicate votes - we handle those gracefully)
    // Check multiple ways to ensure we don't log duplicate vote errors
    const shouldSuppressLog = 
      isDuplicateError ||
      normalizedError.code === "DUPLICATE_VOTE" ||
      normalizedError.isDuplicate === true ||
      normalizedError.message?.includes("already voted") ||
      normalizedError.message?.includes("already voted on");
    
    if (!shouldSuppressLog) {
      // Extract all enumerable properties for logging
      const errorInfo = {
        message: normalizedError.message || String(normalizedError),
        code: normalizedError.code,
        name: normalizedError.name,
      };
      
      // Try to get Supabase error details if available
      if (e && typeof e === "object") {
        errorInfo.supabaseCode = e.code;
        errorInfo.supabaseMessage = e.message;
        errorInfo.supabaseDetails = e.details;
        errorInfo.supabaseHint = e.hint;
      }
      
      console.error("❌ Place votes operation failed:", errorInfo);
    }
    
    throw normalizedError;
  }
}

/**
 * Get vote statistics for a place (counts by vote type)
 * @param {string} placeId - The place ID to get statistics for
 * @returns {Promise<{confirm: number, issue: number, total: number}>}
 */
export async function getVoteStatistics(placeId) {
  if (!placeId) {
    return { confirm: 0, issue: 0, total: 0 };
  }

  try {
    const votes = await placeVotes("GET", { place_id: placeId });
    
    const stats = {
      confirm: 0,
      issue: 0,
      total: votes?.length || 0,
    };

    if (votes && Array.isArray(votes)) {
      votes.forEach((vote) => {
        if (vote.vote_type === "confirm") {
          stats.confirm++;
        } else if (vote.vote_type === "issue") {
          stats.issue++;
        }
      });
    }

    return stats;
  } catch (error) {
    console.error("Failed to get vote statistics:", error);
    return { confirm: 0, issue: 0, total: 0 };
  }
}

