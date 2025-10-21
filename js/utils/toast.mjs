// utils/modal.mjs
export function showToast(
  message,
  {
    title = "Error",
    variant = "danger", // "primary" | "success" | "warning" | "danger" | ...
    autohide = true,
    delay = 7000,
    assertive = true, // errors: assertive; infos: polite
  } = {}
) {
  const container = document.getElementById("toast-container");
  if (!container) return console.error("Toast container not found!");

  const wrapper = document.createElement("div");
  const role = assertive ? "alert" : "status";
  const live = assertive ? "assertive" : "polite";

  // Build toast
  wrapper.innerHTML = `
    <div class="toast text-bg-${variant} border-0 shadow" role="${role}" aria-live="${live}" aria-atomic="true" data-bs-autohide="${autohide}" data-bs-delay="${delay}">
      <div class="d-flex">
        <div class="toast-body">
          <strong class="me-2">${title}:</strong> ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `;
  const toastEl = wrapper.firstElementChild;
  container.appendChild(toastEl);

  const instance = bootstrap.Toast.getOrCreateInstance(toastEl);
  // Clean up after hide
  toastEl.addEventListener("hidden.bs.toast", () => toastEl.remove());
  instance.show();
}
