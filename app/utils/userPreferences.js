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
 * Get the next registration step for a user
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - User ID
 * @returns {Promise<string>} - Next step URL or null if registration is complete
 */
export async function getNextRegistrationStep(supabase, userId) {
  if (!userId) return "/auth";

  // Check preferences first (Step 2)
  const hasPreferences = await hasCompletedPreferences(supabase, userId);
  if (!hasPreferences) {
    return "/register/preferences";
  }

  // TODO: Check Step 3 (disability type + home area) when implemented
  // For now, if preferences are done, registration is complete
  return null;
}

