"use client";

import { useState, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import FormHelperText from "@mui/material/FormHelperText";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import { addUserPlace } from "../api/placeStorage";

// Access Leaflet from window (loaded globally by mapMain.js)
const getL = () => {
  if (typeof window === "undefined") return null;
  return window.L || (window.leaflet && window.leaflet.default) || null;
};

// Common place types that users might want to add
const PLACE_TYPES = [
  { value: "housing", label: "Housing / Accommodation" },
  { value: "hotel", label: "Hotel / Lodging" },
  { value: "stop", label: "Bus Stop / Transit Stop" },
  { value: "shelter", label: "Shelter / Emergency Shelter" },
  { value: "restaurant", label: "Restaurant" },
  { value: "cafe", label: "Cafe" },
  { value: "hospital", label: "Hospital / Clinic" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "library", label: "Library" },
  { value: "school", label: "School" },
  { value: "park", label: "Park" },
  { value: "toilet", label: "Public Toilet" },
  { value: "parking", label: "Parking" },
  { value: "shop", label: "Shop / Store" },
  { value: "other", label: "Other" },
];

export default function AddPlaceDialog({ open, onClose }) {
  const [name, setName] = useState("");
  const [placeType, setPlaceType] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState(null); // { lat, lng }
  const [isSelectingLocation, setIsSelectingLocation] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Marker for location selection
  const [locationMarker, setLocationMarker] = useState(null);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setName("");
      setPlaceType("");
      setCity("");
      setCountry("");
      setLocation(null);
      setIsSelectingLocation(false);
      setError("");
      setSubmitting(false);
      // Clean up marker
      if (locationMarker && typeof window !== "undefined" && window.map) {
        window.map.removeLayer(locationMarker);
      }
      setLocationMarker(null);
    } else {
      // Clean up marker when dialog closes
      if (locationMarker && typeof window !== "undefined" && window.map) {
        window.map.removeLayer(locationMarker);
      }
      setLocationMarker(null);
      setIsSelectingLocation(false);
    }
  }, [open]);

  const handleStartLocationSelection = () => {
    if (typeof window === "undefined" || !window.map) {
      setError("Map is not available. Please refresh the page.");
      return;
    }

    const L = getL();
    if (!L) {
      setError("Map library is not loaded. Please refresh the page.");
      return;
    }

    setIsSelectingLocation(true);
    setError("");

    // Get map instance
    const map = window.map;

    // Add temporary marker at map center or current view
    const center = map.getCenter();
    
    // Create a simple colored divIcon for the location marker
    const markerIcon = L.divIcon({
      className: "add-place-marker",
      html: `
        <div style="
          width: 24px;
          height: 24px;
          background-color: #1976d2;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const marker = L.marker([center.lat, center.lng], {
      draggable: true,
      icon: markerIcon,
    }).addTo(map);

    // Create popup with instructions
    marker
      .bindPopup("Drag this marker to set the location, or click on the map")
      .openPopup();

    setLocationMarker(marker);
    setLocation({ lat: center.lat, lng: center.lng });

    // Handle marker drag
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      setLocation({ lat: pos.lat, lng: pos.lng });
      marker.setPopupContent("Location selected. Click 'Confirm Location' when ready.");
    });

    // Handle map click to move marker
    const onMapClick = (e) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      setLocation({ lat, lng });
      marker.setPopupContent("Location selected. Click 'Confirm Location' when ready.");
    };

    map.on("click", onMapClick);

    // Store click handler for cleanup
    marker._onMapClick = onMapClick;
  };

  const handleConfirmLocation = () => {
    if (!location) {
      setError("Please select a location first.");
      return;
    }
    setIsSelectingLocation(false);
    if (locationMarker) {
      locationMarker.setPopupContent("Location confirmed!");
      // Remove click handler
      if (typeof window !== "undefined" && window.map && locationMarker._onMapClick) {
        window.map.off("click", locationMarker._onMapClick);
      }
    }
  };

  const handleCancelLocationSelection = () => {
    setIsSelectingLocation(false);
    if (locationMarker && typeof window !== "undefined" && window.map) {
      window.map.removeLayer(locationMarker);
      if (locationMarker._onMapClick) {
        window.map.off("click", locationMarker._onMapClick);
      }
    }
    setLocationMarker(null);
    setLocation(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!name.trim()) {
      setError("Please enter a name for this place.");
      return;
    }

    if (!placeType) {
      setError("Please select a place type.");
      return;
    }

    if (!location) {
      setError("Please select a location on the map.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await addUserPlace({
        name: name.trim(),
        place_type: placeType,
        lat: location.lat,
        lon: location.lng,
        city: city.trim() || null,
        country: country.trim() || null,
      });

      if (result.error) {
        throw result.error;
      }

      // Success - dispatch event to refresh places on map
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("user-place-added", {
            detail: { placeId: result.id, location },
          })
        );
      }

      // Clean up marker
      if (locationMarker && typeof window !== "undefined" && window.map) {
        window.map.removeLayer(locationMarker);
        if (locationMarker._onMapClick) {
          window.map.off("click", locationMarker._onMapClick);
        }
      }

      // Close dialog (will reset form via useEffect)
      onClose();
    } catch (err) {
      console.error("Failed to add place:", err);
      setError(
        err.message || "Could not save this place. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return; // Prevent closing while submitting

    // Clean up marker
    if (locationMarker && typeof window !== "undefined" && window.map) {
      window.map.removeLayer(locationMarker);
      if (locationMarker._onMapClick) {
        window.map.off("click", locationMarker._onMapClick);
      }
    }

    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: 400,
        },
      }}
    >
      <DialogTitle>Add a New Place</DialogTitle>
      <DialogContent>
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          {/* Name field */}
          <TextField
            label="Place Name"
            required
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting || isSelectingLocation}
          />

          {/* Place Type dropdown */}
          <TextField
            select
            label="Place Type"
            required
            fullWidth
            value={placeType}
            onChange={(e) => setPlaceType(e.target.value)}
            disabled={submitting || isSelectingLocation}
          >
            {PLACE_TYPES.map((type) => (
              <MenuItem key={type.value} value={type.value}>
                {type.label}
              </MenuItem>
            ))}
          </TextField>

          {/* Location selection */}
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Location{" "}
              <Typography component="span" color="error">
                *
              </Typography>
            </Typography>

            {!location && !isSelectingLocation && (
              <Button
                variant="outlined"
                onClick={handleStartLocationSelection}
                disabled={submitting}
                fullWidth
              >
                Select Location on Map
              </Button>
            )}

            {isSelectingLocation && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Alert severity="info" sx={{ mb: 1 }}>
                  Click on the map or drag the marker to set the location.
                </Alert>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Button
                    variant="contained"
                    onClick={handleConfirmLocation}
                    disabled={!location}
                    sx={{ flex: 1 }}
                  >
                    Confirm Location
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={handleCancelLocationSelection}
                    sx={{ flex: 1 }}
                  >
                    Cancel
                  </Button>
                </Box>
              </Box>
            )}

            {location && !isSelectingLocation && (
              <Box>
                <Alert severity="success" sx={{ mb: 1 }}>
                  Location selected: {location.lat.toFixed(5)},{" "}
                  {location.lng.toFixed(5)}
                </Alert>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleStartLocationSelection}
                  disabled={submitting}
                  fullWidth
                >
                  Change Location
                </Button>
              </Box>
            )}
          </Box>

          {/* Optional: City */}
          <TextField
            label="City (optional)"
            fullWidth
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={submitting || isSelectingLocation}
          />

          {/* Optional: Country */}
          <TextField
            label="Country (optional)"
            fullWidth
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            disabled={submitting || isSelectingLocation}
          />

          {/* Error message */}
          {error && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting || isSelectingLocation}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={
            submitting ||
            !name.trim() ||
            !placeType ||
            !location ||
            isSelectingLocation
          }
        >
          {submitting ? (
            <>
              <CircularProgress size={20} sx={{ mr: 1 }} />
              Saving…
            </>
          ) : (
            "Add Place"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

