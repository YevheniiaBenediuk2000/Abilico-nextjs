"use client";

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardMedia from "@mui/material/CardMedia";
import Chip from "@mui/material/Chip";

export default function BasemapGalleryReact({
  basemaps,
  currentName,
  onChange,
}) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef(null);

  const current =
    basemaps.find((b) => b.name === currentName) || basemaps[0] || null;

  // Close grid when clicking outside
  useEffect(() => {
    const handleClickOutside = (ev) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(ev.target)) {
        setExpanded(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  if (!current) return null;

  return (
    <Box ref={containerRef} sx={{ display: "flex", flexDirection: "column" }}>
      {/* Collapsed head */}
      <Box
        className="basemap-gallery__head"
        sx={{ p: 0.5, width: "96px" }}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <Card sx={{ width: "100%", position: "relative" }}>
          <CardMedia
            component="img"
            image={current.preview}
            alt={`${current.name} preview`}
            className="bm-head-img"
          />

          <Box
            sx={{
              position: "absolute",
              left: "50%",
              bottom: 8,
              transform: "translateX(-50%)",
              width: "90%",
              display: "flex",
              justifyContent: "center",
              pointerEvents: "none", // clicks go to CardActionArea underneath
            }}
          >
            <Box
              sx={{
                px: 1.2,
                py: 0.4, // vertical padding for wrapped text
                borderRadius: 999,
                bgcolor: "primary.main",
                color: "common.white",
                fontSize: "0.72rem",
                fontWeight: 500,
                textAlign: "center",
                lineHeight: 1.3,
                maxWidth: "100%",
                whiteSpace: "normal",
                wordBreak: "break-word",
              }}
            >
              {current.name}
            </Box>
          </Box>
        </Card>
      </Box>

      {/* Grid of basemap cards */}
      <Box
        className="basemap-gallery__grid"
        sx={{
          display: expanded ? "grid" : "none", // inline style wins over CSS
          gridTemplateColumns: "repeat(2, var(--bm-thumb-w))",
          gap: 0.5,
          p: 0.5,
        }}
      >
        {basemaps.map((bm) => {
          const active = bm.name === currentName;
          return (
            <Card
              key={bm.name}
              className="bm-item"
              elevation={active ? 6 : 1}
              sx={{
                width: "var(--bm-thumb-w)",
                borderRadius: 2,
                position: "relative",
                overflow: "hidden",
                cursor: "pointer",
                border: active ? 1 : 0,
                borderColor: active ? "primary.main" : "divider",
              }}
              onClick={() => {
                onChange?.(bm.name);
                setExpanded(false);
              }}
            >
              <CardActionArea sx={{ display: "block" }}>
                <CardMedia
                  component="img"
                  image={bm.preview}
                  alt={`${bm.name} preview`}
                  className="bm-item__img"
                />
                <Box
                  sx={{
                    position: "absolute",
                    left: "50%",
                    bottom: 8,
                    transform: "translateX(-50%)",
                    width: "90%",
                    display: "flex",
                    justifyContent: "center",
                    pointerEvents: "none", // clicks go to CardActionArea underneath
                  }}
                >
                  <Box
                    sx={{
                      px: 1.2,
                      py: 0.4, // vertical padding for wrapped text
                      borderRadius: 999,
                      bgcolor: active ? "primary.main" : "rgba(0,0,0,0.65)", // dark overlay for contrast
                      color: "common.white",
                      fontSize: "0.72rem",
                      fontWeight: 500,
                      textAlign: "center",
                      lineHeight: 1.3,
                      maxWidth: "100%",
                      whiteSpace: "normal",
                      wordBreak: "break-word",
                    }}
                  >
                    {bm.name}
                  </Box>
                </Box>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
}
