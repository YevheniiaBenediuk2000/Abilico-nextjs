"use client";

import { useEffect, useState } from "react";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";

import { BADGE_COLOR_BY_TIER } from "../constants/constants.mjs";

const ACCESSIBILITY_FILTER_LS_KEY = "ui.placeAccessibility.filter";
const ALL_TIERS = ["designated", "yes", "limited", "unknown", "no"];

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

  // Map tier colors to actual hex values for background colors
  const TIER_BG_COLORS = {
    designated: "rgba(22, 163, 74, 0.15)", // #16a34a with opacity
    yes: "rgba(108, 194, 74, 0.15)", // #6cc24a with opacity
    limited: "rgba(255, 193, 7, 0.15)", // amber/yellow with opacity
    unknown: "rgba(108, 117, 125, 0.15)", // slate/gray with opacity
    no: "rgba(220, 53, 69, 0.15)", // red with opacity
  };

  const getTierColor = (tier) => {
    return TIER_BG_COLORS[tier] || TIER_BG_COLORS.unknown;
  };

  const getTierBorderColor = (tier, isSelected) => {
    const color = BADGE_COLOR_BY_TIER[tier] || BADGE_COLOR_BY_TIER.unknown;
    if (isSelected) {
      // For CSS variables, we'll use the color directly and let CSS handle it
      // For hex colors, use them directly
      return color;
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
          const color = BADGE_COLOR_BY_TIER[tier] || BADGE_COLOR_BY_TIER.unknown;
          const bgColor = getTierColor(tier);
          const borderColor = getTierBorderColor(tier, isSelected);

          return (
            <Chip
              key={tier}
              icon={
                isSelected ? (
                  <CheckCircleIcon
                    sx={{
                      fontSize: 18,
                      color: color,
                    }}
                  />
                ) : (
                  <RadioButtonUncheckedIcon
                    sx={{
                      fontSize: 18,
                      color: color,
                      opacity: 0.6,
                    }}
                  />
                )
              }
              label={
                <Typography
                  variant="body2"
                  sx={{
                    textTransform: "capitalize",
                    fontSize: "0.875rem",
                    fontWeight: isSelected ? 500 : 400,
                    color: "text.primary",
                  }}
                >
                  {tier}
                </Typography>
              }
              onClick={() => toggleTier(tier)}
              sx={{
                height: 36,
                bgcolor: isSelected ? bgColor : "transparent",
                border: `1px solid ${borderColor}`,
                borderRadius: 1,
                cursor: "pointer",
                "&:hover": {
                  bgcolor: isSelected ? bgColor : "action.hover",
                  borderColor: color,
                },
                "& .MuiChip-icon": {
                  marginLeft: 1,
                },
                "& .MuiChip-label": {
                  paddingLeft: 1,
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
