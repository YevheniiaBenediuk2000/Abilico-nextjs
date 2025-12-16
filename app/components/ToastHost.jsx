"use client";

import { useEffect, useState } from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

function mapVariantToSeverity(variant) {
  // map old bootstrap variants to MUI Alert severities
  switch (variant) {
    case "danger":
    case "error":
      return "error";
    case "warning":
      return "warning";
    case "success":
      return "success";
    case "info":
    case "primary":
    case "secondary":
    case "light":
    case "dark":
    default:
      return "info";
  }
}

/**
 * React host for global toasts sent from utils/toast.mjs
 * Reusable component that can be added to any layout
 */
export default function ToastHost() {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [open, setOpen] = useState(false);

  // Listen for "app-toast" events from showToast()
  useEffect(() => {
    const handler = (ev) => {
      const detail = ev.detail || {};
      setQueue((prev) => [...prev, detail]);
    };

    window.addEventListener("app-toast", handler);
    return () => window.removeEventListener("app-toast", handler);
  }, []);

  // Dequeue next toast when nothing is open
  useEffect(() => {
    if (!open && !current && queue.length) {
      const [next, ...rest] = queue;
      setCurrent(next);
      setQueue(rest);
      setOpen(true);
    }
  }, [queue, open, current]);

  const handleClose = (_evt, reason) => {
    if (reason === "clickaway") return;
    setOpen(false);
  };

  const handleExited = () => {
    setCurrent(null);
  };

  if (!current) return null;

  const severity = mapVariantToSeverity(current.variant);
  const autoHideDuration =
    current.autohide === false ? null : current.delay ?? 7000;

  return (
    <Snackbar
      open={open}
      onClose={handleClose}
      autoHideDuration={autoHideDuration}
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      TransitionProps={{ onExited: handleExited }}
      sx={{
        "& .MuiSnackbar-root": {
          top: "24px !important",
        },
      }}
    >
      <Alert
        onClose={handleClose}
        severity={severity}
        variant="filled"
        sx={{
          width: "100%",
          minWidth: 300,
          maxWidth: 500,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          borderRadius: 2,
        }}
      >
        {current.title && (
          <strong style={{ marginRight: 8, display: "block", marginBottom: 4 }}>
            {current.title}
          </strong>
        )}
        {current.message}
      </Alert>
    </Snackbar>
  );
}

