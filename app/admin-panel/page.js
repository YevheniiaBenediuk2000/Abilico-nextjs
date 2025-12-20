"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/api/supabaseClient";
import styles from "./admin-panel.module.css";
import SettingsIcon from "@mui/icons-material/Settings";
import WarningIcon from "@mui/icons-material/Warning";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import PlaceIcon from "@mui/icons-material/Place";

// Allowed admin emails
const ALLOWED_ADMINS = [
  "yevheniiabenediuk@gmail.com",
  "victor.shevchuk.96@gmail.com",
];

export default function AdminPanel() {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [obstacles, setObstacles] = useState([]);
  const [places, setPlaces] = useState([]);
  const [obstaclesLoading, setObstaclesLoading] = useState(false);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // Track which action is loading
  const [error, setError] = useState(null);
  const [activePanel, setActivePanel] = useState("obstacles"); // "obstacles" or "places"
  const router = useRouter();

  // Check user access
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        console.log("[Admin Panel] Session check:", {
          session: !!session,
          error,
        });

        if (error || !session) {
          console.log("[Admin Panel] No session, redirecting to auth");
          router.push("/auth");
          return;
        }

        const email = session.user?.email;
        console.log("[Admin Panel] User email:", email);

        if (!ALLOWED_ADMINS.includes(email)) {
          console.log("[Admin Panel] Not authorized, redirecting to auth");
          router.push("/auth");
          return;
        }

        setUser(session.user);
        setAccessToken(session.access_token);
        setLoading(false);
      } catch (e) {
        console.error("[Admin Panel] Error checking access:", e);
        router.push("/auth");
      }
    };

    checkAccess();
  }, [router]);

  // Fetch obstacles
  const fetchObstacles = useCallback(async () => {
    if (!accessToken) return;
    setObstaclesLoading(true);
    try {
      const res = await fetch("/api/admin/obstacles", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      console.log("[Admin Panel] Obstacles response:", json);
      if (json.data) {
        setObstacles(json.data);
      } else {
        console.error("[Admin Panel] Obstacles error:", json.error);
      }
    } catch (e) {
      console.error("[Admin Panel] Fetch obstacles error:", e);
    }
    setObstaclesLoading(false);
  }, [accessToken]);

  // Fetch places
  const fetchPlaces = useCallback(async () => {
    if (!accessToken) return;
    setPlacesLoading(true);
    try {
      const res = await fetch("/api/admin/places", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      console.log("[Admin Panel] Places response:", json);
      if (json.data) {
        setPlaces(json.data);
      } else {
        console.error("[Admin Panel] Places error:", json.error);
      }
    } catch (e) {
      console.error("[Admin Panel] Fetch places error:", e);
    }
    setPlacesLoading(false);
  }, [accessToken]);

  // Fetch all data
  const fetchData = useCallback(async () => {
    await Promise.all([fetchObstacles(), fetchPlaces()]);
  }, [fetchObstacles, fetchPlaces]);

  // Fetch data on mount
  useEffect(() => {
    if (accessToken) {
      fetchData(); // Fetch both panels initially
    }
  }, [accessToken]); // Removed fetchData from deps to avoid re-fetching on activePanel change

  // Action handlers
  const handleObstacleAction = async (id, action) => {
    const actionKey = `obstacle-${id}-${action}`;
    setActionLoading(actionKey);
    setError(null);

    try {
      if (action === "delete") {
        const res = await fetch(`/api/admin/obstacles?id=${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json();
        console.log("[Admin Panel] Delete obstacle response:", json);
        if (json.success) {
          setObstacles((prev) => prev.filter((o) => o.id !== id));
        } else {
          setError(json.error || "Failed to delete obstacle");
        }
      } else {
        // Update status (active or rejected)
        const res = await fetch("/api/admin/obstacles", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ id, status: action }),
        });
        const json = await res.json();
        console.log("[Admin Panel] Update obstacle response:", json);
        if (json.data) {
          setObstacles((prev) =>
            prev.map((o) => (o.id === id ? { ...o, status: action } : o))
          );
        } else {
          setError(json.error || "Failed to update obstacle");
        }
      }
    } catch (e) {
      console.error("[Admin Panel] Obstacle action error:", e);
      setError(e.message);
    }

    setActionLoading(null);
  };

  const handlePlaceAction = async (id, action) => {
    const actionKey = `place-${id}-${action}`;
    setActionLoading(actionKey);
    setError(null);

    try {
      if (action === "delete") {
        const res = await fetch(`/api/admin/places?id=${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json();
        console.log("[Admin Panel] Delete place response:", json);
        if (json.success) {
          setPlaces((prev) => prev.filter((p) => p.id !== id));
        } else {
          setError(json.error || "Failed to delete place");
        }
      } else {
        // Update status (active or rejected)
        const res = await fetch("/api/admin/places", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ id, status: action }),
        });
        const json = await res.json();
        console.log("[Admin Panel] Update place response:", json);
        if (json.data) {
          setPlaces((prev) =>
            prev.map((p) => (p.id === id ? { ...p, status: action } : p))
          );
        } else {
          setError(json.error || "Failed to update place");
        }
      }
    } catch (e) {
      console.error("[Admin Panel] Place action error:", e);
      setError(e.message);
    }

    setActionLoading(null);
  };

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  // Get status badge class
  const getStatusClass = (status) => {
    if (status === "active" || status === "approved")
      return styles.statusActive;
    if (status === "rejected") return styles.statusRejected;
    return styles.statusPending;
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingMessage}>Checking access...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.container}>
        <div className={styles.errorMessage}>Access denied</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>
          <SettingsIcon sx={{ verticalAlign: "middle", mr: 1 }} />
          Admin Panel
        </h1>
        <div className={styles.userInfo}>
          Logged in as: <strong>{user.email}</strong>
          <button
            onClick={() => {
              supabase.auth.signOut();
              router.push("/auth");
            }}
            className={styles.logoutBtn}
          >
            Logout
          </button>
        </div>
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* Panel Toggle */}
      <div className={styles.panelToggle}>
        <button
          onClick={() => setActivePanel("obstacles")}
          className={`${styles.toggleBtn} ${
            activePanel === "obstacles" ? styles.toggleBtnActive : ""
          }`}
        >
          <WarningIcon sx={{ mr: 1 }} />
          Obstacles
        </button>
        <button
          onClick={() => setActivePanel("places")}
          className={`${styles.toggleBtn} ${
            activePanel === "places" ? styles.toggleBtnActive : ""
          }`}
        >
          <PlaceIcon sx={{ mr: 1 }} />
          User-Submitted Places
        </button>
      </div>

      {/* Obstacles Table */}
      {activePanel === "obstacles" && (
        <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>
            <WarningIcon sx={{ verticalAlign: "middle", mr: 1 }} />
            Obstacles
          </h2>
          <button
            onClick={fetchObstacles}
            className={styles.refreshBtn}
          >
            <RefreshIcon sx={{ verticalAlign: "middle", mr: 0.5 }} />
            Refresh
          </button>
        </div>

        {obstaclesLoading ? (
          <div className={styles.loadingMessage}>Loading obstacles...</div>
        ) : obstacles.length === 0 ? (
          <div className={styles.emptyMessage}>No obstacles found</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Coordinates</th>
                  <th>Date Added</th>
                  <th>Confirmations</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {obstacles.map((obstacle) => (
                  <tr key={obstacle.id}>
                    <td className={styles.idCell} title={obstacle.id}>
                      {obstacle.id.slice(0, 8)}...
                    </td>
                    <td>{obstacle.properties?.shape || "-"}</td>
                    <td>{obstacle.properties?.title || "-"}</td>
                    <td>
                      {obstacle.geometry?.coordinates &&
                      typeof obstacle.geometry.coordinates[0] === 'number' &&
                      typeof obstacle.geometry.coordinates[1] === 'number'
                        ? `${Number(obstacle.geometry.coordinates[1]).toFixed(4)}, ${Number(obstacle.geometry.coordinates[0]).toFixed(4)}`
                        : "-"}
                    </td>
                    <td>{formatDate(obstacle.date_added)}</td>
                    <td>{obstacle.confirmation_count || 0}</td>
                    <td>
                      <span className={getStatusClass(obstacle.status)}>
                        {obstacle.status || "pending"}
                      </span>
                    </td>
                    <td className={styles.actionsCell}>
                      <button
                        onClick={() =>
                          handleObstacleAction(obstacle.id, "active")
                        }
                        disabled={
                          actionLoading === `obstacle-${obstacle.id}-active`
                        }
                        className={`${styles.actionBtn} ${styles.approveBtn}`}
                        title="Approve"
                      >
                        {actionLoading === `obstacle-${obstacle.id}-active` ? (
                          "..."
                        ) : (
                          <CheckIcon />
                        )}
                      </button>
                      <button
                        onClick={() =>
                          handleObstacleAction(obstacle.id, "rejected")
                        }
                        disabled={
                          actionLoading === `obstacle-${obstacle.id}-rejected`
                        }
                        className={`${styles.actionBtn} ${styles.rejectBtn}`}
                        title="Reject"
                      >
                        {actionLoading === `obstacle-${obstacle.id}-rejected` ? (
                          "..."
                        ) : (
                          <CloseIcon />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              "Are you sure you want to DELETE this obstacle?"
                            )
                          ) {
                            handleObstacleAction(obstacle.id, "delete");
                          }
                        }}
                        disabled={
                          actionLoading === `obstacle-${obstacle.id}-delete`
                        }
                        className={`${styles.actionBtn} ${styles.deleteBtn}`}
                        title="Delete"
                      >
                        {actionLoading === `obstacle-${obstacle.id}-delete` ? (
                          "..."
                        ) : (
                          <DeleteIcon />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {/* Places Table */}
      {activePanel === "places" && (
        <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>
            <PlaceIcon sx={{ verticalAlign: "middle", mr: 1 }} />
            User-Submitted Places
          </h2>
          <button
            onClick={fetchPlaces}
            className={styles.refreshBtn}
          >
            <RefreshIcon sx={{ verticalAlign: "middle", mr: 0.5 }} />
            Refresh
          </button>
        </div>

        {placesLoading ? (
          <div className={styles.loadingMessage}>Loading places...</div>
        ) : places.length === 0 ? (
          <div className={styles.emptyMessage}>
            No user-submitted places found
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>City</th>
                  <th>Country</th>
                  <th>Coordinates</th>
                  <th>Created At</th>
                  <th>Submitted By</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {places.map((place) => (
                  <tr key={place.id}>
                    <td className={styles.idCell} title={place.id}>
                      {place.id.slice(0, 8)}...
                    </td>
                    <td>{place.name || "-"}</td>
                    <td>{place.place_type || "-"}</td>
                    <td>{place.city || "-"}</td>
                    <td>{place.country || "-"}</td>
                    <td>
                      {place.lat != null && place.lon != null &&
                      typeof place.lat === 'number' && typeof place.lon === 'number'
                        ? `${Number(place.lat).toFixed(4)}, ${Number(place.lon).toFixed(4)}`
                        : "-"}
                    </td>
                    <td>{formatDate(place.created_at)}</td>
                    <td>
                      {place.submitted_by_name ||
                        place.submitted_by_email ||
                        "-"}
                    </td>
                    <td>
                      <span className={getStatusClass(place.status)}>
                        {place.status || "pending"}
                      </span>
                    </td>
                    <td className={styles.actionsCell}>
                      <button
                        onClick={() => handlePlaceAction(place.id, "approved")}
                        disabled={
                          actionLoading === `place-${place.id}-approved`
                        }
                        className={`${styles.actionBtn} ${styles.approveBtn}`}
                        title="Approve"
                      >
                        {actionLoading === `place-${place.id}-approved` ? (
                          "..."
                        ) : (
                          <CheckIcon />
                        )}
                      </button>
                      <button
                        onClick={() => handlePlaceAction(place.id, "rejected")}
                        disabled={
                          actionLoading === `place-${place.id}-rejected`
                        }
                        className={`${styles.actionBtn} ${styles.rejectBtn}`}
                        title="Reject"
                      >
                        {actionLoading === `place-${place.id}-rejected` ? (
                          "..."
                        ) : (
                          <CloseIcon />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              "Are you sure you want to DELETE this place?"
                            )
                          ) {
                            handlePlaceAction(place.id, "delete");
                          }
                        }}
                        disabled={actionLoading === `place-${place.id}-delete`}
                        className={`${styles.actionBtn} ${styles.deleteBtn}`}
                        title="Delete"
                      >
                        {actionLoading === `place-${place.id}-delete` ? (
                          "..."
                        ) : (
                          <DeleteIcon />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}
    </div>
  );
}
