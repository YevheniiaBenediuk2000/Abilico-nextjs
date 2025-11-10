"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/ui.css";
import "leaflet/dist/leaflet.css";
import "../styles/poi-badge.css";
import MapContainer from "../MapContainer";
import { supabase } from "../auth/page";

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

export default function MapLayout({ isDashboard = false }) {
  const router = useRouter();
  const [user, setUser] = useState(null);

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
    <div className="d-flex flex-column min-vh-100">
      {/* === Header === */}
      <header className="d-flex justify-content-between align-items-center p-3 border-bottom bg-light shadow-sm position-relative">
        {/* Left: Search */}
        <div
          className="flex-grow-1 me-3 position-relative"
          style={{ maxWidth: "600px" }}
          id="destination-search-bar"
        >
          <input
            id="destination-search-input"
            type="search"
            className="form-control form-control-lg search-input"
            placeholder="Search place or click on the map…"
            aria-label="Search places"
            aria-controls="destination-suggestions"
          />
          <ul
            id="destination-suggestions"
            className="list-group w-100 shadow d-none search-suggestions"
            aria-label="Search suggestions"
          ></ul>
        </div>

        {/* Right: Auth area */}
        <div>
          {!user ? (
            // 🟡 Not logged in
            <button
              className="btn btn-outline-primary"
              onClick={() => router.push("/auth")}
            >
              Log in
            </button>
          ) : (
            // 🟢 Logged in
            <div className="d-flex align-items-center gap-2">
              <span className="fw-semibold text-secondary small">
                {user.email}
              </span>

              {isDashboard && (
                <button
                  className="btn btn-outline-success btn-sm"
                  onClick={handleSetupMFA}
                >
                  Enable 2FA
                </button>
              )}

              <button
                className="btn btn-outline-danger btn-sm"
                onClick={async () => {
                  await supabase.auth.signOut();
                  setUser(null);
                  if (isDashboard) router.push("/");
                }}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* === 2FA setup section (only dashboard) === */}
      {isDashboard && (
        <div
          id="setup-container"
          style={{ display: "none", marginTop: "1rem" }}
        >
          <p>
            Scan this QR code with Google Authenticator, then enter the 6-digit
            code:
          </p>
          <img id="qr" alt="QR code" width="200" height="200" />
          <input
            id="totp-code"
            type="text"
            placeholder="123456"
            className="form-control my-2"
          />
          <button
            className="btn btn-success"
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
          </button>
        </div>
      )}

      {/* === Map === */}
      <main className="flex-grow-1 position-relative">
        <MapContainer />
      </main>
    </div>
  );
}
