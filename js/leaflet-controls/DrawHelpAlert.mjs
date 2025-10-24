import { ls } from "../utils/localStorage.mjs";

export const DRAW_HELP_LS_KEY = "ui.drawHelp.dismissed";

export const DrawHelpAlert = L.Control.extend({
  options: { position: "topright" },
  onAdd() {
    const container = L.DomUtil.create("div", "leaflet-control");
    const alertEl = document.getElementById("draw-help-alert");
    alertEl.classList.remove("d-none");
    container.append(alertEl);

    // prevent the alert from panning/zooming the map when interacted with
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    // Persist dismissal before the element is removed
    alertEl.addEventListener("close.bs.alert", () => {
      ls.set(DRAW_HELP_LS_KEY, "1");
    });

    // After it's closed, remove the Leaflet control so no empty box remains
    alertEl.addEventListener("closed.bs.alert", () => {
      if (this._map) this._map.removeControl(this);
    });

    return container;
  },
});
