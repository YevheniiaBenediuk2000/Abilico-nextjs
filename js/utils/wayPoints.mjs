export const WP_COLORS = { start: "#1a73e8", end: "#d93025", via: "#6b7280" };

export function waypointDivIcon(letter, color) {
  const svg = `
  <svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <filter id="wpShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.35"/>
      </filter>
    </defs>
    <path filter="url(#wpShadow)"
      d="M15 0C7.268 0 1 6.268 1 14c0 10.778 14 28 14 28s14-17.222 14-28C29 6.268 22.732 0 15 0z"
      fill="${color}"/>
    <circle cx="15" cy="14" r="9" fill="#fff"/>
    <text x="15" y="19" text-anchor="middle"
          font-family="system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial"
          font-size="12" font-weight="700" fill="#111">${letter}</text>
  </svg>`;
  return L.divIcon({
    className: "",
    html: svg,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -36],
  });
}

export const letterFor = (i) => String.fromCharCode(65 + i); // 0->A, 1->B, ...

export const createMarker = function (i, wp, nWps) {
  const isStart = i === 0;
  const isEnd = i === nWps - 1;

  let color;
  if (isStart) {
    color = WP_COLORS.start;
  } else if (isEnd) {
    color = WP_COLORS.end;
  } else {
    color = WP_COLORS.via;
  }
  const icon = waypointDivIcon(letterFor(i), color);
  const marker = L.marker(wp.latLng, { draggable: true, icon });

  return marker;
};
