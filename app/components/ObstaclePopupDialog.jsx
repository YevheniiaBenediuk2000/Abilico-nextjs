"use client";

import { useState, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningIcon from "@mui/icons-material/Warning";
import EditIcon from "@mui/icons-material/Edit";
import Image from "next/image";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import { placeVotes, getVoteStatistics } from "../api/placeVotes";
import { obstacleStorage } from "../api/obstacleStorage";
import { ensurePlaceExists } from "../api/reviewStorage";
import { toastError, toastSuccess } from "../utils/toast.mjs";
import { PRIMARY_BLUE } from "../constants/constants.mjs";

export default function ObstaclePopupDialog({ open, onClose, obstacle, onObstacleUpdate }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [obstacleName, setObstacleName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [placeId, setPlaceId] = useState(null);
  const [voteStats, setVoteStats] = useState(null);

  useEffect(() => {
    if (obstacle) {
      const title = obstacle.properties?.title || "Obstacle";
      setObstacleName(title);
      setIsEditMode(false);
      
      // Check if obstacle already has a place_id
      if (obstacle.place_id) {
        setPlaceId(obstacle.place_id);
        loadVoteStats(obstacle.place_id);
      } else if (obstacle.geometry) {
        // Try to find or create place_id from obstacle location
        findPlaceForObstacle();
      }
    }
  }, [obstacle]);

  const loadVoteStats = async (pid) => {
    if (!pid) return;
    try {
      const stats = await getVoteStatistics(pid);
      setVoteStats(stats);
    } catch (error) {
      console.error("Failed to load vote statistics:", error);
      setVoteStats({ confirm: 0, issue: 0, total: 0 });
    }
  };

  const findPlaceForObstacle = async () => {
    try {
      // Extract coordinates from obstacle geometry
      let latlng = null;
      if (obstacle.geometry.type === "Point") {
        latlng = {
          lat: obstacle.geometry.coordinates[1],
          lng: obstacle.geometry.coordinates[0],
        };
      } else if (obstacle.geometry.type === "Polygon" || obstacle.geometry.type === "Circle") {
        // Get center point for polygons/circles
        const coords = obstacle.geometry.coordinates[0] || obstacle.geometry.coordinates;
        if (Array.isArray(coords) && coords.length > 0) {
          const firstPoint = Array.isArray(coords[0]) ? coords[0] : coords;
          latlng = {
            lat: firstPoint[1],
            lng: firstPoint[0],
          };
        }
      }

      if (latlng) {
        // Try to find nearest place or create one
        // For now, we'll use a placeholder - you may want to implement
        // a function to find the nearest place from the places table
        // or create a temporary place entry
        const tempPlaceId = await ensurePlaceExists(
          { name: obstacleName || "Obstacle Location" },
          latlng
        );
        if (tempPlaceId) {
          setPlaceId(tempPlaceId);
          loadVoteStats(tempPlaceId);
        }
      }
    } catch (error) {
      console.error("Error finding place for obstacle:", error);
      // Continue without place_id - user can still vote if needed
    }
  };

  const handleSaveName = async () => {
    if (!obstacleName.trim()) {
      toastError("Please enter a name for the obstacle");
      return;
    }

    setIsLoading(true);
    try {
      const updatedObstacle = {
        ...obstacle,
        properties: {
          ...obstacle.properties,
          title: obstacleName.trim(),
        },
      };

      await obstacleStorage("PUT", updatedObstacle);
      
      if (onObstacleUpdate) {
        onObstacleUpdate(updatedObstacle);
      }
      
      // Reload vote stats if we have place_id
      if (placeId) {
        await loadVoteStats(placeId);
      }
      
      setIsEditMode(false);
      toastSuccess("Obstacle name updated successfully");
    } catch (error) {
      console.error("Error updating obstacle:", error);
      toastError("Failed to update obstacle name");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVote = async (voteType) => {
    if (!placeId) {
      toastError("Unable to associate obstacle with a place. Please try again.");
      return;
    }

    setIsLoading(true);
    try {
      await placeVotes("POST", {
        place_id: placeId,
        vote_type: voteType, // 'confirm' or 'issue'
        comment: null,
      });
      
      toastSuccess(
        voteType === "confirm"
          ? "Obstacle confirmed successfully"
          : "Issue reported successfully"
      );
      // Reload vote statistics after voting
      if (placeId) {
        await loadVoteStats(placeId);
      }
      // Don't close dialog - keep it open to show updated vote counts
    } catch (error) {
      // Check for duplicate vote error (multiple ways it might be formatted)
      const isDuplicateError =
        error.code === "DUPLICATE_VOTE" ||
        error.isDuplicate === true ||
        error.message?.includes("already voted") ||
        error.message?.includes("unique") ||
        error.code === "23505" ||
        error.code === "PGRST301" ||
        (error.message && error.message.toLowerCase().includes("duplicate"));

      if (isDuplicateError) {
        // Don't log duplicate errors - they're expected
        toastError("You have already voted on this obstacle");
      } else {
        // Only log unexpected errors
        console.error("Error submitting vote:", {
          message: error.message,
          code: error.code,
          error: error,
        });
        const errorMessage = error.message || "Failed to submit vote. Please try again.";
        toastError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!obstacle) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: "90vh",
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle
        sx={{
          pb: 2,
          pt: 3,
          px: 3,
          fontSize: "1.625rem",
          fontWeight: 700,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          background: `linear-gradient(135deg, ${PRIMARY_BLUE}08 0%, ${PRIMARY_BLUE}02 100%)`,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <ReportProblemIcon sx={{ color: PRIMARY_BLUE, fontSize: "1.75rem" }} />
          Obstacle Details
        </Box>
        <IconButton
          onClick={onClose}
          disabled={isLoading}
          sx={{
            color: "text.secondary",
            "&:hover": {
              bgcolor: "rgba(0, 0, 0, 0.04)",
            },
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          overflowY: "auto",
          maxHeight: "calc(90vh - 140px)",
          px: 3,
          py: 2.5,
          mt: 3,
        }}
      >
        {isEditMode ? (
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              bgcolor: "rgba(0, 0, 0, 0.005)",
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              transition: "all 0.2s ease-in-out",
              "&:hover": {
                borderColor: PRIMARY_BLUE + "40",
                boxShadow: `0 2px 8px ${PRIMARY_BLUE}15`,
              },
            }}
          >
            <Typography
              variant="h6"
              sx={{
                mb: 2,
                fontSize: "1.125rem",
                fontWeight: 600,
              }}
            >
              Obstacle Name{" "}
              <Typography component="span" color="error">
                *
              </Typography>
            </Typography>
            <TextField
              fullWidth
              label="Obstacle Name"
              value={obstacleName}
              onChange={(e) => setObstacleName(e.target.value)}
              placeholder="e.g., Damaged curb ramp"
              disabled={isLoading}
              autoFocus
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 1.5,
                  transition: "all 0.2s ease-in-out",
                  "&:hover:not(.Mui-disabled)": {
                    "& .MuiOutlinedInput-notchedOutline": {
                      borderColor: PRIMARY_BLUE + "80",
                    },
                  },
                  "&.Mui-focused": {
                    "& .MuiOutlinedInput-notchedOutline": {
                      borderWidth: 2,
                      borderColor: PRIMARY_BLUE,
                    },
                  },
                },
              }}
            />
          </Paper>
        ) : (
          <Stack spacing={2.5}>
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                bgcolor: "rgba(0, 0, 0, 0.005)",
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                transition: "all 0.2s ease-in-out",
                "&:hover": {
                  borderColor: PRIMARY_BLUE + "40",
                  boxShadow: `0 2px 8px ${PRIMARY_BLUE}15`,
                },
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  mb: 2,
                  fontSize: "1.125rem",
                  fontWeight: 600,
                }}
              >
                Obstacle Information
              </Typography>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Name
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {obstacleName || "Obstacle"}
                  </Typography>
                </Box>
              </Stack>
            </Paper>

            {/* Vote Statistics */}
            {voteStats && voteStats.total > 0 && (
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  bgcolor: "rgba(0, 0, 0, 0.005)",
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  transition: "all 0.2s ease-in-out",
                  "&:hover": {
                    borderColor: PRIMARY_BLUE + "40",
                    boxShadow: `0 2px 8px ${PRIMARY_BLUE}15`,
                  },
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    mb: 2,
                    fontSize: "1.125rem",
                    fontWeight: 600,
                  }}
                >
                  Community Feedback
                </Typography>
                <Stack spacing={1.5}>
                  <Box sx={{ display: "flex", gap: 3, alignItems: "center" }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Confirmed
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: PRIMARY_BLUE }}>
                        {voteStats.confirm}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Reported
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: "#FFC107" }}>
                        {voteStats.issue}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Total Votes
                      </Typography>
                      <Typography variant="h6" color="text.primary" sx={{ fontWeight: 600 }}>
                        {voteStats.total}
                      </Typography>
                    </Box>
                  </Box>
                </Stack>
              </Paper>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2.5,
          borderTop: "1px solid",
          borderColor: "divider",
          gap: 1.5,
          bgcolor: "rgba(0, 0, 0, 0.01)",
        }}
      >
        {isEditMode ? (
          <>
            <Button
              onClick={() => {
                setIsEditMode(false);
                setObstacleName(obstacle.properties?.title || "Obstacle");
              }}
              disabled={isLoading}
              sx={{
                textTransform: "none",
                fontWeight: 500,
                px: 3,
                py: 1,
                borderRadius: 1.5,
                transition: "all 0.2s ease-in-out",
                "&:hover:not(:disabled)": {
                  bgcolor: "action.hover",
                  transform: "translateY(-1px)",
                },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveName}
              disabled={isLoading || !obstacleName.trim()}
              variant="contained"
              sx={{
                textTransform: "none",
                fontWeight: 600,
                px: 4,
                py: 1,
                borderRadius: 1.5,
                bgcolor: PRIMARY_BLUE,
                color: "white",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                transition: "all 0.2s ease-in-out",
                "&:hover:not(:disabled)": {
                  bgcolor: PRIMARY_BLUE,
                  opacity: 0.9,
                  boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
                },
                "&:disabled": {
                  bgcolor: "action.disabledBackground",
                  color: "action.disabled",
                },
              }}
            >
              Save
            </Button>
          </>
        ) : (
          <>
            <Button
              onClick={() => handleVote("confirm")}
              disabled={isLoading || !placeId}
              variant="contained"
              startIcon={<CheckCircleIcon />}
              sx={{
                textTransform: "none",
                fontWeight: 600,
                px: 3,
                py: 1,
                borderRadius: 1.5,
                bgcolor: PRIMARY_BLUE,
                color: "#ffffff",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                transition: "all 0.2s ease-in-out",
                "&:hover:not(:disabled)": {
                  bgcolor: PRIMARY_BLUE,
                  opacity: 0.9,
                  boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
                  transform: "translateY(-1px)",
                },
                "&:disabled": {
                  bgcolor: "action.disabledBackground",
                  color: "action.disabled",
                },
              }}
            >
              Confirm
            </Button>
            <Button
              onClick={() => handleVote("issue")}
              disabled={isLoading || !placeId}
              variant="outlined"
              startIcon={
                <Box
                  component="img"
                  src="/icons/maki/caution.svg"
                  alt="Caution"
                  sx={{
                    width: 20,
                    height: 20,
                    display: "block",
                  }}
                />
              }
              sx={{
                textTransform: "none",
                fontWeight: 600,
                px: 3,
                py: 1,
                borderRadius: 1.5,
                bgcolor: "transparent",
                color: "#000000",
                borderColor: "#FFC107",
                borderWidth: 2,
                boxShadow: "none",
                transition: "all 0.2s ease-in-out",
                "&:hover:not(:disabled)": {
                  bgcolor: "transparent",
                  borderColor: "#FFC107",
                  transform: "translateY(-1px)",
                },
                "&:disabled": {
                  borderColor: "action.disabledBackground",
                  color: "action.disabled",
                },
              }}
            >
              Report
            </Button>
            <Button
              onClick={() => setIsEditMode(true)}
              disabled={isLoading}
              variant="outlined"
              startIcon={<EditIcon />}
              sx={{
                textTransform: "none",
                fontWeight: 500,
                px: 3,
                py: 1,
                borderRadius: 1.5,
                borderColor: PRIMARY_BLUE,
                color: PRIMARY_BLUE,
                transition: "all 0.2s ease-in-out",
                "&:hover:not(:disabled)": {
                  bgcolor: PRIMARY_BLUE + "10",
                  borderColor: PRIMARY_BLUE,
                  transform: "translateY(-1px)",
                },
              }}
            >
              Edit
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

