import { iconFor } from "./makiIconFor.mjs";
import { getAccessibilityTier } from "../leaflet-controls/AccessibilityLegend.mjs";
import {
  BADGE_COLOR_BY_TIER,
  PREDICTED_BADGE_COLOR_BY_TIER,
} from "../constants/constants.mjs";

/** Returns an L.divIcon with a fixed 33px badge whose background
 *  color reflects accessibility and whose glyph comes from makiIconFor.
 *
 * @param {Object} tags - Place tags (used for tier and icon detection)
 * @param {Object} opts - Options
 * @param {string} opts.badgeOverride - Override badge color
 * @param {boolean} opts.isPredicted - If true, shows dashed border to indicate ML prediction
 * @param {string} opts.predictedTier - The predicted accessibility tier (accessible, limited, not_accessible)
 */
export function makePoiIcon(tags = {}, opts = {}) {
  const glyphUrl = iconFor(tags);
  const tier = getAccessibilityTier(tags);
  const isPredicted = opts?.isPredicted || false;
  const predictedTier = opts?.predictedTier;

  // Use predicted colors if this is a prediction, otherwise use normal tier colors
  let badge;
  if (opts?.badgeOverride) {
    badge = opts.badgeOverride;
  } else if (
    isPredicted &&
    predictedTier &&
    PREDICTED_BADGE_COLOR_BY_TIER[predictedTier]
  ) {
    badge = PREDICTED_BADGE_COLOR_BY_TIER[predictedTier];
  } else {
    badge = BADGE_COLOR_BY_TIER[tier] ?? BADGE_COLOR_BY_TIER.unknown;
  }

  // Add predicted class for dashed border styling
  const badgeClass = isPredicted
    ? "poi-badge poi-badge--predicted"
    : "poi-badge";

  const html = `
    <div class="${badgeClass}" style="--badge:${badge}">
      <div class="poi-badge__glyph" style="--glyph:url('${glyphUrl}')"></div>
      ${isPredicted ? `<div class="poi-badge__ai-indicator" style="--badge:${badge}">AI</div>` : ""}
    </div>
  `;

  return L.divIcon({
    className: "poi-badge-wrapper",
    html,
    iconSize: [33, 33],
    iconAnchor: [16, 30],
    popupAnchor: [0, -20],
    tooltipAnchor: [0, -16],
  });
}
