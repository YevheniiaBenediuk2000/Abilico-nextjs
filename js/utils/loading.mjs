const bar = document.getElementById("global-loading");
let count = 0;
const active = new Set();
const update = () => bar.classList.toggle("d-none", count === 0);

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

export function showListSpinner(listEl, text = "Searching…") {
  if (!listEl) return;
  listEl.innerHTML = `
    <li class="list-group-item">
      <div class="d-flex align-items-center gap-2">
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        <span>${text}</span>
      </div>
    </li>`;
  listEl.classList.remove("d-none");
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
  list.innerHTML = `
    <div class="list-group-item">
      <div class="d-flex align-items-center gap-2">
        <span class="spinner-border" role="status" aria-hidden="true"></span>
        <span>Loading details…</span>
      </div>
    </div>`;
  moveDepartureSearchBarUnderTo();
  mountInOffcanvas(titleText);
}
