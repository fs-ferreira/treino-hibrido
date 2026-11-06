import { paceText, planTotal } from "./core.js?v=7.1.1";
import { icon } from "./icons.js";
const number = (value, digits = 2) =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const phaseLabel = (block) =>
  ({
    warmup: "Aquecimento",
    hard: "Forte",
    recovery: "Recuperação",
    cooldown: "Caminhada",
  })[block.heartRate?.phase] ||
  (block.label.startsWith("Longão") ? "Longão" : "Corrida leve");
const instruction = (block) =>
  ({
    hard: "Forte, sem sprint.",
    recovery: "Reduza o esforço.",
    steady: "Conversa confortável · esforço 3–4/10.",
  })[block.heartRate?.phase] || "";

export function heartRateLine(target) {
  return target?.minBpm != null
    ? `<span class="heart-rate-target">FC ${target.minBpm}–${target.maxBpm} bpm</span>`
    : "";
}
export function heartRateNotice(reference, legacy = false) {
  return `<p class="heart-rate-reference">${legacy ? "Registro sem referência cardíaca." : reference?.source === "age" ? "Faixas de FC estimadas" : 'Para ver FC em bpm, <a href="#configuracoes/corrida">configure nascimento e sexo</a>.'}</p>`;
}
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function heartRateGuide(reference, type) {
  const note =
    type === "interval"
      ? "A FC responde com atraso: não acelere para atingir a faixa; reduza o esforço na recuperação, sem exigir uma queda imediata."
      : "Use também o esforço percebido e uma conversa confortável para orientar o ritmo.";
  return (
    '<section class="heart-rate-guide"><h3>Frequência cardíaca</h3><p>' +
    (reference?.source === "age"
      ? "FC máxima estimada: <b>" + reference.maxBpm + " bpm</b>. "
      : "") +
    note +
    "</p></section>"
  );
}
export function runDetailsView(blocks, reference, type, context = {}) {
  const total = planTotal(blocks),
    a = context.adjustment;
  const missing = [
    ...new Set(blocks.filter((b) => b.km === null).map(phaseLabel)),
  ];
  const distance = !total.known
    ? "Sem estimativa."
    : (total.complete ? "Estimada: " : "Parcial: ") +
      "<strong>" +
      number(total.km) +
      " km</strong>" +
      (total.complete
        ? "."
        : " · sem estimativa para " +
          missing.join(", ").toLocaleLowerCase("pt-BR") +
          ".");
  const reasons = {
    maintain: "Manter o ritmo",
    ease: "Reduzir o ritmo",
    partial: "Reduzir o ritmo gradualmente",
    calibrate: "Aproximar do esforço alvo",
    progress: "Avançar o ritmo",
  };
  const rhythm = a?.sourceDate
    ? '<section class="pace-method"><h3>Ritmo</h3><p data-plan-caption>' +
      (reasons[a.reason] ?? "Ritmo ajustado") +
      (a.percent
        ? " (" +
          (a.percent > 0 ? "+" : "") +
          number(a.percent, 1) +
          "% no tempo/km)"
        : "") +
      " · referência " +
      esc(a.sourceDate.split("-").reverse().join("/")) +
      ", " +
      esc(paceText(a.previousPace)) +
      "/km, esforço " +
      esc(a.rpe) +
      "/10.</p></section>"
    : "";
  return (
    '<details class="help-details run-details"><summary>Detalhes e ajuda</summary><div class="run-details-body"><section class="run-distance"><h3>Distância</h3><p>' +
    distance +
    "</p></section>" +
    rhythm +
    heartRateGuide(reference, type) +
    '<button class="text-button run-method-link" type="button" data-action="sources">Fontes e método ' +
    icon("arrow-up-right") +
    "</button></div></details>"
  );
}
export function runBlocksView(blocks) {
  const row = (block, index) =>
    `<div class="run-block" data-run-block="${index}"><div class="run-block-heading"><b>${phaseLabel(block)}</b><strong class="block-duration">${block.minutes} <span>min</span></strong></div><div class="run-block-metrics"><span class="run-pace-group"><span class="block-pace">${block.pace ? `Pace ${paceText(block.pace)}/km` : "Pace não informado"}</span>${Number.isFinite(block.kph) ? `<span class="block-speed">· ${number(block.kph, 1)} km/h</span>` : ""}</span>${heartRateLine(block.heartRate)}</div>${instruction(block) ? `<p class="run-instruction">${instruction(block)}</p>` : ""}</div>`;
  if (
    blocks.length !== 18 ||
    blocks.filter((b) => b.kind === "hard").length !== 8
  )
    return blocks.map((block, index) => row(block, index)).join("");
  const repeats = blocks.slice(1, -1);
  const minutes = repeats.reduce((sum, block) => sum + block.minutes, 0);
  return `${row(blocks[0], 0)}<section class="interval-group"><h3>Repetir 8 vezes <span>· ${minutes} min</span></h3><div class="interval-steps">${row(repeats[0], 1)}${row(repeats[1], 2)}</div></section>${row(blocks.at(-1), blocks.length - 1)}`;
}
