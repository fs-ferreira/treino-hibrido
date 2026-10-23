import { trainingPlans, getPlan, planWeek } from "./plans.js?v=1.6.0";
import { workouts, exercises } from "./exercises.js";
import { icon } from "./icons.js?v=1.6.0";

function dayBody(type, settings) {
  if (workouts[type].kind === "strength")
    return `<p class="caption">3 séries de 6–8 repetições por exercício. Nos unilaterais, complete os dois lados.</p><ol class="plan-exercises">${workouts[type].ids.map((id) => `<li><div><b>${exercises[id].name}</b><small>${exercises[id].muscles} · 3 × 6–8</small></div><button class="button quiet small" data-action="guide" data-id="${id}" aria-label="Como fazer ${exercises[id].name}">Como fazer ${icon("arrow-up-right")}</button></li>`).join("")}</ol>`;
  if (type === "interval")
    return `<p class="plan-effort">40 minutos · esforço 7–8/10 nos blocos fortes</p><ol class="plan-running"><li><strong>5 min</strong><span>Aquecimento com trote leve.</span></li><li><strong>8 × (3 + 1 min)</strong><span>3 min moderado-forte e 1 min leve, alternando. São 32 min no total.</span></li><li><strong>3 min</strong><span>Desaquecimento com caminhada.</span></li></ol><p class="caption">Forte, sem sprint. Use um ritmo que consiga repetir com controle nos oito blocos.</p>`;
  if (type === "easy")
    return `<p class="plan-effort">30 minutos · esforço 3–4/10</p><p>Ritmo leve e controlado. Você deve conseguir conversar usando frases completas, com naturalidade.</p>`;
  if (type === "long")
    return `<p class="plan-effort">60–90 minutos · esforço 3–4/10</p><p>Correr por mais tempo e distância, mantendo ritmo leve e controlado.</p><p class="caption">Sua duração configurada: <strong>${settings.longMinutes} minutos</strong>. O volume não aumenta automaticamente. <a class="text-link" href="#configuracoes/semana">Ajustar duração</a>.</p>`;
  return `<p class="plan-effort">Descanso e recuperação</p><p>Um dia reservado para recuperar a disposição para os próximos treinos.</p>`;
}
export function plansView(settings, route, expanded = new Set([1])) {
  const plan = getPlan(route.planId);
  if (!plan)
    return `<div class="page-heading"><div><p class="eyebrow">SEU PONTO DE PARTIDA</p><h1>Treinos<span class="accent">.</span></h1><p class="muted">Conheça o plano que organiza sua semana.</p></div></div>${route.missingPlan ? '<p class="notice" role="status">Treino não encontrado. Consulte o plano disponível abaixo.</p>' : ""}<div class="plans-list">${trainingPlans.map((p) => `<a class="panel plan-card" href="#treinos/${p.id}" aria-labelledby="plan-${p.id}-title"><div class="plan-card-top"><span class="plan-symbol" aria-hidden="true">${icon("clipboard-list")}</span><span class="tag">ATIVO</span></div><h2 id="plan-${p.id}-title">${p.name}</h2><p class="muted">${p.description}</p><div class="plan-stats"><span><b>3</b> musculação</span><span><b>3</b> corrida</span><span><b>1</b> descanso</span></div><span class="plan-card-link">Ver detalhes ${icon("arrow-up-right")}</span></a>`).join("")}</div>`;
  return `<a class="text-link plan-back" href="#treinos">${icon("arrow-left")} Voltar para Treinos</a><div class="page-heading plan-heading"><div><p class="eyebrow">O PLANO DA SUA SEMANA</p><h1>${plan.name}<span class="accent">.</span></h1><p class="muted">${plan.description}</p></div><span class="tag">ATIVO</span></div><div class="panel plan-overview"><span><b>21</b> exercícios</span><span><b>3 × 6–8</b> séries e repetições</span><span><b>6</b> sessões por semana</span></div><div class="section-title"><h2>Seu plano, dia a dia</h2></div><p class="section-hint">Abra cada dia para consultar a estrutura e os guias. Os registros de treino ficam na tela Hoje.</p><div class="plan-days">${planWeek(
    settings,
  )
    .map(({ day, label, type }) => {
      const w = workouts[type];
      return `<details class="exercise-card plan-day ${w.kind}" data-plan-day="${day}" ${expanded.has(day) ? "open" : ""}><summary><span class="exercise-number">${["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][day]}</span><span class="exercise-name"><b>${label}</b><small>${w.name}</small></span><span class="plan-day-meta">${w.kind === "strength" ? "7 exercícios" : type === "interval" ? "40 min" : type === "easy" ? "30 min" : type === "long" ? "60–90 min" : "Pausa"}</span><span class="chevron">${icon("chevron-down")}</span></summary><div class="exercise-body plan-day-body">${dayBody(type, settings)}</div></details>`;
    })
    .join(
      "",
    )}</div><div class="plan-actions"><a class="button primary" href="#hoje" data-open-today>Abrir treino de hoje ${icon("arrow-up-right")}</a><a class="button quiet" href="#semana">Ver calendário ${icon("calendar-days")}</a></div>`;
}
