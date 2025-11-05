import { iconFor } from "./makiIconFor.mjs";
import { getAccessibilityTier } from "../leaflet-controls/AccessibilityLegend.mjs";
import { BADGE_COLOR_BY_TIER } from "../constants/configs.mjs";

/** Returns an L.divIcon with a fixed 33px badge whose background
 *  color reflects accessibility and whose glyph comes from makiIconFor.
 */
export function makePoiIcon(tags = {}) {
  const glyphUrl = iconFor(tags);
  const tier = getAccessibilityTier(tags);
  const badge = BADGE_COLOR_BY_TIER[tier] || BADGE_COLOR_BY_TIER.unknown;

  const html = `
    <div class="poi-badge" style="--badge:${badge}">
      <div class="poi-badge__glyph" style="--glyph:url('${glyphUrl}')"></div>
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
