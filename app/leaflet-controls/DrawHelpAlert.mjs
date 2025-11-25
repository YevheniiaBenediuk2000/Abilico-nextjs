import { ls } from "../utils/localStorage.mjs";
import L from "leaflet";

export const DRAW_HELP_LS_KEY = "ui.drawHelp.dismissed";

export const DrawHelpAlert = L.Control.extend({
  options: { position: "topright" },

  onAdd() {
    const container = L.DomUtil.create("div", "leaflet-control");
    const template = document.getElementById("draw-help-alert");

    if (!template) {
      return container;
    }

    // Clone the React-rendered template (MUI Card) and show it
    const alertEl = template.cloneNode(true);
    alertEl.classList.remove("d-none");

    // Prevent interaction from affecting the map
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    const control = this;

    // Custom close handler instead of Bootstrap's alert events
    const closeBtn = alertEl.querySelector("[data-role='draw-help-close']");
    if (closeBtn) {
      closeBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        // Remember dismissal so we don't show it again
        ls.set(DRAW_HELP_LS_KEY, "1");

        if (control._map) {
          control._map.removeControl(control);
        }
      });
    }

    container.append(alertEl);
    return container;
  },
});
