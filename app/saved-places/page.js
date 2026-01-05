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
              *
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
  // For OSM places, we need to preserve ALL OSM tags (not just reconstruct)
  // For user places, use the same format as fetchUserPlaces.js
  const placesData = useMemo(() => {
    const features = savedPlaces
      .filter((sp) => sp.place)
      .map((savedPlace) => {
        const place = savedPlace.place;
        
        // Extract osm_type and osm_id if it exists
        let osmType = null;
        let osmId = null;
        if (place.osm_id) {
          if (typeof place.osm_id === 'string' && place.osm_id.includes('/')) {
            const parts = place.osm_id.split('/');
            osmType = parts[0];
            osmId = parts[1];
          }
        }

        // If this is an OSM place (has osm_id), we need to use the actual OSM tags
        // The database only stores basic fields, but OSM places have full tag data
        // For now, we'll use what we have and let renderDetails fetch full OSM tags when needed
        // But we need to preserve the structure so it can be fetched
        
        let tags = {};
        
        // For OSM places, start with basic info - full tags will be fetched by renderDetails
        if (osmId && osmType) {
          // OSM place - use minimal tags, renderDetails will fetch full OSM tags
          tags = {
            id: place.id,
            name: place.name,
            osm_id: place.osm_id,
            source: place.source || "osm",
          };
          
          // Add database fields that might override OSM
          if (place.city) tags["addr:city"] = place.city;
          if (place.country) tags["addr:country"] = place.country;
          
          // Extract wheelchair status from accessibility_keywords (from approved reports) or accessibility_status
          // Database values take precedence over OSM tags
          if (place.accessibility_keywords && typeof place.accessibility_keywords === 'object') {
            if (place.accessibility_keywords.wheelchair) {
              tags.wheelchair = place.accessibility_keywords.wheelchair;
            }
          } else if (place.accessibility_status) {
            tags.wheelchair = place.accessibility_status;
          }
          
          if (place.photos && Array.isArray(place.photos)) tags.photos = place.photos;
        } else {
          // User-added place - use same format as fetchUserPlaces.js
          tags = {
            name: place.name,
            place_type: place.place_type,
            source: place.source || "user",
            id: place.id,
          };

          // Map place_type to OSM-style tags
          if (place.place_type) {
            const typeToTag = {
              hotel: { tourism: "hotel" },
              restaurant: { amenity: "restaurant" },
              cafe: { amenity: "cafe" },
              hospital: { amenity: "hospital" },
              pharmacy: { amenity: "pharmacy" },
              library: { amenity: "library" },
              school: { amenity: "school" },
              park: { leisure: "park" },
              toilet: { amenity: "toilets" },
              parking: { amenity: "parking" },
              shop: { shop: "general" },
              stop: { public_transport: "stop_position" },
              shelter: { amenity: "shelter" },
              housing: { amenity: "residential" },
              other: {},
            };

            const tagMapping = typeToTag[place.place_type];
            if (tagMapping) {
              Object.assign(tags, tagMapping);
            } else {
              tags.amenity = place.place_type;
            }
          }

          // Add address fields
          if (place.city) tags["addr:city"] = place.city;
          if (place.country) tags["addr:country"] = place.country;
          if (place.accessibility_comments) tags.accessibility_comments = place.accessibility_comments;
          if (place.photos && Array.isArray(place.photos)) tags.photos = place.photos;

          // Add accessibility tags
          if (place.accessibility_keywords && typeof place.accessibility_keywords === 'object') {
            const accKw = place.accessibility_keywords;
            if (accKw.wheelchair) tags.wheelchair = accKw.wheelchair;
            if (accKw.step_free_entrance) tags["entrance:step_free"] = accKw.step_free_entrance;
            if (accKw.accessible_toilet) tags["toilets:wheelchair"] = accKw.accessible_toilet;
          }
          
          if (!tags.wheelchair && place.accessibility_status) {
            tags.wheelchair = place.accessibility_status;
          }
        }

        // Create GeoJSON feature
        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [place.lon, place.lat],
          },
          properties: {
            id: place.id,
            osm_id: place.osm_id || null,
            osm_type: osmType,
            name: place.name,
            tags: tags,
            source: place.source || (osmId ? "osm" : "user"),
            place_type: place.place_type,
            savedPlaceId: savedPlace.id,
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

