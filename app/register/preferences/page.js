"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../api/supabaseClient";
import { getNextRegistrationStep } from "../../utils/userPreferences";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Button from "@mui/material/Button";
import FormHelperText from "@mui/material/FormHelperText";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import { ACCESSIBILITY_CATEGORIES } from "../../constants/accessibilityCategories";

const MIN_SELECTIONS = 3;
const MAX_SELECTIONS = 5;

export default function RegisterPreferencesPage() {
  const router = useRouter();
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [validationError, setValidationError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if user is authenticated
  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth");
        return;
      }
      setCheckingAuth(false);
    }
    checkAuth();
  }, [router]);

  const handleCategoryChange = (categoryId) => {
    setValidationError("");
    setSelectedCategories((prev) => {
      const isSelected = prev.includes(categoryId);
      if (isSelected) {
        return prev.filter((id) => id !== categoryId);
      } else {
        // Enforce max selections
        if (prev.length >= MAX_SELECTIONS) {
          setValidationError(`You can select a maximum of ${MAX_SELECTIONS} categories.`);
          return prev;
        }
        return [...prev, categoryId];
      }
    });
  };

  const validateSelections = () => {
    const count = selectedCategories.length;
    if (count < MIN_SELECTIONS) {
      setValidationError(`Please select at least ${MIN_SELECTIONS} categories.`);
      return false;
    }
    if (count > MAX_SELECTIONS) {
      setValidationError(`You can select a maximum of ${MAX_SELECTIONS} categories.`);
      return false;
    }
    setValidationError("");
    return true;
  };

  const handleContinue = async () => {
    if (!validateSelections()) {
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth");
        return;
      }

      // Check if profile exists first
      const { data: existingProfile, error: checkError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (checkError && checkError.code !== "PGRST116") {
        // PGRST116 means no rows found, which is fine
        console.error("Error checking profile:", checkError);
        setValidationError("Failed to check profile. Please try again.");
        setLoading(false);
        return;
      }

      let error;
      if (existingProfile) {
        // Profile exists, update it (only update accessibility_preferences, keep other fields)
        ({ error } = await supabase
          .from("profiles")
          .update({
            accessibility_preferences: selectedCategories,
          })
          .eq("id", user.id));
      } else {
        // Profile doesn't exist, insert it
        // Set disability_types to empty array since Step 3 (disability type selection) is not yet implemented
        ({ error } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            accessibility_preferences: selectedCategories,
            disability_types: [], // Empty array until Step 3 is completed
            home_area: null, // Will be set in Step 3
            full_name: null, // Will be set in Step 1 or later
          }));
      }

      if (error) {
        console.error("Error saving preferences:", error);
        setValidationError(
          `Failed to save preferences: ${error.message || "Unknown error"}`
        );
        setLoading(false);
        return;
      }

      // Navigate to next registration step (or dashboard if registration is complete)
      const nextStep = await getNextRegistrationStep(supabase, user.id);
      router.push(nextStep || "/dashboard");
    } catch (error) {
      console.error("Error:", error);
      setValidationError("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  if (checkingAuth) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        bgcolor: "background.default",
        py: 4,
        px: 2,
      }}
    >
      <Card
        sx={{
          maxWidth: 600,
          width: "100%",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {/* Title */}
          <Typography
            variant="h4"
            component="h1"
            sx={{
              mb: 2,
              fontWeight: 500,
              textAlign: "center",
            }}
          >
            Choose 3–5 accessibility categories that matter most to you
          </Typography>

          {/* Description */}
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              mb: 4,
              textAlign: "center",
            }}
          >
            We will use these preferences to personalise place ratings, filters and route suggestions. You can change them later in your profile.
          </Typography>

          {/* Checkbox Group */}
          <Typography
            variant="h6"
            component="label"
            sx={{
              mb: 2,
              fontWeight: 500,
              display: "block",
            }}
          >
            Accessibility preferences
          </Typography>

          <FormGroup>
            {ACCESSIBILITY_CATEGORIES.map((category) => (
              <FormControlLabel
                key={category.id}
                control={
                  <Checkbox
                    checked={selectedCategories.includes(category.id)}
                    onChange={() => handleCategoryChange(category.id)}
                    color="primary"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {category.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {category.helperText}
                    </Typography>
                  </Box>
                }
                sx={{
                  mb: 2,
                  alignItems: "flex-start",
                  "& .MuiFormControlLabel-label": {
                    flex: 1,
                  },
                }}
              />
            ))}
          </FormGroup>

          {/* Validation Error */}
          {validationError && (
            <FormHelperText error sx={{ mt: 2, mb: 2 }}>
              {validationError}
            </FormHelperText>
          )}

          {/* Helper Text */}
          {!validationError && (
            <FormHelperText sx={{ mt: 2, mb: 2 }}>
              Selected: {selectedCategories.length} / {MAX_SELECTIONS} (minimum {MIN_SELECTIONS} required)
            </FormHelperText>
          )}

          {/* Navigation Buttons */}
          <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
            <Button
              variant="outlined"
              onClick={handleBack}
              disabled={loading}
              sx={{ flex: 1 }}
            >
              Back
            </Button>
            <Button
              variant="contained"
              onClick={handleContinue}
              disabled={loading || selectedCategories.length < MIN_SELECTIONS || selectedCategories.length > MAX_SELECTIONS}
              sx={{ flex: 1 }}
            >
              {loading ? <CircularProgress size={24} /> : "Continue"}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

