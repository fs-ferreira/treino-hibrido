import {
  trainingPlans,
  getPlan,
  planWeek,
  getActivePlan,
  pendingPlanChange,
  CROSS_PLAN_ID,
} from "./plans.js?v=7.1.0";
import { workouts, exercises, workoutName } from "./exercises.js";
import { icon } from "./icons.js?v=1.6.0";
import { muscleMap } from "./muscle-map.js";
import { runningPlan } from "./core.js?v=7.1.0";
import { createHeartRatePlan } from "./heart-rate.js";
import {
  runBlocksView,
  heartRateNotice,
  runDetailsView,
} from "./run-view.js?v=7.1.0";

function dayBody(type, settings) {
  if (type === "cross")
    return `<p>Siga a programação da sua aula. Depois registre duração, esforço e observações em Hoje.</p>`;
  if (workouts[type].kind === "strength")
    return `${["lower", "upper2"].includes(type) ? '<p class="caption">Complete os dois lados.</p>' : ""}<ol class="plan-exercises">${workouts[type].ids.map((id) => `<li><div class="plan-exercise-name"><b>${exercises[id].name}</b><small>${exercises[id].muscles}</small></div><button class="button quiet small" data-action="guide" data-id="${id}" aria-label="Como fazer ${exercises[id].name}">Como fazer ${icon("arrow-up-right")}</button>${muscleMap(exercises[id], "plan")}</li>`).join("")}</ol>`;
  if (workouts[type].kind === "run") {
    const blocks = runningPlan(type, settings),
      reference = createHeartRatePlan(type, settings.heartRate);
    return `${heartRateNotice(reference)}<div class="run-blocks">${runBlocksView(blocks)}</div>${runDetailsView(blocks, reference, type)}${type === "long" ? '<a class="text-link" href="#configuracoes/semana">Ajustar duração</a>' : ""}`;
  }
  return `<p class="plan-effort">Descanso e recuperação</p><p>Um dia reservado para recuperar a disposição para os próximos treinos.</p>`;
}
const shortDate = (date) => date.split("-").reverse().join("/");
function planStatus(settings, id) {
  const active = getActivePlan(settings).id === id;
  const pending = pendingPlanChange(settings);
  return (
    (active ? '<span class="tag">Ativo</span>' : "") +
    (pending?.planId === id
      ? '<span class="tag">Agendado para ' + shortDate(pending.from) + "</span>"
      : "")
  );
}
export function planChangeActions(settings, id) {
  const pending = pendingPlanChange(settings);
  return (
    '<div class="plan-actions">' +
    (getActivePlan(settings).id !== id
      ? '<button class="button primary" data-action="activate-plan" data-plan="' +
        id +
        '">' +
        (pending?.planId === id ? "Alterar data" : "Ativar plano") +
        "</button>"
      : "") +
    (pending?.planId === id
      ? '<button class="button quiet" data-action="cancel-plan-change">Cancelar agendamento</button>'
      : "") +
    "</div>"
  );
}
export function plansView(settings, route, expanded = new Set([1])) {
  const plan = getPlan(route.planId);
  if (!plan)
    return (
      '<div class="page-heading"><div><h1>Treinos<span class="accent">.</span></h1><p class="muted">Escolha o plano que organiza sua semana.</p></div></div>' +
      (route.missingPlan
        ? '<p class="notice" role="status">Treino não encontrado. Consulte os planos disponíveis abaixo.</p>'
        : "") +
      '<div class="plans-list">' +
      trainingPlans
        .map(
          (p) =>
            '<a class="panel plan-card" href="#treinos/' +
            p.id +
            '" aria-labelledby="plan-' +
            p.id +
            '-title"><div class="plan-card-top"><span class="plan-symbol" aria-hidden="true">' +
            icon("clipboard-list") +
            "</span>" +
            planStatus(settings, p.id) +
            '</div><h2 id="plan-' +
            p.id +
            '-title">' +
            p.name +
            "</h2><p>" +
            p.description +
            '</p><div class="plan-stats">' +
            (p.id === CROSS_PLAN_ID
              ? "<span><b>2</b> musculação</span><span><b>2</b> corrida</span><span><b>1</b> Cross</span><span>Sábado opcional</span>"
              : "<span><b>3</b> musculação</span><span><b>3</b> corrida</span><span><b>1</b> descanso</span>") +
            '</div><span class="plan-card-link">Ver detalhes ' +
            icon("arrow-up-right") +
            "</span></a>",
        )
        .join("") +
      "</div>"
    );
  const week = planWeek(settings, plan.id),
    cross = plan.id === CROSS_PLAN_ID;
  return (
    '<a class="text-link plan-back" href="#treinos">' +
    icon("arrow-left") +
    ' Voltar para Treinos</a><div class="page-heading plan-heading"><div><h1>' +
    plan.name +
    '<span class="accent">.</span></h1>' +
    planStatus(settings, plan.id) +
    "</div></div>" +
    planChangeActions(settings, plan.id) +
    '<div class="panel plan-overview"><span><b>' +
    week.reduce((n, d) => n + (workouts[d.type].ids?.length ?? 0), 0) +
    "</b> exercícios regulares</span><span><b>3 × 6–8</b> séries e repetições</span><span><b>" +
    (cross ? "5" : "6") +
    "</b> sessões regulares" +
    (cross ? " + sábado opcional" : " por semana") +
    '</span></div><div class="section-title"><h2>Seu plano, dia a dia</h2></div><p class="section-hint">Registre os treinos em Hoje.</p><div class="plan-days">' +
    week
      .map(({ day, label, type, optional }) => {
        const w = workouts[type];
        const name = optional
          ? "Sábado opcional"
          : workoutName({ type, sourcePlanId: plan.id });
        const meta = optional
          ? "Bônus"
          : w.kind === "strength"
            ? w.ids.length + " exercícios"
            : type === "interval"
              ? "40 min"
              : type === "easy"
                ? "30 min"
                : type === "long"
                  ? settings.longMinutes + " min"
                  : type === "cross"
                    ? "Aula"
                    : "Pausa";
        const body = optional
          ? "<p>Escolha uma atividade para esta data em Hoje, ou descanse. Não aumenta a meta e não gera pendência.</p>" +
            ["cross", "upper2", "long"]
              .map(
                (t) =>
                  '<details class="help-details"><summary>' +
                  workouts[t].name +
                  "</summary>" +
                  dayBody(t, settings) +
                  "</details>",
              )
              .join("")
          : dayBody(type, settings);
        return (
          '<details class="exercise-card plan-day ' +
          w.kind +
          '" data-plan-day="' +
          day +
          '" ' +
          (expanded.has(day) ? "open" : "") +
          '><summary><span class="exercise-number">' +
          ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][day] +
          '</span><span class="exercise-name"><b>' +
          label +
          "</b><small>" +
          name +
          '</small></span><span class="plan-day-meta">' +
          meta +
          '</span><span class="chevron">' +
          icon("chevron-down") +
          '</span></summary><div class="exercise-body plan-day-body">' +
          body +
          "</div></details>"
        );
      })
      .join("") +
    '</div><div class="plan-actions"><a class="button primary" href="#hoje" data-open-today>Abrir treino de hoje ' +
    icon("arrow-up-right") +
    '</a><a class="button quiet" href="#semana">Ver calendário ' +
    icon("calendar-days") +
    "</a></div>"
  );
}
