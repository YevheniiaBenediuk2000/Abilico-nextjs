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
 * Check if user has a profile created (has completed at least one step)
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - True if profile exists, false otherwise
 */
export async function hasProfile(supabase, userId) {
  if (!userId) return false;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("Error checking profile:", error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error("Error checking profile:", error);
    return false;
  }
}

/**
 * Check if a user has completed their disability types selection
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - True if at least one disability type is set, false otherwise
 */
export async function hasCompletedDisabilityTypes(supabase, userId) {
  if (!userId) return false;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("disability_types")
      .eq("id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("Error checking disability types:", error);
      return false;
    }

    // Check if disability_types exists and has at least one item
    const types = data?.disability_types || [];
    return Array.isArray(types) && types.length > 0;
  } catch (error) {
    console.error("Error checking disability types:", error);
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

  // Check if user has a profile - if not, they haven't been to personal info page yet
  // Personal info page is skippable, but we still want to show it first
  const hasProfileData = await hasProfile(supabase, userId);
  if (!hasProfileData) {
    return "/register/personal-info";
  }

  // Step 2: Check accessibility preferences
  const hasPreferences = await hasCompletedPreferences(supabase, userId);
  if (!hasPreferences) {
    return "/register/preferences";
  }

  // Step 3: Check disability types
  const hasDisabilityTypes = await hasCompletedDisabilityTypes(supabase, userId);
  if (!hasDisabilityTypes) {
    return "/register/disability-types";
  }

  // All registration steps completed
  return null;
}

