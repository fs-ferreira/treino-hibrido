import { movements } from "./movement-data.js";
import { drawMovement } from "./movement-renderer.js";
export { drawMovement } from "./movement-renderer.js";
export { rigAt, poseAt, solveJoint, polar } from "./movement-rig.js";
export { evaluateMovement } from "./movement-scene.js";
let serial = 0;
export function illustration(ex) {
  const id = `movement-${ex.id}-${++serial}`,
    c = movements[ex.diagram];
  return `<section class="movement-guide" data-movement="${ex.diagram}" data-movement-id="${id}" aria-label="Ilustração de ${ex.name}"><div class="movement-player" id="${id}-player"><div class="motion-stage">${drawMovement(ex.diagram, 0, `${id}-animated`, "Início")}</div><p class="motion-status" role="status" aria-live="polite">Início</p><div class="motion-controls"><button class="button primary" type="button" data-motion="play">Reproduzir</button><button class="button" type="button" data-motion="pause" disabled>Pausar</button><button class="button quiet" type="button" data-motion="reset">Reiniciar</button></div><div class="motion-steps" role="group" aria-label="Escolher posição"><button type="button" data-motion="start" aria-pressed="true">Início</button><button type="button" data-motion="middle" aria-pressed="false">Meio</button><button type="button" data-motion="end" aria-pressed="false">Final</button></div><p class="caption motion-note">Movimento em repetição · velocidade ilustrativa.</p></div><p class="movement-legend"><span></span> Contorno: região em movimento · Seta: direção${c.unilateral ? "<strong>Repita do outro lado.</strong>" : ""}</p></section><p class="caption">Ilustração didática. Confira as orientações e a demonstração para observar os detalhes da execução.</p>`;
}
