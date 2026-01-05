"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import LockIcon from "@mui/icons-material/Lock";
import { getNextRegistrationStep } from "../utils/userPreferences";
import { supabase } from "../api/supabaseClient";
import { toastError, toastSuccess } from "../utils/toast.mjs";
import { DIALOG_BORDER_RADIUS, PRIMARY_BLUE } from "../constants/constants.mjs";
import ToastHost from "../components/ToastHost";
import AbilicoLogo from "../components/AbilicoLogo";
import styles from "./auth.module.css";

export { supabase } from "../api/supabaseClient";

export default function AuthPage() {
  const router = useRouter();
  const [pendingMFA, setPendingMFA] = useState(null);
  const [totpCode, setTotpCode] = useState(["", "", "", "", "", ""]);
  const [mounted, setMounted] = useState(false);
  const inputRefs = useRef([]);

  // Set mounted state on client side only to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Get redirect URL - only use on client side
  // Use a stable URL that works in both development and production
  const redirectTo =
    mounted && typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : null;

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN") {
        const userId = session?.user?.id;

        // check if this user has verified TOTP
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totp = factors?.all?.find(
          (f) => f.factor_type === "totp" && f.status === "verified"
        );

        if (totp) {
          // ✅ create challenge (still signed in)
          const { data: challenge, error } = await supabase.auth.mfa.challenge({
            factorId: totp.id,
          });
          if (error) {
            console.error("Challenge failed:", error);
            // Check registration status before redirecting
            const nextStep = await getNextRegistrationStep(supabase, userId);
            const target = nextStep || "/dashboard";
            // Force full reload to avoid occasional blank Leaflet map after login navigation.
            if (typeof window !== "undefined") {
              window.location.assign(target);
            } else {
              router.push(target);
            }
            return;
          }

          // show the 2FA input UI
          setPendingMFA({ factorId: totp.id, challengeId: challenge.id });
        } else {
          // user has no MFA — check registration status and redirect accordingly
          const nextStep = await getNextRegistrationStep(supabase, userId);
          const target = nextStep || "/dashboard";
          // Force full reload to avoid occasional blank Leaflet map after login navigation.
          if (typeof window !== "undefined") {
            window.location.assign(target);
          } else {
            router.push(target);
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // Auto-focus first input when 2FA screen appears
  useEffect(() => {
    if (pendingMFA) {
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [pendingMFA]);

  const handleDigitChange = (index, value) => {
    // Only allow single digit
    if (value.length > 1) return;

    const newCode = [...totpCode];
    newCode[index] = value;
    setTotpCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === "Backspace" && !totpCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, 6);
    const newCode = pastedData
      .split("")
      .concat(Array(6 - pastedData.length).fill(""));
    setTotpCode(newCode.slice(0, 6));
    // Focus the last filled input or first empty
    const lastFilledIndex = Math.min(pastedData.length - 1, 5);
    inputRefs.current[lastFilledIndex]?.focus();
  };

  const handleVerify = async () => {
    if (!pendingMFA) return;

    const code = totpCode.join("");
    if (code.length !== 6) {
      toastError("Please enter a complete 6-digit code.");
      return;
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId: pendingMFA.factorId,
      challengeId: pendingMFA.challengeId,
      code: code,
    });

    if (error) {
      console.error("Verify failed:", error);
      toastError("The code you entered is incorrect. Please try again.", {
        title: "Invalid Code",
      });
      // Clear inputs on error
      setTotpCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } else {
      toastSuccess("Two-factor authentication verified successfully!", {
        title: "2FA Verified",
      });
      // Check registration status before redirecting
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const nextStep = await getNextRegistrationStep(supabase, user?.id);
      const target = nextStep || "/dashboard";
      // Force full reload to avoid occasional blank Leaflet map after login navigation.
      if (typeof window !== "undefined") {
        window.location.assign(target);
      } else {
        router.push(target);
      }
    }
  };

  // Don't render anything until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          background: "#ffffff",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Loading...
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        background: "#ffffff",
      }}
    >
      {!pendingMFA ? (
        <Box
          sx={{
            display: "flex",
            width: "100%",
            minHeight: "100vh",
          }}
        >
          {/* Left Side - Logo and Illustration */}
          <Box
            sx={{
              flex: 1,
              display: { xs: "none", md: "flex" },
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "flex-start",
              p: 4,
              position: "relative",
              background: "#ffffff",
            }}
          >
            {/* Logo at top left */}
            <AbilicoLogo
              logoHeight={48}
              textColor={PRIMARY_BLUE}
              sx={{ mb: 4 }}
            />

            {/* Illustration */}
            <Box
              sx={{
                position: "absolute",
                top: "50%",
                left: 0,
                right: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: "translateY(-50%)",
                p: 4,
                pl: 6,
              }}
            >
              <Box
                component="img"
                src="/illustrations/registration-welcome-wheelchair-transparent-background.png"
                alt="Welcome illustration"
                sx={{
                  maxWidth: "100%",
                  height: "auto",
                  objectFit: "contain",
                  transform: "scaleX(-1)",
                  ml: 12,
                }}
              />
            </Box>
          </Box>

          {/* Right Side - Auth Form */}
          <Box
            sx={{
              flex: { xs: 1, md: 1 },
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              p: { xs: 3, md: 6 },
              background: "#ffffff",
              minHeight: "100vh",
            }}
          >
            {/* Mobile Logo */}
            <Box
              sx={{
                display: { xs: "block", md: "none" },
                mb: 4,
                alignSelf: "flex-start",
              }}
            >
              <AbilicoLogo logoHeight={40} textColor={PRIMARY_BLUE} />
            </Box>

            {/* Auth Form Container */}
            <Box
              className={styles.authForm}
              sx={{
                width: "100%",
                maxWidth: "440px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Auth
                supabaseClient={supabase}
                appearance={{
                  theme: ThemeSupa,
                  variables: {
                    default: {
                      colors: {
                        brand: PRIMARY_BLUE,
                        brandAccent: PRIMARY_BLUE,
                        inputText: "#000000",
                        inputLabelText: "#000000",
                        inputPlaceholder: "#9e9e9e",
                        inputBorder: "rgba(0, 0, 0, 0.23)",
                        inputBorderHover: "rgba(0, 0, 0, 0.5)",
                        inputBorderFocus: PRIMARY_BLUE,
                        messageText: "#000000",
                        messageTextDanger: "#d32f2f",
                        anchorTextColor: PRIMARY_BLUE,
                        anchorTextHoverColor: PRIMARY_BLUE,
                      },
                      space: {
                        inputPadding: "16px",
                        buttonPadding: "16px",
                      },
                      fontSizes: {
                        baseBodySize: "14px",
                        baseInputSize: "16px",
                        labelText: "14px",
                        inputPlaceholder: "13px",
                      },
                      radii: {
                        borderRadiusButton: "8px",
                        buttonBorderRadius: "8px",
                        inputBorderRadius: "8px",
                      },
                    },
                  },
                }}
                localization={{
                  variables: {
                    sign_in: {
                      email_label: "Email",
                      password_label: "Password",
                      email_input_placeholder: "name@example.com",
                      password_input_placeholder:
                        "Min. 8 chars, A–Z, a–z, 0–9, symbol",
                    },
                    sign_up: {
                      email_label: "Email",
                      password_label: "Password",
                      email_input_placeholder: "name@example.com",
                      password_input_placeholder:
                        "Min. 8 chars, A–Z, a–z, 0–9, symbol",
                    },
                  },
                }}
                providers={["google"]}
                redirectTo={redirectTo}
              />
            </Box>
          </Box>
        </Box>
      ) : (
        <Box
          sx={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 2,
          }}
        >
          <Card
            sx={{
              maxWidth: 440,
              width: "100%",
              p: 4,
              borderRadius: DIALOG_BORDER_RADIUS,
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Padlock Icon */}
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                bgcolor: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 3,
              }}
            >
              <LockIcon sx={{ fontSize: 32, color: "white" }} />
            </Box>

            {/* Title */}
            <Typography
              variant="h6"
              sx={{
                fontSize: "1.25rem",
                fontWeight: 600,
                mb: 1,
                color: "text.primary",
                textAlign: "center",
              }}
            >
              Two-Factor Authentication
            </Typography>

            {/* Instructions */}
            <Typography
              variant="body2"
              sx={{
                fontSize: "0.875rem",
                color: "text.secondary",
                mb: 4,
                textAlign: "center",
              }}
            >
              Enter the 6-digit code from your Authenticator app
            </Typography>

            {/* 6-Digit Input Boxes */}
            <Box
              sx={{
                display: "flex",
                gap: 1.5,
                mb: 3,
                justifyContent: "center",
                width: "100%",
              }}
              onPaste={handlePaste}
            >
              {totpCode.map((digit, index) => (
                <TextField
                  key={index}
                  inputRef={(el) => (inputRefs.current[index] = el)}
                  value={digit}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  inputProps={{
                    maxLength: 1,
                    style: {
                      textAlign: "center",
                      fontSize: "1.25rem",
                      fontWeight: 600,
                      padding: "12px 0",
                    },
                  }}
                  sx={{
                    width: 56,
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                      "& fieldset": {
                        borderWidth: 2,
                        borderColor: digit
                          ? "primary.main"
                          : "rgba(0, 0, 0, 0.23)",
                      },
                      "&:hover fieldset": {
                        borderColor: "primary.main",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "primary.main",
                        borderWidth: 2,
                      },
                    },
                  }}
                />
              ))}
            </Box>

            {/* Verify Button */}
            <Button
              onClick={handleVerify}
              variant="contained"
              color="primary"
              fullWidth
              sx={{
                mb: 2,
                py: 1.5,
                borderRadius: 2,
                textTransform: "none",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Verify
            </Button>

            {/* Abilico Logo/Branding */}
            <AbilicoLogo
              sx={{ mt: 2 }}
              horizontal={true}
              logoHeight={32}
              textColor={PRIMARY_BLUE}
            />
          </Card>
        </Box>
      )}

      {/* Toast Notifications */}
      <ToastHost />
    </Box>
  );
}
