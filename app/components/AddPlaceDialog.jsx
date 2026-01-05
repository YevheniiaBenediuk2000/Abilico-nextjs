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
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import AccessibilityNewIcon from "@mui/icons-material/AccessibilityNew";
import PersonIcon from "@mui/icons-material/Person";
import AddLocationIcon from "@mui/icons-material/AddLocation";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import { addUserPlace } from "../api/placeStorage";
import { reverseGeocode } from "../api/reverseGeocode";
import { supabase } from "../api/supabaseClient";
import { PRIMARY_BLUE } from "../constants/constants.mjs";

// Accessibility level colors
const GREEN = "#4caf50";
const ORANGE = "#ff9800";
const RED = "#f44336";

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

  // Accessibility fields
  const [overallAccessibility, setOverallAccessibility] = useState("");
  const [stepFreeEntrance, setStepFreeEntrance] = useState("");
  const [accessibleToilet, setAccessibleToilet] = useState("");
  const [accessibilityComments, setAccessibilityComments] = useState("");

  // Photos
  const [photos, setPhotos] = useState([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // Submitter info
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");

  // Expandable section state
  const [expandedDetails, setExpandedDetails] = useState(false);
  const [expandedComments, setExpandedComments] = useState(false);

  // Marker and popup for location confirmation
  const [locationMarker, setLocationMarker] = useState(null);
  const [confirmationPopup, setConfirmationPopup] = useState(null);

  // Reset form when dialog opens - check for pending location
  useEffect(() => {
    if (open) {
      setError("");
      setSubmitting(false);
      setIsSelectingLocation(false);
      setExpandedDetails(false);
      setExpandedComments(false);
      
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
        setOverallAccessibility("");
        setStepFreeEntrance("");
        setAccessibleToilet("");
        setAccessibilityComments("");
        setPhotos([]);
        setSubmitterName("");
        setSubmitterEmail("");
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

  // Upload photos to Supabase Storage
  // 
  // ⚠️ IMPORTANT: Before uploading photos, create the storage bucket in Supabase:
  // 1. Go to Supabase Dashboard → Storage → Buckets
  // 2. Click "New bucket"
  // 3. Name: "place-photos" (exactly as shown below)
  // 4. Make it Public: Yes (checked)
  // 5. Create bucket
  //
  // If the bucket doesn't exist, photos will be skipped but the place will still be saved.
  const uploadPhotos = async (photoFiles) => {
    const urls = [];
    const BUCKET_NAME = "place-photos"; // 👈 Must match the bucket name in Supabase Storage

    // Wrap everything in try-catch to handle bucket errors gracefully
    try {
      for (const file of photoFiles) {
      try {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${BUCKET_NAME}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(fileName, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          // Check if bucket doesn't exist - check multiple error formats
          const errorMsg = String(uploadError.message || uploadError.error || JSON.stringify(uploadError) || "");
          const isBucketNotFound = 
            (errorMsg.includes("Bucket") && errorMsg.includes("not found")) ||
            errorMsg.includes("Bucket not found") ||
            uploadError.statusCode === "404" ||
            uploadError.statusCode === 404 ||
            (uploadError.error && typeof uploadError.error === "string" && uploadError.error.includes("Bucket")) ||
            uploadError.name === "StorageApiError";
          
          if (isBucketNotFound) {
            bucketErrorOccurred = true;
            // Bucket doesn't exist - silently skip photos (this is expected)
            // Return empty array - skip all photos immediately
            return [];
          }
          
          // For other errors, skip this photo but continue with others
          console.warn("Skipping photo due to upload error:", uploadError);
          continue;
        }

        // Get public URL
        const { data } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(fileName);

        if (data?.publicUrl) {
          urls.push(data.publicUrl);
        }
      } catch (err) {
        // Check if bucket doesn't exist - catch any StorageApiError
        const errorMsg = String(err.message || err.error || JSON.stringify(err) || "");
        const isBucketNotFound = 
          err.name === "StorageApiError" ||
          (errorMsg.includes("Bucket") && errorMsg.includes("not found")) ||
          errorMsg.includes("Bucket not found");
        
        if (isBucketNotFound) {
          bucketErrorOccurred = true;
          // Bucket doesn't exist - silently skip photos
          return [];
        }
        
        // For other unexpected errors, log but continue
        console.warn("Error processing photo (will skip):", err);
        // Continue with next photo for other errors
      }
    }

      return urls;
    } catch (globalErr) {
      // Catch any unhandled errors (e.g., bucket doesn't exist)
      const errorMsg = String(globalErr.message || globalErr.error || JSON.stringify(globalErr) || "");
      const isBucketError = 
        globalErr.name === "StorageApiError" ||
        (errorMsg.includes("Bucket") && errorMsg.includes("not found")) ||
        errorMsg.includes("Bucket not found");
      
      if (isBucketError) {
        // Bucket doesn't exist - return empty array (photos are optional)
        return [];
      }
      
      // Re-throw other unexpected errors
      throw globalErr;
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
              background-color: ${PRIMARY_BLUE};
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
                background-color: ${PRIMARY_BLUE};
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
    setUploadingPhotos(photos.length > 0);

    try {
      // Upload photos first if any
      let photoUrls = [];
      if (photos.length > 0) {
        try {
          photoUrls = await uploadPhotos(photos);
          if (photoUrls.length === 0 && photos.length > 0) {
            // Photos couldn't be uploaded (bucket doesn't exist)
            // This is OK - we'll save the place without photos
            console.info("Note: Photos were not uploaded. The place will be saved without photos.");
          }
        } catch (photoError) {
          // Silently ignore photo upload errors - photos are optional
          // The place will still be saved successfully
          console.info("Photo upload skipped. Place will be saved without photos.");
          photoUrls = []; // Ensure we have empty array
        }
        setUploadingPhotos(false);
      }

      console.log("📤 Sending place data to API...");
      
      // Build accessibility keywords object to store in JSONB field
      const accessibilityKeywords = {};
      if (overallAccessibility) accessibilityKeywords.wheelchair = overallAccessibility;
      if (stepFreeEntrance) accessibilityKeywords.step_free_entrance = stepFreeEntrance;
      if (accessibleToilet) accessibilityKeywords.accessible_toilet = accessibleToilet;
      
      const result = await addUserPlace({
        name: name.trim(),
        place_type: placeType,
        lat: location.lat,
        lon: location.lng,
        city: city.trim() || null,
        country: country.trim() || null,
        accessibility_keywords: Object.keys(accessibilityKeywords).length > 0 ? accessibilityKeywords : null,
        accessibility_comments: accessibilityComments.trim() || null,
        photos: photoUrls.length > 0 ? photoUrls : null,
        submitted_by_name: submitterName.trim() || null,
        submitted_by_email: submitterEmail.trim() || null,
      });

      console.log("📥 API result:", result);

      if (result.error) {
        const errorMessage = typeof result.error === "string" 
          ? result.error 
          : result.error?.message || JSON.stringify(result.error) || "Unknown error";
        throw new Error(errorMessage);
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
          maxHeight: "90vh",
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle
        sx={{
          pb: 2,
          pt: 3,
          px: 3,
          fontSize: "1.625rem",
          fontWeight: 700,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          background: `linear-gradient(135deg, ${PRIMARY_BLUE}08 0%, ${PRIMARY_BLUE}02 100%)`,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <AddLocationIcon sx={{ color: PRIMARY_BLUE, fontSize: "1.75rem" }} />
          Add a New Place
        </Box>
        <IconButton
          onClick={handleClose}
          disabled={submitting || isSelectingLocation}
          sx={{
            color: "text.secondary",
            "&:hover": {
              bgcolor: "rgba(0, 0, 0, 0.04)",
            },
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent
        sx={{
          overflowY: "auto",
          maxHeight: "calc(90vh - 140px)",
          px: 3,
          py: 2.5,
        }}
      >
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}
        >
          {/* 1. Place Information Section */}
          <Paper
            elevation={0}
            sx={{
              mt: 2,
              p: 2.5,
              bgcolor: "rgba(0, 0, 0, 0.005)",
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              transition: "all 0.2s ease-in-out",
              "&:hover": {
                borderColor: PRIMARY_BLUE + "40",
                boxShadow: `0 2px 8px ${PRIMARY_BLUE}15`,
              },
            }}
          >
            <Typography
              variant="h6"
              sx={{
                mb: 2,
                fontSize: "1.125rem",
                fontWeight: 600,
              }}
            >
              Place Information{" "}
              <Typography component="span" color="error">
                *
          </Typography>
            </Typography>
            <Stack spacing={2}>

          <TextField
            label="Place Name"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting || isSelectingLocation}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 1.5,
                    transition: "all 0.2s ease-in-out",
                    "&:hover:not(.Mui-disabled)": {
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: PRIMARY_BLUE + "80",
                      },
                    },
                    "&.Mui-focused": {
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderWidth: 2,
                        borderColor: PRIMARY_BLUE,
                      },
                    },
                  },
                }}
          />

          <TextField
            select
            label="Place Type"
            fullWidth
            value={placeType}
            onChange={(e) => setPlaceType(e.target.value)}
            disabled={submitting || isSelectingLocation}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 1.5,
                    transition: "all 0.2s ease-in-out",
                    "&:hover:not(.Mui-disabled)": {
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: PRIMARY_BLUE + "80",
                      },
                    },
                    "&.Mui-focused": {
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderWidth: 2,
                        borderColor: PRIMARY_BLUE,
                      },
                    },
                  },
                }}
          >
            {PLACE_TYPES.map((type) => (
              <MenuItem key={type.value} value={type.value}>
                {type.label}
              </MenuItem>
            ))}
          </TextField>
            </Stack>
          </Paper>

          {/* 2. Location Section */}
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              bgcolor: "rgba(0, 0, 0, 0.005)",
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              transition: "all 0.2s ease-in-out",
              "&:hover": {
                borderColor: PRIMARY_BLUE + "40",
                boxShadow: `0 2px 8px ${PRIMARY_BLUE}15`,
              },
            }}
          >
            <Typography
              variant="h6"
              sx={{
                mb: 2,
                fontSize: "1.125rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <LocationOnIcon sx={{ fontSize: "1.25rem", color: PRIMARY_BLUE }} />
              Location
          </Typography>
            <Stack spacing={2}>
          {/* Location selection */}
          <Box>
                <Typography
                  variant="body2"
                  sx={{ mb: 1, fontWeight: 500, color: "text.secondary" }}
                >
              Location{" "}
              <Typography component="span" color="error">
                *
              </Typography>
            </Typography>

            {!location ? (
              <Button
                variant="contained"
                onClick={handleStartLocationSelection}
                disabled={submitting}
                fullWidth
                startIcon={<LocationOnIcon />}
                sx={{
                  bgcolor: PRIMARY_BLUE,
                  color: "white",
                  py: 1.5,
                  borderRadius: "25px",
                  textTransform: "none",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                  transition: "all 0.2s ease-in-out",
                  "&:hover": {
                    bgcolor: PRIMARY_BLUE,
                    opacity: 0.9,
                    boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
                  },
                }}
              >
                Select Location on Map
              </Button>
            ) : (
              <Box>
                    <Alert
                      severity="success"
                      icon={<CheckCircleIcon />}
                      sx={{
                        mb: 1,
                        borderRadius: 1.5,
                        bgcolor: "success.light",
                        "& .MuiAlert-icon": {
                          alignItems: "center",
                        },
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  Location selected: {location.lat.toFixed(5)},{" "}
                  {location.lng.toFixed(5)}
                      </Typography>
                </Alert>
                <Button
                  variant="outlined"
                      size="medium"
                  onClick={handleStartLocationSelection}
                  disabled={submitting}
                  fullWidth
                      startIcon={<LocationOnIcon />}
                      sx={{
                        borderRadius: 1.5,
                        textTransform: "none",
                        fontWeight: 500,
                        transition: "all 0.2s ease-in-out",
                        "&:hover": {
                          transform: "translateY(-1px)",
                        },
                      }}
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
                helperText={
                  loadingLocation
                    ? "Detecting city from location..."
                    : city
                    ? "Auto-detected from coordinates"
                    : ""
                }
            InputProps={{
              endAdornment: loadingLocation ? (
                <InputAdornment position="end">
                  <CircularProgress size={20} />
                </InputAdornment>
              ) : null,
            }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 1.5,
                    transition: "all 0.2s ease-in-out",
                    "&:hover:not(.Mui-disabled)": {
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: PRIMARY_BLUE + "80",
                      },
                    },
                    "&.Mui-focused": {
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderWidth: 2,
                        borderColor: PRIMARY_BLUE,
                      },
                    },
                  },
            }}
          />

          {/* Country - auto-filled from coordinates */}
          <TextField
            label="Country"
            fullWidth
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            disabled={submitting || isSelectingLocation}
                helperText={
                  loadingLocation
                    ? "Detecting country from location..."
                    : country
                    ? "Auto-detected from coordinates"
                    : ""
                }
            InputProps={{
              endAdornment: loadingLocation ? (
                <InputAdornment position="end">
                  <CircularProgress size={20} />
                </InputAdornment>
              ) : null,
            }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 1.5,
                    transition: "all 0.2s ease-in-out",
                    "&:hover:not(.Mui-disabled)": {
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: PRIMARY_BLUE + "80",
                      },
                    },
                    "&.Mui-focused": {
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderWidth: 2,
                        borderColor: PRIMARY_BLUE,
                      },
                    },
                  },
                }}
              />
            </Stack>
          </Paper>

          {/* Expandable Details Button */}
          <Box
            onClick={() => setExpandedDetails(!expandedDetails)}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              py: 1.5,
              cursor: "pointer",
              borderRadius: 1,
              transition: "background-color 0.2s",
              "&:hover": {
                bgcolor: "rgba(0, 0, 0, 0.02)",
              },
            }}
          >
            <Typography
              variant="body1"
              sx={{
                color: PRIMARY_BLUE,
                fontWeight: 500,
                textTransform: "none",
              }}
            >
              {expandedDetails ? "Hide" : "Add"} accessibility details{" "}
              <Typography component="span" sx={{ color: PRIMARY_BLUE }}>
                (optional)
              </Typography>
            </Typography>
            {expandedDetails ? (
              <ExpandLessIcon sx={{ color: PRIMARY_BLUE, fontSize: "1.25rem" }} />
            ) : (
              <ExpandMoreIcon sx={{ color: PRIMARY_BLUE, fontSize: "1.25rem" }} />
            )}
          </Box>

          {/* Collapsible Sections 3-5 */}
          <Collapse in={expandedDetails}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          {/* Accessibility Overview Section */}
          <Box>
            <Box
              sx={{
                mb: 1.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 600,
                  color: "text.primary",
                  textTransform: "uppercase",
                  fontSize: "0.75rem",
                  letterSpacing: "0.5px",
                }}
              >
                PLACE ACCESSIBILITY
          </Typography>
              {(overallAccessibility || stepFreeEntrance || accessibleToilet) && (
                <Button
                  onClick={() => {
                    setOverallAccessibility("");
                    setStepFreeEntrance("");
                    setAccessibleToilet("");
                  }}
                  sx={{
                    textTransform: "none",
                    color: "text.secondary",
                    fontSize: "0.7rem",
                    minWidth: "auto",
                    px: 1,
                    "&:hover": {
                      bgcolor: "transparent",
                      textDecoration: "underline",
                      color: "text.primary",
                    },
                  }}
                >
                  Clear accessibility
                </Button>
              )}
            </Box>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              bgcolor: "rgba(0, 0, 0, 0.005)",
              borderRadius: 3,
              border: "1px solid rgba(0,0,0,0.12)",
              transition: "all 0.2s ease-in-out",
              "&:hover": {
                borderColor: PRIMARY_BLUE + "40",
                boxShadow: `0 2px 8px ${PRIMARY_BLUE}15`,
              },
            }}
          >
            <Stack spacing={2.5}>
          {/* Frame: Accessibility Level */}
          <Box
            sx={{
              p: 2,
              bgcolor: "rgba(0, 0, 0, 0.02)",
              borderRadius: 1.5,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                mb: 1.5,
                fontWeight: 600,
                color: "text.primary",
                textTransform: "uppercase",
                fontSize: "0.75rem",
                letterSpacing: "0.5px",
              }}
            >
              Accessibility Level
            </Typography>
          <TextField
            select
            label="Overall accessibility level"
            fullWidth
            value={overallAccessibility}
            onChange={(e) => setOverallAccessibility(e.target.value)}
            disabled={submitting || isSelectingLocation}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 1.5,
                  transition: "all 0.2s ease-in-out",
                  "&:hover:not(.Mui-disabled)": {
                    "& .MuiOutlinedInput-notchedOutline": {
                      borderColor: PRIMARY_BLUE + "80",
                    },
                  },
                  "&.Mui-focused": {
                    "& .MuiOutlinedInput-notchedOutline": {
                      borderWidth: 2,
                      borderColor: PRIMARY_BLUE,
                    },
                  },
                },
                "& .MuiMenuItem-root": {
                  "&:hover": {
                    bgcolor: "transparent",
                  },
                },
              }}
            >
            <MenuItem 
              value=""
              sx={{
                "&:hover": {
                  bgcolor: "rgba(0, 0, 0, 0.04)",
                },
              }}
            >
              Not Selected
            </MenuItem>
            <MenuItem 
              value="designated"
              sx={{
                borderLeft: `3px solid ${GREEN}`,
                color: GREEN,
                "&:hover, &.Mui-selected": {
                  bgcolor: GREEN,
                  color: "#fff",
                },
                "&.Mui-selected:hover": {
                  bgcolor: GREEN,
                  color: "#fff",
                },
              }}
            >
              Designated
            </MenuItem>
            <MenuItem 
              value="yes"
              sx={{
                borderLeft: `3px solid ${GREEN}`,
                color: GREEN,
                "&:hover, &.Mui-selected": {
                  bgcolor: GREEN,
                  color: "#fff",
                },
                "&.Mui-selected:hover": {
                  bgcolor: GREEN,
                  color: "#fff",
                },
              }}
            >
              Accessible
            </MenuItem>
            <MenuItem 
              value="limited"
              sx={{
                borderLeft: `3px solid ${ORANGE}`,
                color: ORANGE,
                "&:hover, &.Mui-selected": {
                  bgcolor: ORANGE,
                  color: "#fff",
                },
                "&.Mui-selected:hover": {
                  bgcolor: ORANGE,
                  color: "#fff",
                },
              }}
            >
              Limited
            </MenuItem>
            <MenuItem 
              value="no"
              sx={{
                borderLeft: `3px solid ${RED}`,
                color: RED,
                "&:hover, &.Mui-selected": {
                  bgcolor: RED,
                  color: "#fff",
                },
                "&.Mui-selected:hover": {
                  bgcolor: RED,
                  color: "#fff",
                },
              }}
            >
              Not Accessible
            </MenuItem>
          </TextField>
          </Box>

          {/* Frame: Features */}
          <Box
            sx={{
              p: 2,
              bgcolor: "rgba(0, 0, 0, 0.02)",
              borderRadius: 1.5,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                mb: 1.5,
                fontWeight: 600,
                color: "text.primary",
                textTransform: "uppercase",
                fontSize: "0.75rem",
                letterSpacing: "0.5px",
              }}
            >
              Features
            </Typography>
            <Stack spacing={2.5}>
          {/* Step-free entrance */}
              <FormControl
                component="fieldset"
                disabled={submitting || isSelectingLocation}
              >
                <FormLabel
                  component="legend"
                  sx={{ mb: 1, fontWeight: 500, color: "text.primary", textAlign: "center", display: "block" }}
                >
                  Step-free entrance
                </FormLabel>
            <RadioGroup
              row
              value={stepFreeEntrance}
              onChange={(e) => setStepFreeEntrance(e.target.value)}
                  sx={{ gap: 3, justifyContent: "center" }}
                >
                  <FormControlLabel
                    value="yes"
                    control={
                      <Radio
                        sx={{
                          color: PRIMARY_BLUE + "80",
                          "&.Mui-checked": {
                            color: PRIMARY_BLUE,
                          },
                          "& .MuiSvgIcon-root": {
                            fontSize: 20,
                          },
                        }}
                      />
                    }
                    label="Yes"
                    sx={{
                      "& .MuiFormControlLabel-label": {
                        fontWeight: 500,
                      },
                    }}
                  />
                  <FormControlLabel
                    value="no"
                    control={
                      <Radio
                        sx={{
                          color: PRIMARY_BLUE + "80",
                          "&.Mui-checked": {
                            color: PRIMARY_BLUE,
                          },
                          "& .MuiSvgIcon-root": {
                            fontSize: 20,
                          },
                        }}
                      />
                    }
                    label="No"
                    sx={{
                      "& .MuiFormControlLabel-label": {
                        fontWeight: 500,
                      },
                    }}
                  />
            </RadioGroup>
          </FormControl>

          {/* Accessible toilet available */}
              <FormControl
                component="fieldset"
                disabled={submitting || isSelectingLocation}
              >
                <FormLabel
                  component="legend"
                  sx={{ mb: 1, fontWeight: 500, color: "text.primary", textAlign: "center", display: "block" }}
                >
                  Accessible toilet available
                </FormLabel>
            <RadioGroup
              row
              value={accessibleToilet}
              onChange={(e) => setAccessibleToilet(e.target.value)}
                  sx={{ gap: 3, justifyContent: "center" }}
                >
                  <FormControlLabel
                    value="yes"
                    control={
                      <Radio
                        sx={{
                          color: PRIMARY_BLUE + "80",
                          "&.Mui-checked": {
                            color: PRIMARY_BLUE,
                          },
                          "& .MuiSvgIcon-root": {
                            fontSize: 20,
                          },
                        }}
                      />
                    }
                    label="Yes"
                    sx={{
                      "& .MuiFormControlLabel-label": {
                        fontWeight: 500,
                      },
                    }}
                  />
                  <FormControlLabel
                    value="no"
                    control={
                      <Radio
                        sx={{
                          color: PRIMARY_BLUE + "80",
                          "&.Mui-checked": {
                            color: PRIMARY_BLUE,
                          },
                          "& .MuiSvgIcon-root": {
                            fontSize: 20,
                          },
                        }}
                      />
                    }
                    label="No"
                    sx={{
                      "& .MuiFormControlLabel-label": {
                        fontWeight: 500,
                      },
                    }}
                  />
            </RadioGroup>
          </FormControl>
            </Stack>
          </Box>

          {/* Frame: Details (optional) - Expandable */}
          <Box
            sx={{
              borderRadius: 1.5,
              border: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
            }}
          >
            <Box
              onClick={() => setExpandedComments(!expandedComments)}
              sx={{
                p: 2,
                bgcolor: "rgba(0, 0, 0, 0.02)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                transition: "background-color 0.2s",
                "&:hover": {
                  bgcolor: "rgba(0, 0, 0, 0.04)",
                },
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 600,
                  color: "text.primary",
                  textTransform: "uppercase",
                  fontSize: "0.75rem",
                  letterSpacing: "0.5px",
                }}
              >
                Details{" "}
                <Typography component="span" sx={{ color: "text.secondary", textTransform: "none" }}>
                  (optional)
                </Typography>
              </Typography>
              {expandedComments ? (
                <ExpandLessIcon sx={{ color: "text.secondary", fontSize: "1.25rem" }} />
              ) : (
                <ExpandMoreIcon sx={{ color: "text.secondary", fontSize: "1.25rem" }} />
              )}
            </Box>
            <Collapse in={expandedComments}>
              <Box sx={{ p: 2 }}>
          <TextField
            label="Additional comments"
            multiline
            rows={3}
            fullWidth
            value={accessibilityComments}
            onChange={(e) => setAccessibilityComments(e.target.value)}
            disabled={submitting || isSelectingLocation}
            helperText="Anything important about accessibility, issues, time limits, etc."
            placeholder="E.g., Ramp available on the side entrance, accessible parking nearby..."
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 1.5,
                      transition: "all 0.2s ease-in-out",
                      "&:hover:not(.Mui-disabled)": {
                        "& .MuiOutlinedInput-notchedOutline": {
                          borderColor: PRIMARY_BLUE + "80",
                        },
                      },
                      "&.Mui-focused": {
                        "& .MuiOutlinedInput-notchedOutline": {
                          borderWidth: 2,
                          borderColor: PRIMARY_BLUE,
                        },
                      },
                    },
                  }}
                />
              </Box>
            </Collapse>
          </Box>
            </Stack>
          </Paper>
          </Box>

          {/* Photos Section */}
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              bgcolor: "rgba(0, 0, 0, 0.005)",
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              transition: "all 0.2s ease-in-out",
              "&:hover": {
                borderColor: PRIMARY_BLUE + "40",
                boxShadow: `0 2px 8px ${PRIMARY_BLUE}15`,
              },
            }}
          >
            <Typography
              variant="h6"
              sx={{
                mb: 2,
                fontSize: "1.125rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
              }}
            >
              <PhotoCameraIcon sx={{ fontSize: "1.25rem", color: PRIMARY_BLUE }} />
              Photos
          </Typography>
          <Box>
            <input
              accept="image/*"
              style={{ display: "none" }}
              id="photo-upload-input"
              type="file"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setPhotos((prev) => [...prev, ...files]);
              }}
              disabled={submitting || isSelectingLocation}
            />
            <Box sx={{ display: "flex", justifyContent: "center" }}>
            <label htmlFor="photo-upload-input">
              <Button
                  variant="contained"
                component="span"
                disabled={submitting || isSelectingLocation}
                  sx={{
                    mb: photos.length > 0 ? 1.5 : 0,
                    bgcolor: PRIMARY_BLUE,
                    color: "white",
                    py: 1.5,
                    px: 3,
                    borderRadius: "25px",
                    textTransform: "none",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                    transition: "all 0.2s ease-in-out",
                    "&:hover": {
                      bgcolor: PRIMARY_BLUE,
                      opacity: 0.9,
                      boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
                    },
                  }}
              >
                Upload Photos
              </Button>
            </label>
            </Box>
            {photos.length > 0 && (
                <Box>
                  <Chip
                    label={`${photos.length} photo${photos.length > 1 ? "s" : ""} selected`}
                    color="primary"
                    size="small"
                    sx={{
                      mb: 1.5,
                      fontWeight: 600,
                      bgcolor: PRIMARY_BLUE + "15",
                      color: PRIMARY_BLUE,
                      border: `1px solid ${PRIMARY_BLUE}30`,
                    }}
                  />
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
                  {photos.map((photo, index) => (
                    <Box
                      key={index}
                      sx={{
                        position: "relative",
                          width: 100,
                          height: 100,
                          borderRadius: 2,
                        overflow: "hidden",
                          border: "2px solid",
                          borderColor: "divider",
                          boxShadow: `0 2px 8px ${PRIMARY_BLUE}15`,
                          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                          "&:hover": {
                            transform: "scale(1.08) translateY(-2px)",
                            borderColor: PRIMARY_BLUE,
                            boxShadow: `0 4px 16px ${PRIMARY_BLUE}30`,
                            zIndex: 1,
                          },
                      }}
                    >
                      <img
                        src={URL.createObjectURL(photo)}
                        alt={`Preview ${index + 1}`}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                        <Box
                          sx={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            bgcolor: "rgba(0,0,0,0)",
                            transition: "background-color 0.2s",
                            "&:hover": {
                              bgcolor: "rgba(0,0,0,0.1)",
                            },
                        }}
                      />
                      <IconButton
                        size="small"
                        onClick={() => {
                            setPhotos((prev) =>
                              prev.filter((_, i) => i !== index)
                            );
                        }}
                        sx={{
                          position: "absolute",
                            top: 6,
                            right: 6,
                            bgcolor: "rgba(255,255,255,0.95)",
                            color: "error.main",
                            width: 32,
                            height: 32,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                            transition: "all 0.2s",
                            "&:hover": {
                              bgcolor: "error.main",
                          color: "white",
                              transform: "scale(1.1)",
                            },
                        }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
                  <FormHelperText sx={{ mt: 1.5, fontSize: "0.8125rem" }}>
                  Upload photos of entrance, ramp, stairs, lift, etc.
                </FormHelperText>
              </Box>
            )}
          </Box>
          </Paper>

          {/* Submitter Information Section */}
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              bgcolor: "rgba(0, 0, 0, 0.005)",
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              transition: "all 0.2s ease-in-out",
              "&:hover": {
                borderColor: PRIMARY_BLUE + "40",
                boxShadow: `0 2px 8px ${PRIMARY_BLUE}15`,
              },
            }}
          >
            <Typography
              variant="h6"
              sx={{
                mb: 2,
                fontSize: "1.125rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <PersonIcon sx={{ fontSize: "1.25rem", color: PRIMARY_BLUE }} />
              Contact details
          </Typography>
            <Stack spacing={2}>
          <TextField
                label="Name"
            fullWidth
            value={submitterName}
            onChange={(e) => setSubmitterName(e.target.value)}
            disabled={submitting || isSelectingLocation}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 1.5,
                    transition: "all 0.2s ease-in-out",
                    "&:hover:not(.Mui-disabled)": {
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: PRIMARY_BLUE + "80",
                      },
                    },
                    "&.Mui-focused": {
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderWidth: 2,
                        borderColor: PRIMARY_BLUE,
                      },
                    },
                  },
                }}
          />

          <TextField
                label="Email"
            type="email"
            fullWidth
            value={submitterEmail}
            onChange={(e) => setSubmitterEmail(e.target.value)}
            disabled={submitting || isSelectingLocation}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 1.5,
                    transition: "all 0.2s ease-in-out",
                    "&:hover:not(.Mui-disabled)": {
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: PRIMARY_BLUE + "80",
                      },
                    },
                    "&.Mui-focused": {
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderWidth: 2,
                        borderColor: PRIMARY_BLUE,
                      },
                    },
                  },
                }}
              />
            </Stack>
          </Paper>
            </Box>
          </Collapse>

          {/* Error message */}
          {error && (
            <Alert
              severity="error"
              sx={{
                borderRadius: 1.5,
                animation: "fadeIn 0.3s ease-in",
                "@keyframes fadeIn": {
                  from: {
                    opacity: 0,
                    transform: "translateY(-10px)",
                  },
                  to: {
                    opacity: 1,
                    transform: "translateY(0)",
                  },
                },
                "& .MuiAlert-icon": {
                  alignItems: "center",
                },
              }}
            >
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions
        sx={{
          px: 3,
          py: 2.5,
          borderTop: "1px solid",
          borderColor: "divider",
          gap: 1.5,
          bgcolor: "rgba(0, 0, 0, 0.01)",
        }}
      >
        <Button
          onClick={handleClose}
          disabled={submitting || isSelectingLocation}
          sx={{
            textTransform: "none",
            fontWeight: 500,
            px: 3,
            py: 1,
            borderRadius: 1.5,
            transition: "all 0.2s ease-in-out",
            "&:hover:not(:disabled)": {
              bgcolor: "action.hover",
              transform: "translateY(-1px)",
            },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={
            submitting ||
            uploadingPhotos ||
            !name.trim() ||
            !placeType ||
            !location ||
            isSelectingLocation
          }
          sx={{
            textTransform: "none",
            fontWeight: 600,
            px: 4,
            py: 1,
            borderRadius: 1.5,
            bgcolor: PRIMARY_BLUE,
            color: "white",
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            transition: "all 0.2s ease-in-out",
            "&:hover:not(:disabled)": {
              bgcolor: PRIMARY_BLUE,
              opacity: 0.9,
              boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
            },
            "&:disabled": {
              bgcolor: "action.disabledBackground",
              color: "action.disabled",
            },
          }}
        >
          {submitting || uploadingPhotos ? (
            <>
              <CircularProgress size={20} sx={{ mr: 1, color: "white" }} />
              {uploadingPhotos ? "Uploading photos…" : "Saving…"}
            </>
          ) : (
            "Add Place"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

