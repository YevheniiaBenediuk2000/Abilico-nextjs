"use client";

import { useEffect, useState } from "react";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Switch from "@mui/material/Switch";

const ACCESSIBILITY_FILTER_LS_KEY = "ui.placeAccessibility.filter";
const ML_PREDICTIONS_LS_KEY = "ui.placeAccessibility.mlPredictions";
const ALL_TIERS = ["designated", "yes", "limited", "unknown", "no"];

// Display labels for accessibility tiers
const TIER_LABELS = {
  designated: "Designated accessible",
  yes: "Wheelchair accessible",
  limited: "Partially accessible",
  unknown: "Not specified",
  no: "Not accessible",
};

function getInitialSelection() {
  if (typeof window === "undefined") return ALL_TIERS;

  try {
    const raw = window.localStorage.getItem(ACCESSIBILITY_FILTER_LS_KEY);
    if (!raw) return ALL_TIERS;

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Keep only known tiers
      const filtered = parsed.filter((t) => ALL_TIERS.includes(t));
      if (filtered.length) return filtered;
    }
  } catch {
    // ignore parse errors
  }

  return ALL_TIERS;
}

function getInitialMlPredictionsEnabled() {
  if (typeof window === "undefined") return true;

  try {
    const raw = window.localStorage.getItem(ML_PREDICTIONS_LS_KEY);
    if (raw === null) return true; // default to enabled
    return JSON.parse(raw) !== false;
  } catch {
    return true;
  }
}

export default function AccessibilityLegendReact({ hideTitle = false }) {
  const [selected, setSelected] = useState(getInitialSelection);
  const [mlPredictionsEnabled, setMlPredictionsEnabled] = useState(getInitialMlPredictionsEnabled);

  // Persist + notify mapMain.js whenever selection changes
  useEffect(() => {
    try {
      window.localStorage.setItem(
        ACCESSIBILITY_FILTER_LS_KEY,
        JSON.stringify(selected)
      );
    } catch {
      // ignore storage errors
    }

    console.log("🎯 Dispatching accessibilityFilterChanged:", selected);
    document.dispatchEvent(
      new CustomEvent("accessibilityFilterChanged", { detail: selected })
    );
  }, [selected]);

  // Persist + notify mapMain.js whenever ML predictions toggle changes
  useEffect(() => {
    try {
      window.localStorage.setItem(
        ML_PREDICTIONS_LS_KEY,
        JSON.stringify(mlPredictionsEnabled)
      );
    } catch {
      // ignore storage errors
    }

    console.log("🤖 Dispatching mlPredictionsEnabledChanged:", mlPredictionsEnabled);
    document.dispatchEvent(
      new CustomEvent("mlPredictionsEnabledChanged", { detail: mlPredictionsEnabled })
    );
  }, [mlPredictionsEnabled]);

  const toggleTier = (tier) => {
    console.log("🎯 Toggling tier:", tier);
    setSelected((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]
    );
  };

  // Map tier colors to actual hex values for solid backgrounds (for accessibility contrast)
  const TIER_SOLID_COLORS = {
    designated: "#16a34a", // green
    yes: "#6cc24a", // green (darker)
    limited: "#ffc107", // amber/yellow (Bootstrap warning)
    unknown: "#6c757d", // slate/gray (Bootstrap tertiary)
    no: "#dc3545", // red (Bootstrap danger)
  };

  const getTierSolidColor = (tier) => {
    return TIER_SOLID_COLORS[tier] || TIER_SOLID_COLORS.unknown;
  };

  // Helper to convert hex to rgba with opacity
  const hexToRgba = (hex, opacity) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  const firstRowTiers = ["designated", "yes", "limited"];
  const secondRowTiers = ["unknown", "no"];

  return (
    <Box mb={1.5}>
      {!hideTitle && (
        <Typography
          variant="overline"
          sx={{
            color: "text.primary",
            fontWeight: 600,
            letterSpacing: 1,
            fontSize: "0.7rem",
            mb: 1.5,
            display: "block",
          }}
        >
          PLACE ACCESSIBILITY
        </Typography>
      )}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        {/* First row: Designated accessible, Wheelchair accessible, Partially accessible */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            gap: 1,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {firstRowTiers.map((tier) => {
            const isSelected = selected.includes(tier);
            const solidColor = getTierSolidColor(tier);
            const label = TIER_LABELS[tier] || tier;

            return (
              <Chip
                key={tier}
                label={
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.8125rem",
                      fontWeight: isSelected ? 500 : 400,
                      color: isSelected ? "white" : solidColor,
                    }}
                  >
                    {label}
                  </Typography>
                }
                onClick={() => toggleTier(tier)}
                sx={{
                  height: 28,
                  bgcolor: isSelected ? solidColor : "transparent",
                  color: isSelected ? "white" : solidColor,
                  border: `1px solid ${solidColor}`,
                  borderRadius: 3,
                  cursor: "pointer",
                  opacity: isSelected ? 1 : 0.6,
                  "&:hover": {
                    bgcolor: isSelected
                      ? solidColor
                      : hexToRgba(solidColor, 0.1),
                    borderColor: solidColor,
                    opacity: isSelected ? 0.9 : 0.8,
                  },
                  "& .MuiChip-label": {
                    paddingLeft: 1.5,
                    paddingRight: 1.5,
                  },
                }}
              />
            );
          })}
        </Box>

        {/* Second row: Not specified, Not accessible */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            gap: 1,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {secondRowTiers.map((tier) => {
            const isSelected = selected.includes(tier);
            const solidColor = getTierSolidColor(tier);
            const label = TIER_LABELS[tier] || tier;

            return (
              <Chip
                key={tier}
                label={
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.8125rem",
                      fontWeight: isSelected ? 500 : 400,
                      color: isSelected ? "white" : solidColor,
                    }}
                  >
                    {label}
                  </Typography>
                }
                onClick={() => toggleTier(tier)}
                sx={{
                  height: 28,
                  bgcolor: isSelected ? solidColor : "transparent",
                  color: isSelected ? "white" : solidColor,
                  border: `1px solid ${solidColor}`,
                  borderRadius: 3,
                  cursor: "pointer",
                  opacity: isSelected ? 1 : 0.6,
                  "&:hover": {
                    bgcolor: isSelected
                      ? solidColor
                      : hexToRgba(solidColor, 0.1),
                    borderColor: solidColor,
                    opacity: isSelected ? 0.9 : 0.8,
                  },
                  "& .MuiChip-label": {
                    paddingLeft: 1.5,
                    paddingRight: 1.5,
                  },
                }}
              />
            );
          })}
        </Box>

        {/* ML Predictions Toggle */}
        <Box
          sx={{
            mt: 1,
            pt: 1.5,
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography variant="caption" component="span">
                ✨
              </Typography>
              <Typography variant="caption" color="text.secondary">
                AI Predictions
              </Typography>
            </Box>
            <Switch
              size="small"
              checked={mlPredictionsEnabled}
              onChange={(e) => setMlPredictionsEnabled(e.target.checked)}
            />
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: "10px", display: "block", mt: 0.5 }}
          >
            Predicts accessibility for places without wheelchair data
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
