/**
 * Road Accessibility Layer Component
 * Visualizes roads/paths with color-coded accessibility features
 */

"use client";

import { useState, useRef, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Switch from "@mui/material/Switch";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Paper from "@mui/material/Paper";
import IconButton from "@mui/material/IconButton";
import Collapse from "@mui/material/Collapse";
import CircularProgress from "@mui/material/CircularProgress";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import RouteIcon from "@mui/icons-material/Route";
import TerrainIcon from "@mui/icons-material/Terrain";
import StraightenIcon from "@mui/icons-material/Straighten";
import TextureIcon from "@mui/icons-material/Texture";
import GradientIcon from "@mui/icons-material/Gradient";

import {
  INCLINE_COLORS,
  WIDTH_COLORS,
  SMOOTHNESS_COLORS,
  getSurfaceLabel,
  getInclineLabel,
  getWidthLabel,
} from "../api/fetchRoadAccessibility";

// Visualization modes
export const VIZ_MODES = {
  OVERALL: "overall",
  SURFACE: "surface",
  INCLINE: "incline",
  WIDTH: "width",
  SMOOTHNESS: "smoothness",
};

// Legend configurations
const LEGENDS = {
  [VIZ_MODES.OVERALL]: {
    title: "Overall Accessibility",
    items: [
      { label: "Excellent (80-100)", color: "#2ecc71" },
      { label: "Good (60-80)", color: "#27ae60" },
      { label: "Moderate (40-60)", color: "#f1c40f" },
      { label: "Poor (20-40)", color: "#e67e22" },
      { label: "Very Poor (<20)", color: "#e74c3c" },
      { label: "Unknown", color: "#95a5a6" },
    ],
  },
  [VIZ_MODES.SURFACE]: {
    title: "Surface Type",
    items: [
      { label: "Asphalt/Concrete", color: "#2ecc71" },
      { label: "Paving Stones", color: "#3498db" },
      { label: "Compacted", color: "#f1c40f" },
      { label: "Gravel/Sett", color: "#e67e22" },
      { label: "Unpaved/Dirt", color: "#e74c3c" },
      { label: "Grass/Mud", color: "#c0392b" },
      { label: "Unknown", color: "#95a5a6" },
    ],
  },
  [VIZ_MODES.INCLINE]: {
    title: "Road Incline",
    items: [
      { label: "Flat (≤2%)", color: INCLINE_COLORS.flat },
      { label: "Gentle (2-5%)", color: INCLINE_COLORS.gentle },
      { label: "Moderate (5-8%)", color: INCLINE_COLORS.moderate },
      { label: "Steep (8-12%)", color: INCLINE_COLORS.steep },
      { label: "Very Steep (>12%)", color: INCLINE_COLORS.very_steep },
    ],
  },
  [VIZ_MODES.WIDTH]: {
    title: "Path Width",
    items: [
      { label: "Wide (>1.8m)", color: WIDTH_COLORS.wide },
      { label: "Adequate (1.2-1.8m)", color: WIDTH_COLORS.adequate },
      { label: "Narrow (0.9-1.2m)", color: WIDTH_COLORS.narrow },
      { label: "Very Narrow (<0.9m)", color: WIDTH_COLORS.very_narrow },
    ],
  },
  [VIZ_MODES.SMOOTHNESS]: {
    title: "Surface Smoothness",
    items: [
      { label: "Excellent", color: SMOOTHNESS_COLORS.excellent },
      { label: "Good", color: SMOOTHNESS_COLORS.good },
      { label: "Intermediate", color: SMOOTHNESS_COLORS.intermediate },
      { label: "Bad", color: SMOOTHNESS_COLORS.bad },
      { label: "Very Bad", color: SMOOTHNESS_COLORS.very_bad },
      { label: "Horrible", color: SMOOTHNESS_COLORS.horrible },
    ],
  },
};

export default function RoadAccessibilityLegend({
  enabled = false,
  onToggle,
  vizMode = VIZ_MODES.OVERALL,
  onVizModeChange,
  loading = false,
  predictionsEnabled = true,
  predictionsLoading = false,
  onPredictionsToggle,
  onnxReady = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const hasTriggeredPreload = useRef(false);

  // Trigger ONNX model preload on first hover
  const handleMouseEnter = useCallback(() => {
    if (
      !hasTriggeredPreload.current &&
      typeof window !== "undefined" &&
      window.preloadOnnxModelsInBackground
    ) {
      hasTriggeredPreload.current = true;
      console.log("🤖 [ONNX] Hover detected - starting model preload...");
      window.preloadOnnxModelsInBackground();
    }
  }, []);

  const legend = LEGENDS[vizMode] || LEGENDS[VIZ_MODES.OVERALL];

  return (
    <Paper
      elevation={2}
      onMouseEnter={handleMouseEnter}
      sx={{
        position: "absolute",
        bottom: 170,
        right: 10,
        zIndex: 1000,
        minWidth: 200,
        maxWidth: 280,
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 1.5,
          bgcolor: "background.default",
          borderBottom: expanded ? 1 : 0,
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {loading ? (
            <CircularProgress size={20} color="primary" />
          ) : (
            <RouteIcon color="primary" />
          )}
          <Typography variant="subtitle2" fontWeight={600}>
            Road Accessibility
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Switch
            size="small"
            checked={enabled}
            onChange={(e) => onToggle?.(e.target.checked)}
            disabled={loading}
          />
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>
      </Box>

      {/* Expandable Content */}
      <Collapse in={expanded}>
        <Box sx={{ p: 1.5, pt: 1 }}>
          {/* Visualization Mode Selector */}
          <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
            <InputLabel>Color By</InputLabel>
            <Select
              value={vizMode}
              label="Color By"
              onChange={(e) => onVizModeChange?.(e.target.value)}
            >
              <MenuItem value={VIZ_MODES.OVERALL}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <RouteIcon fontSize="small" />
                  Overall Score
                </Box>
              </MenuItem>
              <MenuItem value={VIZ_MODES.SURFACE}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <TextureIcon fontSize="small" />
                  Surface Type
                </Box>
              </MenuItem>
              <MenuItem value={VIZ_MODES.INCLINE}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <TerrainIcon fontSize="small" />
                  Incline
                </Box>
              </MenuItem>
              <MenuItem value={VIZ_MODES.WIDTH}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <StraightenIcon fontSize="small" />
                  Path Width
                </Box>
              </MenuItem>
              <MenuItem value={VIZ_MODES.SMOOTHNESS}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <GradientIcon fontSize="small" />
                  Smoothness
                </Box>
              </MenuItem>
            </Select>
          </FormControl>

          {/* Legend */}
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight={500}
            sx={{ mb: 0.5, display: "block" }}
          >
            {legend.title}
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {legend.items.map((item) => (
              <Box
                key={item.label}
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <Box
                  sx={{
                    width: 24,
                    height: 4,
                    bgcolor: item.color,
                    borderRadius: 1,
                  }}
                />
                <Typography variant="caption" color="text.secondary">
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* ML Predictions Toggle */}
          <Box
            sx={{
              mt: 1.5,
              pt: 1,
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
                {predictionsLoading ? (
                  <CircularProgress size={12} sx={{ mr: 0.5 }} />
                ) : (
                  <Typography variant="caption" component="span">
                    🤖
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  ML Predictions
                </Typography>
                {predictionsLoading ? (
                  <Typography
                    variant="caption"
                    sx={{
                      bgcolor: "info.light",
                      color: "info.contrastText",
                      px: 0.5,
                      borderRadius: 0.5,
                      fontSize: "9px",
                    }}
                  >
                    Loading...
                  </Typography>
                ) : onnxReady ? (
                  <Typography
                    variant="caption"
                    sx={{
                      bgcolor: "success.light",
                      color: "success.contrastText",
                      px: 0.5,
                      borderRadius: 0.5,
                      fontSize: "9px",
                    }}
                  >
                    Ready
                  </Typography>
                ) : null}
              </Box>
              <Switch
                size="small"
                checked={predictionsEnabled}
                onChange={(e) => onPredictionsToggle?.(e.target.checked)}
                disabled={!enabled}
              />
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: "10px", display: "block", mt: 0.5 }}
            >
              {predictionsLoading
                ? "Predicting accessibility data..."
                : "Predicts missing surface, smoothness, width & incline data"}
            </Typography>
            {predictionsEnabled && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  mt: 0.5,
                }}
              >
                <Box
                  sx={{
                    width: 24,
                    height: 0,
                    borderTop: "2px dashed #666",
                  }}
                />
                <Typography variant="caption" color="text.secondary">
                  Dashed = Predicted
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
}

/**
 * Get the color for a road feature based on visualization mode
 */
export function getRoadColor(feature, vizMode) {
  const props = feature.properties || {};

  switch (vizMode) {
    case VIZ_MODES.SURFACE:
      return props._surfaceColor || "#95a5a6";
    case VIZ_MODES.INCLINE:
      return props._inclineColor || "#95a5a6";
    case VIZ_MODES.WIDTH:
      return props._widthColor || "#95a5a6";
    case VIZ_MODES.SMOOTHNESS:
      return props._smoothnessColor || "#95a5a6";
    case VIZ_MODES.OVERALL:
    default:
      return props._overallColor || "#95a5a6";
  }
}

/**
 * Get popup content for a road feature
 */
export function getRoadPopupContent(feature) {
  const props = feature.properties || {};

  const items = [];

  if (props.name) {
    items.push(`<strong>${props.name}</strong>`);
  }

  if (props.highway) {
    items.push(`<b>Type:</b> ${formatHighway(props.highway)}`);
  }

  if (props.surface) {
    items.push(`<b>Surface:</b> ${getSurfaceLabel(props.surface)}`);
  }

  if (props.incline) {
    items.push(`<b>Incline:</b> ${getInclineLabel(props.incline)}`);
  }

  if (props.width) {
    items.push(`<b>Width:</b> ${getWidthLabel(props.width)}`);
  }

  if (props.smoothness) {
    items.push(`<b>Smoothness:</b> ${formatSmoothness(props.smoothness)}`);
  }

  if (props.lit) {
    items.push(`<b>Lit:</b> ${props.lit === "yes" ? "✓ Yes" : "✗ No"}`);
  }

  if (props.tactile_paving) {
    items.push(
      `<b>Tactile Paving:</b> ${
        props.tactile_paving === "yes" ? "✓ Yes" : "✗ No"
      }`
    );
  }

  if (props.kerb) {
    items.push(`<b>Kerb:</b> ${formatKerb(props.kerb)}`);
  }

  if (
    props._accessibilityScore !== null &&
    props._accessibilityScore !== undefined
  ) {
    const score = props._accessibilityScore;
    const color = props._overallColor || "#95a5a6";
    items.push(
      `<b>Accessibility Score:</b> <span style="color:${color};font-weight:bold">${score}/100</span>`
    );
  }

  return `<div style="font-size:13px;line-height:1.6">${items.join(
    "<br/>"
  )}</div>`;
}

function formatHighway(highway) {
  const labels = {
    footway: "Footway",
    path: "Path",
    pedestrian: "Pedestrian Area",
    cycleway: "Cycleway",
    steps: "Steps",
    corridor: "Corridor",
    crossing: "Crossing",
    sidewalk: "Sidewalk",
    living_street: "Living Street",
    residential: "Residential Road",
    service: "Service Road",
    track: "Track",
  };
  return labels[highway] || highway;
}

function formatSmoothness(smoothness) {
  const labels = {
    excellent: "Excellent",
    good: "Good",
    intermediate: "Intermediate",
    bad: "Bad",
    very_bad: "Very Bad",
    horrible: "Horrible",
    very_horrible: "Very Horrible",
    impassable: "Impassable",
  };
  return labels[smoothness?.toLowerCase()] || smoothness;
}

function formatKerb(kerb) {
  const labels = {
    flush: "Flush (level)",
    lowered: "Lowered",
    raised: "Raised",
    rolled: "Rolled",
    no: "None",
    yes: "Present",
  };
  return labels[kerb?.toLowerCase()] || kerb;
}
