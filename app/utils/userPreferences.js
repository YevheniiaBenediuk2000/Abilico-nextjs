/**
 * Check if a user has completed their accessibility preferences
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - True if preferences are set (3-5 categories), false otherwise
 */
export async function hasCompletedPreferences(supabase, userId) {
  if (!userId) return false;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("accessibility_preferences")
      .eq("id", userId)
      .single();

    if (error) {
      // If profile doesn't exist, preferences are not completed
      if (error.code === "PGRST116") {
        return false;
      }
      console.error("Error checking preferences:", error);
      return false;
    }

    // Check if preferences exist and have 3-5 items
    const preferences = data?.accessibility_preferences || [];
    return Array.isArray(preferences) && preferences.length >= 3 && preferences.length <= 5;
  } catch (error) {
    console.error("Error checking preferences:", error);
    return false;
  }
}

/**
 * Check if a user has completed their personal information (name)
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - True if name is set, false otherwise
 */
export async function hasCompletedPersonalInfo(supabase, userId) {
  if (!userId) return false;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("Error checking personal info:", error);
      return false;
    }

    // Check if full_name exists and is not empty
    return !!(data?.full_name && data.full_name.trim().length > 0);
  } catch (error) {
    console.error("Error checking personal info:", error);
    return false;
  }
}

/**
 * Get the next registration step for a user
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - User ID
 * @returns {Promise<string>} - Next step URL or null if registration is complete
 */
export async function getNextRegistrationStep(supabase, userId) {
  if (!userId) return "/auth";

  // Step 1: Check personal info (name is required)
  const hasPersonalInfo = await hasCompletedPersonalInfo(supabase, userId);
  if (!hasPersonalInfo) {
    return "/register/personal-info";
  }

  // Step 2: Check accessibility preferences
  const hasPreferences = await hasCompletedPreferences(supabase, userId);
  if (!hasPreferences) {
    return "/register/preferences";
  }

  // TODO: Check Step 3 (disability type) when implemented
  // For now, if personal info and preferences are done, registration is complete
  return null;
}

