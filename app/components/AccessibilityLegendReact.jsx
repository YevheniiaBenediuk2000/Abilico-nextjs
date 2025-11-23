"use client";

import { useEffect, useState } from "react";

import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Stack from "@mui/material/Stack";

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

  return (
    <Card id="accessibility-legend" elevation={3} sx={{ minWidth: 220 }}>
      <CardContent sx={{ "&:last-child": { pb: 2 } }}>
        <Typography variant="subtitle2" gutterBottom>
          Place Accessibility
        </Typography>

        <FormGroup>
          <Stack direction="row" spacing={1}>
            {ALL_TIERS.map((tier) => {
              const color =
                BADGE_COLOR_BY_TIER[tier] || BADGE_COLOR_BY_TIER.unknown;

              return (
                <FormControlLabel
                  key={tier}
                  control={
                    <Checkbox
                      size="small"
                      checked={selected.includes(tier)}
                      onChange={() => toggleTier(tier)}
                      sx={{ p: 0.5, color, "&.Mui-checked": { color } }}
                    />
                  }
                  label={tier}
                  sx={{
                    ".MuiFormControlLabel-label": {
                      textTransform: "capitalize",
                      fontSize: "0.75rem",
                    },
                  }}
                />
              );
            })}
          </Stack>
        </FormGroup>
      </CardContent>
    </Card>
  );
}
