"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../auth/page";
import MapLayout from "../components/MapLayout";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import SecurityIcon from "@mui/icons-material/Security";
import EmailIcon from "@mui/icons-material/Email";
import LockIcon from "@mui/icons-material/Lock";
import AccessibilityNewIcon from "@mui/icons-material/AccessibilityNew";
import EditIcon from "@mui/icons-material/Edit";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import { deepOrange, deepPurple } from "@mui/material/colors";
import AccessibilityPreferencesEditor from "../components/AccessibilityPreferencesEditor";
import { ACCESSIBILITY_CATEGORY_LABELS } from "../constants/accessibilityCategories";

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

let currentFactorId = null;

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [securityExpanded, setSecurityExpanded] = useState(false);
  const [has2FA, setHas2FA] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [showPreferencesEditor, setShowPreferencesEditor] = useState(false);
  const [showDisabilityEditor, setShowDisabilityEditor] = useState(false);

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

  // ✅ Load user profile data
  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      setLoadingProfile(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("accessibility_preferences, disability_types, home_area, full_name")
          .eq("id", user.id)
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          console.error("Error loading profile:", error);
        } else {
          setProfile(data || {
            accessibility_preferences: [],
            disability_types: [],
            home_area: null,
            full_name: null,
          });
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setLoadingProfile(false);
      }
    }
    loadProfile();
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

  // Handle setting up 2FA
  const handleSetupMFA = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
    });
    if (error) {
      alert("❌ Failed to start 2FA setup");
      console.error(error);
      return;
    }
    currentFactorId = data.id;
    setQrCode(data.totp.qr_code);
    setShow2FASetup(true);
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

  // Handle verifying 2FA code
  const handleVerify2FA = async () => {
    if (!currentFactorId) {
      alert('⚠️ Please start 2FA setup first.');
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
      code: totpCode,
    });

    if (verifyErr) {
      alert("❌ Wrong code");
    } else {
      alert("✅ 2FA verified and enabled!");
      setShow2FASetup(false);
      setTotpCode("");
      await refreshMFAStatus();
      await supabase.auth.refreshSession();
    }
  };

  // Handle password change using Supabase's updateUser
  const handlePasswordChange = async () => {
    setPasswordError("");
    setPasswordSuccess("");

    // Validation
    if (!newPassword || !confirmPassword) {
      setPasswordError("All fields are required");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    try {
      // Update password using Supabase's updateUser method
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setPasswordError(updateError.message || "Failed to update password");
        return;
      }

      setPasswordSuccess("Password updated successfully!");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordChange(false);

      // Clear success message after 3 seconds
      setTimeout(() => {
        setPasswordSuccess("");
      }, 3000);
    } catch (error) {
      setPasswordError("An error occurred while changing password");
      console.error(error);
    }
  };

  if (!user) {
    return (
      <MapLayout isDashboard={true}>
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
          <Typography>Loading...</Typography>
        </Box>
      </MapLayout>
    );
  }

  return (
    <MapLayout isDashboard={true}>
      <Box
        sx={{
          maxWidth: 800,
          mx: "auto",
          mt: 4,
          mb: 4,
          px: 2,
        }}
      >
        <Card
          sx={{
            bgcolor: "#fff",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >
          <CardContent sx={{ p: 4 }}>
            {/* Profile Header */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                mb: 4,
              }}
            >
              <Avatar
                sx={{
                  bgcolor: getAvatarColor(user.email),
                  width: 80,
                  height: 80,
                  mb: 2,
                  fontSize: "2rem",
                }}
              >
                {getInitialsFromEmail(user.email)}
              </Avatar>
              <Typography variant="h5" component="h1" sx={{ mb: 1, fontWeight: 500 }}>
                Profile
              </Typography>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Email Section */}
            <Box sx={{ mb: 3 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  mb: 2,
                }}
              >
                <EmailIcon sx={{ color: "text.secondary" }} />
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Email
                  </Typography>
                  <Typography variant="body1">{user.email}</Typography>
                </Box>
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Accessibility Settings Section */}
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <AccessibilityNewIcon sx={{ color: "text.secondary" }} />
                <Typography variant="h6" sx={{ fontWeight: 500 }}>
                  Accessibility Settings
                </Typography>
              </Box>

              {loadingProfile ? (
                <Typography variant="body2" color="text.secondary">
                  Loading...
                </Typography>
              ) : (
                <>
                  {/* Accessibility Preferences */}
                  <Box sx={{ mb: 3 }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        mb: 1.5,
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Accessibility preferences
                      </Typography>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<EditIcon />}
                        onClick={() => setShowPreferencesEditor(true)}
                      >
                        Edit preferences
                      </Button>
                    </Box>
                    {profile?.accessibility_preferences?.length > 0 ? (
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {profile.accessibility_preferences.map((pref) => (
                          <Chip
                            key={pref}
                            label={ACCESSIBILITY_CATEGORY_LABELS[pref] || pref}
                            size="small"
                            variant="outlined"
                          />
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary" fontStyle="italic">
                        No preferences selected yet
                      </Typography>
                    )}
                  </Box>

                  {/* Disability Types */}
                  <Box sx={{ mb: 2 }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        mb: 1.5,
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Disability type(s)
                      </Typography>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<EditIcon />}
                        onClick={() => setShowDisabilityEditor(true)}
                      >
                        Edit disability info
                      </Button>
                    </Box>
                    {profile?.disability_types?.length > 0 ? (
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {profile.disability_types.map((type) => (
                          <Chip
                            key={type}
                            label={type}
                            size="small"
                            variant="outlined"
                            color="primary"
                          />
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary" fontStyle="italic">
                        Not specified yet
                      </Typography>
                    )}
                  </Box>
                </>
              )}
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Security Section */}
            <Box>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
                Security
              </Typography>
              <List sx={{ bgcolor: "background.paper" }}>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => setSecurityExpanded(!securityExpanded)}
                    sx={{
                      borderRadius: 1,
                      bgcolor: securityExpanded ? "action.hover" : "transparent",
                      "&:hover": {
                        bgcolor: "action.hover",
                      },
                    }}
                  >
                    <ListItemIcon>
                      <SecurityIcon sx={{ color: "text.secondary" }} />
                    </ListItemIcon>
                    <ListItemText
                      primary="Security Settings"
                      secondary={securityExpanded ? "Click to collapse" : "Click to expand"}
                    />
                  </ListItemButton>
                </ListItem>
              </List>

              {/* Security Content */}
              {securityExpanded && (
                <Box
                  sx={{
                    mt: 2,
                    p: 3,
                  }}
                >
                  {/* Password Change Section */}
                  <Box sx={{ mb: 4 }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <LockIcon sx={{ color: "text.secondary" }} />
                        <Box>
                          <Typography variant="body1" sx={{ fontWeight: 500 }}>
                            Change Password
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Update your account password
                          </Typography>
                        </Box>
                      </Box>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                          setShowPasswordChange(!showPasswordChange);
                          setPasswordError("");
                          setPasswordSuccess("");
                          setNewPassword("");
                          setConfirmPassword("");
                        }}
                      >
                        {showPasswordChange ? "Cancel" : "Change"}
                      </Button>
                    </Box>

                    {showPasswordChange && (
                      <Box
                        sx={{
                          mt: 2,
                          p: 3,
                          bgcolor: "background.paper",
                          borderRadius: 1,
                          border: "1px solid",
                          borderColor: "divider",
                        }}
                      >
                        <TextField
                          fullWidth
                          label="New Password"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          sx={{ mb: 2 }}
                          autoComplete="new-password"
                          helperText="Must be at least 6 characters"
                        />
                        <TextField
                          fullWidth
                          label="Confirm New Password"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          sx={{ mb: 2 }}
                          autoComplete="new-password"
                        />
                        {passwordError && (
                          <Typography variant="body2" color="error" sx={{ mb: 2 }}>
                            {passwordError}
                          </Typography>
                        )}
                        {passwordSuccess && (
                          <Typography variant="body2" color="success.main" sx={{ mb: 2 }}>
                            {passwordSuccess}
                          </Typography>
                        )}
                        <Button
                          variant="contained"
                          color="primary"
                          onClick={handlePasswordChange}
                          fullWidth
                        >
                          Update Password
                        </Button>
                      </Box>
                    )}
                  </Box>

                  <Divider sx={{ my: 3 }} />

                  {/* 2FA Toggle */}
                  <Box sx={{ mb: 3 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={has2FA}
                          onChange={async (e) => {
                            if (e.target.checked) {
                              // Enable 2FA
                              await handleSetupMFA();
                            } else {
                              // Disable 2FA
                              await handleDisableMFA();
                            }
                          }}
                          color="primary"
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body1" sx={{ fontWeight: 500 }}>
                            Two-Factor Authentication (2FA)
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Add an extra layer of security to your account
                          </Typography>
                        </Box>
                      }
                    />
                  </Box>

                  {/* 2FA Setup Section */}
                  {show2FASetup && (
                    <Box
                      sx={{
                        mt: 3,
                        p: 3,
                        bgcolor: "background.paper",
                        borderRadius: 1,
                        border: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 500 }}>
                        Set up Two-Factor Authentication
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Scan this QR code with Google Authenticator, then enter the 6-digit code:
                      </Typography>
                      {qrCode && (
                        <Box sx={{ display: "flex", justifyContent: "center", mb: 3 }}>
                          <img src={qrCode} alt="QR code" width="200" height="200" />
                        </Box>
                      )}
                      <TextField
                        fullWidth
                        label="Enter 6-digit code"
                        placeholder="123456"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        sx={{ mb: 2 }}
                        inputProps={{ maxLength: 6 }}
                      />
                      <Box sx={{ display: "flex", gap: 2 }}>
                        <Button
                          variant="contained"
                          color="success"
                          onClick={handleVerify2FA}
                        >
                          Verify Code
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={() => {
                            setShow2FASetup(false);
                            setQrCode("");
                            setTotpCode("");
                            currentFactorId = null;
                          }}
                        >
                          Cancel
                        </Button>
                      </Box>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Accessibility Preferences Editor Dialog */}
      {user && (
        <AccessibilityPreferencesEditor
          open={showPreferencesEditor}
          onClose={() => setShowPreferencesEditor(false)}
          supabase={supabase}
          userId={user.id}
          initialPreferences={profile?.accessibility_preferences || []}
          onSave={(newPreferences) => {
            // Update local profile state
            setProfile((prev) => ({
              ...prev,
              accessibility_preferences: newPreferences,
            }));
          }}
        />
      )}

      {/* TODO: Disability Editor Dialog - to be implemented when Step 3 is created */}
    </MapLayout>
  );
}

