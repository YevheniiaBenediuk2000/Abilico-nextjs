"use client";

import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/ui.css";
import "leaflet/dist/leaflet.css";
import "../styles/poi-badge.css";
import MapContainer from "../MapContainer";
import { supabase } from "../auth/page";
import { getNextRegistrationStep } from "../utils/userPreferences";

import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Avatar from "@mui/material/Avatar";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import ListItemIcon from "@mui/material/ListItemIcon";
import { deepOrange, deepPurple } from "@mui/material/colors";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import FavoriteIcon from "@mui/icons-material/Favorite";
import AddLocationIcon from "@mui/icons-material/AddLocation";
import Tooltip from "@mui/material/Tooltip";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";

import { queryClient } from "../queryClient";
import AddPlaceDialog from "./AddPlaceDialog";
import ToastHost from "./ToastHost";
import AbilicoLogo from "./AbilicoLogo";
import { PRIMARY_BLUE } from "../constants/constants.mjs";

// Helper function to get initials from email
function getInitialsFromEmail(email) {
  if (!email) return "?";
  const parts = email.split("@")[0];
  const words = parts.split(/[._-]/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return parts.substring(0, 2).toUpperCase();
}

// Helper function to get color based on email
function getAvatarColor(email) {
  if (!email) return deepOrange[500];
  const hash = email
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return hash % 2 === 0 ? deepOrange[500] : deepPurple[500];
}

export default function MapLayout({
  isDashboard = false,
  children,
  hideSidebar = false,
}) {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [user, setUser] = useState(null);
  const [isPlacesListOpen, setIsPlacesListOpen] = useState(false);
  const [avatarMenuAnchor, setAvatarMenuAnchor] = useState(null);
  const [addPlaceDialogOpen, setAddPlaceDialogOpen] = useState(false);

  // Keep sidebar closed when hideSidebar is true
  const effectiveIsPlacesListOpen = hideSidebar ? false : isPlacesListOpen;

  // Remove shadow from header when sidebar is open on mobile
  const headerElevation = isMobile && effectiveIsPlacesListOpen ? 0 : 1;

  // ✅ Track user session
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);

      // ✅ Handle password recovery - redirect to auth page with recovery flag
      if (event === "PASSWORD_RECOVERY") {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("passwordRecovery", "true");
          window.location.assign("/auth");
        }
        return;
      }

      // ✅ Fix gray map issue: invalidate size after authentication (without causing visible "pan jumps")
      if (event === "SIGNED_IN" && typeof window !== "undefined") {
        const safeInvalidate = () => {
          if (window.map && typeof window.map.invalidateSize === "function") {
            try {
              window.map.invalidateSize({ pan: false, animate: false });
            } catch (error) {
              console.warn(
                "Failed to invalidate map size after sign in:",
                error
              );
            }
          }
        };

        // Double-rAF to wait for layout + paint.
        requestAnimationFrame(() => requestAnimationFrame(safeInvalidate));
      }

      // Force map refresh on logout to clear user-specific state
      if (event === "SIGNED_OUT") {
        // Clear any user-specific caches
        if (typeof window !== "undefined" && window.clearAllCaches) {
          window.clearAllCaches();
        }

        // Force map refresh by reloading the page if we're on the map page
        if (!isDashboard && !hideSidebar) {
          // Small delay to ensure logout completes
          setTimeout(() => {
            window.location.reload();
          }, 100);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [isDashboard, hideSidebar]);

  // ✅ Listen for dialog reopen event (after location selection)
  useEffect(() => {
    const handleReopen = (e) => {
      // Reopen the dialog with the selected location
      setAddPlaceDialogOpen(true);
    };

    window.addEventListener("add-place-dialog-reopen", handleReopen);
    return () => {
      window.removeEventListener("add-place-dialog-reopen", handleReopen);
    };
  }, []);

  // ✅ Protect dashboard and check registration status
  useEffect(() => {
    if (isDashboard && user === null) {
      // user not loaded yet, wait
      return;
    }
    if (isDashboard && !user) {
      router.push("/auth");
      return;
    }
    // Check if user has completed registration steps
    if (isDashboard && user) {
      async function checkRegistration() {
        const nextStep = await getNextRegistrationStep(supabase, user.id);
        if (nextStep) {
          router.push(nextStep);
        }
      }
      checkRegistration();
    }
  }, [isDashboard, user, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="d-flex flex-column min-vh-100">
        {/* === MUI AppBar with burger + search + account === */}
        <AppBar
          elevation={headerElevation}
          position="static"
          color="transparent"
          sx={{
            bgcolor: effectiveIsPlacesListOpen ? "#fafafa" : "#fff",
            color: "text.primary",
            borderBottom: effectiveIsPlacesListOpen
              ? "1px solid rgba(0,0,0,0.08)"
              : "1px solid rgba(0,0,0,0.12)",
            transition: "background-color 0.2s ease, border-color 0.2s ease",
          }}
        >
          <Toolbar sx={{ gap: 2 }}>
            {/* LEFT: burger + logo */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {!hideSidebar && (
                <IconButton
                  size="large"
                  edge="start"
                  aria-label={
                    isPlacesListOpen ? "close places list" : "open places list"
                  }
                  onClick={() => setIsPlacesListOpen((prev) => !prev)}
                  sx={{
                    color: "rgba(0, 0, 0, 0.54)",
                    "&:hover": {
                      backgroundColor: "rgba(0, 0, 0, 0.04)",
                    },
                  }}
                >
                  {isPlacesListOpen ? <CloseIcon /> : <MenuIcon />}
                </IconButton>
              )}

              <Box className="header-logo-container">
                <AbilicoLogo
                  logoHeight={26}
                  showText
                  horizontal
                  onClick={() => {
                    // Force full page reload to ensure map initializes properly
                    window.location.href = "/";
                  }}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.3, // logo + text closer together
                  }}
                  textSx={{
                    display: { xs: "none", sm: "block" },
                    fontSize: { sm: "20px", md: "22px" },
                    lineHeight: 1,
                  }}
                />
              </Box>
            </Box>

            {/* CENTER: search bar, centered in available space */}
            <Box
              sx={{
                flex: 1,
                display: "flex",
                justifyContent: "center",
                px: { xs: 1, sm: 2 },
              }}
            >
              <Box
                id="destination-search-bar"
                sx={{
                  width: "100%",
                  maxWidth: 600,
                  position: "relative",
                }}
              >
                <TextField
                  id="destination-search-input"
                  placeholder="Search place or click on the map…"
                  variant="outlined"
                  color="inherit"
                  fullWidth
                  size="small"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <SearchIcon className="route-search-icon" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "#fff",
                      "& fieldset": {
                        borderColor: "rgba(0, 0, 0, 0.23)",
                      },
                      "&:hover fieldset": {
                        borderColor: "rgba(0, 0, 0, 0.87)",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "rgba(0, 0, 0, 0.87)",
                      },
                    },
                  }}
                  inputProps={{
                    "aria-label": "Search places",
                    "aria-controls": "destination-suggestions",
                  }}
                />

                <div
                  id="destination-suggestions"
                  className="w-100 d-none search-suggestions"
                  aria-label="Search suggestions"
                ></div>
              </Box>
            </Box>

            {/* RIGHT: Add button + account area (always pushed to the right) */}
            <Box
              sx={{
                ml: "auto", // 👈 pushes this box to the far right
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              {/* Add Place button - visible to all users */}
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<AddLocationIcon />}
                onClick={() => setAddPlaceDialogOpen(true)}
                aria-label="add place"
                sx={{
                  bgcolor: PRIMARY_BLUE,
                  color: "white",
                  borderRadius: "25px",
                  px: 2,
                  py: 0.75,
                  minWidth: "auto",
                  textTransform: "none",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                  "&:hover": {
                    bgcolor: PRIMARY_BLUE,
                    opacity: 0.9,
                    boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
                  },
                  "& .MuiButton-startIcon": {
                    margin: "0 8px 0 0",
                  },
                  "@media (max-width: 768px)": {
                    px: 1.5,
                    minWidth: "40px",
                    "& .MuiButton-startIcon": {
                      margin: 0,
                    },
                  },
                }}
              >
                <Box
                  component="span"
                  sx={{
                    display: "inline",
                    "@media (max-width: 768px)": {
                      display: "none",
                    },
                  }}
                >
                  Add place
                </Box>
              </Button>

              {!user ? (
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={() => router.push("/auth")}
                  sx={{
                    borderRadius: "25px",
                    px: 2,
                    py: 0.75,
                    textTransform: "none",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                    borderColor: "rgba(0, 0, 0, 0.5)",
                    "&:hover": {
                      borderColor: "rgba(0, 0, 0, 0.8)",
                      backgroundColor: "rgba(0, 0, 0, 0.04)",
                    },
                  }}
                >
                  Log in
                </Button>
              ) : (
                <>
                  <IconButton
                    onClick={(e) => setAvatarMenuAnchor(e.currentTarget)}
                    sx={{ p: 0 }}
                  >
                    <Avatar sx={{ bgcolor: getAvatarColor(user.email) }}>
                      {getInitialsFromEmail(user.email)}
                    </Avatar>
                  </IconButton>
                  <Menu
                    anchorEl={avatarMenuAnchor}
                    open={Boolean(avatarMenuAnchor)}
                    onClose={() => setAvatarMenuAnchor(null)}
                    PaperProps={{
                      sx: {
                        minWidth: 200,
                      },
                    }}
                  >
                    <MenuItem disabled>
                      <Typography variant="body2" color="text.secondary">
                        {user.email}
                      </Typography>
                    </MenuItem>
                    <Divider />
                    <MenuItem
                      onClick={() => {
                        setAvatarMenuAnchor(null);
                        router.push("/profile");
                      }}
                    >
                      <ListItemIcon>
                        <PersonIcon fontSize="small" />
                      </ListItemIcon>
                      Profile
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        setAvatarMenuAnchor(null);
                        router.push("/saved-places");
                      }}
                    >
                      <ListItemIcon>
                        <FavoriteIcon fontSize="small" />
                      </ListItemIcon>
                      Saved places
                    </MenuItem>
                    <Divider />
                    <MenuItem
                      onClick={async () => {
                        setAvatarMenuAnchor(null);
                        await supabase.auth.signOut();
                        setUser(null);

                        // Clear caches on logout
                        if (
                          typeof window !== "undefined" &&
                          window.clearAllCaches
                        ) {
                          window.clearAllCaches();
                        }

                        if (isDashboard) {
                          router.push("/");
                        } else {
                          // Force page reload to refresh map state
                          window.location.reload();
                        }
                      }}
                      sx={{
                        color: "error.main",
                      }}
                    >
                      <ListItemIcon>
                        <LogoutIcon
                          fontSize="small"
                          sx={{ color: "error.main" }}
                        />
                      </ListItemIcon>
                      Log out
                    </MenuItem>
                  </Menu>
                </>
              )}
            </Box>
          </Toolbar>
        </AppBar>

        {/* === Map or Children === */}
        <main className="flex-grow-1 position-relative">
          {children ? (
            children
          ) : (
            <MapContainer
              user={user}
              isPlacesListOpen={effectiveIsPlacesListOpen}
              onPlacesListClose={() => setIsPlacesListOpen(false)}
            />
          )}
        </main>

        {/* Add Place Dialog */}
        <AddPlaceDialog
          open={addPlaceDialogOpen}
          onClose={() => setAddPlaceDialogOpen(false)}
        />

        {/* Global Toast Notifications */}
        <ToastHost />
      </div>
    </QueryClientProvider>
  );
}