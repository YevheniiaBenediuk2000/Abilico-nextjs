export const TAG_CHIP_SX = {
  height: "var(--tag-chip-height)",
  fontSize: "var(--tag-chip-font-size)",
  fontWeight: 500,
  backgroundColor: "var(--tag-chip-bg)",
  color: "var(--tag-chip-fg)",
  "& .MuiChip-label": {
    px: "var(--tag-chip-px)",
  },
};

export const TAG_CHIP_WITH_ICON_SX = {
  ...TAG_CHIP_SX,
  "& .MuiChip-icon": {
    marginLeft: "8px",
    marginRight: "-4px",
  },
};

export const TAG_CHIP_ICON_STYLE = {
  fontSize: "var(--tag-chip-icon-size)",
  color: "var(--tag-chip-fg)",
};







