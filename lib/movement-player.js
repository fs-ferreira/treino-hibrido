import { drawMovement } from "./movement-renderer.js";
import { icon } from "./icons.js";
export const CYCLE_MS = 6000;
export function cyclePose(elapsed) {
  const n = Math.min(1, Math.max(0, elapsed / CYCLE_MS));
  return (1 - Math.cos(n * Math.PI * 2)) / 2;
}
export function createMovementPlayer(root, environment = {}) {
  if (!root) return () => {};
  const request = environment.request ?? requestAnimationFrame,
    cancel = environment.cancel ?? cancelAnimationFrame,
    preference =
      environment.preference ?? matchMedia("(prefers-reduced-motion: reduce)"),
    doc = environment.document ?? document,
    find = (s) => root.querySelector(s),
    button = find('[data-motion="toggle"]'),
    kind = root.dataset.movement,
    id = root.dataset.movementId;
  let frame = 0,
    elapsed = 0,
    last = null,
    playing = false,
    disposed = false;
  function controls() {
    const label = playing ? "Pausar" : "Reproduzir";
    button.innerHTML = icon(playing ? "pause" : "play") + " " + label;
    button.setAttribute("aria-label", label + " demonstração");
    button.setAttribute("aria-pressed", String(playing));
    find(".motion-status").textContent = playing ? "Reproduzindo" : "Pausado";
  }
  function show(t) {
    find(".motion-stage").innerHTML = drawMovement(
      kind,
      t,
      id + "-animated",
      t === 0 ? "Início" : t === 1 ? "Final" : "Movimento",
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
    find(".motion-note").textContent = preference.matches
      ? "Movimento reduzido: reproduza quando quiser."
      : "Velocidade ilustrativa.";
  }
  function play() {
    if (playing || doc.hidden || disposed) return;
    playing = true;
    last = null;
    controls();
    frame = request(tick);
  }
  function click(event) {
    if (
      disposed ||
      event.target.closest("[data-motion]")?.dataset.motion !== "toggle"
    )
      return;
    if (playing) pause();
    else play();
  }
  function hidden() {
    if (doc.hidden && playing) pause();
  }
  show(0);
  reduced();
  if (!preference.matches) play();
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
