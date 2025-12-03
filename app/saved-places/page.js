"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../auth/page";
import MapLayout from "../components/MapLayout";
import PlacesListReact from "../components/PlacesListReact";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

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
              accessibility_status,
              osm_id,
              accessibility_keywords,
              photos
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

  // Convert saved places to GeoJSON features format for PlacesListReact
  const placesData = useMemo(() => {
    const features = savedPlaces
      .filter((sp) => sp.place)
      .map((savedPlace) => {
        const place = savedPlace.place;
        
        // Build tags object from place data
        const tags = {
          id: place.id,
          name: place.name,
          "addr:city": place.city,
          "addr:country": place.country,
          amenity: place.place_type,
          wheelchair: place.accessibility_status || "unknown",
          accessibility_status: place.accessibility_status,
          accessibility_keywords: place.accessibility_keywords,
          photos: place.photos,
          source: "user",
          ...(place.osm_id && { osm_id: place.osm_id }),
        };

        return {
          type: "Feature",
          properties: {
            ...tags,
            tags: tags,
            savedPlaceId: savedPlace.id, // Store the saved_places record ID for unsaving
          },
          geometry: {
            type: "Point",
            coordinates: [place.lon, place.lat],
          },
        };
      });

    return {
      features,
      center: null, // No center needed for saved places
      zoom: null,
    };
  }, [savedPlaces]);

  const handlePlaceSelect = (feature) => {
    if (!feature || !feature.properties) return;
    
    const place = feature.properties;
    const placeId = place.id;
    const lat = feature.geometry?.coordinates?.[1];
    const lon = feature.geometry?.coordinates?.[0];

    if (!placeId || !lat || !lon) return;

    // Store place ID in sessionStorage so the main page can pick it up
    if (typeof window !== "undefined") {
      sessionStorage.setItem("selectedPlaceId", placeId);
      sessionStorage.setItem("selectedPlaceLat", lat.toString());
      sessionStorage.setItem("selectedPlaceLon", lon.toString());
      sessionStorage.setItem("selectedPlaceName", place.name || place.tags?.name || "Place Details");
      sessionStorage.setItem("fromSavedPlaces", "true"); // Flag to indicate we came from saved places
    }

    // Force full page reload to ensure map is fully initialized
    window.location.href = "/";
  };

  const handleUnsave = async (feature) => {
    if (!feature || !feature.properties || !user) return;

    const savedPlaceId = feature.properties.savedPlaceId;
    const placeName = feature.properties.name || feature.properties.tags?.name || "Place";

    if (!savedPlaceId) {
      console.error("No savedPlaceId found in feature");
      return;
    }

    try {
      const { error } = await supabase
        .from("saved_places")
        .delete()
        .eq("id", savedPlaceId)
        .eq("user_id", user.id);

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

  if (loading) {
    return (
      <MapLayout hideSidebar>
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
    <MapLayout hideSidebar>
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="h6" component="h1">
            Saved Places
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {savedPlaces.length === 0
              ? "You haven't saved any places yet."
              : `${savedPlaces.length} saved place${savedPlaces.length !== 1 ? "s" : ""}`}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, overflow: "auto" }}>
          {placesData.features.length > 0 ? (
            <PlacesListReact
              data={placesData}
              onSelect={handlePlaceSelect}
              onUnsave={handleUnsave}
              hideControls={true}
            />
          ) : (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "50vh",
                p: 3,
                textAlign: "center",
              }}
            >
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No saved places yet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Start exploring the map and save places you want to visit later.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

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
    </MapLayout>
  );
}

