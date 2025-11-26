"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./styles/ui.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "./styles/poi-badge.css";
import { supabase } from "./api/supabaseClient.js";

import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import Drawer from "@mui/material/Drawer";

import PlacesListReact from "./components/PlacesListReact";

function DetailsTabPanel({ value, active, children }) {
  const hidden = active !== value;

  return (
    <div
      role="tabpanel"
      id={`tab-${value}`} // keeps tab-overview / tab-reviews / tab-photos
      aria-labelledby={`${value}-tab`}
      hidden={hidden}
      className={hidden ? "d-none" : ""}
    >
      {children}
    </div>
  );
}

export default function MapContainer({
  user: initialUser,
  isPlacesListOpen = false,
  onPlacesListClose = () => {},
}) {
  const [user, setUser] = useState(initialUser);
  const router = useRouter();

  const [detailsTab, setDetailsTab] = useState("overview");
  const [placesListData, setPlacesListData] = useState(null);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [detailsTitle, setDetailsTitle] = useState("Details");

  // Expose a global function so mapMain.js can open the details drawer
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.openPlaceDetails = (titleText) => {
        if (titleText) setDetailsTitle(titleText);
        setDetailsDrawerOpen(true);
      };
      window.closePlaceDetails = () => {
        setDetailsDrawerOpen(false);
      };
    }

    return () => {
      if (typeof window !== "undefined") {
        delete window.openPlaceDetails;
        delete window.closePlaceDetails;
      }
    };
  }, []);

  const handleDetailsDrawerClose = () => {
    setDetailsDrawerOpen(false);
    if (
      typeof window !== "undefined" &&
      window.restoreDestinationSearchBarHome
    ) {
      window.restoreDestinationSearchBarHome();
    }
  };

  // Receive "places in viewport" data from mapMain.js
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.setPlacesListData = (payload) => {
      setPlacesListData(payload);
    };

    return () => {
      if (window.setPlacesListData) {
        delete window.setPlacesListData;
      }
    };
  }, []);

  // Track user session changes
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      // ✅ Dynamically import Leaflet + plugins
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      await import("leaflet.markercluster/dist/MarkerCluster.css");
      await import("leaflet.markercluster/dist/MarkerCluster.Default.css");
      await import("leaflet-draw");
      await import("leaflet-draw/dist/leaflet.draw.css");
      await import("leaflet-control-geocoder");
      await import("leaflet-control-geocoder/dist/Control.Geocoder.css");

      // ✅ Bootstrap JS
      await import("bootstrap/dist/js/bootstrap.bundle.min.js");
      window.bootstrap = await import("bootstrap");

      // ✅ Now that everything is rendered and loaded, run your main logic
      const { initMap, updateUser } = await import("./mapMain.js");
      if (isMounted) {
        await initMap(user); // <— pass user to initMap
        // Store updateUser function globally so we can call it when user changes
        window.updateMapUser = updateUser;
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []); // Only run once on mount

  // Update user state in mapMain when user changes
  useEffect(() => {
    if (window.updateMapUser) {
      window.updateMapUser(user);
    }
  }, [user]);

  // Allow non-React modules (fetchPhotos.mjs, etc.) to switch tabs
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.setDetailsTab = (tab) => {
      setDetailsTab(tab);
    };

    return () => {
      if (window.setDetailsTab) {
        delete window.setDetailsTab;
      }
    };
  }, []);

  const handlePlaceFromListSelect = (feature) => {
    if (
      typeof window !== "undefined" &&
      typeof window.selectPlaceFromListFeature === "function"
    ) {
      window.selectPlaceFromListFeature(feature);
    }
    // Close the drawer after selecting a place
    if (onPlacesListClose) {
      onPlacesListClose();
    }
  };

  return (
    <div>
      {/* === Map container === */}
      <div
        id="map"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      ></div>

      {/* === Places list Drawer (controlled by AppBar burger) === */}
      <Drawer
        variant="persistent"
        anchor="left"
        open={isPlacesListOpen}
        onClose={onPlacesListClose}
        ModalProps={{
          keepMounted: true, // (optional) keeps it mounted for better perf
        }}
        hideBackdrop
        PaperProps={{
          sx: (theme) => ({
            width: 360,
            maxWidth: "80vw",
            pt: 1,
            px: 1,
            boxShadow: "none", // ✅ remove the right-hand shadow
            borderRight: "1px solid rgba(0,0,0,0.12)", // optional subtle divider
            top: 56,
            height: "calc(100% - 56px)",
            [theme.breakpoints.up("sm")]: {
              top: 64,
              height: "calc(100% - 64px)",
            },
          }),
        }}
      >
        {placesListData ? (
          <PlacesListReact
            data={placesListData}
            onSelect={handlePlaceFromListSelect}
          />
        ) : (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Zoom in on the map to load accessible points of interest.
            </Typography>
          </Box>
        )}
      </Drawer>

      {/* === Details + Directions Drawer (MUI instead of Bootstrap Offcanvas) === */}
      <Drawer
        variant="persistent"
        anchor="right"
        open={detailsDrawerOpen}
        onClose={handleDetailsDrawerClose}
        ModalProps={{ keepMounted: true }}
        hideBackdrop
        PaperProps={{
          sx: (theme) => ({
            width: 420,
            maxWidth: "80vw",
            pt: 1,
            px: 1,
            boxShadow: "none", // ✅ remove the right-hand shadow
            borderRight: "1px solid rgba(0,0,0,0.12)", // optional subtle divider
            top: 56,
            height: "calc(100% - 56px)",
            [theme.breakpoints.up("sm")]: {
              top: 64,
              height: "calc(100% - 64px)",
            },
          }),
        }}
      >
        {/* keep these IDs so existing JS (mapMain, modules) can still find them */}
        <div id="placeOffcanvas">
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 1,
            }}
          >
            <Typography id="placeOffcanvasLabel" variant="h6" component="h2">
              {detailsTitle}
            </Typography>
            <IconButton
              aria-label="Close details"
              onClick={handleDetailsDrawerClose}
              size="small"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <div className="offcanvas-body">
            {/* === Directions UI === */}
            <div id="directions-ui" className="mb-3 d-none">
              <div className="row g-2 align-items-center mb-1">
                <div className="col">
                  <label
                    className="form-label mb-1"
                    htmlFor="departure-search-input"
                  >
                    From
                  </label>
                  <div id="departure-search-bar" className="position-relative">
                    <TextField
                      size="small"
                      id="departure-search-input"
                      type="search"
                      variant="outlined"
                      fullWidth
                      className="form-control form-control-lg"
                      placeholder="Search place or click on the map…"
                      slotProps={{
                        input: {
                          "aria-label": "Search places",
                          "aria-controls": "destination-suggestions",
                        },
                      }}
                    />

                    <ul
                      className="list-group w-100 shadow d-none search-suggestions"
                      aria-label="Search suggestions"
                      id="departure-suggestions"
                    ></ul>
                  </div>
                </div>
              </div>

              <div className="row g-2 align-items-center mb-2">
                <div className="col">
                  <label
                    className="form-label mb-1"
                    htmlFor="destination-search-input"
                  >
                    To
                  </label>
                </div>
              </div>
            </div>

            {/* === Main photo (preview above tabs) === */}
            <figure className="figure d-none" id="main-photo-wrapper">
              <img
                id="main-photo"
                className="figure-img img-fluid shadow-sm mb-1"
                alt=""
              />
              <figcaption
                id="main-photo-caption"
                className="figure-caption small text-muted"
              ></figcaption>
            </figure>

            {/* === Details Panel with Tabs === */}
            <div id="details-panel" className="d-none">
              {/* MUI Tabs navigation */}
              <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
                <Tabs
                  value={detailsTab}
                  onChange={(_, newValue) => setDetailsTab(newValue)}
                  aria-label="Place details tabs"
                  variant="fullWidth"
                >
                  <Tab
                    id="overview-tab"
                    label="Overview"
                    value="overview"
                    aria-controls="tab-overview"
                  />
                  <Tab
                    id="reviews-tab"
                    label="Reviews"
                    value="reviews"
                    aria-controls="tab-reviews"
                  />
                  <Tab
                    id="photos-tab"
                    label="Photos"
                    value="photos"
                    aria-controls="tab-photos"
                  />
                </Tabs>
              </Box>

              {/* Tabs content */}
              <div className="pt-3" id="detailsTabsContent">
                {/* --- Overview tab --- */}
                <DetailsTabPanel value="overview" active={detailsTab}>
                  <div className="d-grid gap-2 mb-3">
                    <div
                      className="btn-group"
                      role="group"
                      aria-label="Quick route actions"
                    >
                      <button
                        id="btn-start-here"
                        type="button"
                        className="btn btn-outline-primary"
                      >
                        Start here
                      </button>
                      <button
                        id="btn-go-here"
                        type="button"
                        className="btn btn-outline-danger"
                      >
                        Go here
                      </button>
                    </div>
                  </div>
                  <div className="card shadow-sm">
                    <div
                      className="list-group list-group-flush"
                      id="details-list"
                    ></div>
                  </div>
                </DetailsTabPanel>

                {/* --- Reviews tab --- */}
                <DetailsTabPanel value="reviews" active={detailsTab}>
                  <div className="card shadow-sm">
                    <div className="card-body">
                      <h6 className="mb-3">Reviews</h6>

                      {/* Review form - only shown for logged-in users */}
                      {user ? (
                        <form id="review-form" className="d-grid gap-2 mb-3">
                          <textarea
                            id="review-text"
                            className="form-control"
                            placeholder="Write your review…"
                            required
                          ></textarea>
                          <Button
                            id="submit-review-btn"
                            type="submit"
                            variant="outlined"
                          >
                            Submit Review
                          </Button>
                        </form>
                      ) : (
                        /* CTA card for non-logged-in users */
                        <div className="card bg-light border mb-3">
                          <div className="card-body text-center py-4">
                            <h6 className="mb-2">Want to leave a review?</h6>
                            <p className="small text-muted mb-3">
                              Log in or create an account to share your
                              experience.
                            </p>
                            <Button
                              variant="contained"
                              color="primary"
                              onClick={() => router.push("/auth")}
                            >
                              Log in / Sign up
                            </Button>
                          </div>
                        </div>
                      )}

                      <ul id="reviews-list" className="list-group"></ul>
                    </div>
                  </div>
                </DetailsTabPanel>

                {/* --- Photos tab --- */}
                <DetailsTabPanel value="photos" active={detailsTab}>
                  <div id="photos-empty" className="text-muted small d-none">
                    No photos found for this place.
                  </div>
                  <div id="photos-grid" className="row g-2"></div>
                </DetailsTabPanel>
              </div>
            </div>
          </div>
        </div>
      </Drawer>

      {/* === Obstacle Modal === */}
      <div
        className="modal fade"
        id="obstacleModal"
        tabIndex="-1"
        aria-hidden="true"
        aria-labelledby="obstacleModalLabel"
      >
        <div className="modal-dialog">
          <form className="modal-content" id="obstacle-form">
            <div className="modal-header">
              <h5 className="modal-title">Obstacle details</h5>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body">
              <input
                id="obstacle-title"
                className="form-control"
                placeholder="e.g., Damaged curb ramp"
                required
              />
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                data-bs-dismiss="modal"
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* === Draw Help Alert (template for DrawHelpAlert control) === */}
      <div id="draw-help-alert" className="d-none">
        <Card>
          <CardContent
            sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}
          >
            <span className="fs-5" aria-hidden="true">
              🧱
            </span>

            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle1" component="h6" gutterBottom>
                Draw obstacles
              </Typography>
              <Typography variant="body2" color="text.secondary">
                You can mark areas the route should avoid.
              </Typography>
            </Box>

            <IconButton
              size="small"
              aria-label="Dismiss draw help"
              data-role="draw-help-close"
              sx={{ mt: -0.5 }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </CardContent>
        </Card>
      </div>

      {/* === Global Loading Bar === */}
      <div
        id="global-loading"
        className="position-fixed top-0 start-0 w-100 d-none"
        style={{ zIndex: 2000 }}
      >
        <div className="progress rounded-0" style={{ height: "0.24rem" }}>
          <div
            className="progress-bar progress-bar-striped progress-bar-animated"
            style={{ width: "100%" }}
          ></div>
        </div>
      </div>

      {/* === Toast Stack === */}
      <div aria-live="polite" aria-atomic="true" className="position-relative">
        <div
          id="toast-stack"
          className="toast-container position-fixed top-0 end-0 p-3"
        ></div>
      </div>

      {/* === Obstacle Management Overlay (for non-logged-in users) === */}
      {!user && (
        <div id="obstacle-management-overlay" className="position-absolute">
          <Card sx={{ maxWidth: 280 }}>
            <CardContent>
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="fs-5" aria-hidden="true">
                  🔒
                </span>
                <Typography variant="subtitle1" component="h6">
                  Log in to manage obstacles
                </Typography>
              </div>
              <Typography variant="body2" color="grey.600">
                You need to be logged in to add, edit or delete obstacles.
              </Typography>
            </CardContent>
            <CardActions sx={{ pt: 0 }}>
              <Button
                variant="contained"
                color="primary"
                size="small"
                fullWidth
                onClick={() => router.push("/auth")}
              >
                Log in
              </Button>
            </CardActions>
          </Card>
        </div>
      )}
    </div>
  );
}
