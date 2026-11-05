import { paceText, planTotal } from "./core.js?v=6.0.0";
import { icon } from "./icons.js?v=1.6.0";
import {
  heartRateText,
  intervalHeartRateHelp,
  watchHeartRateHelp,
} from "./heart-rate.js";

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
    cooldown: "Caminhe.",
    steady: "Conversa confortável · esforço 3–4/10.",
  })[block.heartRate?.phase] || "";

export function heartRateLine(target) {
  return target?.minBpm != null
    ? `<span class="heart-rate-target">FC ${target.minBpm}–${target.maxBpm} bpm</span>`
    : "";
}
export function heartRateNotice(reference, legacy = false) {
  return `<p class="heart-rate-reference">${legacy ? "Orientação geral: registro sem referência cardíaca. Zonas e percentuais nos detalhes." : reference?.source === "age" ? "Faixas de FC estimadas" : 'Para ver FC em bpm, <a href="#configuracoes/corrida">configure nascimento e sexo</a>.'}</p>`;
}
// Shared help body for the diary and read-only catalogue.
export function heartRateGuide(reference, type) {
  return `<section class="heart-rate-guide"><h3>FC no relógio</h3>${reference?.source === "age" ? `<p>FC máxima estimada: ${reference.maxBpm} bpm.</p>` : ""}<p>As faixas por etapa são referências de intensidade por percentual da FC máxima.</p>${type === "interval" ? `<p>${intervalHeartRateHelp}</p>` : ""}<p>${watchHeartRateHelp}</p><button class="text-button" type="button" data-action="sources">Consultar fontes ${icon("arrow-up-right")}</button></section>`;
}
export function runDetailsView(blocks, reference, type, extra = "") {
  const total = planTotal(blocks);
  // Each repeated cycle has the same targets; describe each phase once.
  const phases = blocks.filter(
    (block, index) =>
      blocks.findIndex(
        (other) => other.heartRate?.phase === block.heartRate?.phase,
      ) === index,
  );
  return `<details class="help-details run-details"><summary>Detalhes e ajuda</summary><div class="run-details-body"><section><h3>Distância e intensidade</h3><p>${total.complete ? "Distância estimada" : "Distância parcial"}: ${total.known ? `${number(total.km)} km` : "sem estimativa"}.</p>${total.known && !total.complete ? `<p>Distância parcial: inclui apenas as etapas com pace informado.${type === "interval" && !blocks.at(-1).pace ? " Caminhada sem estimativa." : ""}</p>` : ""}<dl class="run-secondary">${phases.map((block) => `<div><dt>${phaseLabel(block)}</dt><dd>${block.kph === null ? "Velocidade sem estimativa" : `${number(block.kph, 1)} km/h`} · ${block.km === null ? "Distância sem estimativa" : `${number(block.km)} km por etapa`}</dd>${block.heartRate ? `<dd>${heartRateText(block.heartRate)}</dd>` : ""}</div>`).join("")}</dl></section>${extra}${heartRateGuide(reference, type)}</div></details>`;
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
