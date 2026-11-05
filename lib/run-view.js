import { paceText } from "./core.js?v=6.0.0";
import { icon } from "./icons.js?v=1.6.0";
import {
  heartRateText,
  heartRateReferenceText,
  intervalHeartRateHelp,
  watchHeartRateHelp,
} from "./heart-rate.js";

export function heartRateLine(target, prefix = "") {
  if (!target) return "";
  const hint = {
    warmup: "Suba gradualmente.",
    hard: "Referência ao longo do bloco, sem perseguir a faixa imediatamente.",
    recovery:
      "Reduza o esforço e busque retornar à faixa; a FC pode continuar alta neste minuto.",
    cooldown:
      "Caminhe e deixe a FC cair em direção à faixa, sem exigir atingi-la em 3 min.",
  }[target.phase];
  return `<small class="heart-rate-target">${prefix}${heartRateText(target)}${target.minBpm !== null ? " · estimada" : ""}</small>${hint ? `<small class="heart-rate-hint">${hint}</small>` : ""}`;
}

export function heartRateGuide(reference, type, legacy = false) {
  return `<div class="heart-rate-guide"><p class="heart-rate-reference">${legacy ? "Orientação geral: este registro antigo não guardava uma referência cardíaca. Exibimos somente zonas e percentuais." : heartRateReferenceText(reference)}</p><details class="help-details"><summary>Como acompanhar a frequência cardíaca</summary><p>As faixas por etapa são uma orientação adotada pelo app, baseada em percentuais da FC máxima.</p>${type === "interval" ? `<p>${intervalHeartRateHelp}</p>` : "<p>Mantenha o ritmo leve e o esforço em 3–4/10, com conversa confortável em frases completas.</p>"}<p>${watchHeartRateHelp}</p><button class="text-button" type="button" data-action="sources">Consultar fontes ${icon("arrow-up-right")}</button></details></div>`;
}

export function runBlocksView(blocks) {
  const number = (value) =>
    value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const row = (b, index) =>
    `<div class="run-block" data-run-block="${index}"><span class="block-index ${b.kind}">${String(index + 1).padStart(2, "0")}</span><div class="run-block-description"><b>${b.label}</b><small>${b.pace ? `${paceText(b.pace)} /km · ${b.kph.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km/h` : "Pace não informado"}</small>${heartRateLine(b.heartRate)}</div><div class="block-values"><b>${b.minutes} min</b><small>${b.km === null ? "—" : number(b.km) + " km"}</small></div></div>`;
  if (
    blocks.length !== 18 ||
    blocks.filter((b) => b.kind === "hard").length !== 8
  )
    return blocks.map(row).join("");
  const repeats = blocks.slice(1, -1),
    minutes = repeats.reduce((sum, b) => sum + b.minutes, 0);
  return `${row(blocks[0], 0)}<details class="interval-repeats"><summary><span><b>8 × forte + recuperação</b><small>3 min moderado-forte + 1 min leve · ${minutes} min</small>${heartRateLine(repeats[0].heartRate, "Forte · ")}${heartRateLine(repeats[1].heartRate, "Recuperação · ")}<span class="text-link">Consultar os oito blocos</span></span>${icon("chevron-down")}</summary><div class="interval-cycles">${Array.from({ length: 8 }, (_, i) => `<section class="interval-cycle" aria-label="Bloco ${i + 1}"><h3>Bloco ${i + 1} de 8</h3>${row(repeats[i * 2], i * 2 + 1)}${row(repeats[i * 2 + 1], i * 2 + 2)}</section>`).join("")}</div></details>${row(blocks.at(-1), blocks.length - 1)}`;
}
