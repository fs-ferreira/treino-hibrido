import fs from "node:fs";
import { drawMovement } from "../lib/diagrams.js";
import { exercises } from "../lib/exercises.js";
fs.mkdirSync("test-results", { recursive: true });
fs.writeFileSync(
  "test-results/movements.html",
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><link rel="stylesheet" href="../assets/movement.css"><style>body{background:#0c0d0f;color:white;font:16px system-ui;margin:20px}section{margin-bottom:30px}body:has(:target) section:not(:target){display:none}h2{font-size:18px}article{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}svg{background:#141b20;width:100%}figure{margin:0}figcaption{padding:8px}</style>${Object.values(
    exercises,
  )
    .map(
      (e) =>
        `<section id="${e.id}"><h2>${e.name}</h2><article>${[0, 0.5, 1].map((t, i) => `<figure>${drawMovement(e.diagram, t, `qa-${e.id}-${i}`, ["Início", "Meio", "Final"][i])}<figcaption>${["Início", "Meio", "Final"][i]}</figcaption></figure>`).join("")}</article></section>`,
    )
    .join("")}</html>`,
);
