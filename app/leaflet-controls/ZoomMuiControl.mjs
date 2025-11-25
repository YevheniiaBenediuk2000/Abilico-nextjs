import L from "leaflet";

export const ZoomMuiControl = L.Control.extend({
  options: { position: "bottomright" },

  onAdd(map) {
    const container = L.DomUtil.create("div", "leaflet-control");
    const mountNode = L.DomUtil.create("div", "", container);

    // Avoid map panning/zooming when interacting with the control
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    const self = this;

    Promise.all([
      import("react"),
      import("react-dom/client"),
      import("../components/ZoomControlReact"),
    ])
      .then(([ReactMod, ReactDOMMod, ZoomMod]) => {
        const React = ReactMod.default || ReactMod;
        const { createRoot } = ReactDOMMod;
        const ZoomControlReact = ZoomMod.default || ZoomMod;

        const root = createRoot(mountNode);
        self._reactRoot = root;

        root.render(
          React.createElement(ZoomControlReact, {
            onZoomIn: () => map.zoomIn(),
            onZoomOut: () => map.zoomOut(),
          })
        );
      })
      .catch((err) => {
        console.error("Failed to mount ZoomMuiControl React component", err);
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
