"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./styles/ui.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "./styles/poi-badge.css";
import { supabase } from "./api/supabaseClient.js";

export default function MapContainer({ user: initialUser }) {
  const [user, setUser] = useState(initialUser);
  const router = useRouter();

  // Track user session changes
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
    let isMounted = true;

    (async () => {
      // ✅ Wait until React finishes rendering the DOM
      await new Promise((r) => setTimeout(r, 0));

      // ✅ Dynamically import Leaflet + plugins
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      await import("leaflet.markercluster/dist/MarkerCluster.css");
      await import("leaflet.markercluster/dist/MarkerCluster.Default.css");
      await import("leaflet-draw");
      await import("leaflet-draw/dist/leaflet.draw.css");
      await import("leaflet-control-geocoder");
      await import("leaflet-control-geocoder/dist/Control.Geocoder.css");

      // ✅ Bootstrap JS
      await import("bootstrap/dist/js/bootstrap.bundle.min.js");
      window.bootstrap = await import("bootstrap");

      // ✅ Now that everything is rendered and loaded, run your main logic
      const { initMap, updateUser } = await import("./mapMain.js");
      if (isMounted) {
        await initMap(user); // <— pass user to initMap
        // Store updateUser function globally so we can call it when user changes
        window.updateMapUser = updateUser;
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []); // Only run once on mount

  // Update user state in mapMain when user changes
  useEffect(() => {
    if (window.updateMapUser) {
      window.updateMapUser(user);
    }
  }, [user]);

  return (
    <div>
      {/* === Map container === */}
      <div
        id="map"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      ></div>

      {/* === Offcanvas (Details + Directions) === */}
      <div
        className="offcanvas offcanvas-start"
        id="placeOffcanvas"
        aria-labelledby="placeOffcanvasLabel"
        data-bs-backdrop="false"
      >
        <div className="offcanvas-header">
          <h2 className="offcanvas-title" id="placeOffcanvasLabel">
            Details
          </h2>
          <button
            type="button"
            className="btn-close"
            data-bs-dismiss="offcanvas"
            aria-label="Close"
          ></button>
        </div>

        <div className="offcanvas-body">
          {/* === Directions UI === */}
          <div id="directions-ui" className="mb-3 d-none">
            <div className="row g-2 align-items-center mb-1">
              <div className="col">
                <label
                  className="form-label mb-1"
                  htmlFor="departure-search-input"
                >
                  From
                </label>
                <div id="departure-search-bar" className="position-relative">
                  <input
                    id="departure-search-input"
                    type="search"
                    className="form-control form-control-lg search-input"
                    placeholder="Search place or click on the map…"
                    aria-label="Search places"
                    aria-controls="departure-suggestions"
                  />

                  <ul
                    className="list-group w-100 shadow d-none search-suggestions"
                    aria-label="Search suggestions"
                    id="departure-suggestions"
                  ></ul>
                </div>
              </div>
            </div>

            <div className="row g-2 align-items-center mb-2">
              <div className="col">
                <label
                  className="form-label mb-1"
                  htmlFor="destination-search-input"
                >
                  To
                </label>
              </div>
            </div>
          </div>

          {/* === Main photo (preview above tabs) === */}
          <figure className="figure d-none" id="main-photo-wrapper">
            <img
              id="main-photo"
              className="figure-img img-fluid shadow-sm mb-1"
              alt=""
            />
            <figcaption
              id="main-photo-caption"
              className="figure-caption small text-muted"
            ></figcaption>
          </figure>

          {/* === Details Panel with Tabs === */}
          <div id="details-panel" className="d-none">
            {/* Tabs navigation */}
            <ul className="nav nav-tabs" id="detailsTabs" role="tablist">
              <li className="nav-item" role="presentation">
                <button
                  className="nav-link active"
                  id="overview-tab"
                  data-bs-toggle="tab"
                  data-bs-target="#tab-overview"
                  type="button"
                  role="tab"
                  aria-controls="tab-overview"
                  aria-selected="true"
                >
                  Overview
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button
                  className="nav-link"
                  id="reviews-tab"
                  data-bs-toggle="tab"
                  data-bs-target="#tab-reviews"
                  type="button"
                  role="tab"
                  aria-controls="tab-reviews"
                  aria-selected="false"
                >
                  Reviews
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button
                  className="nav-link"
                  id="photos-tab"
                  data-bs-toggle="tab"
                  data-bs-target="#tab-photos"
                  type="button"
                  role="tab"
                  aria-controls="tab-photos"
                  aria-selected="false"
                >
                  Photos
                </button>
              </li>
            </ul>

            {/* Tabs content */}
            <div className="tab-content pt-3" id="detailsTabsContent">
              {/* --- Overview tab --- */}
              <div
                className="tab-pane fade show active"
                id="tab-overview"
                role="tabpanel"
                aria-labelledby="overview-tab"
              >
                <div className="d-grid gap-2 mb-3">
                  <div
                    className="btn-group"
                    role="group"
                    aria-label="Quick route actions"
                  >
                    <button
                      id="btn-start-here"
                      type="button"
                      className="btn btn-outline-primary"
                    >
                      Start here
                    </button>
                    <button
                      id="btn-go-here"
                      type="button"
                      className="btn btn-outline-danger"
                    >
                      Go here
                    </button>
                  </div>
                </div>
                <div className="card shadow-sm">
                  <div
                    className="list-group list-group-flush"
                    id="details-list"
                  ></div>
                </div>
              </div>

              {/* --- Reviews tab --- */}
              <div
                className="tab-pane fade"
                id="tab-reviews"
                role="tabpanel"
                aria-labelledby="reviews-tab"
              >
                <div className="card shadow-sm">
                  <div className="card-body">
                    <h6 className="mb-3">Reviews</h6>

                    {/* Review form - only shown for logged-in users */}
                    {user ? (
                      <form id="review-form" className="d-grid gap-2 mb-3">
                        <textarea
                          id="review-text"
                          className="form-control"
                          placeholder="Write your review…"
                          required
                        ></textarea>
                        <button
                          id="submit-review-btn"
                          type="submit"
                          className="btn btn-outline-secondary"
                        >
                          Submit Review
                        </button>
                      </form>
                    ) : (
                      /* CTA card for non-logged-in users */
                      <div className="card bg-light border mb-3">
                        <div className="card-body text-center py-4">
                          <h6 className="mb-2">Want to leave a review?</h6>
                          <p className="small text-muted mb-3">
                            Log in or create an account to share your
                            experience.
                          </p>
                          <button
                            className="btn btn-primary"
                            onClick={() => router.push("/auth")}
                          >
                            Log in / Sign up
                          </button>
                        </div>
                      </div>
                    )}

                    <ul id="reviews-list" className="list-group"></ul>
                  </div>
                </div>
              </div>

              {/* --- Photos tab --- */}
              <div
                className="tab-pane fade"
                id="tab-photos"
                role="tabpanel"
                aria-labelledby="photos-tab"
              >
                <div id="photos-empty" className="text-muted small d-none">
                  No photos found for this place.
                </div>
                <div id="photos-grid" className="row g-2"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* === Obstacle Modal === */}
      <div
        className="modal fade"
        id="obstacleModal"
        tabIndex="-1"
        aria-hidden="true"
        aria-labelledby="obstacleModalLabel"
      >
        <div className="modal-dialog">
          <form className="modal-content" id="obstacle-form">
            <div className="modal-header">
              <h5 className="modal-title">Obstacle details</h5>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body">
              <input
                id="obstacle-title"
                className="form-control"
                placeholder="e.g., Damaged curb ramp"
                required
              />
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                data-bs-dismiss="modal"
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* === Accessibility Legend === */}
      <div id="accessibility-legend" className="alert alert-light"></div>

      {/* === Draw Help Alert (template for DrawHelpAlert control) === */}
      <div
        id="draw-help-alert"
        className="d-none alert alert-light alert-dismissible fade show shadow-sm mb-0"
        role="alert"
      >
        <div>
          <h6 className="d-flex align-items-center gap-2">
            <span className="fs-6" aria-hidden="true">
              🧱
            </span>
            Draw obstacles
          </h6>
          <p className="mb-0" style={{ fontSize: "0.9rem" }}>
            You can mark areas the route should avoid.
          </p>
        </div>

        <button
          type="button"
          className="btn-close ms-auto"
          data-bs-dismiss="alert"
          aria-label="Close"
        ></button>
      </div>

      {/* === Global Loading Bar === */}
      <div
        id="global-loading"
        className="position-fixed top-0 start-0 w-100 d-none"
        style={{ zIndex: 2000 }}
      >
        <div className="progress rounded-0" style={{ height: "0.24rem" }}>
          <div
            className="progress-bar progress-bar-striped progress-bar-animated"
            style={{ width: "100%" }}
          ></div>
        </div>
      </div>

      {/* === Toast Stack === */}
      <div aria-live="polite" aria-atomic="true" className="position-relative">
        <div
          id="toast-stack"
          className="toast-container position-fixed top-0 end-0 p-3"
        ></div>
      </div>

      {/* === Obstacle Management Overlay (for non-logged-in users) === */}
      {!user && (
        <div id="obstacle-management-overlay" className="position-absolute">
          <div
            className="bg-dark text-white p-3 rounded shadow-lg"
            style={{
              minWidth: "200px",
              maxWidth: "300px",
            }}
          >
            <div className="d-flex align-items-center gap-2 mb-2">
              <span className="fs-5">🔒</span>
              <h6 className="mb-0">Log in to manage obstacles</h6>
            </div>
            <p className="small mb-2">
              You need to be logged in to add, edit, or delete obstacles.
            </p>
            <button
              className="btn btn-primary btn-sm w-100"
              onClick={() => router.push("/auth")}
            >
              Log in
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
