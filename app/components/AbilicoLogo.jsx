"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { PRIMARY_BLUE } from "../constants/constants.mjs";

/**
 * Reusable Abilico Logo Component
 * Displays the logo image with "ABILICO" text below it
 * Clickable - redirects to the main map page
 * 
 * @param {Object} props
 * @param {number} [props.logoHeight=48] - Height of the logo image in pixels
 * @param {string} [props.logoPath="/logo.png"] - Path to the logo image
 * @param {boolean} [props.showText=true] - Whether to show the "ABILICO" text
 * @param {string} [props.textColor] - Color of the text (defaults to PRIMARY_BLUE)
 * @param {string} [props.fontSize="14px"] - Font size of the text
 * @param {Object} [props.sx] - Additional MUI sx props to apply to the container
 */
export default function AbilicoLogo({
  logoHeight = 48,
  logoPath = "/logo.png",
  showText = true,
  textColor = PRIMARY_BLUE,
  fontSize = "14px",
  sx = {},
}) {
  const router = useRouter();

  const handleClick = () => {
    router.push("/");
  };

  return (
    <Box
      onClick={handleClick}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        ...sx,
      }}
    >
      <Box
        component="img"
        src={logoPath}
        alt="Abilico Logo"
        sx={{
          width: "auto",
          height: logoHeight,
          objectFit: "contain",
          mb: showText ? 1 : 0,
        }}
      />
      {showText && (
        <Typography
          sx={{
            fontFamily: '"Work Sans", sans-serif',
            fontWeight: 800, // ExtraBold
            fontSize: fontSize,
            letterSpacing: "5%",
            color: textColor,
            textAlign: "left",
            textTransform: "uppercase",
          }}
        >
          ABILICO
        </Typography>
      )}
    </Box>
  );
}

