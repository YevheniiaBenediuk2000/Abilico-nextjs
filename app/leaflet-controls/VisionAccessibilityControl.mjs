/**
 * Vision Accessibility Control
 * Displays vision accessibility information when a place with blind=no is selected
 * Positioned at bottomleft, above the basemap gallery
 */

export const VisionAccessibilityControl = L.Control.extend({
  options: { position: "bottomleft" },

  initialize(opts = {}) {
    L.setOptions(this, opts);
    this._tags = null;
  },

  onAdd(map) {
    const container = L.DomUtil.create(
      "div",
      "leaflet-control vision-accessibility-control"
    );
    container.style.display = "none"; // Hidden by default
    container.style.marginBottom = "8px"; // Space above basemap gallery

    // Prevent map interactions
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    // Card container
    const card = L.DomUtil.create("div", "vision-accessibility-card", container);
    card.style.cssText = `
      background-color: #ffffff;
      border-radius: 16px;
      box-shadow: 0px 2px 1px -1px rgba(0, 0, 0, 0.2),
        0px 1px 1px 0px rgba(0, 0, 0, 0.14),
        0px 1px 3px 0px rgba(0, 0, 0, 0.12);
      border: 1px solid rgba(0, 0, 0, 0.06);
      padding: 16px;
      max-width: 280px;
    `;

    // Header with icon
    const header = L.DomUtil.create("div", "vision-accessibility-header", card);
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    `;

    // Icon container
    const iconContainer = L.DomUtil.create("div", "", header);
    iconContainer.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background-color: rgba(12, 119, 210, 0.08);
      color: var(--bs-primary);
      flex-shrink: 0;
    `;

    const icon = L.DomUtil.create("span", "material-icons", iconContainer);
    icon.style.cssText = `
      font-size: 24px;
      color: var(--bs-primary);
    `;
    icon.textContent = "blind";

    // Title
    const title = L.DomUtil.create("h6", "", header);
    title.style.cssText = `
      font-size: 1.125rem;
      font-weight: 600;
      color: rgba(0, 0, 0, 0.87);
      letter-spacing: -0.01em;
      margin: 0;
    `;
    title.textContent = "Other Accessibility";

    // Content
    const content = L.DomUtil.create("div", "vision-accessibility-content", card);

    const label = L.DomUtil.create("div", "", content);
    label.style.cssText = `
      display: block;
      color: rgba(0, 0, 0, 0.6);
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    `;
    label.textContent = "Vision accessibility";

    const value = L.DomUtil.create("div", "", content);
    value.style.cssText = `
      color: rgba(0, 0, 0, 0.87);
      font-size: 0.875rem;
      line-height: 1.5;
    `;
    value.textContent =
      "No specific features for blind or low-vision visitors reported (e.g. tactile paths, audio guidance).";

    this._container = container;
    this._card = card;

    return container;
  },

  update(tags) {
    if (!this._container) return;

    const blindValue = tags?.blind || tags?.Blind || null;
    const shouldShow =
      blindValue && String(blindValue).toLowerCase().trim() === "no";

    if (shouldShow) {
      this._container.style.display = "block";
      this._tags = tags;
    } else {
      this._container.style.display = "none";
      this._tags = null;
    }
  },

  clear() {
    if (this._container) {
      this._container.style.display = "none";
      this._tags = null;
    }
  },
});

