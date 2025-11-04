import { ACCESSIBILITY_KEYWORDS_CLASSIFICATION_THRESHOLD } from "../constants/configs.mjs";
import elements from "../constants/domElements.mjs";
import globals from "../constants/globalVariables.mjs";
import { hideLoading, showLoading } from "../utils/loading.mjs";

const classifierWorker = new Worker(
  new URL("../workers/accessibilityKeywordsClassifier.js", import.meta.url),
  { type: "module" }
);

let _reqId = 0;
const _pending = new Map();
classifierWorker.onmessage = (e) => {
  const { id, type, ...rest } = e.data || {};
  const p = _pending.get(id);
  if (!p) return;

  if (type === "error") {
    p.reject(new Error(rest.error || "Worker error"));
  } else {
    p.resolve({ type, ...rest });
  }
  _pending.delete(id);
};

function callWorker(msg) {
  const id = ++_reqId;
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    classifierWorker.postMessage({ id, ...msg });
  });
}

async function extractAccessibilityKeywordsMany(texts, options = {}) {
  const res = await callWorker({ type: "classify-many", texts, options });
  if (res.type !== "result-many") throw new Error("Bulk classification failed");
  return res.items; // array of raw outs: { labels:[], scores:[] }
}

function ensureAccKeywordsBlock() {
  const reviewsPane = document.getElementById("tab-reviews");
  let block = reviewsPane.querySelector("#acc-keywords-block");
  if (!block) {
    block = document.createElement("div");
    block.id = "acc-keywords-block";
    block.className = "mb-3 d-none";
    block.innerHTML = `
      <h6 class="mb-2">Accessibility mentions in reviews</h6>
      <div id="acc-keywords-summary" class="d-flex flex-wrap gap-2"></div>
    `;
    // Insert before the review form
    elements.reviewForm.parentElement.insertBefore(
      block,
      elements.reviewForm.nextSibling
    );
  }
  return {
    block,
    summaryEl: block.querySelector("#acc-keywords-summary"),
  };
}

function aggregateHits(hitsPerReview, total) {
  const m = new Map();
  hitsPerReview.forEach((hits) => {
    const seen = new Set();
    hits.forEach(({ label, score }) => {
      if (seen.has(label)) return;
      const cur = m.get(label) || { count: 0, scoreSum: 0 };
      cur.count += 1;
      cur.scoreSum += score;
      m.set(label, cur);
      seen.add(label);
    });
  });
  return [...m.entries()]
    .map(([label, { count, scoreSum }]) => ({
      label,
      count,
      pct: (count / total) * 100,
      scoreAvg: scoreSum / count,
    }))
    .sort((a, b) => b.count - a.count || b.scoreAvg - a.scoreAvg);
}

function renderAccSummary(agg) {
  const { block, summaryEl } = ensureAccKeywordsBlock();
  summaryEl.innerHTML = "";
  agg.forEach(({ label, count, pct }) => {
    const chip = document.createElement("span");
    chip.className = "badge text-bg-secondary";
    chip.textContent = `${label} · ${count} (${Math.round(pct)}%)`;
    summaryEl.appendChild(chip);
  });
  block.classList.toggle("d-none", agg.length === 0);
}

function renderPerReviewBadges(hitsPerReview) {
  const items = Array.from(elements.reviewsList.children);
  items.forEach((li, i) => {
    let wrap = li.querySelector(".review-badges");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "mt-1 d-flex flex-wrap gap-1 review-badges";
      wrap.setAttribute("aria-label", "Detected accessibility mentions");
      li.appendChild(wrap);
    }
    wrap.innerHTML = "";
    (hitsPerReview[i] || []).forEach(({ label }) => {
      const b = document.createElement("span");
      b.className = "badge text-bg-light border";
      b.textContent = label;
      wrap.appendChild(b);
    });
  });
}

export async function recomputePlaceAccessibilityKeywords() {
  const placeId = globals.detailsCtx.placeId;
  const texts = globals.reviews
    .filter((r) => r.placeId === placeId)
    .map((r) => r.text);
  if (!texts.length) {
    renderAccSummary([]);
    renderPerReviewBadges([]);
    return;
  }

  const key = showLoading("reviews-analyze");
  try {
    const outs = await extractAccessibilityKeywordsMany(texts);
    const hitsPerReview = outs.map((out) =>
      out.labels
        .map((label, i) => ({ label, score: out.scores[i] }))
        .filter(
          (x) => x.score >= ACCESSIBILITY_KEYWORDS_CLASSIFICATION_THRESHOLD
        )
    );
    console.log(outs);
    renderPerReviewBadges(hitsPerReview);
    const agg = aggregateHits(hitsPerReview, texts.length);
    renderAccSummary(agg);
  } finally {
    hideLoading(key);
  }
}
