"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import Button from "@mui/material/Button";
import { getNextRegistrationStep } from "../utils/userPreferences";
import { supabase } from "../api/supabaseClient";

export { supabase } from "../api/supabaseClient";

export default function AuthPage() {
  const router = useRouter();
  const [pendingMFA, setPendingMFA] = useState(null);
  const [totpCode, setTotpCode] = useState("");
  const [redirectTo, setRedirectTo] = useState("");

  // Set redirect URL on client side only - redirect to callback page for proper handling
  useEffect(() => {
    if (typeof window !== "undefined") {
      setRedirectTo(`${window.location.origin}/auth/callback`);
    }
  }, []);

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
            router.push(nextStep || "/dashboard");
            return;
          }

          // show the 2FA input UI
          setPendingMFA({ factorId: totp.id, challengeId: challenge.id });
        } else {
          // user has no MFA — check registration status and redirect accordingly
          const nextStep = await getNextRegistrationStep(supabase, userId);
          router.push(nextStep || "/dashboard");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const handleVerify = async () => {
    if (!pendingMFA) return;

    const { error } = await supabase.auth.mfa.verify({
      factorId: pendingMFA.factorId,
      challengeId: pendingMFA.challengeId,
      code: totpCode,
    });

    if (error) {
      console.error("Verify failed:", error);
      alert("❌ Wrong code");
    } else {
      alert("✅ 2FA verified!");
      // Check registration status before redirecting
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const nextStep = await getNextRegistrationStep(supabase, user?.id);
      router.push(nextStep || "/dashboard");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginTop: "10vh",
      }}
    >
      {!pendingMFA ? (
        redirectTo && (
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            providers={["google"]}
            redirectTo={redirectTo}
          />
        )
      ) : (
        <div className="card p-3" style={{ maxWidth: 400 }}>
          <h5>Two-Factor Authentication</h5>
          <p>Enter the 6-digit code from your Authenticator app:</p>
          <input
            type="text"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            className="form-control my-2"
            placeholder="123456"
          />
          <Button
            onClick={handleVerify}
            variant="contained"
            color="success"
            fullWidth
          >
            Verify
          </Button>
        </div>
      )}
    </div>
  );
}
