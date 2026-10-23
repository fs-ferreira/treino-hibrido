import { paceText } from "./core.js?v=1.6.0";
import { icon } from "./icons.js?v=1.6.0";

export function runBlocksView(blocks) {
  const number = (value) =>
    value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const row = (b, index) =>
    `<div class="run-block" data-run-block="${index}"><span class="block-index ${b.kind}">${String(index + 1).padStart(2, "0")}</span><div><b>${b.label}</b><small>${b.pace ? `${paceText(b.pace)} /km · ${b.kph.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km/h` : "Pace não informado"}</small></div><div class="block-values"><b>${b.minutes} min</b><small>${b.km === null ? "—" : number(b.km) + " km"}</small></div></div>`;
  if (
    blocks.length !== 18 ||
    blocks.filter((b) => b.kind === "hard").length !== 8
  )
    return blocks.map(row).join("");
  const repeats = blocks.slice(1, -1),
    minutes = repeats.reduce((sum, b) => sum + b.minutes, 0);
  return `${row(blocks[0], 0)}<details class="interval-repeats"><summary><span><b>8 × forte + recuperação</b><small>3 min moderado-forte + 1 min leve · ${minutes} min</small><span class="text-link">Consultar os oito blocos</span></span>${icon("chevron-down")}</summary><div class="interval-cycles">${Array.from({ length: 8 }, (_, i) => `<section class="interval-cycle" aria-label="Bloco ${i + 1}"><h3>Bloco ${i + 1} de 8</h3>${row(repeats[i * 2], i * 2 + 1)}${row(repeats[i * 2 + 1], i * 2 + 2)}</section>`).join("")}</div></details>${row(blocks.at(-1), blocks.length - 1)}`;
}
