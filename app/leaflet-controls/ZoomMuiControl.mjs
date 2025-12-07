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

        const renderControl = () => {
          const currentZoom = map.getZoom();
          const minZoom = map.getMinZoom();
          const maxZoom = map.getMaxZoom();

          root.render(
            React.createElement(ZoomControlReact, {
              onZoomIn: () => map.zoomIn(),
              onZoomOut: () => map.zoomOut(),
              currentZoom,
              minZoom,
              maxZoom,
            })
          );
        };

        // Initial render
        renderControl();

        // Update on zoom changes
        const onZoomEnd = () => renderControl();
        map.on("zoomend", onZoomEnd);
        self._onZoomEnd = onZoomEnd;
      })
      .catch((err) => {
        console.error("Failed to mount ZoomMuiControl React component", err);
      });

    return container;
  },

  onRemove(map) {
    if (this._onZoomEnd) {
      map.off("zoomend", this._onZoomEnd);
      this._onZoomEnd = null;
    }
    if (this._reactRoot) {
      this._reactRoot.unmount();
      this._reactRoot = null;
    }
  },
});
