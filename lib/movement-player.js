import { drawMovement } from "./movement-renderer.js";
export const CYCLE_MS = 6000;
export function cyclePose(elapsed) {
  const n = Math.min(1, Math.max(0, elapsed / CYCLE_MS));
  return (1 - Math.cos(n * Math.PI * 2)) / 2;
}
export function createMovementPlayer(root, environment = {}) {
  if (!root) return () => {};
  const request = environment.request ?? requestAnimationFrame,
    cancel = environment.cancel ?? cancelAnimationFrame;
  const preference =
    environment.preference ?? matchMedia("(prefers-reduced-motion: reduce)");
  const doc = environment.document ?? document;
  const find = (s) => root.querySelector(s),
    kind = root.dataset.movement,
    id = root.dataset.movementId;
  let frame = 0,
    elapsed = 0,
    last = null,
    playing = false,
    disposed = false;
  const status = (text) => {
    find(".motion-status").textContent = text;
  };
  function controls() {
    find('[data-motion="play"]').disabled = playing;
    find('[data-motion="pause"]').disabled = !playing;
  }
  function show(t) {
    find(".motion-stage").innerHTML = drawMovement(
      kind,
      t,
      `${id}-animated`,
      t === 0 ? "Início" : t === 1 ? "Final" : "Movimento",
    );
    for (const [name, value] of [
      ["start", 0],
      ["middle", 0.5],
      ["end", 1],
    ])
      find(`[data-motion="${name}"]`).setAttribute(
        "aria-pressed",
        String(Math.abs(t - value) < 0.001),
      );
  }
  function pause() {
    if (frame) cancel(frame);
    frame = 0;
    playing = false;
    last = null;
    controls();
  }
  function tick(now) {
    if (disposed || !playing) return;
    if (last !== null) elapsed += now - last;
    last = now;
    elapsed %= CYCLE_MS;
    show(cyclePose(elapsed));
    frame = request(tick);
  }
  function reduced() {
    pause();
    find(".motion-controls").hidden = preference.matches;
    find(".motion-note").textContent = preference.matches
      ? "Movimento reduzido ativado. Use Início, Meio e Final para consultar as posições."
      : "Movimento em repetição · velocidade ilustrativa.";
    show(0);
    elapsed = 0;
    status("Início");
  }
  function play() {
    if (playing || preference.matches || doc.hidden || disposed) return;
    playing = true;
    last = null;
    controls();
    status("Reproduzindo · ida e volta");
    frame = request(tick);
  }
  function click(event) {
    const action = event.target.closest("[data-motion]")?.dataset.motion;
    if (!action) return;
    if (action === "play") {
      play();
      return;
    }
    if (action === "pause") {
      pause();
      status("Pausado");
      return;
    }
    if (["start", "middle", "end", "reset"].includes(action)) {
      pause();
      const t = action === "end" ? 1 : action === "middle" ? 0.5 : 0;
      elapsed = (t * CYCLE_MS) / 2;
      show(t);
      status(t === 0 ? "Início" : t === 1 ? "Final" : "Meio");
    }
  }
  function hidden() {
    if (doc.hidden && playing) {
      pause();
      status("Pausado");
    }
  }
  reduced();
  play();
  root.addEventListener("click", click);
  preference.addEventListener("change", reduced);
  doc.addEventListener("visibilitychange", hidden);
  return () => {
    disposed = true;
    pause();
    root.removeEventListener("click", click);
    preference.removeEventListener("change", reduced);
    doc.removeEventListener("visibilitychange", hidden);
  };
}
