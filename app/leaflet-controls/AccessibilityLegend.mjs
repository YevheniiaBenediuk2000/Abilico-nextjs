export const ACCESSIBILITY_FILTER_LS_KEY = "ui.placeAccessibility.filter";

export const AccessibilityLegend = L.Control.extend({
  options: { position: "topright" },

  onAdd() {
    const container = L.DomUtil.create("div", "leaflet-control");
    const mountNode = L.DomUtil.create("div", "", container);

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    const self = this;

    // Dynamically mount the React legend
    Promise.all([
      import("react"),
      import("react-dom/client"),
      import("../components/AccessibilityLegendReact"),
    ])
      .then(([ReactMod, ReactDOMMod, LegendMod]) => {
        const React = ReactMod.default || ReactMod;
        const { createRoot } = ReactDOMMod;
        const Legend = LegendMod.default || LegendMod;

        const root = createRoot(mountNode);
        self._reactRoot = root;
        root.render(React.createElement(Legend));
      })
      .catch((err) => {
        console.error(
          "Failed to mount AccessibilityLegend React component",
          err
        );
      });

    return container;
  },

  onRemove() {
    if (this._reactRoot) {
      this._reactRoot.unmount();
      this._reactRoot = null;
    }
  },
});

// === Accessibility-driven icon sizing
export function getAccessibilityTier(tags = {}) {
  // Check user-reported accessibility first (from approved reports) - this takes precedence
  const userReported = tags.user_reported_accessibility;
  const userReportedWheelchair =
    userReported && typeof userReported === "object"
      ? userReported.wheelchair
      : null;

  const raw = (
    userReportedWheelchair ??
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