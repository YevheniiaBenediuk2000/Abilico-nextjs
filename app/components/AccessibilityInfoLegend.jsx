"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import InfoIcon from "@mui/icons-material/Info";

import { BADGE_COLOR_BY_TIER } from "../constants/constants.mjs";

// Tier labels and descriptions
const TIER_INFO = [
  {
    tier: "designated",
    label: "Accessible",
    description: "Step-free or mostly wheelchair-friendly",
    color: "#16a34a", // green
    emoji: "🟢",
  },
  {
    tier: "yes",
    label: "Accessible",
    description: "Step-free or mostly wheelchair-friendly",
    color: "#6cc24a", // green (darker)
    emoji: "🟢",
  },
  {
    tier: "limited",
    label: "Limited access",
    description: "Barriers or only partial accessibility",
    color: "#ffc107", // amber/yellow
    emoji: "🟡",
  },
  {
    tier: "unknown",
    label: "Unknown",
    description: "No reliable accessibility information yet",
    color: "#6c757d", // slate/gray
    emoji: "⚪️",
  },
  {
    tier: "no",
    label: "No access",
    description: "Not suitable for wheelchair users",
    color: "#dc3545", // red
    emoji: "🔴",
  },
];

export default function AccessibilityInfoLegend() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Box
        sx={{
          position: "fixed",
          bottom: 16,
          left: 16,
          zIndex: 1000,
        }}
      >
        <IconButton
          onClick={() => setOpen(true)}
          sx={{
            backgroundColor: "white",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)",
            borderRadius: 2,
            width: 40,
            height: 40,
            "&:hover": {
              backgroundColor: "rgba(255,255,255,0.95)",
              boxShadow: "0 6px 16px rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.12)",
              transform: "translateY(-1px)",
            },
            transition: "all 0.2s ease-in-out",
          }}
          aria-label="Show accessibility legend"
        >
          <InfoIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 16,
        left: 16,
        zIndex: 1000,
        maxWidth: 320,
      }}
    >
      <Card
        sx={{
          boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
          borderRadius: 3,
          border: "1px solid",
          borderColor: "rgba(0, 0, 0, 0.08)",
          overflow: "hidden",
        }}
      >
        <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
          {/* Header */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 3,
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "rgba(0, 0, 0, 0.87)",
                letterSpacing: "-0.01em",
              }}
            >
              Accessibility legend
            </Typography>
            <IconButton
              size="small"
              onClick={() => setOpen(false)}
              aria-label="Close legend"
              sx={{
                color: "rgba(0, 0, 0, 0.6)",
                "&:hover": {
                  backgroundColor: "rgba(0, 0, 0, 0.04)",
                },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Legend items */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {TIER_INFO.map((info) => (
              <Box
                key={info.tier}
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 2,
                }}
              >
                {/* Color indicator */}
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    backgroundColor: info.color,
                    flexShrink: 0,
                    mt: 0.125,
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                    border: "2px solid white",
                  }}
                />
                {/* Text */}
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      color: "rgba(0, 0, 0, 0.87)",
                      mb: 0.5,
                      lineHeight: 1.4,
                    }}
                  >
                    {info.label}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: "0.8125rem",
                      color: "rgba(0, 0, 0, 0.6)",
                      lineHeight: 1.5,
                    }}
                  >
                    {info.description}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>

          {/* Explanation */}
          <Box
            sx={{
              mt: 3,
              pt: 3,
              borderTop: "1px solid",
              borderColor: "rgba(0, 0, 0, 0.12)",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontSize: "0.8125rem",
                color: "rgba(0, 0, 0, 0.6)",
                lineHeight: 1.6,
              }}
            >
              <strong>Icon shape</strong> = place type
              <br />
              <strong>Color</strong> = wheelchair accessibility
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

