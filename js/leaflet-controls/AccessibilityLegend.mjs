export const SIZE_BY_TIER = {
  designated: 44, // biggest: fully designated accessible
  yes: 40,
  limited: 34,
  unknown: 30, // default when we don't know
  no: 26, // smallest when explicitly not accessible
};

export const Z_INDEX_BY_TIER = {
  designated: 1200,
  yes: 1100,
  limited: 1000,
  unknown: 900,
  no: 800,
};

export const ACCESSIBILITY_LEGEND_LS_KEY = "ui.accessibilityLegend.dismissed";

export const AccessibilityLegend = L.Control.extend({
  options: { position: "topright" },
  onAdd() {
    const div = L.DomUtil.create("div", "leaflet-control ");
    const accessibilityLegendEl = document.getElementById(
      "accessibility-legend"
    );

    const tooltipTriggerList = accessibilityLegendEl.querySelectorAll(
      '[data-bs-toggle="tooltip"]'
    );
    tooltipTriggerList.forEach(
      (tooltipTriggerEl) => new bootstrap.Tooltip(tooltipTriggerEl)
    );

    div.append(accessibilityLegendEl);
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);

    accessibilityLegendEl.addEventListener("close.bs.alert", () => {
      ls.set(ACCESSIBILITY_LEGEND_LS_KEY, "1");
    });
    accessibilityLegendEl.addEventListener("closed.bs.alert", () => {
      if (this._map) this._map.removeControl(this);
    });

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
