"use client";

import { createTheme } from "@mui/material/styles";
import { PRIMARY_BLUE } from "../constants/constants.mjs";

// Create MUI theme with centralized primary color
export const theme = createTheme({
  palette: {
    primary: {
      main: PRIMARY_BLUE,
    },
  },
});








