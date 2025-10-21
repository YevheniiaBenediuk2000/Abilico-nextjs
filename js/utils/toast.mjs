// ./js/utils/toast.mjs

// Variants: primary, secondary, success, danger, warning, info, light, dark
const VARIANT_DEFAULT = "danger"; // good default for errors

function getContainer() {
  let el = document.getElementById("toast-stack");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast-stack";
    el.className = "toast-container position-fixed top-0 end-0 p-3";
    document.body.appendChild(el);
  }
  return el;
}

/**
 * showToast
 * @param {Object} opts
 * @param {string} opts.message - required
 * @param {string} [opts.title] - optional header text
 * @param {('primary'|'secondary'|'success'|'danger'|'warning'|'info'|'light'|'dark')} [opts.variant='danger']
 * @param {boolean} [opts.autohide=true]
 * @param {number} [opts.delay=7000]
 * @param {boolean} [opts.important=false] - use assertive live region for critical errors
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

  const container = getContainer();

  // role/aria-live: 'alert' + 'assertive' for errors; 'status' + 'polite' otherwise
  const isErrorLike = variant === "danger" || important;
  const role = isErrorLike ? "alert" : "status";
  const ariaLive = isErrorLike ? "assertive" : "polite";

  const toast = document.createElement("div");
  toast.className = `toast align-items-center text-bg-${variant} border-0`;
  toast.setAttribute("role", role);
  toast.setAttribute("aria-live", ariaLive);
  toast.setAttribute("aria-atomic", "true");

  // Body (you can add a header if you like; simple layout is usually best for alerts)
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        ${title ? `<strong class="me-2">${escapeHtml(title)}</strong>` : ""}
        ${escapeHtml(message)}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;

  container.appendChild(toast);

  // Respect autohide/delay via JS options (preferred over data attributes)
  const bsToast = bootstrap.Toast.getOrCreateInstance(toast, {
    autohide,
    delay,
  });

  // Clean DOM on hide
  toast.addEventListener("hidden.bs.toast", () => toast.remove());
  bsToast.show();

  return bsToast;
}

// Convenience helpers
export const toastError = (msg, opts = {}) =>
  showToast({ message: msg, variant: "danger", title: "Error", ...opts });
export const toastWarn = (msg, opts = {}) =>
  showToast({ message: msg, variant: "warning", title: "Warning", ...opts });
export const toastInfo = (msg, opts = {}) =>
  showToast({ message: msg, variant: "info", ...opts });
export const toastSuccess = (msg, opts = {}) =>
  showToast({ message: msg, variant: "success", ...opts });

// Tiny XSS-safe text escape for dynamic content
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        ch
      ])
  );
}
