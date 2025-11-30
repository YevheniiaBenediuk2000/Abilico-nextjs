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
import InputAdornment from "@mui/material/InputAdornment";
import { addUserPlace } from "../api/placeStorage";
import { reverseGeocode } from "../api/reverseGeocode";

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
  const [pendingLocation, setPendingLocation] = useState(null); // Store location before reopening dialog
  const [loadingLocation, setLoadingLocation] = useState(false); // Loading city/country from coordinates

  // Marker and popup for location confirmation
  const [locationMarker, setLocationMarker] = useState(null);
  const [confirmationPopup, setConfirmationPopup] = useState(null);

  // Reset form when dialog opens - check for pending location
  useEffect(() => {
    if (open) {
      setError("");
      setSubmitting(false);
      setIsSelectingLocation(false);
      
      // If there's a pending location from map selection, use it and reverse geocode
      if (pendingLocation) {
        setLocation(pendingLocation);
        setPendingLocation(null);
        // Automatically fetch city and country from coordinates
        fetchCityAndCountry(pendingLocation.lat, pendingLocation.lng);
      } else if (!location) {
        // Only reset form fields if no pending location
        setName("");
        setPlaceType("");
        setCity("");
        setCountry("");
        setLocation(null);
      }
      
      // Clean up any leftover markers/popups
      cleanupLocationSelection();
    } else {
      // Clean up when dialog closes
      cleanupLocationSelection();
      setIsSelectingLocation(false);
    }
  }, [open]);

  // Cleanup function for location selection resources
  const cleanupLocationSelection = () => {
    if (typeof window === "undefined" || !window.map) return;
    
    const map = window.map;
    
    // Remove marker
    if (locationMarker) {
      try {
        map.removeLayer(locationMarker);
      } catch (e) {
        console.warn("Error removing location marker:", e);
      }
      setLocationMarker(null);
    }
    
    // Remove popup
    if (confirmationPopup) {
      try {
        map.closePopup(confirmationPopup);
      } catch (e) {
        console.warn("Error closing confirmation popup:", e);
      }
      setConfirmationPopup(null);
    }
    
    // Remove map click handler
    if (map._addPlaceLocationHandler) {
      map.off("click", map._addPlaceLocationHandler);
      delete map._addPlaceLocationHandler;
    }
    
    // Re-enable quick route popup
    if (typeof window !== "undefined" && window.globals) {
      window.globals._isSelectingPlaceLocation = false;
    }
    
    setIsSelectingLocation(false);
  };

  // Fetch city and country from coordinates using reverse geocoding
  const fetchCityAndCountry = async (lat, lng) => {
    setLoadingLocation(true);
    try {
      const { city: fetchedCity, country: fetchedCountry } = await reverseGeocode(lat, lng);
      if (fetchedCity) setCity(fetchedCity);
      if (fetchedCountry) setCountry(fetchedCountry);
    } catch (err) {
      console.error("Failed to reverse geocode location:", err);
      // Don't show error to user - just continue without city/country
    } finally {
      setLoadingLocation(false);
    }
  };

  const handleStartLocationSelection = () => {
    if (typeof window === "undefined") {
      setError("Map is not available. Please refresh the page.");
      return;
    }

    const L = getL();
    if (!L) {
      setError("Map library is not loaded. Please refresh the page.");
      return;
    }

    const map = window.map;
    if (!map) {
      setError("Map is not initialized yet. Please wait a moment and try again.");
      return;
    }

    // Close the dialog first
    onClose();
    
    // Wait a moment for dialog to close, then set up map click handler
    setTimeout(() => {
      setIsSelectingLocation(true);
      
      // Create map click handler
      const handleMapClick = (e) => {
        // Stop propagation to prevent other handlers (like quick route popup)
        if (e.originalEvent) {
          e.originalEvent.stopPropagation();
        }
        
        const { lat, lng } = e.latlng;
        
        // Create a temporary marker at clicked location
        const markerIcon = L.divIcon({
          className: "add-place-marker",
          html: `
            <div style="
              width: 32px;
              height: 32px;
              background-color: #1976d2;
              border: 3px solid white;
              border-radius: 50%;
              box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            "></div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });
        
        const marker = L.marker([lat, lng], {
          icon: markerIcon,
        }).addTo(map);
        setLocationMarker(marker);
        
        // Create confirmation popup
        const popupContent = `
          <div style="text-align: center; padding: 8px;">
            <p style="margin: 0 0 12px 0; font-weight: 500;">Do you want to choose this location?</p>
            <p style="margin: 0 0 12px 0; font-size: 12px; color: #666;">
              ${lat.toFixed(5)}, ${lng.toFixed(5)}
            </p>
            <div style="display: flex; gap: 8px; justify-content: center;">
              <button id="confirm-location-btn" style="
                padding: 6px 16px;
                background-color: #1976d2;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
              ">Yes, choose this</button>
              <button id="cancel-location-btn" style="
                padding: 6px 16px;
                background-color: #f5f5f5;
                color: #333;
                border: 1px solid #ddd;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
              ">Cancel</button>
            </div>
          </div>
        `;
        
        const popup = L.popup({
          closeOnClick: false,
          closeButton: true,
          className: "add-place-confirmation-popup",
        })
          .setLatLng([lat, lng])
          .setContent(popupContent)
          .openOn(map);
        
        setConfirmationPopup(popup);
        
        // Handle confirmation button click
        setTimeout(() => {
          const confirmBtn = document.getElementById("confirm-location-btn");
          const cancelBtn = document.getElementById("cancel-location-btn");
          
          if (confirmBtn) {
            confirmBtn.onclick = () => {
              // Store the location and reopen dialog
              setPendingLocation({ lat, lng });
              cleanupLocationSelection();
              
              // Reopen the dialog via window event (parent will handle)
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("add-place-dialog-reopen", {
                    detail: { location: { lat, lng } },
                  })
                );
              }
            };
          }
          
          if (cancelBtn) {
            cancelBtn.onclick = () => {
              cleanupLocationSelection();
              setIsSelectingLocation(false);
            };
          }
        }, 100);
      };
      
      // Store handler reference for cleanup
      map._addPlaceLocationHandler = handleMapClick;
      
      // Prevent quick route popup from showing while selecting location
      if (typeof window !== "undefined" && window.globals) {
        window.globals._isSelectingPlaceLocation = true;
      }
      
      // Add click handler - will run before the quick route popup handler
      map.on("click", handleMapClick);
      
      // Show instruction toast
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("app-toast", {
            detail: {
              message: "Click on the map to choose a location",
              variant: "info",
              delay: 5000,
            },
          })
        );
      }
    }, 300); // Small delay to ensure dialog closes smoothly
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

      // Clean up location selection resources
      cleanupLocationSelection();

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
    
    // Clean up location selection resources
    cleanupLocationSelection();
    
    // If we're in the middle of selecting location, cancel it
    if (isSelectingLocation) {
      setIsSelectingLocation(false);
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

            {!location ? (
              <Button
                variant="outlined"
                onClick={handleStartLocationSelection}
                disabled={submitting}
                fullWidth
              >
                Select Location on Map
              </Button>
            ) : (
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

          {/* City - auto-filled from coordinates */}
          <TextField
            label="City"
            fullWidth
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={submitting || isSelectingLocation}
            helperText={loadingLocation ? "Detecting city from location..." : city ? "Auto-detected from coordinates" : "Will be detected from coordinates"}
            InputProps={{
              endAdornment: loadingLocation ? (
                <InputAdornment position="end">
                  <CircularProgress size={20} />
                </InputAdornment>
              ) : null,
            }}
          />

          {/* Country - auto-filled from coordinates */}
          <TextField
            label="Country"
            fullWidth
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            disabled={submitting || isSelectingLocation}
            helperText={loadingLocation ? "Detecting country from location..." : country ? "Auto-detected from coordinates" : "Will be detected from coordinates"}
            InputProps={{
              endAdornment: loadingLocation ? (
                <InputAdornment position="end">
                  <CircularProgress size={20} />
                </InputAdornment>
              ) : null,
            }}
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

