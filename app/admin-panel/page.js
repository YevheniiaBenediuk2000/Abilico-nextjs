"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ThemeProvider } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

import { supabase } from "@/app/api/supabaseClient";
import { theme } from "@/app/theme/theme";
import AbilicoLogo from "@/app/components/AbilicoLogo";

const ALLOWED_EMAILS = [
  "yevheniiabenediuk@gmail.com",
  "victor.shevchuk.96@gmail.com",
];

function TabPanel({ children, value, index }) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

function StatusChip({ status }) {
  const getColor = () => {
    switch (status) {
      case "active":
      case "approved":
        return "success";
      case "rejected":
        return "error";
      case "pending":
        return "warning";
      default:
        return "default";
    }
  };

  return (
    <Chip
      label={status || "pending"}
      color={getColor()}
      size="small"
      variant="outlined"
    />
  );
}

function ConfirmDialog({ open, onClose, onConfirm, title, message }) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onConfirm} color="error" variant="contained">
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AdminPanel() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);

  // Obstacles state
  const [obstacles, setObstacles] = useState([]);
  const [obstaclesLoading, setObstaclesLoading] = useState(false);
  const [obstaclesError, setObstaclesError] = useState(null);

  // Places state
  const [places, setPlaces] = useState([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
  });

  // Action loading state
  const [actionLoading, setActionLoading] = useState(null);

  // Check authentication
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data?.user?.email;
      if (ALLOWED_EMAILS.includes(email)) {
        setUser(data.user);
      } else {
        router.push("/auth");
      }
      setLoading(false);
    });
  }, [router]);

  // Fetch obstacles
  const fetchObstacles = useCallback(async () => {
    setObstaclesLoading(true);
    setObstaclesError(null);
    try {
      const response = await fetch("/api/admin/obstacles");
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      setObstacles(result.data || []);
    } catch (error) {
      setObstaclesError(error.message);
    } finally {
      setObstaclesLoading(false);
    }
  }, []);

  // Fetch places
  const fetchPlaces = useCallback(async () => {
    setPlacesLoading(true);
    setPlacesError(null);
    try {
      const response = await fetch("/api/admin/places");
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      setPlaces(result.data || []);
    } catch (error) {
      setPlacesError(error.message);
    } finally {
      setPlacesLoading(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    if (user) {
      fetchObstacles();
      fetchPlaces();
    }
  }, [user, fetchObstacles, fetchPlaces]);

  // Obstacle actions
  const handleDeleteObstacle = async (id) => {
    setActionLoading(id);
    try {
      const response = await fetch("/api/admin/obstacles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      setObstacles((prev) => prev.filter((o) => o.id !== id));
    } catch (error) {
      alert("Error deleting obstacle: " + error.message);
    } finally {
      setActionLoading(null);
      setConfirmDialog({
        open: false,
        title: "",
        message: "",
        onConfirm: null,
      });
    }
  };

  const handleUpdateObstacleStatus = async (id, status) => {
    setActionLoading(id);
    try {
      const response = await fetch("/api/admin/obstacles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      setObstacles((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status } : o))
      );
    } catch (error) {
      alert("Error updating obstacle: " + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Place actions
  const handleDeletePlace = async (id) => {
    setActionLoading(id);
    try {
      const response = await fetch("/api/admin/places", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      setPlaces((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      alert("Error deleting place: " + error.message);
    } finally {
      setActionLoading(null);
      setConfirmDialog({
        open: false,
        title: "",
        message: "",
        onConfirm: null,
      });
    }
  };

  const handleUpdatePlaceStatus = async (id, status) => {
    setActionLoading(id);
    try {
      const response = await fetch("/api/admin/places", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      setPlaces((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status } : p))
      );
    } catch (error) {
      alert("Error updating place: " + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const openDeleteConfirm = (id, type) => {
    setConfirmDialog({
      open: true,
      title: `Delete ${type}`,
      message: `Are you sure you want to delete this ${type}? This action cannot be undone.`,
      onConfirm: () =>
        type === "obstacle" ? handleDeleteObstacle(id) : handleDeletePlace(id),
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("uk-UA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Checking access...</Typography>
      </Box>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5", py: 4 }}>
        <Container maxWidth="xl">
          {/* Header */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <IconButton onClick={() => router.push("/dashboard")}>
                  <ArrowBackIcon />
                </IconButton>
                <AbilicoLogo />
                <Typography variant="h4" component="h1">
                  Admin Panel
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Logged in as: {user.email}
                </Typography>
              </Box>
            </Box>
          </Paper>

          {/* Tabs */}
          <Paper sx={{ mb: 3 }}>
            <Tabs
              value={tabValue}
              onChange={(e, newValue) => setTabValue(newValue)}
              sx={{ borderBottom: 1, borderColor: "divider" }}
            >
              <Tab label={`Obstacles (${obstacles.length})`} />
              <Tab label={`User Places (${places.length})`} />
            </Tabs>

            {/* Obstacles Tab */}
            <TabPanel value={tabValue} index={0}>
              <Box sx={{ p: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 2,
                  }}
                >
                  <Typography variant="h6">Obstacles</Typography>
                  <Button
                    startIcon={<RefreshIcon />}
                    onClick={fetchObstacles}
                    disabled={obstaclesLoading}
                  >
                    Refresh
                  </Button>
                </Box>

                {obstaclesError && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {obstaclesError}
                  </Alert>
                )}

                {obstaclesLoading ? (
                  <Box
                    sx={{ display: "flex", justifyContent: "center", py: 4 }}
                  >
                    <CircularProgress />
                  </Box>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>ID</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Description</TableCell>
                          <TableCell>Location</TableCell>
                          <TableCell>Date Added</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Photo</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {obstacles.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} align="center">
                              No obstacles found
                            </TableCell>
                          </TableRow>
                        ) : (
                          obstacles.map((obstacle) => (
                            <TableRow key={obstacle.id} hover>
                              <TableCell>
                                <Typography
                                  variant="caption"
                                  sx={{ fontFamily: "monospace" }}
                                >
                                  {obstacle.id?.slice(0, 8)}...
                                </Typography>
                              </TableCell>
                              <TableCell>{obstacle.type || "-"}</TableCell>
                              <TableCell sx={{ maxWidth: 200 }}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {obstacle.description || "-"}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                {obstacle.lat && obstacle.lon ? (
                                  <a
                                    href={`https://www.google.com/maps?q=${obstacle.lat},${obstacle.lon}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "#0a3f89" }}
                                  >
                                    {obstacle.lat.toFixed(4)},{" "}
                                    {obstacle.lon.toFixed(4)}
                                  </a>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                              <TableCell>
                                {formatDate(obstacle.date_added)}
                              </TableCell>
                              <TableCell>
                                <StatusChip status={obstacle.status} />
                              </TableCell>
                              <TableCell>
                                {obstacle.photo_url ? (
                                  <a
                                    href={obstacle.photo_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={obstacle.photo_url}
                                      alt="Obstacle"
                                      style={{
                                        width: 50,
                                        height: 50,
                                        objectFit: "cover",
                                        borderRadius: 4,
                                      }}
                                    />
                                  </a>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                              <TableCell align="right">
                                <ButtonGroup
                                  size="small"
                                  disabled={actionLoading === obstacle.id}
                                >
                                  <Tooltip title="Approve">
                                    <Button
                                      color="success"
                                      onClick={() =>
                                        handleUpdateObstacleStatus(
                                          obstacle.id,
                                          "active"
                                        )
                                      }
                                    >
                                      <CheckCircleIcon fontSize="small" />
                                    </Button>
                                  </Tooltip>
                                  <Tooltip title="Reject">
                                    <Button
                                      color="warning"
                                      onClick={() =>
                                        handleUpdateObstacleStatus(
                                          obstacle.id,
                                          "rejected"
                                        )
                                      }
                                    >
                                      <CancelIcon fontSize="small" />
                                    </Button>
                                  </Tooltip>
                                  <Tooltip title="Delete">
                                    <Button
                                      color="error"
                                      onClick={() =>
                                        openDeleteConfirm(
                                          obstacle.id,
                                          "obstacle"
                                        )
                                      }
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </Button>
                                  </Tooltip>
                                </ButtonGroup>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            </TabPanel>

            {/* Places Tab */}
            <TabPanel value={tabValue} index={1}>
              <Box sx={{ p: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 2,
                  }}
                >
                  <Typography variant="h6">User-Submitted Places</Typography>
                  <Button
                    startIcon={<RefreshIcon />}
                    onClick={fetchPlaces}
                    disabled={placesLoading}
                  >
                    Refresh
                  </Button>
                </Box>

                {placesError && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {placesError}
                  </Alert>
                )}

                {placesLoading ? (
                  <Box
                    sx={{ display: "flex", justifyContent: "center", py: 4 }}
                  >
                    <CircularProgress />
                  </Box>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>ID</TableCell>
                          <TableCell>Name</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Location</TableCell>
                          <TableCell>City/Country</TableCell>
                          <TableCell>Submitted By</TableCell>
                          <TableCell>Created</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Comments</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {places.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} align="center">
                              No user-submitted places found
                            </TableCell>
                          </TableRow>
                        ) : (
                          places.map((place) => (
                            <TableRow key={place.id} hover>
                              <TableCell>
                                <Typography
                                  variant="caption"
                                  sx={{ fontFamily: "monospace" }}
                                >
                                  {place.id?.toString().slice(0, 8)}...
                                </Typography>
                              </TableCell>
                              <TableCell>{place.name || "-"}</TableCell>
                              <TableCell>{place.place_type || "-"}</TableCell>
                              <TableCell>
                                {place.lat && place.lon ? (
                                  <a
                                    href={`https://www.google.com/maps?q=${place.lat},${place.lon}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "#0a3f89" }}
                                  >
                                    {Number(place.lat).toFixed(4)},{" "}
                                    {Number(place.lon).toFixed(4)}
                                  </a>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                              <TableCell>
                                {[place.city, place.country]
                                  .filter(Boolean)
                                  .join(", ") || "-"}
                              </TableCell>
                              <TableCell>
                                <Box>
                                  <Typography variant="body2">
                                    {place.submitted_by_name || "-"}
                                  </Typography>
                                  {place.submitted_by_email && (
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                    >
                                      {place.submitted_by_email}
                                    </Typography>
                                  )}
                                </Box>
                              </TableCell>
                              <TableCell>
                                {formatDate(place.created_at)}
                              </TableCell>
                              <TableCell>
                                <StatusChip status={place.status} />
                              </TableCell>
                              <TableCell sx={{ maxWidth: 150 }}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={place.accessibility_comments}
                                >
                                  {place.accessibility_comments || "-"}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <ButtonGroup
                                  size="small"
                                  disabled={actionLoading === place.id}
                                >
                                  <Tooltip title="Approve">
                                    <Button
                                      color="success"
                                      onClick={() =>
                                        handleUpdatePlaceStatus(
                                          place.id,
                                          "approved"
                                        )
                                      }
                                    >
                                      <CheckCircleIcon fontSize="small" />
                                    </Button>
                                  </Tooltip>
                                  <Tooltip title="Reject">
                                    <Button
                                      color="warning"
                                      onClick={() =>
                                        handleUpdatePlaceStatus(
                                          place.id,
                                          "rejected"
                                        )
                                      }
                                    >
                                      <CancelIcon fontSize="small" />
                                    </Button>
                                  </Tooltip>
                                  <Tooltip title="Delete">
                                    <Button
                                      color="error"
                                      onClick={() =>
                                        openDeleteConfirm(place.id, "place")
                                      }
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </Button>
                                  </Tooltip>
                                </ButtonGroup>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            </TabPanel>
          </Paper>
        </Container>
      </Box>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() =>
          setConfirmDialog({
            open: false,
            title: "",
            message: "",
            onConfirm: null,
          })
        }
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
      />
    </ThemeProvider>
  );
}
