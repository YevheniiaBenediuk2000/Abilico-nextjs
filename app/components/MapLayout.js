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
import SearchIcon from "@mui/icons-material/Search";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import FavoriteIcon from "@mui/icons-material/Favorite";
import AddIcon from "@mui/icons-material/Add";
import Tooltip from "@mui/material/Tooltip";

import { queryClient } from "../queryClient";
import AddPlaceDialog from "./AddPlaceDialog";
import ToastHost from "./ToastHost";

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

export default function MapLayout({ isDashboard = false, children, hideSidebar = false }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isPlacesListOpen, setIsPlacesListOpen] = useState(false);
  const [avatarMenuAnchor, setAvatarMenuAnchor] = useState(null);
  const [addPlaceDialogOpen, setAddPlaceDialogOpen] = useState(false);

  // Keep sidebar closed when hideSidebar is true
  const effectiveIsPlacesListOpen = hideSidebar ? false : isPlacesListOpen;

  // ✅ Track user session
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

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
          elevation={1}
          position="static"
          color="transparent"
          sx={{
            bgcolor: "#fff",
            color: "text.primary",
            borderBottom: "1px solid rgba(0,0,0,0.12)",
          }}
        >
          <Toolbar sx={{ gap: 2 }}>
            {/* LEFT: burger + logo */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {!hideSidebar && (
                <IconButton
                  size="large"
                  edge="start"
                  color="inherit"
                  aria-label="open places list"
                  onClick={() => setIsPlacesListOpen((prev) => !prev)}
                >
                  <MenuIcon />
                </IconButton>
              )}

              <Typography
                variant="h6"
                noWrap
                component="div"
                onClick={() => {
                  // Force full page reload to ensure map initializes properly
                  window.location.href = "/";
                }}
                sx={{ 
                  display: { xs: "none", sm: "block" },
                  cursor: "pointer",
                  "&:hover": {
                    opacity: 0.8
                  }
                }}
              >
                Abilico
              </Typography>
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
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ color: "text.secondary" }} />
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

                <ul
                  id="destination-suggestions"
                  className="list-group w-100 shadow d-none search-suggestions"
                  aria-label="Search suggestions"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    zIndex: 1001,
                    marginTop: 4,
                  }}
                ></ul>
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
                startIcon={<AddIcon />}
                onClick={() => setAddPlaceDialogOpen(true)}
                aria-label="add place"
                sx={{
                  bgcolor: "#1976d2",
                  color: "white",
                  borderRadius: "25px",
                  px: 2,
                  py: 0.75,
                  textTransform: "none",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                  "&:hover": {
                    bgcolor: "#1565c0",
                    boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
                  },
                }}
              >
                Add place
              </Button>

              {!user ? (
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={() => router.push("/auth")}
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
                        if (isDashboard) router.push("/");
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
