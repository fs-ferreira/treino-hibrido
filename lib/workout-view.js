import { workoutState, dateKey, dateFromKey, paceText } from "./core.js";
import { workouts } from "./exercises.js";
import { icon } from "./icons.js";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const number = (value) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
export const statusIcon = (key) =>
  ({
    done: "check",
    canceled: "minus",
    missed: "minus",
    started: "activity",
    planned: "circle",
    rest: "moon",
  })[key];
export function workoutIndicator(state) {
  return `<span class="workout-indicator ${state.key}" aria-hidden="true">${icon(statusIcon(state.key))}</span>`;
}
export function statusBadge(state) {
  return `<span class="session-state status-${state.key}">${workoutIndicator(state)}${esc(state.label)}</span>`;
}
export const timestampText = (value) =>
  new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function dayLabel(date, items, states) {
  const day = dateFromKey(date).toLocaleDateString("pt-BR", {
    dateStyle: "full",
  });
  return `${day}, ${items.length ? items.map((s, i) => `${workouts[s.type].name}: ${states[i].label}`).join("; ") : "Descanso"}`;
}
export function dayContents(date, items, states) {
  const day = dateFromKey(date),
    done = items.filter((s) => s.done).length;
  return `<span class="day-weekday">${["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][day.getDay()]}</span><b>${day.getDate()}</b><small>${items.length ? (done ? `${done} de ${items.length} feitos` : `${items.length} ${items.length === 1 ? "treino" : "treinos"}`) : "Pausa"}</small><span class="day-indicators" aria-hidden="true">${items.length ? states.slice(0, 3).map(workoutIndicator).join("") + (items.length > 3 ? `<span class="day-more">+${items.length - 3}</span>` : "") : icon("moon")}</span>`;
}
export function summaryDetails(summary) {
  return `${summary.canceled ? `<span>${summary.canceled} ${summary.canceled === 1 ? "cancelado" : "cancelados"}</span>` : ""}${summary.missed ? `<span>${summary.missed} ${summary.missed === 1 ? "não realizado" : "não realizados"}</span>` : ""}`;
}
export function workoutHero(item, date, settings, options = {}) {
  const state = workoutState(item, { date, ...options }),
    w = workouts[item?.type ?? "rest"],
    hasDraft = options.hasDraft;
  const scheduled = dateFromKey(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const sets = Object.values(item?.sets ?? {}).flat(),
    done = sets.filter((s) => s.done).length,
    total = (w.ids?.length ?? 0) * 3;
  const metric = (value, label) =>
    `<div><b>${esc(value)}</b><span>${label}</span></div>`;
  let context = `${icon("calendar-days")} <span>Programado para <strong>${esc(scheduled)}</strong></span>`;
  if (state.key === "done")
    context = `${icon("circle-check")} <span>${item.completedAt ? `Concluído em <strong>${esc(timestampText(item.completedAt))}</strong>` : "Concluído · horário não registrado"}</span>`;
  if (state.key === "canceled")
    context = `${icon("calendar-days")} <span>Cancelado em <strong>${esc(timestampText(item.canceledAt))}</strong></span>`;
  if (state.key === "missed")
    context = `${icon("calendar-days")} <span>Previsto para <strong>${esc(scheduled)}</strong> · sem registros</span>`;
  if (state.key === "rest")
    context = `${icon("moon")} <span>Uma pausa para recuperar</span>`;
  let metrics = "";
  if (w.kind === "strength")
    metrics =
      state.key === "started" || state.key === "done"
        ? metric(`${done}/${total}`, "séries concluídas") +
          metric(w.ids.length, "exercícios") +
          metric("6–8", "repetições previstas")
        : metric(String(w.ids.length).padStart(2, "0"), "exercícios") +
          metric("03", "séries cada") +
          metric("6–8", "repetições");
  if (w.kind === "run")
    metrics = item?.run
      ? metric(number(item.run.minutes), "minutos realizados") +
        metric(number(item.run.km), "km realizados") +
        metric(paceText((item.run.minutes * 60) / item.run.km), "pace /km")
      : metric(
          item.type === "interval"
            ? 40
            : item.type === "easy"
              ? 30
              : settings.longMinutes,
          "minutos previstos",
        ) +
        metric(
          item.type === "interval" ? "08" : "3–4",
          item.type === "interval" ? "blocos" : "esforço / 10",
        );
  const manage = `data-action="reorganize-selected" data-workout="${esc(item?.id)}"`;
  const actions =
    state.key === "canceled"
      ? `<button class="button quiet" data-action="reactivate-workout" data-workout="${esc(item.id)}">Reativar treino ${icon("rotate-ccw")}</button><a class="text-link" href="#session">Consultar treino ${icon("arrow-down")}</a>`
      : state.key === "missed"
        ? `<button class="button primary" ${manage}>Reorganizar treino ${icon("calendar-days")}</button><a class="text-link" href="#session">Registrar treino realizado ${icon("arrow-down")}</a>`
        : `<a class="button primary" href="#session">${state.action} ${icon("arrow-down")}</a>${state.key === "planned" ? `<button class="text-button" ${manage}>Reorganizar</button>` : ""}`;
  return `<section class="hero ${w.kind} state-${state.key}"><div class="hero-copy"><div class="hero-header"><span class="tag ${w.kind}">${esc(w.kind === "run" ? "CORRIDA" : w.kind === "rest" ? "RECUPERAÇÃO" : w.tag)}</span>${statusBadge(state)}</div><p class="hero-overline">${date === (options.today ?? dateKey()) ? "SEU TREINO DE HOJE" : "TREINO SELECIONADO"}</p><h2>${esc(w.name)}<span>.</span></h2><p class="hero-subtitle">${esc(w.subtitle)}</p><div class="hero-context">${context}</div>${["done", "canceled"].includes(state.key) ? `<p class="hero-scheduled">Data prevista · ${esc(scheduled)}</p>` : ""}<div class="hero-stats">${metrics}</div>${state.key === "started" && w.kind === "strength" ? `<div class="hero-progress" role="progressbar" aria-label="Séries concluídas" aria-valuenow="${done}" aria-valuemax="${total}" aria-valuemin="0"><span style="width:${total ? (done / total) * 100 : 0}%"></span></div>` : ""}${hasDraft ? '<p class="caption hero-draft">Alterações não salvas nesta visita</p>' : ""}<div class="hero-actions">${actions}</div></div><div class="hero-art" aria-hidden="true"><div class="orbit o1"></div><div class="orbit o2"></div></div></section>`;
}
