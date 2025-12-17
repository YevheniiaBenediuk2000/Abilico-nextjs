"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import EditIcon from "@mui/icons-material/Edit";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

/**
 * Normalized hours structure:
 * - DayIndex: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 * - Interval: { open: "12:00", close: "01:00" }
 * - HoursByDay: { [dayIndex]: Interval[] }
 */

/**
 * Parse OSM opening_hours format and convert to normalized HoursByDay
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
  // Map OSM day keys to DayIndex (0=Sunday, 1=Monday, etc.)
  const osmToDayIndex = {
    Mo: 1, // Monday
    Tu: 2, // Tuesday
    We: 3, // Wednesday
    Th: 4, // Thursday
    Fr: 5, // Friday
    Sa: 6, // Saturday
    Su: 0, // Sunday
  };

  // Handle 24/7
  if (/^24\s*\/\s*7/i.test(openingHoursStr.trim())) {
    const result = {};
    for (let i = 0; i < 7; i++) {
      result[i] = [{ open: "00:00", close: "24:00" }];
    }
    return result;
  }

  // Split by semicolon to get different day ranges
  const parts = openingHoursStr.split(";").map((p) => p.trim()).filter(Boolean);

  const result = {};

  parts.forEach((part) => {
    // Match day range (e.g., "Mo-Fr", "Mo-We", "Sa", "Su")
    const dayRangeMatch = part.match(/^([A-Za-z]{2}(?:-[A-Za-z]{2})?)\s+(.+)$/);
    if (!dayRangeMatch) {
      // Try to match without space: "Mo-Fr08:00-18:00"
      const noSpaceMatch = part.match(/^([A-Za-z]{2}(?:-[A-Za-z]{2})?)(.+)$/);
      if (noSpaceMatch) {
        const dayRange = noSpaceMatch[1];
        const times = noSpaceMatch[2];
        parseDayRange(dayRange, times, result, dayOrder, osmToDayIndex);
      }
      return;
    }

    const dayRange = dayRangeMatch[1];
    const times = dayRangeMatch[2];
    parseDayRange(dayRange, times, result, dayOrder, osmToDayIndex);
  });

  return result;
}

function parseDayRange(dayRange, times, result, dayOrder, osmToDayIndex) {
  // Parse day range
  let dayIndices = [];
  if (dayRange.includes("-")) {
    const [start, end] = dayRange.split("-");
    const startIdx = dayOrder.indexOf(start);
    const endIdx = dayOrder.indexOf(end);
    if (startIdx !== -1 && endIdx !== -1) {
      for (let i = startIdx; i <= endIdx; i++) {
        dayIndices.push(osmToDayIndex[dayOrder[i]]);
      }
    }
  } else {
    dayIndices = [osmToDayIndex[dayRange]];
  }

  // Parse times (can be multiple ranges like "00:00-08:30,19:00-08:30")
  const timeRanges = times.split(",").map((t) => t.trim()).filter(Boolean);

  dayIndices.forEach((dayIdx) => {
    if (!result[dayIdx]) {
      result[dayIdx] = [];
    }
    timeRanges.forEach((timeRange) => {
      const parts = timeRange.split("-");
      if (parts.length === 2) {
        let [open, close] = parts.map((t) => t.trim());
        
        // Handle next-day times (e.g., "25:00" means 1:00 next day)
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

        open = parseTime(open);
        close = parseTime(close);

        result[dayIdx].push({ open, close });
      }
    });
  });
}

/**
 * Parse time string to minutes since midnight
 */
function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Check if current time is within an interval (handles overnight intervals)
 */
function isNowInInterval(nowMinutes, openMinutes, closeMinutes) {
  // Same-day interval (e.g. 12:00–23:00)
  if (closeMinutes > openMinutes) {
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  }
  // Overnight interval (e.g. 22:00–02:00)
  // means: open from openMinutes to midnight, AND from 0 to closeMinutes
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}

/**
 * Get today's status: isOpen and label
 */
function getTodayStatus(hoursByDay) {
  const now = new Date();
  const todayIndex = now.getDay(); // 0 = Sunday, 6 = Saturday
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayIntervals = hoursByDay[todayIndex] || [];

  // Check if currently open
  let openInterval = null;

  for (const interval of todayIntervals) {
    const openMin = parseTimeToMinutes(interval.open);
    const closeMin = parseTimeToMinutes(interval.close);
    if (isNowInInterval(nowMinutes, openMin, closeMin)) {
      openInterval = { openMin, closeMin, interval };
      break;
    }
  }

  if (openInterval) {
    // Open now
    const labelClose = openInterval.interval.close;
    return {
      isOpen: true,
      label: `Open · Closes at ${labelClose}`,
    };
  }

  if (!todayIntervals.length) {
    // No hours at all today
    return {
      isOpen: false,
      label: "Closed",
    };
  }

  // Closed now but has hours: find next opening time today
  const upcoming = todayIntervals
    .map((interval) => ({
      openMin: parseTimeToMinutes(interval.open),
      interval,
    }))
    .filter((x) => x.openMin > nowMinutes)
    .sort((a, b) => a.openMin - b.openMin)[0];

  if (upcoming) {
    return {
      isOpen: false,
      label: `Closed · Opens at ${upcoming.interval.open}`,
    };
  }

  // All openings already passed
  return {
    isOpen: false,
    label: "Closed",
  };
}

/**
 * Format interval for display
 */
function formatInterval(interval) {
  const { open, close } = interval;
  
  // Handle 24-hour format
  if (open === "00:00" && close === "24:00") {
    return "Open 24 hours";
  }

  // If end is 00:00, it means midnight (end of day)
  if (close === "00:00" && open !== "00:00") {
    return `${open}-00:00`;
  }

  return `${open}-${close}`;
}

/**
 * Format multiple intervals for display
 */
function formatIntervals(intervals) {
  if (!intervals || intervals.length === 0) {
    return "Closed";
  }
  return intervals.map(formatInterval).join(", ");
}

export default function OpeningHours({ openingHours, holidayHours = null }) {
  const [expanded, setExpanded] = useState(false);

  if (!openingHours) {
    return null;
  }

  const hoursByDay = parseOpeningHours(openingHours);

  // Check if parsed is valid object and has keys
  if (!hoursByDay || typeof hoursByDay !== "object" || Object.keys(hoursByDay).length === 0) {
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

  const now = new Date();
  const todayIndex = now.getDay(); // 0 = Sunday, 6 = Saturday
  const todayStatus = getTodayStatus(hoursByDay);

  const dayLabels = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  // When collapsed: only show today
  // When expanded: show today first, then rest of the week
  const orderedDays = expanded
    ? [
        todayIndex,
        ...Array.from({ length: 7 }, (_, i) => i).filter((d) => d !== todayIndex),
      ]
    : [todayIndex];

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <AccessTimeIcon sx={{ color: "primary.main", fontSize: "1.2rem" }} />
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: "1.1rem" }}>
          Hours
        </Typography>
      </Box>

      {/* Status label (Google-style) */}
      <Typography
        variant="body2"
        sx={{
          mb: 1.5,
          fontSize: "0.875rem",
          color: todayStatus.isOpen ? "success.main" : "text.secondary",
          fontWeight: 500,
        }}
      >
        {todayStatus.label}
      </Typography>

      {/* Hours list */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 1 }}>
        {orderedDays.map((dayIdx) => {
          const intervals = hoursByDay[dayIdx] || [];
          const isToday = dayIdx === todayIndex;
          const valueText = formatIntervals(intervals);

          return (
            <Box
              key={dayIdx}
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 2,
                py: isToday ? 0.5 : 0,
                px: isToday ? 1 : 0,
                borderRadius: isToday ? 1 : 0,
                bgcolor: isToday ? "action.hover" : "transparent",
              }}
              aria-current={isToday ? "date" : undefined}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: isToday ? 600 : 400,
                  minWidth: 120,
                  fontSize: "0.875rem",
                  color: "text.primary",
                }}
              >
                {dayLabels[dayIdx]}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  flex: 1,
                  textAlign: "right",
                  fontSize: "0.875rem",
                  fontWeight: isToday ? 500 : 400,
                }}
              >
                {valueText}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Toggle button */}
      <Button
        variant="text"
        size="small"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        sx={{
          p: 0,
          minWidth: "auto",
          textTransform: "none",
          fontSize: "0.875rem",
          color: "primary.main",
          "&:hover": {
            backgroundColor: "transparent",
            textDecoration: "underline",
          },
        }}
      >
        {expanded ? "Less" : "More hours"}
      </Button>

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
                },
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Box>
          {typeof holidayHours === "object" && holidayHours.date ? (
            <Box>
              <Typography
                variant="body2"
                sx={{ fontWeight: 400, mb: 0.5, fontSize: "0.875rem" }}
              >
                {holidayHours.date}
              </Typography>
              {holidayHours.name && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 0.5, fontSize: "0.875rem" }}
                >
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

