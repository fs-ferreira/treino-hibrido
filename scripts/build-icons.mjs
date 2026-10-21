import fs from "node:fs";
const names = [
  "arrow-up-right",
  "arrow-down",
  "arrow-up",
  "arrow-left",
  "arrow-right",
  "rotate-ccw",
  "check",
  "chevron-down",
  "moon",
  "play",
  "activity",
  "layout-dashboard",
  "calendar-days",
  "chart-no-axes-combined",
  "settings",
  "circle",
  "circle-check",
  "circle-dashed",
  "x",
  "plus",
];
const paths = Object.fromEntries(
  names.map((name) => {
    const source = fs.readFileSync(
      `node_modules/lucide-static/icons/${name}.svg`,
      "utf8",
    );
    return [name, source.match(/<svg[\s\S]*?>([\s\S]*?)<\/svg>/)[1].trim()];
  }),
);
fs.writeFileSync(
  "lib/icons.js",
  `// Lucide Static 1.61.0 — ISC license in assets/lucide-LICENSE.txt.\nconst paths=${JSON.stringify(paths, null, 2)};\nexport function icon(name){return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(paths[name]||paths.circle)+'</svg>';}\n`,
);
fs.copyFileSync(
  "node_modules/lucide-static/LICENSE",
  "assets/lucide-LICENSE.txt",
);
