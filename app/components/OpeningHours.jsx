"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

/**
 * Parse OSM opening_hours format
 * Examples:
 * - "Mo-Fr 08:00-18:00"
 * - "Mo-We 12:00-24:00; Th 12:00-25:00; Fr 12:00-01:00; Sa 15:00-28:00; Su 15:00-23:00"
 * - "Mo 00:00-08:30,19:00-08:30; Tu-Fr 19:00-08:30; Sa 12:00-00:00; Su 00:00-24:00"
 * - "24/7" or "24/7 open"
 */
function parseOpeningHours(openingHoursStr) {
  if (!openingHoursStr || typeof openingHoursStr !== "string") {
    return null;
  }

  const dayOrder = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  // Handle 24/7
  if (/^24\s*\/\s*7/i.test(openingHoursStr.trim())) {
    const result = {};
    dayOrder.forEach((day) => {
      result[day] = ["00:00-24:00"];
    });
    return result;
  }

  // Split by semicolon to get different day ranges
  const parts = openingHoursStr.split(";").map((p) => p.trim()).filter(Boolean);

  const result = {};

  parts.forEach((part) => {
    // Match day range (e.g., "Mo-Fr", "Mo-We", "Sa", "Su")
    // Also handle cases like "Mo-We 12:00-24:00"
    const dayRangeMatch = part.match(/^([A-Za-z]{2}(?:-[A-Za-z]{2})?)\s+(.+)$/);
    if (!dayRangeMatch) {
      // Try to match without space: "Mo-Fr08:00-18:00"
      const noSpaceMatch = part.match(/^([A-Za-z]{2}(?:-[A-Za-z]{2})?)(.+)$/);
      if (noSpaceMatch) {
        const dayRange = noSpaceMatch[1];
        const times = noSpaceMatch[2];
        parseDayRange(dayRange, times, result, dayOrder);
      }
      return;
    }

    const dayRange = dayRangeMatch[1];
    const times = dayRangeMatch[2];
    parseDayRange(dayRange, times, result, dayOrder);
  });

  return result;
}

function parseDayRange(dayRange, times, result, dayOrder) {
  // Parse day range
  let dayKeys = [];
  if (dayRange.includes("-")) {
    const [start, end] = dayRange.split("-");
    const startIdx = dayOrder.indexOf(start);
    const endIdx = dayOrder.indexOf(end);
    if (startIdx !== -1 && endIdx !== -1) {
      for (let i = startIdx; i <= endIdx; i++) {
        dayKeys.push(dayOrder[i]);
      }
    }
  } else {
    dayKeys = [dayRange];
  }

  // Parse times (can be multiple ranges like "00:00-08:30,19:00-08:30")
  const timeRanges = times.split(",").map((t) => t.trim()).filter(Boolean);

  dayKeys.forEach((dayKey) => {
    if (!result[dayKey]) {
      result[dayKey] = [];
    }
    result[dayKey].push(...timeRanges);
  });
}

function formatTimeRange(timeStr) {
  // Handle 24-hour format and next-day times (e.g., "25:00" = 1:00 next day)
  if (!timeStr) return "";

  // Parse times like "00:00-08:30" or "19:00-08:30" (next day)
  const parts = timeStr.split("-");
  if (parts.length !== 2) return timeStr;

  let [start, end] = parts.map((t) => t.trim());

  // Handle next-day times (e.g., "25:00" means 1:00 next day, "28:00" means 4:00 next day)
  const parseTime = (time) => {
    const [hours, minutes = "00"] = time.split(":");
    let h = parseInt(hours, 10);
    const m = minutes;
    if (h >= 24) {
      h = h - 24;
      return `${h.toString().padStart(2, "0")}:${m}`;
    }
    return time;
  };

  start = parseTime(start);
  end = parseTime(end);

  // ✅ Only treat as "Open 24 hours" if the range is exactly 00:00-24:00
  // This must be checked after normalizing times but before other formatting
  if (start === "00:00" && end === "24:00") {
    return "Open 24 hours";
  }

  // If end is 00:00, it means midnight (end of day)
  if (end === "00:00" && start !== "00:00") {
    return `${start}-00:00`;
  }

  return `${start}-${end}`;
}

export default function OpeningHours({ openingHours, holidayHours = null }) {
  if (!openingHours) {
    return null;
  }

  const parsed = parseOpeningHours(openingHours);

  // Check if parsed is valid object and has keys
  if (!parsed || typeof parsed !== "object" || Object.keys(parsed).length === 0) {
    // If parsing failed, show raw value
    return (
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <AccessTimeIcon sx={{ color: "primary.main", fontSize: "1.2rem" }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Hours
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Open with main hours
        </Typography>
        <Typography variant="body2">{openingHours}</Typography>
      </Box>
    );
  }

  const dayOrder = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const dayNames = {
    Mo: "Monday",
    Tu: "Tuesday",
    We: "Wednesday",
    Th: "Thursday",
    Fr: "Friday",
    Sa: "Saturday",
    Su: "Sunday",
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <AccessTimeIcon sx={{ color: "primary.main", fontSize: "1.2rem" }} />
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: "1.1rem" }}>
          Hours
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: "0.875rem" }}>
        Open with main hours
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {dayOrder.map((dayKey) => {
          const times = parsed && parsed[dayKey];
          if (!times || !Array.isArray(times) || times.length === 0) return null;

          return (
            <Box
              key={dayKey}
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 2,
              }}
            >
              <Typography
                variant="body2"
                sx={{ 
                  fontWeight: 400, 
                  minWidth: 120,
                  fontSize: "0.875rem",
                  color: "text.primary"
                }}
              >
                {dayNames[dayKey]}
              </Typography>
              <Box sx={{ flex: 1, textAlign: "right" }}>
                {times.map((timeRange, idx) => (
                  <Typography
                    key={idx}
                    variant="body2"
                    color="text.secondary"
                    sx={{ 
                      display: "block",
                      fontSize: "0.875rem"
                    }}
                  >
                    {formatTimeRange(timeRange)}
                  </Typography>
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>

      {holidayHours && (
        <>
          <Divider sx={{ my: 2.5 }} />
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 1,
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: "1.1rem" }}>
              Holiday opening hours
            </Typography>
            <IconButton 
              size="small" 
              aria-label="Edit holiday hours"
              sx={{ 
                color: "text.secondary",
                "&:hover": {
                  backgroundColor: "action.hover",
                }
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Box>
          {typeof holidayHours === "object" && holidayHours.date ? (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 400, mb: 0.5, fontSize: "0.875rem" }}>
                {holidayHours.date}
              </Typography>
              {holidayHours.name && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, fontSize: "0.875rem" }}>
                  {holidayHours.name}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.875rem" }}>
                {holidayHours.hours || "Open 24 hours"}
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.875rem" }}>
              {typeof holidayHours === "string" ? holidayHours : "Open 24 hours"}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}

