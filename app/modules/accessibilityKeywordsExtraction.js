import {
  ACCESSIBILITY_KEYWORDS_CLASSIFICATION_THRESHOLD,
  ACCESSIBILITY_LABELS_IN_REVIEWS,
} from "../constants/constants.mjs";
import elements from "../constants/domElements.js";
import globals from "../constants/globalVariables.js";

async function extractAccessibilityKeywordsMany(texts, options = {}) {
  const res = await fetch("/api/acc-classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      texts,
      labels: ACCESSIBILITY_LABELS_IN_REVIEWS,
      options,
    }),
  });

  if (!res.ok) throw new Error(`Server classify failed: ${res.status}`);
  const json = await res.json();
  return json.items || [];
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

    const cardBody = reviewsPane.querySelector(".card-body");
    if (cardBody && elements.reviewsList) {
      cardBody.insertBefore(block, elements.reviewsList);
    } else if (cardBody) {
      cardBody.appendChild(block);
    }
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

// 🔑 helper: a stable key based on coordinates, used to sync with React list
function geoKeyFromLatLng(latlng) {
  if (
    !latlng ||
    typeof latlng.lat !== "number" ||
    Number.isNaN(latlng.lat) ||
    typeof latlng.lng !== "number" ||
    Number.isNaN(latlng.lng)
  ) {
    return null;
  }
  return `${latlng.lat.toFixed(5)},${latlng.lng.toFixed(5)}`;
}

export async function recomputePlaceAccessibilityKeywords() {
  const placeId = globals.detailsCtx.placeId; // still used for reviews filter
  const latlng = globals.detailsCtx.latlng;
  const geoKey = geoKeyFromLatLng(latlng);

  const texts = globals.reviews
    .filter((r) => r.place_id === placeId)
    .map((r) => r.comment);

  // No reviews → clear everything for this place
  if (!texts.length) {
    renderAccSummary([]);
    renderPerReviewBadges([]);

    if (geoKey) {
      globals.accessibilityKeywordsByGeoKey =
        globals.accessibilityKeywordsByGeoKey || {};
      globals.accessibilityKeywordsByGeoKey[geoKey] = [];

      if (
        typeof window !== "undefined" &&
        typeof window.updatePlaceAccKeywords === "function"
      ) {
        window.updatePlaceAccKeywords(geoKey, []);
      }
    }

    return;
  }

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

    // Update review badges + summary block
    renderPerReviewBadges(hitsPerReview);
    const agg = aggregateHits(hitsPerReview, texts.length);
    renderAccSummary(agg);

    // ✅ NEW: cache per-place keywords and notify React list view
    if (geoKey) {
      globals.accessibilityKeywordsByGeoKey =
        globals.accessibilityKeywordsByGeoKey || {};
      globals.accessibilityKeywordsByGeoKey[geoKey] = agg;

      if (
        typeof window !== "undefined" &&
        typeof window.updatePlaceAccKeywords === "function"
      ) {
        window.updatePlaceAccKeywords(geoKey, agg);
      }
    }
  } catch (err) {
    console.error("Failed to extract accessibility keywords:", err);
  }
}
