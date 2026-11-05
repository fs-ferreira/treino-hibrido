import { trainingPlans, getPlan, planWeek } from "./plans.js?v=1.6.0";
import { workouts, exercises } from "./exercises.js";
import { icon } from "./icons.js?v=1.6.0";
import { muscleMap } from "./muscle-map.js";
import { runningPlan } from "./core.js?v=6.0.0";
import { createHeartRatePlan } from "./heart-rate.js";
import {
  runBlocksView,
  heartRateNotice,
  runDetailsView,
} from "./run-view.js?v=6.1.2";

function dayBody(type, settings) {
  if (workouts[type].kind === "strength")
    return `<p class="caption">3 séries de 6–8 repetições por exercício.${["lower", "upper2"].includes(type) ? " Nos unilaterais, complete os dois lados." : ""}</p><ol class="plan-exercises">${workouts[type].ids.map((id) => `<li><div class="plan-exercise-name"><b>${exercises[id].name}</b><small>${exercises[id].muscles}</small></div><button class="button quiet small" data-action="guide" data-id="${id}" aria-label="Como fazer ${exercises[id].name}">Como fazer ${icon("arrow-up-right")}</button>${muscleMap(exercises[id], "plan")}</li>`).join("")}</ol>`;
  if (workouts[type].kind === "run") {
    const blocks = runningPlan(type, settings),
      reference = createHeartRatePlan(type, settings.heartRate);
    return `<p class="plan-effort">${blocks.reduce((sum, b) => sum + b.minutes, 0)} min${type === "interval" ? " · 8 × (3 + 1 min)" : ""}</p>${heartRateNotice(reference)}<div class="run-blocks">${runBlocksView(blocks)}</div>${runDetailsView(blocks, reference, type)}${type === "long" ? '<a class="text-link" href="#configuracoes/semana">Ajustar duração</a>' : ""}`;
  }
  return `<p class="plan-effort">Descanso e recuperação</p><p>Um dia reservado para recuperar a disposição para os próximos treinos.</p>`;
}
export function plansView(settings, route, expanded = new Set([1])) {
  const plan = getPlan(route.planId);
  if (!plan)
    return `<div class="page-heading"><div><h1>Treinos<span class="accent">.</span></h1><p class="muted">Conheça o plano que organiza sua semana.</p></div></div>${route.missingPlan ? '<p class="notice" role="status">Treino não encontrado. Consulte o plano disponível abaixo.</p>' : ""}<div class="plans-list">${trainingPlans.map((p) => `<a class="panel plan-card" href="#treinos/${p.id}" aria-labelledby="plan-${p.id}-title"><div class="plan-card-top"><span class="plan-symbol" aria-hidden="true">${icon("clipboard-list")}</span></div><h2 id="plan-${p.id}-title">${p.name}</h2><div class="plan-stats"><span><b>3</b> musculação</span><span><b>3</b> corrida</span><span><b>1</b> descanso</span></div><span class="plan-card-link">Ver detalhes ${icon("arrow-up-right")}</span></a>`).join("")}</div>`;
  return `<a class="text-link plan-back" href="#treinos">${icon("arrow-left")} Voltar para Treinos</a><div class="page-heading plan-heading"><div><h1>${plan.name}<span class="accent">.</span></h1></div></div><div class="panel plan-overview"><span><b>${planWeek(settings).reduce((sum, day) => sum + (workouts[day.type].ids?.length ?? 0), 0)}</b> exercícios</span><span><b>3 × 6–8</b> séries e repetições</span><span><b>6</b> sessões por semana</span></div><div class="section-title"><h2>Seu plano, dia a dia</h2></div><p class="section-hint">Registre os treinos em Hoje.</p><div class="plan-days">${planWeek(
    settings,
  )
    .map(({ day, label, type }) => {
      const w = workouts[type];
      return `<details class="exercise-card plan-day ${w.kind}" data-plan-day="${day}" ${expanded.has(day) ? "open" : ""}><summary><span class="exercise-number">${["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][day]}</span><span class="exercise-name"><b>${label}</b><small>${w.name}</small></span><span class="plan-day-meta">${w.kind === "strength" ? `${w.ids.length} exercícios` : type === "interval" ? "40 min" : type === "easy" ? "30 min" : type === "long" ? "60–90 min" : "Pausa"}</span><span class="chevron">${icon("chevron-down")}</span></summary><div class="exercise-body plan-day-body">${dayBody(type, settings)}</div></details>`;
    })
    .join(
      "",
    )}</div><div class="plan-actions"><a class="button primary" href="#hoje" data-open-today>Abrir treino de hoje ${icon("arrow-up-right")}</a><a class="button quiet" href="#semana">Ver calendário ${icon("calendar-days")}</a></div>`;
}
