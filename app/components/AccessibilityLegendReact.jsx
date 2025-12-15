"use client";

import { useEffect, useState } from "react";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";

import { BADGE_COLOR_BY_TIER } from "../constants/constants.mjs";

const ACCESSIBILITY_FILTER_LS_KEY = "ui.placeAccessibility.filter";
const ALL_TIERS = ["designated", "yes", "limited", "unknown", "no"];

// Display labels for accessibility tiers
const TIER_LABELS = {
  designated: "Designated",
  yes: "Wheelchair accessible",
  limited: "Limited",
  unknown: "Unknown",
  no: "No",
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

export default function AccessibilityLegendReact() {
  const [selected, setSelected] = useState(getInitialSelection);

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

    document.dispatchEvent(
      new CustomEvent("accessibilityFilterChanged", { detail: selected })
    );
  }, [selected]);

  const toggleTier = (tier) => {
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

  const getTierBorderColor = (tier, isSelected) => {
    const color = BADGE_COLOR_BY_TIER[tier] || BADGE_COLOR_BY_TIER.unknown;
    if (isSelected) {
      return getTierSolidColor(tier);
    }
    return "rgba(0,0,0,0.12)";
  };

  return (
    <Box mb={1.5}>
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
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {ALL_TIERS.map((tier) => {
          const isSelected = selected.includes(tier);
          const solidColor = getTierSolidColor(tier);
          const borderColor = getTierBorderColor(tier, isSelected);
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
                    color: isSelected ? "white" : "text.primary",
                  }}
                >
                  {label}
                </Typography>
              }
              onClick={() => toggleTier(tier)}
              sx={{
                height: 28,
                bgcolor: isSelected ? solidColor : "transparent",
                color: isSelected ? "white" : "text.primary",
                border: `1px solid ${borderColor}`,
                borderRadius: 3,
                cursor: "pointer",
                "&:hover": {
                  bgcolor: isSelected ? solidColor : "action.hover",
                  borderColor: solidColor,
                  opacity: isSelected ? 0.9 : 1,
                },
                "& .MuiChip-label": {
                  paddingLeft: 1.5,
                  paddingRight: 1.5,
                },
              }}
            />
          );
        })}
      </Stack>
    </Box>
  );
}
