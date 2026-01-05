import {
  ACCESSIBILITY_KEYWORDS_CLASSIFICATION_THRESHOLD,
  ACCESSIBILITY_LABELS_IN_REVIEWS,
} from "../constants/constants.mjs";
import elements from "../constants/domElements.js";
import globals from "../constants/globalVariables.js";
import { supabase } from "../api/supabaseClient.js";

/**
 * Extracts accessibility keywords from multiple review texts using the classification API
 * @param {string[]} texts - Array of review text strings to classify
 * @param {Object} options - Optional configuration for the classification
 * @returns {Promise<Array>} Array of classification results, each containing labels and scores
 */
async function extractAccessibilityKeywordsMany(texts, options = {}) {
  // Validate input: ensure texts is an array and has at least one non-empty string
  // This prevents sending invalid requests to the API that would return 400
  if (!Array.isArray(texts) || texts.length === 0) {
    console.warn(
      "⚠️ extractAccessibilityKeywordsMany: texts array is empty or invalid"
    );
    return []; // Return empty array instead of making an API call
  }

  // Filter out empty or null text strings to avoid sending invalid data
  const validTexts = texts.filter(
    (text) => text && typeof text === "string" && text.trim().length > 0
  );

  // If no valid texts after filtering, return empty array
  if (validTexts.length === 0) {
    console.warn(
      "⚠️ extractAccessibilityKeywordsMany: no valid texts found after filtering"
    );
    return [];
  }

  try {
    // Get the base URL for API calls - handle both client and server environments
    const baseUrl = typeof window !== "undefined" 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    
    // Make POST request to the classification API endpoint
    const res = await fetch(`${baseUrl}/api/acc-classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texts: validTexts, // Use filtered valid texts instead of original array
        labels: ACCESSIBILITY_LABELS_IN_REVIEWS, // Predefined accessibility label categories
        options, // Additional classification options (e.g., multi_label settings)
      }),
    });

    // Check if the HTTP response status indicates success (200-299)
    if (!res.ok) {
      // Get error details from response if available
      let errorMessage = `Server classify failed: ${res.status}`;
      try {
        const errorBody = await res.json();
        errorMessage = errorBody?.error || errorMessage;
      } catch {
        // If response body is not JSON, use status code message
      }
      console.error("❌ Classification API error:", errorMessage);
      // Return empty array instead of throwing - this prevents breaking the UI
      return [];
    }

    // Parse the JSON response from the API
    const json = await res.json();
    // API response shape: { items: [{ labels:[], scores:[] }, ...] }
    // Each item corresponds to one input text and contains detected labels with confidence scores
    return json.items || [];
  } catch (error) {
    // Catch network errors, JSON parsing errors, or any other unexpected errors
    console.error("❌ Failed to extract accessibility keywords:", error);
    // Return empty array to prevent breaking the UI - the reviews will just not show keywords
    return [];
  }
}

/**
 * Ensures the accessibility keywords display block exists in the DOM
 * Creates it if it doesn't exist, or returns the existing one
 * @returns {Object} Object containing the block element and summary element
 */
function ensureAccKeywordsBlock() {
  // Find the reviews tab panel where we'll insert the keywords block
  const reviewsPane = document.getElementById("tab-reviews");

  // If reviews pane doesn't exist in DOM, we can't proceed - return null to prevent errors
  if (!reviewsPane) {
    console.warn("⚠️ ensureAccKeywordsBlock: reviews pane not found in DOM");
    return {
      block: null,
      summaryEl: null,
    };
  }

  // Check if the keywords block already exists to avoid creating duplicates
  let block = reviewsPane.querySelector("#acc-keywords-block");

  if (!block) {
    // Create a new div element for the keywords block
    block = document.createElement("div");
    block.id = "acc-keywords-block"; // Unique ID for easy querying later
    block.className = "mb-4 d-none"; // Bootstrap classes: margin-bottom and initially hidden
    // Set the HTML content with heading and container for keyword chips
    block.innerHTML = `
      <h6 class="mb-2">Accessibility mentions in reviews</h6>
      <div id="acc-keywords-summary" class="d-flex flex-wrap gap-2"></div>
    `;

    const reviewsList = document.getElementById("reviews-list");
    const reviewForm = document.getElementById("review-form");

    // CRITICAL FIX: Check if reviewForm exists before trying to access its parentElement
    // elements.reviewForm can be null if the review form hasn't been rendered yet
    if (reviewForm && reviewForm.parentElement && reviewsList) {
      // Insert the new block right after the review form so keywords appear below it
      reviewForm.parentElement.insertAdjacentElement("afterend", block);
    } else if (reviewsPane) {
      // Fallback: if review form doesn't exist, append to the reviews pane instead
      // This prevents the null pointer error and still allows keywords to display
      console.warn(
        "⚠️ ensureAccKeywordsBlock: review form not found, appending to reviews pane"
      );
      reviewsPane.appendChild(block);
    } else {
      // Last resort: if we can't find anywhere to insert, log error and return null
      console.error(
        "❌ ensureAccKeywordsBlock: cannot find valid insertion point in DOM"
      );
      return {
        block: null,
        summaryEl: null,
      };
    }
  }

  // Return both the block container and the summary element where keyword chips will be rendered
  return {
    block,
    summaryEl: block.querySelector("#acc-keywords-summary"), // Find the summary div inside the block
  };
}

/**
 * Aggregates keyword hits across all reviews to calculate summary statistics
 * Counts how many reviews mention each keyword and calculates average confidence scores
 * @param {Array} hitsPerReview - Array of arrays, each containing {label, score} objects for one review
 * @param {number} total - Total number of reviews (used for percentage calculation)
 * @returns {Array} Sorted array of aggregated keyword data with count, percentage, and average score
 */
function aggregateHits(hitsPerReview, total) {
  // Use a Map to track aggregate statistics for each keyword label
  // Map structure: { label => { count: number, scoreSum: number } }
  const m = new Map();

  // Validate input to prevent errors
  if (!Array.isArray(hitsPerReview)) {
    console.warn("⚠️ aggregateHits: hitsPerReview is not an array");
    return []; // Return empty array if input is invalid
  }

  // Ensure total is a valid positive number for percentage calculation
  const validTotal = total && total > 0 ? total : 1; // Default to 1 to prevent division by zero

  // Iterate through each review's keyword hits
  hitsPerReview.forEach((hits) => {
    // Validate that hits is an array
    if (!Array.isArray(hits)) {
      return; // Skip this review if hits is not an array
    }

    // Use a Set to track which labels we've already counted for this review
    // This prevents counting the same keyword multiple times if it appears multiple times in one review
    const seen = new Set();

    // Process each keyword hit in this review
    hits.forEach(({ label, score }) => {
      // Skip if we've already counted this label for this review
      if (seen.has(label)) return;

      // Validate that label exists and is a valid string
      if (!label || typeof label !== "string") {
        return; // Skip invalid labels
      }

      // Validate that score is a valid number
      if (typeof score !== "number" || isNaN(score)) {
        return; // Skip invalid scores
      }

      // Get existing aggregate data for this label, or initialize with zeros
      const cur = m.get(label) || { count: 0, scoreSum: 0 };

      // Increment the count of reviews mentioning this keyword
      cur.count += 1;

      // Add this score to the running sum (for calculating average later)
      cur.scoreSum += score;

      // Store the updated aggregate data back in the Map
      m.set(label, cur);

      // Mark this label as seen for this review to prevent double-counting
      seen.add(label);
    });
  });

  // Convert Map entries to an array of objects with calculated statistics
  return (
    [...m.entries()]
      .map(([label, { count, scoreSum }]) => ({
        label, // Keyword label name
        count, // Number of reviews that mention this keyword
        pct: (count / validTotal) * 100, // Percentage of reviews mentioning this keyword
        scoreAvg: scoreSum / count, // Average confidence score across all mentions
      }))
      // Sort by count (descending), then by average score (descending) if counts are equal
      // This puts the most frequently mentioned keywords with highest confidence first
      .sort((a, b) => b.count - a.count || b.scoreAvg - a.scoreAvg)
  );
}

/**
 * Renders the aggregated accessibility keywords summary as badge chips
 * @param {Array} agg - Array of aggregated keyword data with label, count, and percentage
 */
function renderAccSummary(agg) {
  // Get the block and summary elements, creating them if they don't exist
  const { block, summaryEl } = ensureAccKeywordsBlock();

  // CRITICAL FIX: Check if elements exist before trying to use them
  // If ensureAccKeywordsBlock couldn't find the DOM elements, these will be null
  if (!block || !summaryEl) {
    console.warn(
      "⚠️ renderAccSummary: cannot render - block or summaryEl not found"
    );
    return; // Exit early to prevent null pointer errors
  }

  // Clear any existing keyword chips before rendering new ones
  summaryEl.innerHTML = "";

  // Iterate through each aggregated keyword result and create a badge chip for it
  agg.forEach(({ label, count, pct }) => {
    // Create a span element to display as a badge chip
    const chip = document.createElement("span");
    chip.className = "badge text-bg-secondary"; // Bootstrap badge styling (secondary color)
    // Format: "Label Name · 3 (50%)" - shows label, count of mentions, and percentage
    chip.textContent = `${label} · ${count} (${Math.round(pct)}%)`;
    // Append the chip to the summary container
    summaryEl.appendChild(chip);
  });

  // Toggle visibility: hide the block if there are no keywords (agg.length === 0)
  // d-none class hides the element, so we add it when empty, remove it when there are keywords
  block.classList.toggle("d-none", agg.length === 0);
}

/**
 * Renders accessibility keyword badges next to each individual review
 * Creates badge containers if they don't exist and populates them with detected keywords
 * @param {Array} hitsPerReview - Array of arrays, each containing {label, score} objects for one review
 */
function renderPerReviewBadges(hitsPerReview) {
  // CRITICAL FIX: Check if reviewsList exists before trying to access its children
  // elements.reviewsList might be null if the reviews list hasn't been rendered yet
  if (!elements.reviewsList) {
    console.warn("⚠️ renderPerReviewBadges: reviewsList not found in DOM");
    return; // Exit early to prevent null pointer error
  }

  // Convert the reviewsList's child nodes (likely list items) to an array
  // This allows us to iterate over each review and match it with its keyword hits
  const items = Array.from(elements.reviewsList.children);

  // Validate that we have valid input data
  if (!Array.isArray(hitsPerReview)) {
    console.warn("⚠️ renderPerReviewBadges: hitsPerReview is not an array");
    hitsPerReview = []; // Default to empty array
  }

  // Iterate through each review list item and attach its corresponding keyword badges
  items.forEach((li, i) => {
    // CRITICAL FIX: Check if list item exists before trying to query it
    if (!li || typeof li.querySelector !== "function") {
      console.warn(`⚠️ renderPerReviewBadges: invalid list item at index ${i}`);
      return; // Skip this item and continue with the next one
    }

    // Look for existing badge container within this review item
    let wrap = li.querySelector(".review-badges");

    // If badge container doesn't exist, create it
    if (!wrap) {
      wrap = document.createElement("div"); // Create a new div element
      wrap.className = "mt-1 d-flex flex-wrap gap-1 review-badges"; // Bootstrap flexbox classes
      wrap.setAttribute("aria-label", "Detected accessibility mentions"); // Accessibility label for screen readers
      li.appendChild(wrap); // Add the container to the review list item
    }

    // Clear any existing badges before rendering new ones (in case of re-render)
    wrap.innerHTML = "";

    // Get the keyword hits for this specific review (index i), default to empty array if missing
    const hitsForThisReview = hitsPerReview[i] || [];

    // Validate that hits is an array before iterating
    if (!Array.isArray(hitsForThisReview)) {
      console.warn(
        `⚠️ renderPerReviewBadges: hits at index ${i} is not an array`
      );
      return; // Skip this review
    }

    // Create a badge chip for each detected keyword
    hitsForThisReview.forEach(({ label }) => {
      // Validate that label exists and is a string
      if (!label || typeof label !== "string") {
        console.warn(`⚠️ renderPerReviewBadges: invalid label in review ${i}`);
        return; // Skip this label
      }

      // Create a span element to display as a badge
      const b = document.createElement("span");
      b.className = "badge text-bg-light border"; // Bootstrap badge styling (light background with border)
      b.textContent = label; // Set the keyword text as the badge content
      wrap.appendChild(b); // Add the badge to the container
    });
  });
}

/**
 * Main function: Recomputes and displays accessibility keywords for the current place
 * Filters reviews by place ID, extracts keywords, and renders both per-review badges and summary
 */
export async function recomputePlaceAccessibilityKeywords(
  forceRefresh = false
) {
  // Get the current place ID from global context
  const placeId = globals.detailsCtx.placeId;
  const osmId = globals.detailsCtx.tags?.osm_id || globals.detailsCtx.tags?.id; // Needed for the List View to match

  // Validate that we have a place ID before proceeding
  if (!placeId) {
    console.warn(
      "⚠️ recomputePlaceAccessibilityKeywords: no placeId in context"
    );
    renderAccSummary([]); // Clear any existing keywords
    renderPerReviewBadges([]); // Clear per-review badges
    return; // Exit early
  }

  // Filter reviews to only include those for the current place, then extract comment text
  // This ensures we only classify reviews relevant to the place being viewed
  const texts = globals.reviews
    .filter((r) => r && r.place_id === placeId) // Filter by place ID, also check r exists
    .map((r) => r.comment) // Extract just the comment text for classification
    .filter(
      (text) => text && typeof text === "string" && text.trim().length > 0
    ); // Filter out empty comments

  // If no valid review texts found, clear the display and exit
  if (!texts.length) {
    renderAccSummary([]); // Hide the summary block
    renderPerReviewBadges([]); // Clear all per-review badges

    // Clear DB Cache
    if (forceRefresh) {
      await supabase
        .from("places")
        .update({ accessibility_keywords: [] })
        .eq("id", placeId);
      // Notify List View to clear chips
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("keywords-updated", {
            detail: { placeId, osmId, keywords: [] },
          })
        );
      }
    }
    return; // Exit early - nothing to classify
  }

  try {
    //  Check DB for existing cached keywords to avoid re-running ML
    // placeId is the UUID from ensurePlaceExists
    if (!forceRefresh) {
      const { data: placeData, error: fetchError } = await supabase
        .from("places")
        .select("accessibility_keywords")
        .eq("id", placeId)
        .maybeSingle();

      if (
        !fetchError &&
        placeData?.accessibility_keywords &&
        Array.isArray(placeData.accessibility_keywords) &&
        placeData.accessibility_keywords.length > 0
      ) {
        console.log("✅ Using cached accessibility keywords from Supabase");
        renderAccSummary(placeData.accessibility_keywords);
        // Note: We cannot render *per-review* badges easily if we skip inference,
        // unless we stored per-review hits too. For now, we show the summary from cache.
        // If you strictly need per-review badges, we must run inference or store per-review data.
        // Here we prioritize the "summary" request.
        return;
      }
    } else {
      console.log("♻️ Forcing fresh ML inference (ignoring cache)...");
    }

    // If no cache, run ML Inference
    console.log("🧠 Running ML inference for accessibility keywords...");

    // Call the classification API with all review texts
    // This returns an array of results, one per input text
    const outs = await extractAccessibilityKeywordsMany(texts);

    // CRITICAL FIX: Check if API returned valid results
    // The function now returns empty array on error instead of throwing
    if (!outs || !Array.isArray(outs) || outs.length === 0) {
      console.warn(
        "⚠️ recomputePlaceAccessibilityKeywords: API returned no results"
      );
      renderAccSummary([]);
      renderPerReviewBadges([]);
      return;
    }

    // Process each classification result to extract only high-confidence keywords
    // Map each result to an array of {label, score} objects that meet the threshold
    const hitsPerReview = outs.map((out) => {
      // Validate that the result has the expected structure
      if (!out || !out.labels || !out.scores || !Array.isArray(out.labels)) {
        return []; // Return empty array if structure is invalid
      }
      // Create pairs of labels and their corresponding scores
      // Filter to only include keywords above the confidence threshold
      return out.labels
        .map((label, i) => ({ label, score: out.scores[i] })) // Pair label with its score
        .filter(
          (x) => x.score >= ACCESSIBILITY_KEYWORDS_CLASSIFICATION_THRESHOLD // Only keep high-confidence matches
        );
    });

    // Log the results for debugging (can be removed in production)
    console.log("✅ Accessibility keywords extracted:", outs);

    // Render badges next to each individual review showing detected keywords
    renderPerReviewBadges(hitsPerReview);

    // Aggregate all keywords across all reviews to show summary statistics
    const agg = aggregateHits(hitsPerReview, texts.length);

    // Render the aggregated summary block at the top of the reviews section
    renderAccSummary(agg);

    //  Store aggregated result in Supabase "places" bucket
    const { error: updateError } = await supabase
      .from("places")
      .update({ accessibility_keywords: agg })
      .eq("id", placeId);

    if (updateError) {
      console.error("❌ Failed to cache keywords in Supabase:", updateError);
    } else {
      console.log("💾 Cached accessibility keywords to Supabase");

      // 🔥 Broadcast event so PlacesListReact can update the specific card immediately
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("keywords-updated", {
            detail: {
              placeId, // UUID
              osmId, // String key (e.g. "node/123") used by ListReact
              keywords: agg,
            },
          })
        );
      }
    }
  } catch (err) {
    // Catch any unexpected errors that weren't handled in extractAccessibilityKeywordsMany
    // This is a safety net to prevent the entire feature from breaking the UI
    console.error("❌ Failed to extract accessibility keywords:", err);
    // Clear the display on error so users don't see stale data
    renderAccSummary([]);
    renderPerReviewBadges([]);
  }
}
