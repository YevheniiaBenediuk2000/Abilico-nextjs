// api/placeRatings.js

/**
 * R_{s,p} – average rating for each category p for this place s
 * from an array of reviews (each review may have category_ratings JSON).
 */
export function computeCategoryAveragesFromReviews(reviews = []) {
  const sums = {};
  const counts = {};

  for (const review of reviews) {
    const catRatings = review.category_ratings || {};
    if (!catRatings || typeof catRatings !== "object") continue;

    for (const [cat, rawVal] of Object.entries(catRatings)) {
      const val = Number(rawVal);
      if (!val || Number.isNaN(val)) continue; // ignore 0 / invalid

      sums[cat] = (sums[cat] || 0) + val;
      counts[cat] = (counts[cat] || 0) + 1;
    }
  }

  const averages = {};
  for (const cat of Object.keys(sums)) {
    averages[cat] = sums[cat] / counts[cat]; // R_s,p
  }
  return averages;
}

/**
 * A_s – personalised score = mean of the averages
 * for the user's chosen categories P.
 *
 * preferences: array of category ids, e.g. ["entrance","restroom","parking"]
 */
export function computePersonalScore(averages = {}, preferences = []) {
  if (!preferences || !preferences.length) return null;

  const used = [];

  for (const p of preferences) {
    const v = averages[p];
    if (typeof v === "number" && !Number.isNaN(v)) {
      used.push(v);
    }
  }

  // If place has no ratings in any chosen category → no personal score
  if (!used.length) return null;

  const sum = used.reduce((a, b) => a + b, 0);
  return sum / used.length; // A_s
}

/**
 * G_s – global average rating (overall stars) for a place.
 */
export function computeGlobalRatingFromReviews(reviews = []) {
  const values = [];

  for (const review of reviews) {
    const v = Number(
      review.overall_rating ?? review.rating ?? review.rating_overall
    );
    if (!v || Number.isNaN(v)) continue;
    values.push(v);
  }

  if (!values.length) return null;

  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length; // G_s
}

/**
 * Convenience: everything in one call.
 */
export function computePlaceScores(reviews = [], preferences = []) {
  const perCategory = computeCategoryAveragesFromReviews(reviews);
  const personalScore = computePersonalScore(perCategory, preferences);
  const globalScore = computeGlobalRatingFromReviews(reviews);
  return { perCategory, personalScore, globalScore };
}
