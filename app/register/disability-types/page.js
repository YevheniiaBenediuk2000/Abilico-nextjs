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

const DISABILITY_TYPES = [
  { id: "wheelchair", label: "Wheelchair User" },
  { id: "visual", label: "Visually Impaired" },
  { id: "hearing", label: "Hearing Impaired" },
  { id: "other", label: "Other" },
];

export default function RegisterDisabilityTypesPage() {
  const router = useRouter();
  const [selectedTypes, setSelectedTypes] = useState([]);
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

  const handleTypeChange = (typeId) => {
    setValidationError("");
    setSelectedTypes((prev) => {
      const isSelected = prev.includes(typeId);
      if (isSelected) {
        return prev.filter((id) => id !== typeId);
      } else {
        return [...prev, typeId];
      }
    });
  };

  const validateSelections = () => {
    if (selectedTypes.length === 0) {
      setValidationError("Please select at least one option.");
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
        console.error("Error checking profile:", checkError);
        setValidationError("Failed to check profile. Please try again.");
        setLoading(false);
        return;
      }

      const updateData = {
        disability_types: selectedTypes,
      };

      let error;
      if (existingProfile) {
        // Profile exists, update it
        ({ error } = await supabase
          .from("profiles")
          .update(updateData)
          .eq("id", user.id));
      } else {
        // Profile doesn't exist, insert it
        ({ error } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            ...updateData,
            accessibility_preferences: [],
            home_area: null,
            full_name: null,
          }));
      }

      if (error) {
        console.error("Error saving disability types:", error);
        setValidationError(
          `Failed to save: ${error.message || "Unknown error"}`
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
            Select your disability types (choose one or more):
          </Typography>

          {/* Checkbox Group */}
          <FormGroup>
            {DISABILITY_TYPES.map((type) => (
              <FormControlLabel
                key={type.id}
                control={
                  <Checkbox
                    checked={selectedTypes.includes(type.id)}
                    onChange={() => handleTypeChange(type.id)}
                    color="primary"
                  />
                }
                label={
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {type.label}
                  </Typography>
                }
                sx={{
                  mb: 2,
                  alignItems: "flex-start",
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
              disabled={loading || selectedTypes.length === 0}
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

