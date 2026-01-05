"use client";

import { useState, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";

export default function HomeAreaEditor({ open, onClose, supabase, userId, initialHomeArea = "", onSave }) {
  const [homeArea, setHomeArea] = useState(initialHomeArea);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Update home area when initial value changes or dialog opens
  useEffect(() => {
    if (open) {
      setHomeArea(initialHomeArea);
      setError("");
      setLoading(false);
    }
  }, [initialHomeArea, open]);

  const handleSave = async () => {
    setError("");
    setLoading(true);

    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          home_area: homeArea.trim() || null,
        })
        .eq("id", userId);

      if (updateError) {
        console.error("Error saving home area:", updateError);
        setError(`Failed to save: ${updateError.message || "Unknown error"}`);
        setLoading(false);
        return;
      }

      // Reset loading state before closing
      setLoading(false);

      // Call the onSave callback if provided
      if (onSave) {
        onSave(homeArea.trim() || null);
      }

      onClose();
    } catch (err) {
      console.error("Error:", err);
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset state when closing
    setLoading(false);
    setError("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Home Area</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Update your home area (city or neighbourhood). This information helps us personalise your experience.
        </Typography>

        <TextField
          fullWidth
          label="Home area"
          placeholder="City / Neighbourhood"
          value={homeArea}
          onChange={(e) => {
            setHomeArea(e.target.value);
            setError("");
          }}
          helperText="Enter your city or neighbourhood (optional)"
          error={!!error}
        />

        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 2 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={loading}
        >
          {loading ? <CircularProgress size={24} /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

