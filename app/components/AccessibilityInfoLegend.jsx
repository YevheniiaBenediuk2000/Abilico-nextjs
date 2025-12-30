"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import InfoIcon from "@mui/icons-material/Info";

// Tier labels and descriptions
const TIER_INFO = [
  {
    tier: "designated",
    label: "Designated",
    description: "Officially marked accessible",
    color: "#16a34a", // green
    emoji: "🟢",
  },
  {
    tier: "yes",
    label: "Wheelchair accessible",
    description: "Step-free, usable for most wheelchairs",
    color: "#6cc24a", // green (darker)
    emoji: "🟢",
  },
  {
    tier: "limited",
    label: "Limited",
    description: "Some barriers",
    color: "#ffc107", // amber/yellow
    emoji: "🟡",
  },
  {
    tier: "unknown",
    label: "Unknown",
    description: "Accessibility not checked",
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
  // Fixed positioning requested by UI spec / DOM snapshot:
  // bottom: 110px; right: 10px;
  const LEGEND_RIGHT = 10;
  const LEGEND_BOTTOM = 110;
  // Slightly larger than zoom buttons (zoom uses 36px)
  const LEGEND_BUTTON_SIZE = 40;

  if (!open) {
    return (
      <Box
        sx={{
          position: "fixed",
          bottom: LEGEND_BOTTOM,
          right: LEGEND_RIGHT,
          zIndex: 1001,
        }}
      >
        <IconButton
          onClick={() => setOpen(true)}
          sx={{
            backgroundColor: "white",
            border: "1px solid rgba(0,0,0,0.12)",
            boxShadow:
              "0 2px 1px -1px rgba(0,0,0,0.2), 0px 1px 1px 0px rgba(0,0,0,0.14), 0px 1px 3px 0px rgba(0,0,0,0.12)",
            borderRadius: 1,
            width: LEGEND_BUTTON_SIZE,
            height: LEGEND_BUTTON_SIZE,
            minWidth: LEGEND_BUTTON_SIZE,
            padding: 0,
            "&:hover": {
              backgroundColor: "#f5f5f5",
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
        bottom: LEGEND_BOTTOM,
        right: LEGEND_RIGHT,
        zIndex: 1001,
        width: { xs: "calc(100vw - 20px)", sm: 360 },
        maxWidth: 380,
      }}
    >
      <Card
        sx={{
          boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
          borderRadius: 3,
          border: "1px solid",
          borderColor: "rgba(0, 0, 0, 0.08)",
          overflow: "hidden",
          maxHeight: "65vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <CardContent
          sx={{
            p: 2.25,
            "&:last-child": { pb: 2.25 },
            overflowY: "auto",
          }}
        >
          {/* Header */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 1.5,
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontSize: "1rem",
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
                width: 36,
                height: 36,
                "&:hover": {
                  backgroundColor: "rgba(0, 0, 0, 0.04)",
                },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Legend items */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
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
                      lineHeight: 1.4,
                    }}
                  >
                    {info.label}{" "}
                    <Box
                      component="span"
                      sx={{ fontWeight: 400, color: "rgba(0, 0, 0, 0.6)" }}
                    >
                      – {info.description}
                    </Box>
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>

          {/* Explanation */}
          <Box
            sx={{
              mt: 1.5,
              pt: 1.5,
              borderTop: "1px solid",
              borderColor: "rgba(0, 0, 0, 0.12)",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontSize: "0.75rem",
                color: "rgba(0, 0, 0, 0.6)",
                lineHeight: 1.6,
              }}
            >
              Icon shape = place type
              <br />
              Color = wheelchair accessibility
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
