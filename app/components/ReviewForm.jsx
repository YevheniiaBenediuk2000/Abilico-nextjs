"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Rating from "@mui/material/Rating";
import Divider from "@mui/material/Divider";
import FormHelperText from "@mui/material/FormHelperText";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { ACCESSIBILITY_CATEGORIES } from "../constants/accessibilityCategories";
import { reviewStorage, ensurePlaceExists } from "../api/reviewStorage";

export default function ReviewForm() {
  const [overallRating, setOverallRating] = useState(0);
  // Initialize categoryRatings with all categories from ACCESSIBILITY_CATEGORIES
  const [categoryRatings, setCategoryRatings] = useState(() => {
    const initial = {};
    ACCESSIBILITY_CATEGORIES.forEach((cat) => {
      initial[cat.id] = 0;
    });
    return initial;
  });
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);

  const categoriesById = ACCESSIBILITY_CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = cat;
    return acc;
  }, {});

  // Primary: keep the form lightweight. Secondary: optional details.
  const primaryCategoryIds = ["entrance", "indoor_mobility", "restroom", "staff"];
  const secondaryCategoryIds = [
    "seating",
    "parking",
    "visual_auditory",
    "emergency",
  ];

  const primaryCategories = primaryCategoryIds
    .map((id) => categoriesById[id])
    .filter(Boolean);
  const secondaryCategories = secondaryCategoryIds
    .map((id) => categoriesById[id])
    .filter(Boolean);

  const handleCategoryRatingChange = (key, value) => {
    setCategoryRatings((prev) => ({
      ...prev,
      [key]: value || 0,
    }));
  };

  const renderCategoryRating = (cat) => {
    return (
      <Box key={cat.id}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 0.5,
            gap: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography variant="body2">{cat.label}</Typography>
            {cat.helperText && (
              <Tooltip title={cat.helperText} arrow placement="top">
                <IconButton
                  size="small"
                  aria-label={`More info about ${cat.label}`}
                  sx={{ color: "text.secondary" }}
                >
                  <InfoOutlinedIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          <Rating
            value={categoryRatings[cat.id] || 0}
            precision={0.5}
            onChange={(_, newValue) => {
              handleCategoryRatingChange(cat.id, newValue);
            }}
            size="small"
          />
        </Box>
      </Box>
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (overallRating === 0) {
      setError("Please give an overall rating.");
      return;
    }

    // Get place context from globals (set by mapMain.js)
    const globals = typeof window !== "undefined" ? window.globals : null;
    if (!globals?.detailsCtx) {
      setError("No place selected. Please select a place first.");
      return;
    }

    setSubmitting(true);

    try {
      // Get or create place ID
      let placeId = globals.detailsCtx.placeId;

      // If placeId is not set, try to get/create it using tags and latlng
      if (!placeId) {
        if (!globals.detailsCtx.tags || !globals.detailsCtx.latlng) {
          console.error("Missing place context:", {
            hasTags: !!globals.detailsCtx.tags,
            hasLatlng: !!globals.detailsCtx.latlng,
            placeId: globals.detailsCtx.placeId,
            detailsCtx: globals.detailsCtx,
          });
          throw new Error(
            "Place information is missing. Please select a place again."
          );
        }

        // Normalize latlng - handle both Leaflet LatLng objects and plain objects
        let normalizedLatlng = globals.detailsCtx.latlng;
        if (normalizedLatlng && typeof normalizedLatlng === "object") {
          // Extract lat/lng - works for both Leaflet LatLng and plain objects
          if (
            normalizedLatlng.lat !== undefined &&
            normalizedLatlng.lng !== undefined
          ) {
            normalizedLatlng = {
              lat: Number(normalizedLatlng.lat),
              lng: Number(normalizedLatlng.lng),
            };
          }
        }

        if (!normalizedLatlng?.lat || !normalizedLatlng?.lng) {
          console.error("Invalid latlng format:", globals.detailsCtx.latlng);
          throw new Error(
            "Invalid location data. Please select a place again."
          );
        }

        try {
          placeId = await ensurePlaceExists(
            globals.detailsCtx.tags,
            normalizedLatlng
          );

          // Update globals with the newly created/found placeId
          if (placeId) {
            globals.detailsCtx.placeId = placeId;
          }
        } catch (ensureErr) {
          console.error("Failed to ensure place exists:", ensureErr);
          throw new Error(
            `Could not create or find place: ${ensureErr.message || ensureErr}`
          );
        }
      }

      if (!placeId) {
        throw new Error("Could not determine place ID");
      }

      // Filter out categories with 0 rating for cleaner data
      const categoriesWithRatings = Object.entries(categoryRatings).reduce(
        (acc, [key, value]) => {
          if (value > 0) {
            acc[key] = value;
          }
          return acc;
        },
        {}
      );

      // Prepare review data
      const reviewData = {
        text: comment.trim() || null,
        place_id: placeId,
        rating: overallRating,
        category_ratings:
          Object.keys(categoriesWithRatings).length > 0
            ? categoriesWithRatings
            : null,
      };

      // Submit review
      await reviewStorage("POST", reviewData);

      // Dispatch event to refresh reviews list (handled by mapMain.js)
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("review-submitted", { detail: { placeId } })
        );
      }

      // Reset form
      setOverallRating(0);
      const resetRatings = {};
      ACCESSIBILITY_CATEGORIES.forEach((cat) => {
        resetRatings[cat.id] = 0;
      });
      setCategoryRatings(resetRatings);
      setComment("");
      setError("");
    } catch (err) {
      console.error("Failed to submit review:", err);
      setError("Could not save your review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      id="review-form"
      component="form"
      onSubmit={handleSubmit}
      sx={{ display: "flex", flexDirection: "column", gap: 2 }}
    >
      <Typography variant="h6" sx={{ mb: 1 }}>
        Rate this place
      </Typography>

      {/* Overall Rating - Required */}
      <Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 0.5,
          }}
        >
          <Typography variant="body2">
            Overall{" "}
            <Typography component="span" color="error">
              *
            </Typography>
          </Typography>
          <Rating
            value={overallRating}
            precision={0.5}
            onChange={(_, newValue) => {
              setOverallRating(newValue || 0);
              setError("");
            }}
            size="medium"
          />
        </Box>
        {error && overallRating === 0 && (
          <FormHelperText error sx={{ mt: 0.5 }}>
            Overall rating is required.
          </FormHelperText>
        )}
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* Category Ratings - Optional */}
      {primaryCategories.map(renderCategoryRating)}

      {secondaryCategories.length > 0 && (
        <Box sx={{ mt: 0.5 }}>
          <Button
            type="button"
            variant="text"
            size="small"
            onClick={() => setShowMoreDetails((v) => !v)}
            sx={{ px: 0, textTransform: "none" }}
          >
            {showMoreDetails
              ? "Hide accessibility details"
              : "More accessibility details"}
          </Button>
          <Collapse in={showMoreDetails} timeout="auto" unmountOnExit>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
              {secondaryCategories.map(renderCategoryRating)}
            </Box>
          </Collapse>
        </Box>
      )}

      {/* Comment Field - Optional */}
      <TextField
        label="Your comments (optional)"
        placeholder="E.g. entrance step, toilet space, staff, etc."
        multiline
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        fullWidth
      />

      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}

      <Button
        type="submit"
        variant="contained"
        disabled={submitting || overallRating === 0}
        fullWidth
      >
        {submitting ? (
          <>
            <CircularProgress size={20} sx={{ mr: 1 }} />
            Saving…
          </>
        ) : (
          "Submit Review"
        )}
      </Button>
    </Box>
  );
}
