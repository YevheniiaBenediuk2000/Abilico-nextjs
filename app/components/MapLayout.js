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
import { deepOrange, deepPurple } from "@mui/material/colors";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";

import { queryClient } from "../queryClient";

let currentFactorId = null;

async function handleSetupMFA() {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
  });
  if (error) {
    alert("❌ Failed to start 2FA setup");
    console.error(error);
    return;
  }
  currentFactorId = data.id;
  document.getElementById("qr").src = data.totp.qr_code;
  document.getElementById("setup-container").style.display = "block";
}



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
  const hash = email.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return hash % 2 === 0 ? deepOrange[500] : deepPurple[500];
}

export default function MapLayout({ isDashboard = false }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [has2FA, setHas2FA] = useState(false);
  const [isPlacesListOpen, setIsPlacesListOpen] = useState(false);
  const [avatarMenuAnchor, setAvatarMenuAnchor] = useState(null);

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

  // ✅ Check if user already has verified TOTP 2FA
  useEffect(() => {
    async function checkMFA() {
      if (!user) return;
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.all?.some(
        (f) => f.factor_type === "totp" && f.status === "verified"
      );
      setHas2FA(!!verified);
    }
    checkMFA();
  }, [user]);

  // Refresh MFA status after operations
  const refreshMFAStatus = async () => {
    if (!user) return;
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.all?.some(
      (f) => f.factor_type === "totp" && f.status === "verified"
    );
    setHas2FA(!!verified);
  };

  // Handle disabling 2FA
  const handleDisableMFA = async () => {
    try {
      // Get all factors for the user
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        alert("❌ Failed to fetch 2FA factors");
        console.error(listError);
        return;
      }

      // Find the verified TOTP factor
      const verifiedTotp = factors?.all?.find(
        (f) => f.factor_type === "totp" && f.status === "verified"
      );

      if (!verifiedTotp) {
        alert("⚠️ No verified 2FA factor found");
        return;
      }

      // Confirm before disabling
      if (!confirm("Are you sure you want to disable 2FA? This will reduce your account security.")) {
        return;
      }

      // Unenroll the factor
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId: verifiedTotp.id,
      });

      if (unenrollError) {
        alert("❌ Failed to disable 2FA");
        console.error(unenrollError);
        return;
      }

      alert("✅ 2FA has been disabled");
      
      // Refresh MFA status and session
      await refreshMFAStatus();
      await supabase.auth.refreshSession();
    } catch (error) {
      alert("❌ An error occurred while disabling 2FA");
      console.error(error);
    }
  };

  // ✅ Protect dashboard
  useEffect(() => {
    if (isDashboard && user === null) {
      // user not loaded yet, wait
      return;
    }
    if (isDashboard && !user) {
      router.push("/auth");
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
            {/* Burger: toggles places list drawer */}
            <IconButton
              size="large"
              edge="start"
              color="inherit"
              aria-label="open places list"
              onClick={() => setIsPlacesListOpen((prev) => !prev)}
            >
              <MenuIcon />
            </IconButton>

            <Typography
              variant="h6"
              noWrap
              component="div"
              sx={{ display: { xs: "none", sm: "block" } }}
            >
              Abilico
            </Typography>

            {/* Search - centered in header, styled like login button */}
            <Box
              id="destination-search-bar"
              sx={{
                flex: 1,
                display: "flex",
                justifyContent: "center",
                maxWidth: 600,
                position: "relative",
                mx: "auto",
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

            {/* Account / auth area */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              {!user ? (
                // Not logged in
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={() => router.push("/auth")}
                >
                  Log in
                </Button>
              ) : (
                // Logged in
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
                  >
                    <MenuItem disabled>{user.email}</MenuItem>
                  </Menu>

                  {isDashboard && !has2FA && (
                    <Button
                      variant="outlined"
                      color="inherit"
                      size="small"
                      onClick={handleSetupMFA}
                    >
                      Enable 2FA
                    </Button>
                  )}

                  {isDashboard && has2FA && (
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={handleDisableMFA}
                    >
                      Disable 2FA
                    </Button>
                  )}

                  <Button
                    variant="outlined"
                    color="inherit"
                    size="small"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      setUser(null);
                      if (isDashboard) router.push("/");
                    }}
                  >
                    Log out
                  </Button>
                </>
              )}
            </Box>
          </Toolbar>
        </AppBar>

        {/* === 2FA setup section (only dashboard) === */}
        {isDashboard && (
          <div
            id="setup-container"
            style={{ display: "none", marginTop: "1rem" }}
          >
            <p>
              Scan this QR code with Google Authenticator, then enter the
              6-digit code:
            </p>
            <img id="qr" alt="QR code" width="200" height="200" />
            <input
              id="totp-code"
              type="text"
              placeholder="123456"
              className="form-control my-2"
            />
            <Button
              variant="contained"
              color="success"
              onClick={async () => {
                const code = document.getElementById("totp-code").value;

                if (!currentFactorId) {
                  alert('⚠️ Click "Enable 2FA" first to generate a QR code.');
                  return;
                }

                const { data: challenge, error: challengeErr } =
                  await supabase.auth.mfa.challenge({
                    factorId: currentFactorId,
                  });
                if (challengeErr) {
                  console.error("Challenge failed:", challengeErr);
                  alert("❌ Challenge creation failed.");
                  return;
                }

                const { error: verifyErr } = await supabase.auth.mfa.verify({
                  factorId: currentFactorId,
                  challengeId: challenge.id,
                  code,
                });

                if (verifyErr) {
                  alert("❌ Wrong code");
                } else {
                  alert("✅ 2FA verified and enabled!");
                  // Refresh MFA status after successful verification
                  const { data: factors } = await supabase.auth.mfa.listFactors();
                  const verified = factors?.all?.some(
                    (f) => f.factor_type === "totp" && f.status === "verified"
                  );
                  setHas2FA(!!verified);
                }
              }}
            >
              Verify Code
            </Button>
          </div>
        )}

        {/* === Map === */}
        <main className="flex-grow-1 position-relative">
          <MapContainer
            user={user}
            isPlacesListOpen={isPlacesListOpen}
            onPlacesListClose={() => setIsPlacesListOpen(false)}
          />
        </main>
      </div>
    </QueryClientProvider>
  );
}
