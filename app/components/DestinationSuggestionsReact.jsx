"use client";

import Paper from "@mui/material/Paper";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";

export default function DestinationSuggestionsReact({
  items,
  loading,
  onSelect,
}) {
  // Loading state
  if (loading) {
    return (
      <Paper elevation={3}>
        <Box display="flex" alignItems="center" gap={1} px={2} py={1.5}>
          <CircularProgress size={16} />
          <Typography variant="body2">Searching…</Typography>
        </Box>
      </Paper>
    );
  }

  // No-results state
  if (!items || items.length === 0) {
    return (
      <Paper elevation={3}>
        <Box px={2} py={1.5}>
          <Typography variant="body2" color="text.secondary">
            No results
          </Typography>
        </Box>
      </Paper>
    );
  }

  // Normal list
  return (
    <Paper elevation={3}>
      <List dense role="listbox" sx={{ maxHeight: 320, overflowY: "auto" }}>
        {items.map((item, idx) => (
          <ListItemButton
            key={idx}
            role="option"
            onClick={() => onSelect(item)}
          >
            <ListItemText
              primary={item.name}
              // secondary text if you want more info:
              // secondary={item.properties?.city || item.properties?.country}
            />
          </ListItemButton>
        ))}
      </List>
    </Paper>
  );
}
