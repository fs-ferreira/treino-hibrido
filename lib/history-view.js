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
const defaultFilters = () => ({
  period: "all",
  type: "all",
  exercise: "",
  from: "",
  to: "",
});
export const historyDefaults = () => ({
  draft: defaultFilters(),
  applied: defaultFilters(),
  limit: 20,
  expanded: false,
});
export function historyRangeStatus(filters) {
  if (filters.period !== "custom") return "valid";
  if (
    (filters.from && !validDate(filters.from)) ||
    (filters.to && !validDate(filters.to))
  )
    return "invalid";
  if (!filters.from || !filters.to) return "incomplete";
  return filters.from <= filters.to ? "valid" : "inverted";
}
export function historyExercises(type) {
  return Object.values(exercises).filter(
    (exercise) => type === "all" || workouts[type]?.ids?.includes(exercise.id),
  );
}
export function updateHistoryFilters(state, field, value) {
  if (!Object.hasOwn(state.draft, field)) return state;
  const draft = { ...state.draft, [field]: value };
  if (
    draft.exercise &&
    !historyExercises(draft.type).some(
      (exercise) => exercise.id === draft.exercise,
    )
  )
    draft.exercise = "";
  if (historyRangeStatus(draft) !== "valid") return { ...state, draft };
  const applied = {
    ...draft,
    from: draft.period === "custom" ? draft.from : "",
    to: draft.period === "custom" ? draft.to : "",
  };
  const changed = Object.keys(applied).some(
    (key) => applied[key] !== state.applied[key],
  );
  return { ...state, draft, applied, limit: changed ? 20 : state.limit };
}
export function clearHistoryFilters(state) {
  return { ...historyDefaults(), expanded: state.expanded };
}
export function historyFilterSummary(filters) {
  const shortDate = (date) => date.split("-").reverse().join("/");
  const period =
    filters.period === "all"
      ? "Todo o período"
      : filters.period === "custom"
        ? `${shortDate(filters.from)} a ${shortDate(filters.to)}`
        : `Últimos ${filters.period} dias`;
  return [
    period,
    filters.type === "all" ? "Todos os treinos" : workouts[filters.type].name,
    filters.exercise ? exercises[filters.exercise].name : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
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
function filtersView(state, mobile) {
  const { draft, applied } = state;
  const range = historyRangeStatus(draft);
  const error =
    range === "invalid"
      ? "Informe datas válidas."
      : range === "inverted"
        ? "A data inicial deve ser anterior ou igual à final."
        : "";
  const pending = range !== "valid";
  const active =
    draft.period !== "all" || draft.type !== "all" || draft.exercise;
  const expanded = !mobile || state.expanded;
  const strengthType =
    draft.type === "all" || Boolean(workouts[draft.type]?.ids);
  const field = (name, label, options) =>
    `<label for="history-${name}">${label}<select id="history-${name}" data-history-field="${name}">${options.map(([value, text]) => `<option value="${value}" ${draft[name] === value ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
  return `<section class="panel history-filters" aria-labelledby="history-filters-title" data-expanded="${expanded}">
    <header class="history-filters-header"><div class="history-filters-heading"><h2 id="history-filters-title"><button type="button" class="history-filters-toggle" id="history-filters-toggle" data-action="toggle-history-filters" aria-label="${expanded ? "Recolher filtros" : "Expandir filtros"}" aria-expanded="${expanded}" aria-controls="history-filter-fields" ${mobile ? "" : "disabled"}><span>Filtros</span>${icon("chevron-down")}</button></h2><p class="caption" data-history-summary>${esc(historyFilterSummary(applied))}</p></div>
    ${active ? '<div class="history-filters-actions"><button type="button" class="text-button" data-action="clear-history-filters">Limpar filtros</button></div>' : ""}</header>
    ${pending ? `<p class="caption history-filter-pending" data-history-pending>Alterações de filtros pendentes. O recorte acima permanece em exibição.</p>` : ""}
    <form id="history-filter-fields" aria-label="Filtrar histórico" ${expanded ? "" : "hidden"} novalidate><div class="history-filter-grid ${strengthType ? "has-exercise" : ""}">
    ${field("period", "Período", [
      ["all", "Todo o período"],
      ["30", "Últimos 30 dias"],
      ["90", "Últimos 90 dias"],
      ["custom", "Intervalo personalizado"],
    ])}
    ${field("type", "Treino", [
      ["all", "Todos os treinos"],
      ...Object.entries(workouts)
        .filter(([id]) => id !== "rest")
        .map(([id, workout]) => [id, workout.name]),
    ])}
    ${strengthType ? field("exercise", "Exercício", [["", "Todos os exercícios"], ...historyExercises(draft.type).map((exercise) => [exercise.id, exercise.name])]) : ""}</div>
    ${
      draft.period === "custom"
        ? `<fieldset class="history-date-range"><legend>Intervalo personalizado</legend><div class="history-date-fields">${[
            ["from", "De"],
            ["to", "Até"],
          ]
            .map(
              ([name, label]) =>
                `<label for="history-${name}">${label}<input id="history-${name}" type="date" data-history-field="${name}" value="${esc(draft[name])}" aria-describedby="history-range-hint${error ? " history-range-error" : ""}" aria-invalid="${Boolean(error)}"></label>`,
            )
            .join(
              "",
            )}</div><p class="caption" id="history-range-hint">${range === "incomplete" ? "Preencha as duas datas para aplicar o intervalo." : "As datas inicial e final estão incluídas no período."}</p>${error ? `<p class="form-error" id="history-range-error">${error}</p>` : ""}</fieldset>`
        : ""
    }</form></section>`;
}
export function historyView(data, state, { mobile = false } = {}) {
  const applied = state.applied;
  const entries = historyEntries(data, applied),
    visible = entries.slice(0, state.limit),
    finished = entries.filter(({ workout }) => workout.done).length;
  const filters = filtersView(state, mobile);
  const metrics = `<p class="caption" data-history-period>${entries.length} ${entries.length === 1 ? "treino registrado" : "treinos registrados"}</p><div class="history-metrics"><div class="panel"><small>TREINOS CONCLUÍDOS</small><b>${String(finished).padStart(2, "0")}</b></div><div class="panel"><small>QUILÔMETROS NO RECORTE</small><b class="cyan-text">${num(entries.reduce((a, { workout: s }) => a + (s.run?.km ?? 0), 0))}<em>km</em></b></div><div class="panel"><small>SÉRIES CONCLUÍDAS</small><b>${entries.reduce(
    (a, { workout: s }) =>
      a +
      Object.entries(s.sets)
        .filter(([id]) => !applied.exercise || id === applied.exercise)
        .flatMap(([, sets]) => sets)
        .filter((x) => x.done).length,
    0,
  )}</b></div></div>`;
  const content = applied.exercise
    ? `<div class="comparison-scroll"><table class="exercise-comparison"><caption>${esc(exercises[applied.exercise].name)} · séries por treino</caption><thead><tr><th>Data e treino</th><th>Série 1</th><th>Série 2</th><th>Série 3</th><th>Estado</th></tr></thead><tbody>${visible.map(({ date, workout: s }) => `<tr><th><a href="#hoje/${date}/${s.id}">${esc(dateText(date))} · ${esc(workouts[s.type].name)}</a></th>${s.sets[applied.exercise].map((set, i) => `<td data-label="Série ${i + 1}">${setText(set, s.withoutWeight?.[applied.exercise])}</td>`).join("")}<td data-label="Estado">${s.done ? "Concluído" : "Em andamento"}</td></tr>`).join("")}</tbody></table></div>`
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
