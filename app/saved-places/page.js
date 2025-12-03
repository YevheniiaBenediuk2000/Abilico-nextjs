"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../auth/page";
import MapLayout from "../components/MapLayout";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import FavoriteIcon from "@mui/icons-material/Favorite";
import Tooltip from "@mui/material/Tooltip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";

export default function SavedPlacesPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/auth");
      } else {
        setUser(data.user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.push("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user) return;

    const loadSavedPlaces = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("saved_places")
          .select(
            `
            id,
            created_at,
            place:places (
              id,
              name,
              city,
              country,
              lat,
              lon,
              place_type,
              accessibility_status
            )
          `
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error loading saved places:", error);
          return;
        }

        setSavedPlaces(data || []);
      } catch (err) {
        console.error("Error loading saved places:", err);
      } finally {
        setLoading(false);
      }
    };

    loadSavedPlaces();
  }, [user]);

  const handleUnsave = async (savedPlaceId, placeName) => {
    try {
      const { error } = await supabase
        .from("saved_places")
        .delete()
        .eq("id", savedPlaceId);

      if (error) {
        console.error("Error unsaving place:", error);
        setSnackbarMessage("Could not remove place. Please try again.");
        setSnackbarOpen(true);
        return;
      }

      // Remove from local state
      setSavedPlaces((prev) =>
        prev.filter((sp) => sp.id !== savedPlaceId)
      );

      setSnackbarMessage(`Removed ${placeName} from your saved places`);
      setSnackbarOpen(true);
    } catch (err) {
      console.error("Error unsaving place:", err);
      setSnackbarMessage("An unexpected error occurred. Please try again.");
      setSnackbarOpen(true);
    }
  };

  const handlePlaceClick = async (place) => {
    if (!place || !place.id) return;

    // Store place ID in sessionStorage so the main page can pick it up
    if (typeof window !== "undefined") {
      sessionStorage.setItem("selectedPlaceId", place.id);
      sessionStorage.setItem("selectedPlaceLat", place.lat.toString());
      sessionStorage.setItem("selectedPlaceLon", place.lon.toString());
      sessionStorage.setItem("selectedPlaceName", place.name || "Place Details");
    }

    // Navigate to main page
    router.push("/");
  };

  if (loading) {
    return (
      <MapLayout>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "60vh",
          }}
        >
          <CircularProgress />
        </Box>
      </MapLayout>
    );
  }

  return (
    <MapLayout>
      <Box sx={{ p: 3, maxWidth: 800, mx: "auto" }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Saved Places
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {savedPlaces.length === 0
            ? "You haven't saved any places yet."
            : `You have ${savedPlaces.length} saved place${savedPlaces.length !== 1 ? "s" : ""}.`}
        </Typography>

        {savedPlaces.length === 0 ? (
          <Card>
            <CardContent sx={{ textAlign: "center", py: 6 }}>
              <FavoriteIcon sx={{ fontSize: 64, color: "text.secondary", mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No saved places yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Start exploring the map and save places you want to visit later.
              </Typography>
              <Button
                variant="contained"
                onClick={() => router.push("/")}
                sx={{ textTransform: "none" }}
              >
                Explore Map
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <List>
              {savedPlaces.map((savedPlace, index) => {
                const place = savedPlace.place;
                if (!place) return null;

                return (
                  <div key={savedPlace.id}>
                    <ListItem
                      disablePadding
                      secondaryAction={
                        <Tooltip title="Remove from saved">
                          <IconButton
                            edge="end"
                            aria-label="Remove from saved"
                            onClick={() =>
                              handleUnsave(savedPlace.id, place.name || "Place")
                            }
                            sx={{ color: "error.main" }}
                          >
                            <FavoriteIcon />
                          </IconButton>
                        </Tooltip>
                      }
                    >
                      <ListItemButton onClick={() => handlePlaceClick(place)}>
                        <ListItemText
                          primary={place.name || "Unnamed Place"}
                          secondary={
                            <>
                              {place.city && (
                                <Typography
                                  component="span"
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  {place.city}
                                  {place.country && `, ${place.country}`}
                                </Typography>
                              )}
                              {place.place_type && (
                                <Typography
                                  component="span"
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ display: "block", mt: 0.5 }}
                                >
                                  {place.place_type}
                                </Typography>
                              )}
                            </>
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                    {index < savedPlaces.length - 1 && <Divider />}
                  </div>
                );
              })}
            </List>
          </Card>
        )}

        <Snackbar
          open={snackbarOpen}
          autoHideDuration={4000}
          onClose={() => setSnackbarOpen(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            onClose={() => setSnackbarOpen(false)}
            severity="success"
            variant="filled"
            sx={{ width: "100%" }}
          >
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </Box>
    </MapLayout>
  );
}

