"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../api/supabaseClient";
import { getNextRegistrationStep } from "../../utils/userPreferences";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import FormHelperText from "@mui/material/FormHelperText";

export default function RegisterPersonalInfoPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [homeArea, setHomeArea] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [validationError, setValidationError] = useState("");

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
      
      // Load existing profile data if available
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, home_area")
        .eq("id", user.id)
        .maybeSingle();
      
      if (profile) {
        setFullName(profile.full_name || "");
        setHomeArea(profile.home_area || "");
      }
    }
    checkAuth();
  }, [router]);

  const handleSkip = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth");
        return;
      }

      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      // Create a minimal profile entry if it doesn't exist (so flow knows user skipped this step)
      if (!existingProfile) {
        const { error } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            full_name: null,
            home_area: null,
            accessibility_preferences: [],
            disability_types: [],
          });

        if (error) {
          console.error("Error creating profile:", error);
          // Continue anyway - user can still proceed
        }
      }

      // Navigate to next registration step
      const nextStep = await getNextRegistrationStep(supabase, user.id);
      router.push(nextStep || "/dashboard");
    } catch (error) {
      console.error("Error:", error);
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    setValidationError("");

    // Validate required fields only if user is trying to save (not skipping)
    if (fullName && fullName.trim().length > 0) {
      if (fullName.trim().length < 2) {
        setValidationError("Name must be at least 2 characters");
        return;
      }
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

      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      let error;
      // Only save if user provided at least one field
      const hasName = fullName && fullName.trim().length > 0;
      const hasHomeArea = homeArea && homeArea.trim().length > 0;

      if (existingProfile) {
        // Profile exists, update only provided fields
        const updateData = {};
        if (hasName) updateData.full_name = fullName.trim();
        if (hasHomeArea) updateData.home_area = homeArea.trim();
        else if (!hasName) updateData.home_area = null; // Allow clearing home area

        if (Object.keys(updateData).length > 0) {
          ({ error } = await supabase
            .from("profiles")
            .update(updateData)
            .eq("id", user.id));
        } else {
          // No changes, just continue
          error = null;
        }
      } else {
        // Profile doesn't exist, insert it (create with empty defaults if nothing provided)
        ({ error } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            full_name: hasName ? fullName.trim() : null,
            home_area: hasHomeArea ? homeArea.trim() : null,
            accessibility_preferences: [],
            disability_types: [],
          }));
      }

      if (error) {
        console.error("Error saving personal info:", error);
        setValidationError(`Failed to save: ${error.message || "Unknown error"}`);
        setLoading(false);
        return;
      }

      // Navigate to next registration step
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
            Tell us about yourself
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
            We'll use this information to personalise your experience.
          </Typography>

          {/* Full Name Field */}
          <TextField
            fullWidth
            label="Name"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setValidationError("");
            }}
            sx={{ mb: 3 }}
            helperText="Enter your full name (optional)"
            error={!!validationError && validationError.includes("Name")}
            autoFocus
          />

          {/* Home Area Field - Optional */}
          <Typography
            variant="h6"
            component="label"
            sx={{
              mb: 1,
              fontWeight: 500,
              display: "block",
            }}
          >
            Location <Typography component="span" variant="body2" color="text.secondary">(Optional)</Typography>
          </Typography>

          <TextField
            fullWidth
            label="Home area"
            placeholder="City / Neighbourhood"
            value={homeArea}
            onChange={(e) => setHomeArea(e.target.value)}
            sx={{ mb: 3 }}
            helperText="Enter your city or neighbourhood (optional)"
          />

          {/* Validation Error */}
          {validationError && (
            <FormHelperText error sx={{ mb: 2 }}>
              {validationError}
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
              variant="text"
              onClick={handleSkip}
              disabled={loading}
              sx={{ flex: 1 }}
            >
              Skip
            </Button>
            <Button
              variant="contained"
              onClick={handleContinue}
              disabled={loading}
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

