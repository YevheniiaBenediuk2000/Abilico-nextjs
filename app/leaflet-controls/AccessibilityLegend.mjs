import { ls } from "../utils/localStorage.mjs";
import { BADGE_COLOR_BY_TIER } from "../constants/constants.mjs";

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

    // 🧩 If empty, populate the default legend HTML
    if (!accessibilityLegendEl.innerHTML.trim()) {
      accessibilityLegendEl.innerHTML = `
      <form>
        <h6>Place Accessibility</h6>
        <div class="d-flex align-items-center gap-2">
          ${["designated", "yes", "limited", "unknown", "no"]
            .map(
              (key) => `
                <input type="checkbox" class="btn-check" id="btn-check-${key}" autocomplete="off" checked />
                <label class="btn" for="btn-check-${key}" data-bs-toggle="tooltip" data-bs-title="${key}"></label>`
            )
            .join("")}
        </div>
      </form>
    `;
    }

    const labels = accessibilityLegendEl.querySelectorAll(
      '[data-bs-toggle="tooltip"]'
    );

    labels.forEach((labelEl) => {
      const tier = idToTier.get(labelEl.htmlFor);
      const px = 32;
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

    // ✅ Load persisted filters, or default to all filters ON
    let activeFilters;
    if (Array.isArray(persisted) && persisted.length > 0) {
      activeFilters = persisted;
    } else {
      // Default: all filters enabled
      activeFilters = ["designated", "yes", "limited", "unknown", "no"];
      ls.set(ACCESSIBILITY_FILTER_LS_KEY, JSON.stringify(activeFilters));
    }

    // Apply state to checkboxes
    inputs.forEach((inp) => {
      const tier = idToTier.get(inp.id);
      inp.checked = activeFilters.includes(tier);
    });

    const emitChange = () => {
      const tiers = Array.from(inputs)
        .filter((i) => i.checked)
        .map((i) => idToTier.get(i.id));

      ls.set(ACCESSIBILITY_FILTER_LS_KEY, JSON.stringify(tiers));
      document.dispatchEvent(
        new CustomEvent("accessibilityFilterChanged", { detail: tiers })
      );
    };

    inputs.forEach((inp) => inp.addEventListener("change", emitChange));
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
