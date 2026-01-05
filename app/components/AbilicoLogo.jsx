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
 * @param {string|Object|number} [props.fontSize="14px"] - Font size of the text (can be responsive sx value)
 * @param {boolean} [props.horizontal=false] - Whether to display logo and text horizontally (side by side)
 * @param {Object} [props.textSx] - Additional MUI sx props to apply to the text Typography
 * @param {Object} [props.sx] - Additional MUI sx props to apply to the container
 */
export default function AbilicoLogo({
  logoHeight = 48,
  logoPath = "/logo-svg.svg",
  showText = true,
  textColor = PRIMARY_BLUE,
  fontSize = "14px",
  horizontal = false,
  onClick,
  textSx = {},
  sx = {},
}) {
  const router = useRouter();

  const handleClick = () => {
    if (typeof onClick === "function") {
      onClick();
      return;
    }
    router.push("/");
  };

  return (
    <Box
      onClick={handleClick}
      sx={{
        display: "flex",
        flexDirection: horizontal ? "row" : "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        gap: horizontal ? 1 : 0,
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
          mb: !horizontal && showText ? 1 : 0,
        }}
      />
      {showText && (
        <Typography
          className="abilico-brand-text"
          sx={{
            fontFamily: '"Work Sans", sans-serif',
            fontWeight: 800, // ExtraBold
            fontSize: fontSize,
            letterSpacing: "5%",
            color: textColor,
            textAlign: horizontal ? "left" : "center",
            textTransform: "uppercase",
            ...textSx,
          }}
        >
          ABILICO
        </Typography>
      )}
    </Box>
  );
}

