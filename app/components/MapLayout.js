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
import InputBase from "@mui/material/InputBase";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import { styled, alpha } from "@mui/material/styles";

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

// === AppBar search styling (from MUI example, adapted) ===
const Search = styled("div")(({ theme }) => ({
  position: "relative",
  borderRadius: theme.shape.borderRadius,
  backgroundColor: alpha(theme.palette.common.white, 0.15),
  "&:hover": {
    backgroundColor: alpha(theme.palette.common.white, 0.25),
  },
  marginLeft: 0,
  width: "100%",
  [theme.breakpoints.up("sm")]: {
    marginLeft: theme.spacing(1),
    width: "auto",
  },
}));

const SearchIconWrapper = styled("div")(({ theme }) => ({
  padding: theme.spacing(0, 2),
  height: "100%",
  position: "absolute",
  pointerEvents: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: "inherit",
  "& .MuiInputBase-input": {
    padding: theme.spacing(1, 1, 1, 0),
    // vertical padding + font size from searchIcon
    paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    transition: theme.transitions.create("width"),
    width: "100%",
    [theme.breakpoints.up("md")]: {
      width: "32ch",
    },
  },
}));

export default function MapLayout({ isDashboard = false }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [has2FA, setHas2FA] = useState(false);
  const [isPlacesListOpen, setIsPlacesListOpen] = useState(false);

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
        <AppBar position="static" color="primary" elevation={1}>
          <Toolbar>
            {/* Burger: toggles places list drawer */}
            <IconButton
              size="large"
              edge="start"
              color="inherit"
              aria-label="open places list"
              sx={{ mr: 2 }}
              onClick={() => setIsPlacesListOpen((prev) => !prev)}
            >
              <MenuIcon />
            </IconButton>

            <Typography
              variant="h6"
              noWrap
              component="div"
              sx={{ display: { xs: "none", sm: "block" }, mr: 2 }}
            >
              Abilico
            </Typography>

            {/* Search (wired to existing DOM IDs expected by mapMain.js) */}
            <Box
              id="destination-search-bar"
              sx={{
                flexGrow: 1,
                maxWidth: 600,
                position: "relative",
                mr: 2,
              }}
            >
              <Search>
                <SearchIconWrapper>
                  <SearchIcon />
                </SearchIconWrapper>
                <StyledInputBase
                  id="destination-search-input"
                  placeholder="Search place or click on the map…"
                  inputProps={{
                    "aria-label": "Search places",
                    "aria-controls": "destination-suggestions",
                  }}
                />
              </Search>
              <ul
                id="destination-suggestions"
                className="list-group w-100 shadow d-none search-suggestions"
                aria-label="Search suggestions"
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
                  <Typography
                    variant="body2"
                    sx={{ display: { xs: "none", sm: "block" } }}
                  >
                    {user.email}
                  </Typography>

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

                if (verifyErr) alert("❌ Wrong code");
                else alert("✅ 2FA verified and enabled!");
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
