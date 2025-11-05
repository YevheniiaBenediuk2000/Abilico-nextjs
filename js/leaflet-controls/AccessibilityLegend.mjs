import { SIZE_BY_TIER } from "../constants/configs.mjs";
import { ls } from "../utils/localStorage.mjs";
import { BADGE_COLOR_BY_TIER } from "../constants/configs.mjs";

export const ACCESSIBILITY_FILTER_LS_KEY = "ui.placeAccessibility.filter";

const idToTier = new Map([
  ["btn-check-designated", "designated"],
  ["btn-check-yes", "yes"],
  ["btn-check-limited", "limited"],
  ["btn-check-unknown", "unknown"],
  ["btn-check-no", "no"],
]);

export const AccessibilityLegend = L.Control.extend({
  options: { position: "topright" },
  onAdd() {
    const div = L.DomUtil.create("div", "leaflet-control");
    const accessibilityLegendEl = document.getElementById(
      "accessibility-legend"
    );

    const labels = accessibilityLegendEl.querySelectorAll(
      '[data-bs-toggle="tooltip"]'
    );

    labels.forEach((labelEl) => {
      const tier = idToTier.get(labelEl.htmlFor);
      const px = SIZE_BY_TIER[tier];

      labelEl.style.width = `${px}px`;
      labelEl.style.height = `${px}px`;
      labelEl.style.backgroundColor =
        BADGE_COLOR_BY_TIER[tier] ?? BADGE_COLOR_BY_TIER.unknown;

      new bootstrap.Tooltip(labelEl);
    });

    div.append(accessibilityLegendEl);
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);

    const inputs = accessibilityLegendEl.querySelectorAll("input.btn-check");
    const persisted = JSON.parse(ls.get(ACCESSIBILITY_FILTER_LS_KEY)) ?? "";

    if (Array.isArray(persisted)) {
      inputs.forEach((inp) => {
        const tier = idToTier.get(inp.id);
        inp.checked = persisted.includes(tier);
      });
    } else {
      // Seed storage from whatever the HTML currently marks as checked
      const seed = Array.from(inputs)
        .filter((i) => i.checked)
        .map((i) => idToTier.get(i.id));
      ls.set(ACCESSIBILITY_FILTER_LS_KEY, JSON.stringify(seed));
    }

    const emitChange = () => {
      const tiers = Array.from(inputs)
        .filter((i) => i.checked)
        .map((i) => idToTier.get(i.id));

      ls.set(ACCESSIBILITY_FILTER_LS_KEY, JSON.stringify(tiers));

      document.dispatchEvent(
        new CustomEvent("accessibilityFilterChanged", { detail: tiers })
      );
    };

    inputs.forEach((inp) => {
      inp.addEventListener("change", emitChange);
    });
    emitChange();

    return div;
  },
});

// === Accessibility-driven icon sizing ===
export function getAccessibilityTier(tags = {}) {
  // Prefer general wheelchair access; fall back to toilets accessibility
  const raw = (
    tags.wheelchair ??
    tags["toilets:wheelchair"] ??
    tags["wheelchair:toilets"] ??
    ""
  )
    .toString()
    .toLowerCase();

  // Normalize a few common variants
  if (raw.includes("designated")) return "designated";
  if (raw === "yes" || raw.includes("true")) return "yes";
  if (raw.includes("limited") || raw.includes("partial")) return "limited";
  if (raw === "no" || raw.includes("false")) return "no";

  return "unknown";
}
