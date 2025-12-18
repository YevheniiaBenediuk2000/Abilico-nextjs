"use client";

import { useState, useMemo } from "react";
import OpeningHoursLib from "opening_hours";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import { alpha } from "@mui/material/styles";
import EditIcon from "@mui/icons-material/Edit";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function isSameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getWeekStartMonday(date) {
  const d = startOfDay(date);
  // JS: 0=Sun..6=Sat → convert to "days since Monday"
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

/**
 * Format time as HH:MM
 */
function formatTime(date) {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatTimeOr24(date, dayEnd) {
  if (dayEnd && date.getTime() === dayEnd.getTime()) return "24:00";
  return formatTime(date);
}

/**
 * Format day name (e.g., "Wed", "Thu")
 */
function formatDayName(date) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[date.getDay()];
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start.getTime() <= prev.end.getTime()) {
      if (cur.end.getTime() > prev.end.getTime()) {
        prev.end = cur.end;
      }
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

function getIntervalsForDay(oh, dayStart) {
  const dayEnd = addDays(dayStart, 1);
  const queryFrom = addDays(dayStart, -1);
  const queryTo = addDays(dayStart, 2);

  let raw = [];
  try {
    raw = oh.getOpenIntervals(queryFrom, queryTo) || [];
  } catch (e) {
    console.error("opening_hours.getOpenIntervals failed:", e);
    return { dayEnd, intervals: [] };
  }

  const intersectsDay = raw
    .map(([start, end]) => ({ start, end }))
    .filter(({ start, end }) => end > dayStart && start < dayEnd);

  const normalized = intersectsDay.map(({ start, end }) => {
    const clippedStart = start < dayStart ? dayStart : start;
    // If it started before this day, clip the end to the day boundary for display.
    // If it starts within this day, keep the true end so we can show overnight hours.
    const clippedEnd = start < dayStart ? (end > dayEnd ? dayEnd : end) : end;
    return { start: clippedStart, end: clippedEnd };
  });

  return { dayEnd, intervals: mergeIntervals(normalized) };
}

export default function OpeningHours({ openingHours, holidayHours = null, checkDate = null }) {
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

  const oh = useMemo(() => {
    if (!openingHours) return null;
    try {
      // opening_hours constructor: (value, nominatim_object?, optional_conf?)
      return new OpeningHoursLib(openingHours, null, { locale: "en" });
    } catch (e) {
      console.error("Failed to parse opening_hours:", e);
      return null;
    }
  }, [openingHours]);

  // Build week data structure (Mon..Sun of the current week)
  const weekStart = getWeekStartMonday(now);
  const weekData = oh
    ? dayOrder.map((dayKey, index) => {
        const dayStart = addDays(weekStart, index);
        const { dayEnd, intervals } = getIntervalsForDay(oh, dayStart);
      const isClosedAllDay = intervals.length === 0;

        let formattedHours = "Closed";
        if (!isClosedAllDay) {
          if (
            intervals.length === 1 &&
            intervals[0].start.getTime() === dayStart.getTime() &&
            intervals[0].end.getTime() === dayEnd.getTime()
          ) {
            formattedHours = "Open 24 hours";
          } else {
            formattedHours = intervals
              .map(({ start, end }) => `${formatTime(start)}-${formatTimeOr24(end, dayEnd)}`)
              .join(", ");
          }
        }
      
      return {
        dayIndex: index,
        dayKey,
        dayLabel: dayNames[dayKey],
          dayStart,
          dayEnd,
        intervals,
        isClosedAllDay,
          formattedHours,
        };
      })
    : [];

  // Check open/closed status using the library (correct around midnight + rule complexity)
  let status = { isOpen: false, message: "Hours not available", nextChange: null };
  if (oh) {
    const isUnknown = oh.getUnknown(now);
    const isOpen = !isUnknown ? oh.getState(now) : false;
    const nextChange = !isUnknown ? oh.getNextChange(now) : undefined;
    
    let message = "";
    if (isUnknown) {
      message = "Hours unknown";
    } else if (isOpen && nextChange) {
      message = `Closes at ${formatTime(nextChange)}`;
    } else if (!isOpen && nextChange) {
      if (isSameLocalDay(nextChange, now)) {
        message = `Opens at ${formatTime(nextChange)}`;
      } else {
        message = `Opens ${formatDayName(nextChange)} ${formatTime(nextChange)}`;
      }
    } else if (isOpen) {
      message = "Open";
    } else {
      message = "Closed";
    }

    status = { isOpen, message, nextChange: nextChange ?? null };
  }

  if (!openingHours) {
    return null;
  }

    // If parsing failed, show simple fallback
    if (!oh) {
      return (
        <Box
        sx={{
          padding: 3,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            mb: 2.5,
          }}
        >
          <Typography
            variant="h6"
            sx={{
              fontSize: "1.125rem",
              fontWeight: 600,
              color: "text.primary",
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            Opening Hours
          </Typography>
        </Box>
        <Card
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
          }}
        >
          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.875rem" }}>
              {openingHours}
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

          return (
            <Box
      sx={{
        padding: 3,
        borderTop: "1px solid",
        borderColor: "divider",
      }}
    >
      {/* Header - matching Wheelchair Access style (no icon) */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          mb: 2.5,
        }}
      >
        <Typography
          variant="h6"
          sx={{
            fontSize: "1.125rem",
            fontWeight: 600,
            color: "text.primary",
            letterSpacing: "-0.01em",
            margin: 0,
          }}
        >
          Opening Hours
        </Typography>
      </Box>

      {/* Status Card - clickable to expand/collapse */}
      <Card
        sx={{
          mb: expanded ? 1.5 : 0,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            borderColor: "primary.main",
            boxShadow: (theme) => `0 2px 8px ${alpha(theme.palette.primary.main, 0.15)}`,
            transform: "translateY(-1px)",
          },
        }}
      >
        <CardActionArea
          onClick={() => setExpanded((prev) => !prev)}
          sx={{
            p: 0,
            "&:hover": {
              backgroundColor: "transparent",
            },
          }}
        >
          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              {/* Status Icon Container */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: (theme) =>
                    status.isOpen
                      ? alpha(theme.palette.success.main, 0.1)
                      : alpha(theme.palette.error.main, 0.1),
                  color: status.isOpen ? "success.main" : "error.main",
                  flexShrink: 0,
                }}
              >
                <AccessTimeIcon sx={{ fontSize: 24 }} />
              </Box>

              {/* Status Content */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    color: "text.secondary",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    mb: 0.5,
                  }}
                >
                  Status
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: status.isOpen ? "success.main" : "error.main",
                    fontSize: "0.9375rem",
                    fontWeight: 600,
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

              {/* Chevron icon */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  color: "text.secondary",
                }}
              >
                {expanded ? (
                  <ExpandMoreIcon sx={{ fontSize: 24 }} />
                ) : (
                  <ChevronRightIcon sx={{ fontSize: 24 }} />
                )}
              </Box>
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>

      {/* Expanded weekly list - only show when expanded */}
      {expanded && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, mt: 1.5 }}>
          {weekData.map((day) => {
            const isToday = day.dayIndex === currentDayIndex;
            return (
              <Box
                key={day.dayKey}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  py: 0.75,
                  px: 1,
                  borderRadius: 1,
                  bgcolor: isToday
                    ? (theme) => alpha(theme.palette.primary.main, 0.05)
                    : "transparent",
                  transition: "background-color 0.2s",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    minWidth: "45%",
                  }}
                >
                  <Typography
                    variant="body2"
                    component="span"
                    sx={{
                      fontSize: "0.875rem",
                      fontWeight: isToday ? 600 : 400,
                      color: isToday ? "primary.main" : "text.primary",
                    }}
                  >
                    {day.dayLabel}
                  </Typography>
                  {isToday && (
                    <>
                      <Chip
                        label="Today"
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: "0.6875rem",
                          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                          color: "primary.main",
                          fontWeight: 600,
                        }}
                      />
                      {!status.isOpen && (
                        <Chip
                          label="closed now"
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: "0.6875rem",
                            ml: 0.5,
                            bgcolor: (theme) => alpha(theme.palette.error.main, 0.1),
                            color: "error.main",
                            fontWeight: 500,
                            textTransform: "lowercase",
                          }}
                        />
                      )}
                    </>
                  )}
                </Box>
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.25 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.875rem",
                      textAlign: "right",
                      color: day.isClosedAllDay ? "text.disabled" : isToday ? "text.primary" : "text.secondary",
                      fontWeight: isToday ? 500 : 400,
                    }}
                  >
                    {day.formattedHours}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Holiday hours section */}
      {holidayHours && (
        <>
          <Divider sx={{ my: 2.5 }} />
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              mb: 2,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: 1.5,
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                color: "primary.main",
              }}
            >
              <EditIcon sx={{ fontSize: 22 }} />
            </Box>
            <Typography
              variant="h6"
              sx={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "text.primary",
                letterSpacing: "-0.01em",
                flex: 1,
              }}
            >
              Holiday Hours
            </Typography>
          </Box>
          <Card
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
              {typeof holidayHours === "object" && holidayHours.date ? (
                <Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      mb: 0.75,
                      fontSize: "0.875rem",
                      color: "text.primary",
                    }}
                  >
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
            </CardContent>
          </Card>
        </>
      )}

      {/* Last checked date - shown at bottom of Opening Hours section */}
      {checkDate && (() => {
        // Check if date is very old (more than 2 years)
        // Parse date format: "01 Oct 2025" -> Date object
        const monthMap = {
          Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
          Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
        };
        const parts = checkDate.split(" ");
        let isVeryOld = false;
        
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = monthMap[parts[1]];
          const year = parseInt(parts[2], 10);
          
          if (!isNaN(day) && month !== undefined && !isNaN(year)) {
            const checkDateObj = new Date(year, month, day);
            const now = new Date();
            const yearsDiff = (now.getTime() - checkDateObj.getTime()) / (1000 * 60 * 60 * 24 * 365);
            isVeryOld = yearsDiff > 2;
          }
        }
        
        return (
          <Box
            sx={{
              mt: 2,
              pt: 2,
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontSize: "0.75rem",
                color: "text.secondary",
                fontWeight: 400,
              }}
            >
              Last checked: Opening Hours – {checkDate}
              {isVeryOld && (
                <Typography
                  component="span"
                  sx={{
                    fontSize: "0.75rem",
                    color: "text.secondary",
                    ml: 0.5,
                  }}
                >
                  · May be outdated
                </Typography>
              )}
            </Typography>
          </Box>
        );
      })()}
    </Box>
  );
}

