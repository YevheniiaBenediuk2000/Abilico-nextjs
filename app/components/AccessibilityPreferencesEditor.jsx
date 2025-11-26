"use client";

import { useState, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import FormHelperText from "@mui/material/FormHelperText";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import { ACCESSIBILITY_CATEGORIES } from "../constants/accessibilityCategories";

const MIN_SELECTIONS = 3;
const MAX_SELECTIONS = 5;

export default function AccessibilityPreferencesEditor({ open, onClose, supabase, userId, initialPreferences = [], onSave }) {
  const [selectedCategories, setSelectedCategories] = useState(initialPreferences);
  const [validationError, setValidationError] = useState("");
  const [loading, setLoading] = useState(false);

  // Update selected categories when initial preferences change or dialog opens/closes
  useEffect(() => {
    if (open) {
      // Reset state when dialog opens
      setSelectedCategories(initialPreferences);
      setValidationError("");
      setLoading(false);
    }
  }, [initialPreferences, open]);

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

  const handleSave = async () => {
    if (!validateSelections()) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          accessibility_preferences: selectedCategories,
        })
        .eq("id", userId);

      if (error) {
        console.error("Error saving preferences:", error);
        setValidationError(`Failed to save preferences: ${error.message || "Unknown error"}`);
        setLoading(false);
        return;
      }

      // Reset loading state before closing
      setLoading(false);

      // Call the onSave callback if provided
      if (onSave) {
        onSave(selectedCategories);
      }

      onClose();
    } catch (error) {
      console.error("Error:", error);
      setValidationError("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset loading state when closing
    setLoading(false);
    setValidationError("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Accessibility Preferences</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Choose 3–5 accessibility categories that matter most to you. We will use these preferences to personalise place ratings, filters and route suggestions.
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

        {validationError && (
          <FormHelperText error sx={{ mt: 2 }}>
            {validationError}
          </FormHelperText>
        )}

        {!validationError && (
          <FormHelperText sx={{ mt: 2 }}>
            Selected: {selectedCategories.length} / {MAX_SELECTIONS} (minimum {MIN_SELECTIONS} required)
          </FormHelperText>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={loading || selectedCategories.length < MIN_SELECTIONS || selectedCategories.length > MAX_SELECTIONS}
        >
          {loading ? <CircularProgress size={24} /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

