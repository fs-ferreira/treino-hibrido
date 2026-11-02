import {
  recordedWorkouts,
  workoutStarted,
  dateKey,
  dateFromKey,
  addDays,
  validDate,
  paceText,
  runningPlan,
  planTotal,
} from "./core.js";
import { workouts, exercises } from "./exercises.js";
import { icon } from "./icons.js?v=1.6.0";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (value, d = 1) =>
  value === null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("pt-BR", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });
const dateText = (date) =>
  dateFromKey(date).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });
export const historyDefaults = () => ({
  period: "all",
  type: "all",
  exercise: "",
  from: "",
  to: "",
  limit: 20,
});
export function historyEntries(data, state, today = dateKey()) {
  let from = "",
    to = "";
  if (state.period === "30" || state.period === "90") {
    from = addDays(today, -Number(state.period) + 1);
    to = today;
  }
  if (state.period === "custom") {
    from = state.from;
    to = state.to;
  }
  return recordedWorkouts(data.sessions).filter(
    ({ date, workout: s }) =>
      workoutStarted(s) &&
      s.type !== "rest" &&
      (!from || date >= from) &&
      (!to || date <= to) &&
      (state.type === "all" || s.type === state.type) &&
      (!state.exercise ||
        s.sets?.[state.exercise]?.some(
          (x) => x.done || x.kg !== "" || x.reps !== "",
        )),
  );
}
const setText = (s, noWeight) =>
  `${noWeight ? "Sem peso adicional" : `${s.kg === "" ? "—" : num(s.kg, 2).replace(/,00$/, "")} kg`} × ${s.reps === "" ? "—" : s.reps}${s.done ? " ✓" : ""}`;
export function seriesView(sets, noWeight) {
  return `<ol class="series-history">${sets.map((s, i) => `<li><span>Série ${i + 1}</span><b>${setText(s, noWeight)}</b></li>`).join("")}</ol>`;
}
function runResult(s) {
  const r = s.run,
    p = r.plan,
    interval = s.type === "interval",
    duration = p
      ? interval
        ? 40
        : s.type === "easy"
          ? 30
          : p.longMinutes
      : null;
  let estimated = null;
  if (p)
    estimated = planTotal(
      runningPlan(s.type, { longMinutes: p.longMinutes }, p),
    );
  return `<div class="history-run"><span><b>${num(r.km, 2)}</b> km</span><span><b>${num(r.minutes)}</b> min</span><span><b>${paceText((r.minutes * 60) / r.km)}</b> /km</span><span>Esforço <b>${r.rpe}/10</b></span></div>
  <details class="history-comparison"><summary>Planejado e realizado ${icon("chevron-down")}</summary><div class="comparison-scroll"><table><caption>Sessão</caption><thead><tr><th>Medida</th><th>Planejado</th><th>Realizado</th></tr></thead><tbody><tr><th>Duração</th><td>${duration === null ? "—" : duration + " min"}</td><td>${num(r.minutes)} min</td></tr><tr><th>Distância</th><td>${estimated?.known ? `${num(estimated.km, 2)} km${estimated.complete ? " · estimada" : " · parcial"}` : "—"}</td><td>${num(r.km, 2)} km</td></tr><tr><th>Pace médio</th><td>${!interval && p?.easyPace ? `${paceText(p.easyPace)}/km` : "—"}</td><td>${paceText((r.minutes * 60) / r.km)}/km</td></tr><tr><th>Esforço</th><td>${interval ? "—" : "3–4/10"}</td><td>${r.rpe}/10</td></tr></tbody></table>
  ${interval ? `<table><caption>Blocos fortes</caption><thead><tr><th>Medida</th><th>Planejado</th><th>Realizado</th></tr></thead><tbody><tr><th>Pace</th><td>${p?.hardPace ? paceText(p.hardPace) + "/km" : "—"}</td><td>${r.hardPace ? paceText(r.hardPace) + "/km" : "—"}</td></tr><tr><th>Esforço</th><td>7–8/10</td><td>${r.hardRpe ?? "—"}/10</td></tr></tbody></table>` : ""}</div>${!p ? '<p class="caption">Planejamento original não disponível neste registro.</p>' : ""}</details>${r.notes ? `<p class="history-note">${esc(r.notes)}</p>` : ""}`;
}
export function historyView(data, state) {
  const validRange =
    state.period !== "custom" ||
    (validDate(state.from) && validDate(state.to) && state.from <= state.to);
  const applied = {
    ...state,
    period: state.applied?.period ?? "all",
    from: state.applied?.from ?? "",
    to: state.applied?.to ?? "",
  };
  const entries = historyEntries(data, validRange ? state : applied),
    visible = entries.slice(0, state.limit),
    finished = entries.filter(({ workout }) => workout.done).length;
  const period =
    state.period === "all"
      ? "Todo o diário"
      : state.period === "custom"
        ? `${state.from} a ${state.to}`
        : `Últimos ${state.period} dias`;
  const strengthType =
    state.type === "all" || ["upper", "lower", "upper2"].includes(state.type);
  const field = (name, options) =>
    `<select data-history-field="${name}">${options.map(([value, label]) => `<option value="${value}" ${String(state[name]) === value ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
  const filters = `<form class="panel history-filters" aria-label="Filtrar histórico"><label>Período${field(
    "period",
    [
      ["all", "Todo o período"],
      ["30", "Últimos 30 dias"],
      ["90", "Últimos 90 dias"],
      ["custom", "Intervalo personalizado"],
    ],
  )}</label><label>Treino${field("type", [
    ["all", "Todos"],
    ...Object.entries(workouts)
      .filter(([id]) => id !== "rest")
      .map(([id, w]) => [id, w.name]),
  ])}</label>${
    strengthType
      ? `<label>Exercício${field("exercise", [
          ["", "Todos os exercícios"],
          ...Object.values(exercises)
            .filter(
              (e) =>
                state.type === "all" || workouts[state.type].ids.includes(e.id),
            )
            .map((e) => [e.id, e.name]),
        ])}</label>`
      : ""
  }${state.period === "custom" ? `<label>De<input type="date" data-history-field="from" value="${esc(state.from)}"></label><label>Até<input type="date" data-history-field="to" value="${esc(state.to)}"></label>${validRange ? "" : '<p class="form-error" role="status">Escolha as duas datas, com início anterior ou igual ao fim. O resultado anterior foi mantido.</p>'}` : ""}<button type="button" class="text-button" data-action="clear-history-filters">Limpar filtros</button></form>`;
  const metrics = `<p class="caption" data-history-period>${esc(validRange ? period : "Filtro anterior")} · ${entries.length} treinos registrados</p><div class="history-metrics"><div class="panel"><small>TREINOS CONCLUÍDOS</small><b>${String(finished).padStart(2, "0")}</b></div><div class="panel"><small>QUILÔMETROS NO RECORTE</small><b class="cyan-text">${num(entries.reduce((a, { workout: s }) => a + (s.run?.km ?? 0), 0))}<em>km</em></b></div><div class="panel"><small>SÉRIES CONCLUÍDAS</small><b>${entries.reduce(
    (a, { workout: s }) =>
      a +
      Object.entries(s.sets)
        .filter(([id]) => !state.exercise || id === state.exercise)
        .flatMap(([, sets]) => sets)
        .filter((x) => x.done).length,
    0,
  )}</b></div></div>`;
  const content = state.exercise
    ? `<div class="comparison-scroll"><table class="exercise-comparison"><caption>${esc(exercises[state.exercise].name)} · séries por treino</caption><thead><tr><th>Data e treino</th><th>Série 1</th><th>Série 2</th><th>Série 3</th><th>Estado</th></tr></thead><tbody>${visible.map(({ date, workout: s }) => `<tr><th><a href="#hoje/${date}/${s.id}">${esc(dateText(date))} · ${esc(workouts[s.type].name)}</a></th>${s.sets[state.exercise].map((set, i) => `<td data-label="Série ${i + 1}">${setText(set, s.withoutWeight?.[state.exercise])}</td>`).join("")}<td data-label="Estado">${s.done ? "Concluído" : "Em andamento"}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="history-list">${visible
        .map(
          ({ date, workout: s }, i) =>
            `${i === 0 || visible[i - 1].date !== date ? `<h2 class="history-date">${esc(dateText(date))}</h2>` : ""}<article class="panel history-entry"><div class="history-title"><div><span class="tag ${workouts[s.type].kind}">${s.run ? "CORRIDA" : "FORÇA"}</span><h3>${esc(workouts[s.type].name)}</h3><p>${esc(dateText(date))}</p></div><button class="button quiet" data-action="open-day" data-date="${date}" data-workout="${s.id}">Abrir ${icon("arrow-up-right")}</button></div>${
              s.run
                ? runResult(s)
                : `<details class="history-strength"><summary>Consultar séries registradas ${icon("chevron-down")}</summary><div class="history-sets">${Object.entries(
                    s.sets,
                  )
                    .filter(([, sets]) =>
                      sets.some((x) => x.done || x.kg !== "" || x.reps !== ""),
                    )
                    .map(
                      ([id, sets]) =>
                        `<section><h4>${esc(exercises[id]?.name ?? id)}</h4>${seriesView(sets, s.withoutWeight?.[id])}</section>`,
                    )
                    .join("")}</div></details>`
            }<p class="caption">${s.done ? "✓ Sessão concluída" : "◐ Sessão em andamento"}</p></article>`,
        )
        .join("")}</div>`;
  const empty = recordedWorkouts(data.sessions).some(({ workout }) =>
    workoutStarted(workout),
  )
    ? '<div class="empty-state panel"><h2>Nenhum treino neste recorte.</h2><button class="button" data-action="clear-history-filters">Limpar filtros</button></div>'
    : '<div class="empty-state panel"><h2>Sua história começa no próximo treino.</h2><p>Registre as séries ou uma corrida e volte aqui para acompanhar.</p><a class="button primary" href="#hoje">Ver meu treino →</a></div>';
  return `<div class="page-heading"><h1>Sua evolução<span class="accent">.</span></h1></div>${filters}${metrics}${entries.length ? content : empty}${entries.length > state.limit ? '<button class="button history-more" data-action="more-history">Mostrar mais 20 treinos</button>' : ""}`;
}
