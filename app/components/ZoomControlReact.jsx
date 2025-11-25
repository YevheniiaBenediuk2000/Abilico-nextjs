"use client";

import Paper from "@mui/material/Paper";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import Divider from "@mui/material/Divider";
import Box from "@mui/material/Box";

export default function ZoomControlReact({ onZoomIn, onZoomOut }) {
  const buttonSx = { py: 0.8, px: 0.8 };

  return (
    <Paper>
      <Box
        title="Zoom in"
        component="button"
        type="button"
        aria-label="Zoom in"
        onClick={onZoomIn}
        sx={{
          ...buttonSx,
          "&:hover": {
            bgcolor: "grey.100",
            borderTopLeftRadius: "4px",
            borderTopRightRadius: "4px",
          },
          "&:active": {
            bgcolor: "grey.200",
            borderTopLeftRadius: "4px",
            borderTopRightRadius: "4px",
          },
        }}
      >
        <AddIcon fontSize="small" />
      </Box>

      <Divider sx={{ borderColor: "rgba(0,0,0,0.4)" }} />

      <Box
        title="Zoom out"
        component="button"
        type="button"
        aria-label="Zoom out"
        onClick={onZoomOut}
        sx={{
          ...buttonSx,
          "&:hover": {
            bgcolor: "grey.100",
            borderBottomLeftRadius: "4px",
            borderBottomRightRadius: "4px",
          },
          "&:active": {
            bgcolor: "grey.200",
            borderBottomLeftRadius: "4px",
            borderBottomRightRadius: "4px",
          },
        }}
      >
        <RemoveIcon fontSize="small" />
      </Box>
    </Paper>
  );
}
