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
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import SecurityIcon from "@mui/icons-material/Security";
import EmailIcon from "@mui/icons-material/Email";
import LockIcon from "@mui/icons-material/Lock";
import AccessibilityNewIcon from "@mui/icons-material/AccessibilityNew";
import EditIcon from "@mui/icons-material/Edit";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import CircularProgress from "@mui/material/CircularProgress";
import { deepOrange, deepPurple } from "@mui/material/colors";
import AccessibilityPreferencesEditor from "../components/AccessibilityPreferencesEditor";
import HomeAreaEditor from "../components/HomeAreaEditor";
import DisabilityTypesEditor from "../components/DisabilityTypesEditor";
import { ACCESSIBILITY_CATEGORY_LABELS } from "../constants/accessibilityCategories";
import { DIALOG_BORDER_RADIUS } from "../constants/constants.mjs";
import { toastSuccess, toastError } from "../utils/toast.mjs";

const DISABILITY_TYPES = [
  { id: "wheelchair", label: "Wheelchair User" },
  { id: "visual", label: "Visually Impaired" },
  { id: "hearing", label: "Hearing Impaired" },
  { id: "other", label: "Other" },
];

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
  const [accessibilityExpanded, setAccessibilityExpanded] = useState(false);
  const [showHomeAreaEditor, setShowHomeAreaEditor] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError, setNameError] = useState("");
  const [showDisable2FADialog, setShowDisable2FADialog] = useState(false);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

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
          .select(
            "accessibility_preferences, disability_types, home_area, full_name"
          )
          .eq("id", user.id)
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          console.error("Error loading profile:", error);
        } else {
          const profileData = data || {
            accessibility_preferences: [],
            disability_types: [],
            home_area: null,
            full_name: null,
          };
          setProfile(profileData);

          // Parse full_name into first name and surname
          if (profileData.full_name) {
            const nameParts = profileData.full_name.trim().split(/\s+/);
            if (nameParts.length >= 2) {
              setFirstName(nameParts.slice(0, -1).join(" "));
              setSurname(nameParts[nameParts.length - 1]);
            } else if (nameParts.length === 1) {
              setFirstName(nameParts[0]);
              setSurname("");
            } else {
              setFirstName("");
              setSurname("");
            }
          } else {
            setFirstName("");
            setSurname("");
          }
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
    try {
      // First, check for existing unverified factors and clean them up
      const { data: factors, error: listError } =
        await supabase.auth.mfa.listFactors();
      if (listError) {
        console.error("Error listing factors:", listError);
      } else {
        // Find and unenroll any unverified TOTP factors
        const unverifiedFactors = factors?.all?.filter(
          (f) => f.factor_type === "totp" && f.status !== "verified"
        );

        if (unverifiedFactors && unverifiedFactors.length > 0) {
          for (const factor of unverifiedFactors) {
            try {
              await supabase.auth.mfa.unenroll({ factorId: factor.id });
            } catch (unenrollErr) {
              console.warn(
                "Failed to unenroll unverified factor:",
                unenrollErr
              );
            }
          }
        }
      }

      // Now enroll a new factor
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
      });

      if (error) {
        toastError(
          error.message ||
            "An error occurred while setting up 2FA. Please try again.",
          {
            title: "Failed to Start 2FA Setup",
          }
        );
        console.error("2FA enrollment error:", error);
        // Refresh MFA status to ensure toggle reflects actual state
        await refreshMFAStatus();
        return;
      }

      currentFactorId = data.id;
      setQrCode(data.totp.qr_code);
      setShow2FASetup(true);
    } catch (error) {
      toastError(
        error.message || "An unexpected error occurred. Please try again.",
        {
          title: "Failed to Start 2FA Setup",
        }
      );
      console.error("2FA setup error:", error);
      // Refresh MFA status to ensure toggle reflects actual state
      await refreshMFAStatus();
    }
  };

  // Handle disabling 2FA (opens confirmation dialog)
  const handleDisableMFA = () => {
    setShowDisable2FADialog(true);
  };

  // Confirm and disable 2FA
  const confirmDisableMFA = async () => {
    setShowDisable2FADialog(false);

    try {
      // Get all factors for the user
      const { data: factors, error: listError } =
        await supabase.auth.mfa.listFactors();
      if (listError) {
        toastError(
          listError.message ||
            "Unable to retrieve your 2FA settings. Please try again.",
          {
            title: "Failed to Fetch 2FA Factors",
          }
        );
        console.error(listError);
        return;
      }

      // Find the verified TOTP factor
      const verifiedTotp = factors?.all?.find(
        (f) => f.factor_type === "totp" && f.status === "verified"
      );

      if (!verifiedTotp) {
        toastError("No verified 2FA factor was found on your account.", {
          title: "No 2FA Factor Found",
        });
        return;
      }

      // Unenroll the factor
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId: verifiedTotp.id,
      });

      if (unenrollError) {
        toastError(
          unenrollError.message || "Unable to disable 2FA. Please try again.",
          {
            title: "Failed to Disable 2FA",
          }
        );
        console.error(unenrollError);
        return;
      }

      // Show success message
      toastSuccess(
        "Two-factor authentication has been successfully disabled.",
        {
          title: "2FA Disabled",
        }
      );

      // Refresh MFA status and session
      await refreshMFAStatus();
      await supabase.auth.refreshSession();
    } catch (error) {
      toastError(
        error.message || "An unexpected error occurred. Please try again.",
        {
          title: "Error Disabling 2FA",
        }
      );
      console.error(error);
    }
  };

  // Handle verifying 2FA code
  const handleVerify2FA = async () => {
    if (!currentFactorId) {
      toastError("Please start 2FA setup first by toggling the switch.", {
        title: "Setup Required",
      });
      return;
    }

    const { data: challenge, error: challengeErr } =
      await supabase.auth.mfa.challenge({
        factorId: currentFactorId,
      });
    if (challengeErr) {
      console.error("Challenge failed:", challengeErr);
      toastError(
        challengeErr.message ||
          "Unable to create verification challenge. Please try again.",
        {
          title: "Verification Failed",
        }
      );
      return;
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: currentFactorId,
      challengeId: challenge.id,
      code: totpCode,
    });

    if (verifyErr) {
      toastError("The code you entered is incorrect. Please try again.", {
        title: "Invalid Code",
      });
    } else {
      toastSuccess("Two-factor authentication has been successfully enabled!", {
        title: "2FA Enabled",
      });
      setShow2FASetup(false);
      setTotpCode("");
      await refreshMFAStatus();
      await supabase.auth.refreshSession();
    }
  };

  // Handle saving name
  const handleSaveName = async () => {
    setNameError("");
    setNameLoading(true);

    try {
      const fullName = [firstName.trim(), surname.trim()]
        .filter(Boolean)
        .join(" ");
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName || null,
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("Error saving name:", updateError);
        setNameError(
          `Failed to save: ${updateError.message || "Unknown error"}`
        );
        setNameLoading(false);
        return;
      }

      setNameLoading(false);
      setProfile((prev) => ({
        ...prev,
        full_name: fullName || null,
      }));
      setIsEditingName(false);
    } catch (err) {
      console.error("Error:", err);
      setNameError("An error occurred. Please try again.");
      setNameLoading(false);
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

  // Handle account deletion
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") {
      toastError("Please type DELETE to confirm account deletion.", {
        title: "Confirmation Required",
      });
      return;
    }

    setDeleteAccountLoading(true);

    try {
      // Get the current session token
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toastError("Unable to verify your session. Please sign in again.", {
          title: "Session Error",
        });
        setDeleteAccountLoading(false);
        return;
      }

      // Call the delete account API
      const response = await fetch("/api/user/delete-account", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (!response.ok) {
        toastError(
          result.error || "Failed to delete account. Please try again.",
          {
            title: "Delete Account Failed",
          }
        );
        setDeleteAccountLoading(false);
        return;
      }

      // Sign out and redirect to auth page
      await supabase.auth.signOut();

      toastSuccess("Your account has been permanently deleted.", {
        title: "Account Deleted",
      });

      // Redirect to auth page
      if (typeof window !== "undefined") {
        window.location.assign("/auth");
      } else {
        router.push("/auth");
      }
    } catch (error) {
      console.error("Error deleting account:", error);
      toastError("An unexpected error occurred. Please try again.", {
        title: "Error",
      });
      setDeleteAccountLoading(false);
    }
  };

  if (!user) {
    return (
      <MapLayout isDashboard={true}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "50vh",
          }}
        >
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
              <Typography
                variant="h5"
                component="h1"
                sx={{ mb: 1, fontWeight: 500 }}
              >
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
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 0.5 }}
                  >
                    Email
                  </Typography>
                  <Typography variant="body1">{user.email}</Typography>
                </Box>
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Personal Information Section */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
                Personal Information
              </Typography>

              {loadingProfile ? (
                <Typography variant="body2" color="text.secondary">
                  Loading...
                </Typography>
              ) : (
                <>
                  {/* Full Name */}
                  <Box sx={{ mb: 2 }}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 0.5 }}
                    >
                      Name
                    </Typography>
                    {isEditingName ? (
                      <Grid
                        container
                        spacing={2}
                        alignItems="center"
                        sx={{ mt: 2 }}
                      >
                        <Grid item xs={12} sm={6}>
                          <TextField
                            fullWidth
                            label="Name"
                            value={firstName}
                            onChange={(e) => {
                              setFirstName(e.target.value);
                              setNameError("");
                            }}
                            autoFocus
                            size="small"
                            sx={{
                              "& .MuiOutlinedInput-root": {
                                borderRadius: 2,
                                fontSize: "0.875rem",
                                height: "32.5px",
                                "& fieldset": {
                                  borderWidth: 1.5,
                                  borderColor: "rgba(0, 0, 0, 0.23)",
                                },
                                "&:hover fieldset": {
                                  borderColor: "rgba(0, 0, 0, 0.5)",
                                },
                                "&.Mui-focused fieldset": {
                                  borderWidth: 2,
                                },
                              },
                              "& .MuiInputBase-input": {
                                py: 0.75,
                                fontSize: "0.875rem",
                                textAlign: "left",
                                "&::placeholder": {
                                  color: "text.secondary",
                                  opacity: 1,
                                },
                              },
                              "& .MuiInputLabel-root": {
                                fontSize: "0.875rem",
                                "&.MuiInputLabel-shrink": {
                                  transform:
                                    "translate(14px, -9px) scale(0.75)",
                                },
                              },
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <TextField
                            fullWidth
                            label="Surname"
                            value={surname}
                            onChange={(e) => {
                              setSurname(e.target.value);
                              setNameError("");
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleSaveName();
                              } else if (e.key === "Escape") {
                                setIsEditingName(false);
                                // Reset to original values
                                if (profile?.full_name) {
                                  const nameParts = profile.full_name
                                    .trim()
                                    .split(/\s+/);
                                  if (nameParts.length >= 2) {
                                    setFirstName(
                                      nameParts.slice(0, -1).join(" ")
                                    );
                                    setSurname(nameParts[nameParts.length - 1]);
                                  } else if (nameParts.length === 1) {
                                    setFirstName(nameParts[0]);
                                    setSurname("");
                                  }
                                } else {
                                  setFirstName("");
                                  setSurname("");
                                }
                                setNameError("");
                              }
                            }}
                            size="small"
                            sx={{
                              "& .MuiOutlinedInput-root": {
                                borderRadius: 2,
                                fontSize: "0.875rem",
                                height: "32.5px",
                                "& fieldset": {
                                  borderWidth: 1.5,
                                  borderColor: "rgba(0, 0, 0, 0.23)",
                                },
                                "&:hover fieldset": {
                                  borderColor: "rgba(0, 0, 0, 0.5)",
                                },
                                "&.Mui-focused fieldset": {
                                  borderWidth: 2,
                                },
                              },
                              "& .MuiInputBase-input": {
                                py: 0.75,
                                fontSize: "0.875rem",
                                textAlign: "left",
                                "&::placeholder": {
                                  color: "text.secondary",
                                  opacity: 1,
                                },
                              },
                              "& .MuiInputLabel-root": {
                                fontSize: "0.875rem",
                                "&.MuiInputLabel-shrink": {
                                  transform:
                                    "translate(14px, -9px) scale(0.75)",
                                },
                              },
                            }}
                          />
                        </Grid>
                        <Grid
                          item
                          xs={12}
                          sm={12}
                          sx={{ display: { xs: "block", sm: "none" } }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              gap: 1.5,
                              justifyContent: "flex-end",
                              mt: 1,
                            }}
                          >
                            <Button
                              variant="contained"
                              size="small"
                              onClick={handleSaveName}
                              disabled={nameLoading}
                              sx={{
                                minWidth: "80px",
                                py: 0.75,
                                px: 2,
                                textTransform: "none",
                                fontSize: "0.875rem",
                                height: "32.5px",
                              }}
                            >
                              {nameLoading ? (
                                <CircularProgress size={16} />
                              ) : (
                                "Save"
                              )}
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => {
                                setIsEditingName(false);
                                // Reset to original values
                                if (profile?.full_name) {
                                  const nameParts = profile.full_name
                                    .trim()
                                    .split(/\s+/);
                                  if (nameParts.length >= 2) {
                                    setFirstName(
                                      nameParts.slice(0, -1).join(" ")
                                    );
                                    setSurname(nameParts[nameParts.length - 1]);
                                  } else if (nameParts.length === 1) {
                                    setFirstName(nameParts[0]);
                                    setSurname("");
                                  }
                                } else {
                                  setFirstName("");
                                  setSurname("");
                                }
                                setNameError("");
                              }}
                              disabled={nameLoading}
                              sx={{
                                minWidth: "80px",
                                py: 0.75,
                                px: 2,
                                textTransform: "none",
                                fontSize: "0.875rem",
                                height: "32.5px",
                              }}
                            >
                              Cancel
                            </Button>
                          </Box>
                        </Grid>
                        <Grid
                          item
                          xs={12}
                          sm={12}
                          sx={{
                            display: { xs: "none", sm: "flex" },
                            alignItems: "center",
                            justifyContent: "flex-end",
                            gap: 1.5,
                          }}
                        >
                          <Button
                            variant="contained"
                            size="small"
                            onClick={handleSaveName}
                            disabled={nameLoading}
                            sx={{
                              minWidth: "80px",
                              py: 0.75,
                              px: 2,
                              textTransform: "none",
                              fontSize: "0.875rem",
                              height: "32.5px",
                            }}
                          >
                            {nameLoading ? (
                              <CircularProgress size={16} />
                            ) : (
                              "Save"
                            )}
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => {
                              setIsEditingName(false);
                              // Reset to original values
                              if (profile?.full_name) {
                                const nameParts = profile.full_name
                                  .trim()
                                  .split(/\s+/);
                                if (nameParts.length >= 2) {
                                  setFirstName(
                                    nameParts.slice(0, -1).join(" ")
                                  );
                                  setSurname(nameParts[nameParts.length - 1]);
                                } else if (nameParts.length === 1) {
                                  setFirstName(nameParts[0]);
                                  setSurname("");
                                }
                              } else {
                                setFirstName("");
                                setSurname("");
                              }
                              setNameError("");
                            }}
                            disabled={nameLoading}
                            sx={{
                              minWidth: "80px",
                              py: 0.75,
                              px: 2,
                              textTransform: "none",
                              fontSize: "0.875rem",
                              height: "32.5px",
                            }}
                          >
                            Cancel
                          </Button>
                        </Grid>
                        {nameError && (
                          <Grid item xs={12}>
                            <Typography
                              variant="body2"
                              color="error"
                              sx={{ mt: 1 }}
                            >
                              {nameError}
                            </Typography>
                          </Grid>
                        )}
                      </Grid>
                    ) : (
                      <Box
                        onClick={() => setIsEditingName(true)}
                        sx={{
                          cursor: "pointer",
                          "&:hover": {
                            opacity: 0.7,
                          },
                        }}
                      >
                        <Typography variant="body1">
                          {profile?.full_name || (
                            <Typography
                              component="span"
                              variant="body2"
                              color="text.secondary"
                              fontStyle="italic"
                            >
                              Not set
                            </Typography>
                          )}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  {/* Home Area / Location */}
                  <Box sx={{ mb: 2 }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        mb: 0.5,
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Home area
                      </Typography>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<EditIcon />}
                        onClick={() => setShowHomeAreaEditor(true)}
                      >
                        Edit home area
                      </Button>
                    </Box>
                    <Typography variant="body1">
                      {profile?.home_area || (
                        <Typography
                          component="span"
                          variant="body2"
                          color="text.secondary"
                          fontStyle="italic"
                        >
                          Not specified
                        </Typography>
                      )}
                    </Typography>
                  </Box>
                </>
              )}
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Accessibility Settings Section */}
            <Box>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
                Accessibility Settings
              </Typography>
              <List sx={{ bgcolor: "background.paper" }}>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() =>
                      setAccessibilityExpanded(!accessibilityExpanded)
                    }
                    sx={{
                      borderRadius: 1,
                      bgcolor: accessibilityExpanded
                        ? "action.hover"
                        : "transparent",
                      "&:hover": {
                        bgcolor: "action.hover",
                      },
                    }}
                  >
                    <ListItemIcon>
                      <AccessibilityNewIcon sx={{ color: "text.secondary" }} />
                    </ListItemIcon>
                    <ListItemText
                      primary="Accessibility Settings"
                      secondary={
                        accessibilityExpanded
                          ? "Click to collapse"
                          : "Click to expand"
                      }
                    />
                  </ListItemButton>
                </ListItem>
              </List>

              {/* Accessibility Content */}
              {accessibilityExpanded && (
                <Box
                  sx={{
                    mt: 2,
                    p: 3,
                  }}
                >
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
                          <Stack
                            direction="row"
                            spacing={1}
                            flexWrap="wrap"
                            useFlexGap
                          >
                            {profile.accessibility_preferences.map((pref) => (
                              <Chip
                                key={pref}
                                label={
                                  ACCESSIBILITY_CATEGORY_LABELS[pref] || pref
                                }
                                size="small"
                                variant="outlined"
                              />
                            ))}
                          </Stack>
                        ) : (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            fontStyle="italic"
                          >
                            No preferences selected yet
                          </Typography>
                        )}
                      </Box>

                      <Divider sx={{ my: 3 }} />

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
                          <Stack
                            direction="row"
                            spacing={1}
                            flexWrap="wrap"
                            useFlexGap
                          >
                            {profile.disability_types.map((type) => (
                              <Chip
                                key={type}
                                label={
                                  DISABILITY_TYPES.find((t) => t.id === type)
                                    ?.label || type
                                }
                                size="small"
                                variant="outlined"
                                color="primary"
                              />
                            ))}
                          </Stack>
                        ) : (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            fontStyle="italic"
                          >
                            Not specified yet
                          </Typography>
                        )}
                      </Box>
                    </>
                  )}
                </Box>
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
                      bgcolor: securityExpanded
                        ? "action.hover"
                        : "transparent",
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
                      secondary={
                        securityExpanded
                          ? "Click to collapse"
                          : "Click to expand"
                      }
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
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        mb: 2,
                      }}
                    >
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
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
                          <Typography
                            variant="body2"
                            color="error"
                            sx={{ mb: 2 }}
                          >
                            {passwordError}
                          </Typography>
                        )}
                        {passwordSuccess && (
                          <Typography
                            variant="body2"
                            color="success.main"
                            sx={{ mb: 2 }}
                          >
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
                            const newValue = e.target.checked;
                            if (newValue) {
                              // Enable 2FA
                              await handleSetupMFA();
                            } else {
                              // Disable 2FA - show confirmation dialog
                              handleDisableMFA();
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
                      <Typography
                        variant="subtitle1"
                        sx={{ mb: 2, fontWeight: 500 }}
                      >
                        Set up Two-Factor Authentication
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 2 }}
                      >
                        Scan this QR code with Google Authenticator, then enter
                        the 6-digit code:
                      </Typography>
                      {qrCode && (
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "center",
                            mb: 3,
                          }}
                        >
                          <img
                            src={qrCode}
                            alt="QR code"
                            width="200"
                            height="200"
                          />
                        </Box>
                      )}
                      <TextField
                        fullWidth
                        label="Enter 6-digit code"
                        placeholder=""
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        sx={{ mb: 2 }}
                        inputProps={{ maxLength: 6 }}
                      />
                      <Box sx={{ display: "flex", gap: 2 }}>
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
                        <Button
                          variant="contained"
                          color="primary"
                          onClick={handleVerify2FA}
                        >
                          Verify Code
                        </Button>
                      </Box>
                    </Box>
                  )}
                </Box>
              )}
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Danger Zone - Delete Account */}
            <Box>
              <Typography
                variant="h6"
                sx={{ mb: 2, fontWeight: 500, color: "error.main" }}
              >
                Danger Zone
              </Typography>
              <Box
                sx={{
                  p: 3,
                  border: "1px solid",
                  borderColor: "error.light",
                  borderRadius: 1,
                  bgcolor: "error.50",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                  <DeleteForeverIcon
                    sx={{ color: "error.main", fontSize: 28, mt: 0.5 }}
                  />
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      variant="body1"
                      sx={{ fontWeight: 500, mb: 0.5 }}
                    >
                      Delete Account
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 2 }}
                    >
                      Permanently delete your account and all associated data.
                      This action cannot be undone.
                    </Typography>
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={() => setShowDeleteAccountDialog(true)}
                      startIcon={<DeleteForeverIcon />}
                      sx={{
                        textTransform: "none",
                      }}
                    >
                      Delete my account
                    </Button>
                  </Box>
                </Box>
              </Box>
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

      {/* Home Area Editor Dialog */}
      {user && (
        <HomeAreaEditor
          open={showHomeAreaEditor}
          onClose={() => setShowHomeAreaEditor(false)}
          supabase={supabase}
          userId={user.id}
          initialHomeArea={profile?.home_area || ""}
          onSave={(newHomeArea) => {
            // Update local profile state
            setProfile((prev) => ({
              ...prev,
              home_area: newHomeArea,
            }));
          }}
        />
      )}

      {/* Disability Types Editor Dialog */}
      {user && (
        <DisabilityTypesEditor
          open={showDisabilityEditor}
          onClose={() => setShowDisabilityEditor(false)}
          supabase={supabase}
          userId={user.id}
          initialTypes={profile?.disability_types || []}
          onSave={(newTypes) => {
            // Update local profile state
            setProfile((prev) => ({
              ...prev,
              disability_types: newTypes,
            }));
          }}
        />
      )}

      {/* Disable Two-Factor Authentication Confirmation Dialog */}
      <Dialog
        open={showDisable2FADialog}
        onClose={() => setShowDisable2FADialog(false)}
        maxWidth="sm"
        fullWidth
        sx={{
          "& .MuiDialog-container": {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
        }}
        PaperProps={{
          sx: {
            borderRadius: DIALOG_BORDER_RADIUS,
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            margin: "auto",
            maxHeight: "90vh",
          },
        }}
      >
        <DialogContent sx={{ p: 3, pb: 2 }}>
          <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
            {/* Warning Icon */}
            <Box
              sx={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <SecurityIcon
                sx={{
                  fontSize: 48,
                  color: "rgba(0, 0, 0, 0.87)",
                }}
              />
            </Box>

            {/* Text Content */}
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 600,
                  mb: 1,
                  color: "text.primary",
                }}
              >
                Disable Two-Factor Authentication?
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  mb: 3,
                }}
              >
                Are you sure you want to disable Two-Factor Authentication? This
                will reduce your account security.
              </Typography>

              {/* Action Buttons */}
              <Box
                sx={{ display: "flex", gap: 1.5, justifyContent: "flex-end" }}
              >
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={() => setShowDisable2FADialog(false)}
                  sx={{
                    textTransform: "none",
                    px: 3,
                    py: 0.75,
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={confirmDisableMFA}
                  sx={{
                    textTransform: "none",
                    px: 3,
                    py: 0.75,
                  }}
                >
                  Disable
                </Button>
              </Box>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Delete Account Confirmation Dialog */}
      <Dialog
        open={showDeleteAccountDialog}
        onClose={() => {
          if (!deleteAccountLoading) {
            setShowDeleteAccountDialog(false);
            setDeleteConfirmText("");
          }
        }}
        maxWidth="sm"
        fullWidth
        sx={{
          "& .MuiDialog-container": {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
        }}
        PaperProps={{
          sx: {
            borderRadius: DIALOG_BORDER_RADIUS,
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            margin: "auto",
            maxHeight: "90vh",
          },
        }}
      >
        <DialogContent sx={{ p: 3, pb: 2 }}>
          <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
            {/* Warning Icon */}
            <Box
              sx={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <WarningAmberIcon
                sx={{
                  fontSize: 48,
                  color: "error.main",
                }}
              />
            </Box>

            {/* Text Content */}
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 600,
                  mb: 1,
                  color: "error.main",
                }}
              >
                Delete Your Account?
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  mb: 2,
                }}
              >
                This action is <strong>permanent and irreversible</strong>. All
                your data will be deleted, including:
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2, mb: 2 }}>
                <Typography
                  component="li"
                  variant="body2"
                  color="text.secondary"
                >
                  Your profile and personal information
                </Typography>
                <Typography
                  component="li"
                  variant="body2"
                  color="text.secondary"
                >
                  All places you&apos;ve added
                </Typography>
                <Typography
                  component="li"
                  variant="body2"
                  color="text.secondary"
                >
                  Your saved places and reviews
                </Typography>
                <Typography
                  component="li"
                  variant="body2"
                  color="text.secondary"
                >
                  Your ratings and votes
                </Typography>
              </Box>
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  mb: 2,
                }}
              >
                To confirm, please type <strong>DELETE</strong> below:
              </Typography>
              <TextField
                fullWidth
                placeholder="Type DELETE to confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                disabled={deleteAccountLoading}
                sx={{ mb: 3 }}
                autoComplete="off"
                error={
                  deleteConfirmText.length > 0 && deleteConfirmText !== "DELETE"
                }
                helperText={
                  deleteConfirmText.length > 0 && deleteConfirmText !== "DELETE"
                    ? 'Please type "DELETE" exactly as shown'
                    : ""
                }
              />

              {/* Action Buttons */}
              <Box
                sx={{ display: "flex", gap: 1.5, justifyContent: "flex-end" }}
              >
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={() => {
                    setShowDeleteAccountDialog(false);
                    setDeleteConfirmText("");
                  }}
                  disabled={deleteAccountLoading}
                  sx={{
                    textTransform: "none",
                    px: 3,
                    py: 0.75,
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  onClick={handleDeleteAccount}
                  disabled={
                    deleteAccountLoading || deleteConfirmText !== "DELETE"
                  }
                  sx={{
                    textTransform: "none",
                    px: 3,
                    py: 0.75,
                  }}
                >
                  {deleteAccountLoading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    "Delete Account"
                  )}
                </Button>
              </Box>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </MapLayout>
  );
}
