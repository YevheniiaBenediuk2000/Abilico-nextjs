"use client";

import Paper from "@mui/material/Paper";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import Divider from "@mui/material/Divider";
import { Button } from "@mui/material";

export default function ZoomControlReact({ onZoomIn, onZoomOut }) {
  const borderRadius = 1;
  const commonButtonSx = {
    minWidth: "36px",
    width: "100%",
    height: "36px",
    color: "text.primary",
    "&:hover": { bgcolor: "action.hover" },
  };

  return (
    <Paper
      sx={{
        border: "1px solid rgba(0,0,0,0.12)",
      }}
    >
      <Button
        title="Zoom in"
        onClick={onZoomIn}
        aria-label="Zoom in"
        size="small"
        sx={{
          ...commonButtonSx,
          borderTopLeftRadius: (theme) =>
            `calc(${theme.shape.borderRadius}px * ${borderRadius})`,
          borderTopRightRadius: (theme) =>
            `calc(${theme.shape.borderRadius}px * ${borderRadius})`,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
        }}
      >
        <AddIcon />
      </Button>

      <Divider />

      <Button
        title="Zoom out"
        onClick={onZoomOut}
        aria-label="Zoom out"
        size="small"
        sx={{
          ...commonButtonSx,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: (theme) =>
            `calc(${theme.shape.borderRadius}px * ${borderRadius})`,
          borderBottomRightRadius: (theme) =>
            `calc(${theme.shape.borderRadius}px * ${borderRadius})`,
        }}
      >
        <RemoveIcon />
      </Button>
    </Paper>
  );
}
