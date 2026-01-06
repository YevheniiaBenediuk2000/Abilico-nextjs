"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../page";
import { getNextRegistrationStep } from "../../utils/userPreferences";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";

/**
 * Inner client component that *actually* uses useSearchParams.
 * This must be wrapped in <Suspense>.
 */
function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function handleCallback() {
      try {
        // Check for error in URL (e.g., email verification failed)
        const errorParam = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        if (errorParam) {
          setError(errorDescription || "An authentication error occurred");
          setLoading(false);
          // Redirect to auth page after showing error
          setTimeout(() => {
            router.push("/auth");
          }, 3000);
          return;
        }

        // Check if this is a password recovery callback
        // Supabase includes type=recovery in query params OR in the hash fragment
        const type = searchParams.get("type");

        // Also check hash fragment for recovery type (Supabase often puts tokens there)
        let isRecovery = type === "recovery";
        if (typeof window !== "undefined" && window.location.hash) {
          const hashParams = new URLSearchParams(
            window.location.hash.substring(1)
          );
          if (hashParams.get("type") === "recovery") {
            isRecovery = true;
          }
        }

        if (isRecovery) {
          // Store recovery state in sessionStorage so auth page knows to show password form
          if (typeof window !== "undefined") {
            sessionStorage.setItem("passwordRecovery", "true");
          }
          // Redirect to auth page to show password update form
          router.push("/auth");
          return;
        }

        // Get the current user
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          setError("Failed to authenticate. Redirecting to login...");
          setLoading(false);
          setTimeout(() => {
            router.push("/auth");
          }, 2000);
          return;
        }

        // Check if user has completed registration steps
        const nextStep = await getNextRegistrationStep(supabase, user.id);

        // Redirect to next registration step or dashboard
        router.push(nextStep || "/dashboard");
      } catch (err) {
        console.error("Callback error:", err);
        setError("An error occurred during authentication");
        setLoading(false);
        setTimeout(() => {
          router.push("/auth");
        }, 3000);
      }
    }

    handleCallback();
  }, [router, searchParams]);

  if (error) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          gap: 2,
        }}
      >
        <Typography color="error">{error}</Typography>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          gap: 2,
        }}
      >
        <CircularProgress />
        <Typography>Completing authentication...</Typography>
      </Box>
    );
  }

  // In practice we usually never see this, because we redirect.
  return null;
}

/**
 * Page component: **doesn't** call useSearchParams itself,
 * only wraps the inner component in Suspense.
 */
export default function AuthCallbackPage() {
  return (
    <Suspense
      // Fallback only shows if the inner component ever suspends;
      // it's mainly here to satisfy Next's requirement.
      fallback={
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: 2,
          }}
        >
          <CircularProgress />
          <Typography>Completing authentication...</Typography>
        </Box>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}