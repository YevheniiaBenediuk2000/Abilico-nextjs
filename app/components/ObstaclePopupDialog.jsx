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
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningIcon from "@mui/icons-material/Warning";
import EditIcon from "@mui/icons-material/Edit";
import { placeVotes } from "../api/placeVotes";
import { obstacleStorage } from "../api/obstacleStorage";
import { ensurePlaceExists } from "../api/reviewStorage";
import { toastError, toastSuccess } from "../utils/toast.mjs";

export default function ObstaclePopupDialog({ open, onClose, obstacle, onObstacleUpdate }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [obstacleName, setObstacleName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [placeId, setPlaceId] = useState(null);

  useEffect(() => {
    if (obstacle) {
      const title = obstacle.properties?.title || "Obstacle";
      setObstacleName(title);
      setIsEditMode(false);
      
      // Check if obstacle already has a place_id
      if (obstacle.place_id) {
        setPlaceId(obstacle.place_id);
      } else if (obstacle.geometry) {
        // Try to find or create place_id from obstacle location
        findPlaceForObstacle();
      }
    }
  }, [obstacle]);

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
      onClose();
    } catch (error) {
      console.error("Error submitting vote:", error);
      if (error.message?.includes("unique")) {
        toastError("You have already voted on this obstacle");
      } else {
        toastError("Failed to submit vote. Please try again.");
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
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h6">Obstacle Details</Typography>
        <IconButton
          aria-label="close"
          onClick={onClose}
          size="small"
          sx={{
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mt: 1 }}>
          {isEditMode ? (
            <Box>
              <TextField
                fullWidth
                label="Obstacle Name"
                value={obstacleName}
                onChange={(e) => setObstacleName(e.target.value)}
                placeholder="e.g., Damaged curb ramp"
                disabled={isLoading}
                autoFocus
                sx={{ mb: 2 }}
              />
            </Box>
          ) : (
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Name
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {obstacleName || "Obstacle"}
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        {isEditMode ? (
          <>
            <Button
              onClick={() => {
                setIsEditMode(false);
                setObstacleName(obstacle.properties?.title || "Obstacle");
              }}
              disabled={isLoading}
              variant="outlined"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveName}
              disabled={isLoading || !obstacleName.trim()}
              variant="contained"
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
              color="success"
              startIcon={<CheckCircleIcon />}
            >
              Confirm
            </Button>
            <Button
              onClick={() => handleVote("issue")}
              disabled={isLoading || !placeId}
              variant="contained"
              color="warning"
              startIcon={<WarningIcon />}
            >
              Report
            </Button>
            <Button
              onClick={() => setIsEditMode(true)}
              disabled={isLoading}
              variant="outlined"
              startIcon={<EditIcon />}
            >
              Edit
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

