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

const DISABILITY_TYPES = [
  { id: "wheelchair", label: "Wheelchair User" },
  { id: "visual", label: "Visually Impaired" },
  { id: "hearing", label: "Hearing Impaired" },
  { id: "other", label: "Other" },
];

export default function DisabilityTypesEditor({
  open,
  onClose,
  supabase,
  userId,
  initialTypes = [],
  onSave,
}) {
  const [selectedTypes, setSelectedTypes] = useState(initialTypes);
  const [validationError, setValidationError] = useState("");
  const [loading, setLoading] = useState(false);

  // Update state when dialog opens or initial values change
  useEffect(() => {
    if (open) {
      setSelectedTypes(initialTypes);
      setValidationError("");
      setLoading(false);
    }
  }, [initialTypes, open]);

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

  const handleSave = async () => {
    if (!validateSelections()) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          disability_types: selectedTypes,
        })
        .eq("id", userId);

      if (error) {
        console.error("Error saving disability types:", error);
        setValidationError(`Failed to save: ${error.message || "Unknown error"}`);
        setLoading(false);
        return;
      }

      // Reset loading state before closing
      setLoading(false);

      // Call the onSave callback if provided
      if (onSave) {
        onSave(selectedTypes);
      }

      onClose();
    } catch (error) {
      console.error("Error:", error);
      setValidationError("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  const handleClose = () => {
    setLoading(false);
    setValidationError("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Disability Types</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Select your disability types (choose one or more):
        </Typography>

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

        {validationError && (
          <FormHelperText error sx={{ mt: 2 }}>
            {validationError}
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
          disabled={loading || selectedTypes.length === 0}
        >
          {loading ? <CircularProgress size={24} /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

