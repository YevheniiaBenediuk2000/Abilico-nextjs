"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

/**
 * React component for the expand/collapse icon in the draw toolbar dropdown button
 */
export default function DrawToolbarExpandIcon({ expanded }) {
  return expanded ? (
    <ExpandLessIcon fontSize="small" sx={{ color: "#464646" }} />
  ) : (
    <ExpandMoreIcon fontSize="small" sx={{ color: "#464646" }} />
  );
}

