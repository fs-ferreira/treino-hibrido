import { evaluateMovement } from "../lib/movement-scene.js";
import { drawScene } from "../lib/movement-renderer.js";
import { cyclePose, CYCLE_MS } from "../lib/movement-player.js";
import { evaluateObjectDemo, drawObjectDemo } from "./movement-lab-examples.js";
const find = (id) => document.getElementById(`lab-${id}`),
  preference = matchMedia("(prefers-reduced-motion: reduce)");
let request = 0,
  elapsed = 0,
  last = null,
  playing = false;
function render(t) {
  const mode = find("mode").value,
    debug = {
      anchors: find("anchors").checked,
      axes: find("axes").checked,
      bodyOnly: mode === "body",
    };
  const frame =
    mode === "object"
      ? evaluateObjectDemo(find("object").value, t)
      : evaluateMovement(find("kind").value, t);
  find("stage").innerHTML =
    mode === "object"
      ? drawObjectDemo(frame, "lab-example", debug)
      : drawScene(frame, "lab-frame", "Inspeção", debug);
  find("phase").value = t * 100;
  find("phase-value").textContent = `${Math.round(t * 100)}%`;
  find("diagnostics").textContent = frame.diagnostics.length
    ? `${frame.diagnostics.length} falha(s): ${frame.diagnostics.map((d) => d.id).join(", ")}`
    : `${frame.entities.length} objetos/peças · ${frame.constraints.length} relações verificadas · sem falhas geométricas`;
  find("diagnostics").dataset.invalid = String(frame.diagnostics.length > 0);
  return frame;
}
function pause() {
  if (request) cancelAnimationFrame(request);
  request = 0;
  playing = false;
  last = null;
  find("play").textContent = "Reproduzir";
}
function tick(now) {
  if (!playing) return;
  if (last !== null) elapsed += now - last;
  last = now;
  if (elapsed >= CYCLE_MS) {
    if (find("loop").checked) elapsed %= CYCLE_MS;
    else {
      pause();
      render(0);
      find("status").textContent = "Ciclo concluído";
      return;
    }
  }
  render(cyclePose(elapsed));
  request = requestAnimationFrame(tick);
}
function reset() {
  pause();
  elapsed = 0;
  render(0);
  find("status").textContent = "Início";
}
find("play").addEventListener("click", () => {
  if (playing) {
    pause();
    find("status").textContent = "Pausado";
    return;
  }
  if (preference.matches) return;
  playing = true;
  last = null;
  find("play").textContent = "Pausar";
  find("status").textContent = "Reproduzindo";
  request = requestAnimationFrame(tick);
});
find("reset").addEventListener("click", reset);
find("phase").addEventListener("input", () => {
  pause();
  const t = Number(find("phase").value) / 100;
  elapsed = (Math.acos(1 - 2 * t) / (2 * Math.PI)) * CYCLE_MS;
  render(t);
  find("status").textContent = "Posição selecionada";
});
for (const id of ["mode", "kind", "object"])
  find(id).addEventListener("change", () => {
    find("kind").parentElement.hidden = find("mode").value === "object";
    find("object").parentElement.hidden = find("mode").value !== "object";
    reset();
  });
for (const id of ["anchors", "axes"])
  find(id).addEventListener("change", () =>
    render(Number(find("phase").value) / 100),
  );
function reduced() {
  pause();
  find("play").disabled = preference.matches;
  find("status").textContent = preference.matches
    ? "Movimento reduzido: selecione a fase."
    : "Início";
}
preference.addEventListener("change", reduced);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
window.addEventListener("pagehide", pause);
window.movementLab = {
  render,
  evaluateMovement,
  drawScene,
  evaluateObjectDemo,
  reset,
};
reset();
reduced();
