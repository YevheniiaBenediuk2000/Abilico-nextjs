// app/utils/toast.mjs

// We now use a global window event that a React MUI ToastHost listens to.
// This file is still plain JS and can be imported from mapMain.js etc.

const VARIANT_DEFAULT = "danger"; // backwards-compatible with old callers

/**
 * Internal: send a toast event to the React layer.
 * @param {Object} opts
 * @param {string} opts.message
 * @param {string} [opts.title]
 * @param {string} [opts.variant] - old Bootstrap variants: danger, warning, info, success, primary, secondary, light, dark
 * @param {boolean} [opts.autohide=true]
 * @param {number} [opts.delay=7000] - ms
 * @param {boolean} [opts.important=false]
 */
export function showToast({
  message,
  title,
  variant = VARIANT_DEFAULT,
  autohide = true,
  delay = 7000,
  important = false,
} = {}) {
  if (!message) return;

  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function"
  ) {
    // SSR / non-browser: just log
    console[variant === "danger" ? "error" : "log"](
      `[toast:${variant}]`,
      title ? `${title}:` : "",
      message
    );
    return;
  }

  const event = new CustomEvent("app-toast", {
    detail: {
      message,
      title,
      variant,
      autohide,
      delay,
      important,
    },
  });

  window.dispatchEvent(event);
}

// Convenience helpers (kept same API as before)
export const toastError = (msg, opts = {}) =>
  showToast({
    message: msg,
    title: opts.title ?? "Error",
    variant: "danger",
    important: true,
    ...opts,
  });

export const toastWarn = (msg, opts = {}) =>
  showToast({
    message: msg,
    title: opts.title ?? "Warning",
    variant: "warning",
    ...opts,
  });

export const toastInfo = (msg, opts = {}) =>
  showToast({
    message: msg,
    variant: "info",
    ...opts,
  });

export const toastSuccess = (msg, opts = {}) =>
  showToast({
    message: msg,
    variant: "success",
    ...opts,
  });
