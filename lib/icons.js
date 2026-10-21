// Lucide Static 1.61.0 — ISC license in assets/lucide-LICENSE.txt.
const paths = {
  "arrow-up-right": '<path d="M7 7h10v10" />\n  <path d="M7 17 17 7" />',
  "arrow-down": '<path d="M12 5v14" />\n  <path d="m19 12-7 7-7-7" />',
  "arrow-up": '<path d="m5 12 7-7 7 7" />\n  <path d="M12 19V5" />',
  "arrow-left": '<path d="m12 19-7-7 7-7" />\n  <path d="M19 12H5" />',
  "arrow-right": '<path d="M5 12h14" />\n  <path d="m12 5 7 7-7 7" />',
  "rotate-ccw":
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />\n  <path d="M3 3v5h5" />',
  check: '<path d="M20 6 9 17l-5-5" />',
  "chevron-down": '<path d="m6 9 6 6 6-6" />',
  moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />',
  play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />',
  activity:
    '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />',
  "layout-dashboard":
    '<rect width="7" height="9" x="3" y="3" rx="1" />\n  <rect width="7" height="5" x="14" y="3" rx="1" />\n  <rect width="7" height="9" x="14" y="12" rx="1" />\n  <rect width="7" height="5" x="3" y="16" rx="1" />',
  "calendar-days":
    '<path d="M8 2v3" />\n  <path d="M16 2v3" />\n  <rect x="3" y="3" width="18" height="18" rx="2" />\n  <path d="M3 9h18" />\n  <path d="M8 13h.01" />\n  <path d="M12 13h.01" />\n  <path d="M16 13h.01" />\n  <path d="M8 17h.01" />\n  <path d="M12 17h.01" />\n  <path d="M16 17h.01" />',
  "chart-no-axes-combined":
    '<path d="M12 16v5" />\n  <path d="M16 14.639V21" />\n  <path d="M20 10.656V21" />\n  <path d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15" />\n  <path d="M4 18.463V21" />\n  <path d="M8 14.656V21" />',
  settings:
    '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />\n  <circle cx="12" cy="12" r="3" />',
  circle: '<circle cx="12" cy="12" r="10" />',
  "circle-check":
    '<circle cx="12" cy="12" r="10" />\n  <path d="m16 9-5.5 5.5L8 12" />',
  "circle-dashed":
    '<path d="M10.1 2.182a10 10 0 0 1 3.8 0" />\n  <path d="M13.9 21.818a10 10 0 0 1-3.8 0" />\n  <path d="M17.609 3.721a10 10 0 0 1 2.69 2.7" />\n  <path d="M2.182 13.9a10 10 0 0 1 0-3.8" />\n  <path d="M20.279 17.609a10 10 0 0 1-2.7 2.69" />\n  <path d="M21.818 10.1a10 10 0 0 1 0 3.8" />\n  <path d="M3.721 6.391a10 10 0 0 1 2.7-2.69" />\n  <path d="M6.391 20.279a10 10 0 0 1-2.69-2.7" />',
  x: '<path d="M18 6 6 18" />\n  <path d="m6 6 12 12" />',
  plus: '<path d="M5 12h14" />\n  <path d="M12 5v14" />',
};
export function icon(name) {
  return (
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    (paths[name] || paths.circle) +
    "</svg>"
  );
}
