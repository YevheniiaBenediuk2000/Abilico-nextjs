// Lazy lookup of the loading bar element to handle React hydration timing
let bar = null;
function getBar() {
  if (!bar) {
    bar = document.getElementById("global-loading");
  }
  return bar;
}

let count = 0;
const active = new Set();
const update = () => {
  const el = getBar();
  if (el) {
    el.classList.toggle("d-none", count === 0);
  }
};

export function showLoading(key = Symbol("loading")) {
  if (!active.has(key)) {
    active.add(key);
    count++;
    update();
  }
  return key;
}
export function hideLoading(key) {
  if (active.delete(key)) {
    count = Math.max(0, count - 1);
    update();
  }
}
export async function duringLoading(key, promise) {
  const k = showLoading(key);
  try {
    return await promise;
  } finally {
    hideLoading(k);
  }
}

export function withButtonLoading(btn, promise, text = "Saving…") {
  if (!btn) return promise;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>${text}`;
  const done = () => {
    btn.disabled = false;
    btn.innerHTML = original;
  };
  return promise.then(
    (x) => (done(), x),
    (e) => {
      done();
      throw e;
    }
  );
}

export function showDetailsLoading(
  container,
  titleText = "Details",
  moveDepartureSearchBarUnderTo,
  mountInOffcanvas
) {
  container.classList.remove("d-none");
  const list = container.querySelector("#details-list");

  // Create a beautiful loading state with proper spacing and modern styling
  const loadingItem = document.createElement("div");
  loadingItem.className = "list-group-item";
  loadingItem.style.padding = "0";

  const loadingContainer = document.createElement("div");
  loadingContainer.style.padding = "48px 24px"; // Generous padding for breathing room
  loadingContainer.style.display = "flex";
  loadingContainer.style.flexDirection = "column";
  loadingContainer.style.alignItems = "center";
  loadingContainer.style.justifyContent = "center";
  loadingContainer.style.gap = "16px"; // Space between spinner and text
  loadingContainer.style.minHeight = "200px"; // Minimum height for better visual presence

  // Spinner container with better styling
  const spinnerContainer = document.createElement("div");
  spinnerContainer.style.display = "flex";
  spinnerContainer.style.alignItems = "center";
  spinnerContainer.style.justifyContent = "center";

  const spinner = document.createElement("span");
  spinner.className = "spinner-border";
  spinner.setAttribute("role", "status");
  spinner.setAttribute("aria-hidden", "true");
  spinner.style.width = "32px";
  spinner.style.height = "32px";
  spinner.style.borderWidth = "3px";
  spinner.style.color = "var(--bs-primary)"; // Use brand primary
  spinnerContainer.appendChild(spinner);

  // Loading text with better typography
  const loadingText = document.createElement("span");
  loadingText.textContent = "Loading details…";
  loadingText.style.fontSize = "0.9375rem";
  loadingText.style.fontWeight = "500";
  loadingText.style.color = "rgba(0, 0, 0, 0.87)";
  loadingText.style.letterSpacing = "-0.01em";

  loadingContainer.appendChild(spinnerContainer);
  loadingContainer.appendChild(loadingText);
  loadingItem.appendChild(loadingContainer);

  list.innerHTML = "";
  list.appendChild(loadingItem);

  moveDepartureSearchBarUnderTo();
  mountInOffcanvas(titleText);
}
