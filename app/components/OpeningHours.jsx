"use client";

import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

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

/**
 * Parse time string (HH:MM) to minutes since midnight
 * Handles next-day times (e.g., 25:00 = 1:00 next day)
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [hours, minutes = "00"] = timeStr.split(":");
  let h = parseInt(hours, 10);
  const m = parseInt(minutes, 10);
  // Handle next-day times (e.g., 25:00 = 1440 + 60 = 1500 minutes)
  if (h >= 24) {
    h = h - 24;
  }
  return h * 60 + m;
}

/**
 * Check if current time falls within an interval
 * Handles next-day times (e.g., 22:00-02:00 spans midnight)
 */
function isTimeInInterval(currentMinutes, startStr, endStr) {
  const startMinutes = parseTimeToMinutes(startStr);
  const endMinutes = parseTimeToMinutes(endStr);
  
  if (startMinutes === null || endMinutes === null) return false;

  // Check if this is a next-day interval (end is before start)
  const isNextDay = endMinutes <= startMinutes;
  
  if (isNextDay) {
    // Interval spans midnight (e.g., 22:00-02:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  } else {
    // Normal interval (e.g., 09:00-18:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
}

/**
 * Get intervals for a specific day from parsed opening hours
 */
function getIntervalsForDay(parsed, dayKey) {
  if (!parsed || !parsed[dayKey]) return [];
  const times = parsed[dayKey];
  return times.map((timeStr) => {
    const parts = timeStr.split("-");
    if (parts.length !== 2) return null;
    const [start, end] = parts.map((t) => t.trim());
    return { start, end, original: timeStr };
  }).filter(Boolean);
}

/**
 * Check if currently open based on today's hours
 */
function checkOpenStatus(parsed, dayKey) {
  const intervals = getIntervalsForDay(parsed, dayKey);
  if (intervals.length === 0) return { isOpen: false, nextChange: null };

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Check if we're in any interval
  for (const interval of intervals) {
    if (isTimeInInterval(currentMinutes, interval.start, interval.end)) {
      // We're open, find when we close
      const startMinutes = parseTimeToMinutes(interval.start);
      const endMinutes = parseTimeToMinutes(interval.end);
      const isNextDay = endMinutes <= startMinutes;
      
      const nextChange = new Date(now);
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      
      // If it's a next-day interval and we're before midnight, closing is tomorrow
      if (isNextDay && currentMinutes >= startMinutes) {
        nextChange.setDate(nextChange.getDate() + 1);
      }
      nextChange.setHours(endHours, endMins, 0, 0);

      return { isOpen: true, nextChange };
    }
  }

  // We're closed, find when we open next
  // Sort intervals by start time
  const sortedIntervals = [...intervals].sort((a, b) => {
    return parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start);
  });

  for (const interval of sortedIntervals) {
    const startMinutes = parseTimeToMinutes(interval.start);
    if (startMinutes > currentMinutes) {
      // Next opening is today
      const nextChange = new Date(now);
      const startHours = Math.floor(startMinutes / 60);
      const startMins = startMinutes % 60;
      nextChange.setHours(startHours, startMins, 0, 0);
      return { isOpen: false, nextChange };
    }
  }

  // Next opening is tomorrow (first interval)
  if (sortedIntervals.length > 0) {
    const firstInterval = sortedIntervals[0];
    const startMinutes = parseTimeToMinutes(firstInterval.start);
    const nextChange = new Date(now);
    nextChange.setDate(nextChange.getDate() + 1);
    const startHours = Math.floor(startMinutes / 60);
    const startMins = startMinutes % 60;
    nextChange.setHours(startHours, startMins, 0, 0);
    return { isOpen: false, nextChange };
  }

  return { isOpen: false, nextChange: null };
}

/**
 * Format time as HH:MM
 */
function formatTime(date) {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * Format day name (e.g., "Wed", "Thu")
 */
function formatDayName(date) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[date.getDay()];
}

export default function OpeningHours({ openingHours, holidayHours = null }) {
  const [expanded, setExpanded] = useState(false);

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

  // Get current day (0 = Monday, 6 = Sunday)
  const now = new Date();
  const currentDayIndex = (now.getDay() + 6) % 7; // Convert JS day (0=Sun) to Mon=0
  const currentDayKey = dayOrder[currentDayIndex];

  const parsed = useMemo(() => {
    if (!openingHours) return null;
    return parseOpeningHours(openingHours);
  }, [openingHours]);

  // Build week data structure
  const weekData = useMemo(() => {
    if (!parsed) return [];
    
    return dayOrder.map((dayKey, index) => {
      const intervals = getIntervalsForDay(parsed, dayKey);
      const isClosedAllDay = intervals.length === 0;
      
      return {
        dayIndex: index,
        dayKey,
        dayLabel: dayNames[dayKey],
        intervals,
        isClosedAllDay,
        formattedHours: isClosedAllDay 
          ? "Closed" 
          : intervals.map(i => formatTimeRange(i.original)).join(", "),
      };
    });
  }, [parsed, dayOrder, dayNames]);

  // Get today's data
  const todayData = weekData[currentDayIndex] || null;

  // Check open/closed status
  const status = useMemo(() => {
    if (!parsed || !todayData) {
      return { isOpen: false, message: "Hours not available", nextChange: null };
    }

    const { isOpen, nextChange } = checkOpenStatus(parsed, currentDayKey);
    
    let message = "";
    if (isOpen && nextChange) {
      message = `Closes at ${formatTime(nextChange)}`;
    } else if (!isOpen && nextChange) {
      const nextDayIndex = (nextChange.getDay() + 6) % 7;
      const isToday = nextDayIndex === currentDayIndex;
      if (isToday) {
        message = `Opens at ${formatTime(nextChange)}`;
      } else {
        message = `Opens ${formatDayName(nextChange)} ${formatTime(nextChange)}`;
      }
    } else if (isOpen && !nextChange) {
      message = "Open";
    } else {
      message = "Closed";
    }

    return { isOpen, message, nextChange };
  }, [parsed, todayData, currentDayIndex, currentDayKey]);

  if (!openingHours) {
    return null;
  }

    // If parsing failed, show simple fallback
    if (!parsed || typeof parsed !== "object" || Object.keys(parsed).length === 0) {
      return (
        <Box
        sx={{
          padding: 2.5,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
        <AccessTimeIcon sx={{ color: "primary.main", fontSize: "1.2rem" }} />
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: "1.1rem" }}>
          Hours
        </Typography>
      </Box>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.875rem" }}>
          {openingHours}
      </Typography>
      </Box>
    );
  }

          return (
            <Box
      sx={{
        padding: 2.5,
        borderTop: "1px solid",
        borderColor: "divider",
      }}
    >
      {/* Header row - clickable to expand/collapse */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          mb: expanded ? 1.5 : 1,
        }}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flex: 1 }}>
          <AccessTimeIcon
            sx={{
              fontSize: "1.2rem",
              color: status.isOpen ? "success.main" : "text.secondary",
            }}
          />
          <Box>
            <Typography
              variant="body1"
              sx={{
                fontWeight: 600,
                fontSize: "0.9375rem",
                color: status.isOpen ? "success.main" : "error.main",
                lineHeight: 1.3,
                mb: 0.25,
              }}
            >
              {status.isOpen ? "Open now" : "Closed now"}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontSize: "0.8125rem",
                color: "text.secondary",
                lineHeight: 1.3,
              }}
            >
              {status.message}
            </Typography>
          </Box>
        </Box>

        {/* Chevron icon */}
        {expanded ? (
          <ExpandMoreIcon sx={{ color: "text.secondary", fontSize: "1.5rem" }} />
        ) : (
          <ChevronRightIcon sx={{ color: "text.secondary", fontSize: "1.5rem" }} />
        )}
      </Box>

      {/* Today's hours - only show when collapsed */}
      {todayData && !expanded && (
        <Box sx={{ pl: 4.5 }}>
          <Typography
            variant="body2"
            sx={{
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "text.primary",
            }}
          >
            {todayData.dayLabel}{" "}
            <Typography
              component="span"
              variant="body2"
              sx={{
                fontSize: "0.875rem",
                color: "text.secondary",
                ml: 0.5,
              }}
            >
              {todayData.formattedHours}
            </Typography>
          </Typography>
        </Box>
      )}

      {/* Expanded weekly list */}
      {expanded && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          {weekData.map((day) => {
            const isToday = day.dayIndex === currentDayIndex;
            return (
              <Box
                key={day.dayKey}
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                  py: 0.5,
                  px: 0.25,
              }}
            >
              <Typography
                variant="body2"
                sx={{ 
                  fontSize: "0.875rem",
                    fontWeight: isToday ? 600 : 400,
                    color: isToday ? "primary.main" : "text.primary",
                    minWidth: "45%",
                }}
              >
                  {day.dayLabel}
                  {isToday && " · Today"}
              </Typography>
                  <Typography
                    variant="body2"
                    sx={{ 
                    fontSize: "0.875rem",
                    textAlign: "right",
                    color: day.isClosedAllDay ? "text.disabled" : "text.secondary",
                    fontWeight: isToday ? 500 : 400,
                  }}
                >
                  {day.formattedHours}
                  </Typography>
            </Box>
          );
        })}
      </Box>
      )}

      {/* Holiday hours section */}
      {holidayHours && (
        <>
          <Divider sx={{ my: expanded ? 2.5 : 2.5 }} />
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 1.5,
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
              <Typography variant="body2" sx={{ fontWeight: 400, mb: 0.75, fontSize: "0.875rem" }}>
                {holidayHours.date}
              </Typography>
              {holidayHours.name && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 0.75, fontSize: "0.875rem" }}
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

