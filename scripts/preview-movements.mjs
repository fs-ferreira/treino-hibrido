import fs from "node:fs";
import { drawMovement } from "../lib/diagrams.js";
import { exercises } from "../lib/exercises.js";
import {
  objectExamples,
  evaluateObjectDemo,
  drawObjectDemo,
} from "./movement-lab-examples.js";
const list = Object.values(exercises);
fs.mkdirSync("test-results", { recursive: true });
fs.writeFileSync(
  "test-results/movements.html",
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Laboratório de movimentos — HÍBRIDO</title><link rel="stylesheet" href="../assets/movement.css"><link rel="stylesheet" href="../scripts/movement-lab.css"></head><body>
<header><h1>Laboratório de movimentos</h1><p>Objetos → mecanismos → corpo → exercício conectado. Referências e limites em docs/sistema-movimentos.md.</p></header>
<main><section class="lab-player" aria-label="Inspeção de movimento">
<div class="lab-controls"><label>Inspecionar<select id="lab-mode"><option value="scene">Exercício conectado</option><option value="body">Corpo isolado</option><option value="object">Objeto ou mecanismo isolado</option></select></label><label>Exercício<select id="lab-kind">${list.map((e) => `<option value="${e.diagram}">${e.name}</option>`).join("")}</select></label><label hidden>Objeto<select id="lab-object">${Object.entries(
    objectExamples,
  )
    .map(([id, label]) => `<option value="${id}">${label}</option>`)
    .join("")}</select></label></div>
<div class="lab-flags"><label><input type="checkbox" id="lab-anchors"> Pegadas e contatos</label><label><input type="checkbox" id="lab-axes"> Eixos locais</label></div>
<div id="lab-stage"></div><label class="lab-phase">Fase <input id="lab-phase" type="range" min="0" max="100" step="0.1" value="0"><output id="lab-phase-value">0%</output></label><div class="lab-actions"><button id="lab-play" type="button">Reproduzir</button><button id="lab-reset" type="button">Reiniciar</button><label><input id="lab-loop" type="checkbox" checked> Repetir ciclo</label></div><p id="lab-status" role="status">Início</p><p id="lab-diagnostics"></p></section>
<h2>Objetos e mecanismos isolados</h2><div class="lab-object-grid">${Object.entries(
    objectExamples,
  )
    .map(
      ([id, label]) =>
        `<figure data-object-example="${id}">${drawObjectDemo(evaluateObjectDemo(id, 0.5), `example-${id}`, { anchors: true })}<figcaption>${label}</figcaption></figure>`,
    )
    .join("")}</div>
<h2>21 exercícios — início, meio e final</h2>${list.map((e) => `<section class="lab-review" id="${e.id}" data-review-kind="${e.diagram}"><h3>${e.name}</h3><article>${[0, 0.5, 1].map((t, i) => `<figure>${drawMovement(e.diagram, t, `qa-${e.id}-${i}`, ["Início", "Meio", "Final"][i])}<figcaption>${["Início", "Meio", "Final"][i]}</figcaption></figure>`).join("")}</article></section>`).join("")}</main><script type="module" src="../scripts/movement-lab-ui.js"></script></body></html>`,
);
console.log("Galeria: http://127.0.0.1:4173/test-results/movements.html");
