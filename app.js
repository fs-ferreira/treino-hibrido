import { account } from "./lib/account.js";
import { notify } from "./lib/notifications.js";
import {
  defaults,
  scheduledWorkouts,
  materializeDay,
  workoutStarted,
  workoutState,
  dayState,
  recordedWorkouts,
  weekSummary,
  addWorkout,
  moveWorkout,
  validDate,
  parsePace,
  paceText,
  dateKey,
  dateFromKey,
  addDays,
  weekStart,
  workoutFor,
  distance,
  validateBackup,
  previousSets,
  maskTime,
  parseDuration,
  durationText,
} from "./lib/core.js?v=4.0.0";
import {
  withoutWeight,
  loadSuggestions,
  roundLoadUp,
  getRunPlan,
  paceRevision,
  effortTarget,
} from "./lib/progression.js?v=4.0.0";
import { workouts, exercises } from "./lib/exercises.js";
import { muscleMap, createMuscleMapController } from "./lib/muscle-map.js";
import { runBlocksView } from "./lib/run-view.js?v=1.7.0";
import { plansView } from "./lib/plans-view.js?v=4.0.0";
import { resolveRoute, isAppHash } from "./lib/routes.js?v=4.0.0";
import {
  settingsView,
  createSettingsController,
  settingsSections,
} from "./lib/settings.js?v=4.0.0";
import { createMobileNav } from "./lib/mobile-nav.js?v=4.0.0";
import { illustration } from "./lib/diagrams.js?v=2.2.0";
import { createMovementPlayer } from "./lib/movement-player.js?v=2.2.0";
import { hydrateIcons, applyTimeMask } from "./lib/ui.js?v=1.6.0";
import { icon } from "./lib/icons.js?v=1.6.0";
import { createMotionDiagnostics } from "./lib/motion-diagnostics.js?v=1.6.0";
import {
  createMotion,
  createAccordions,
  createDialogController,
} from "./lib/motion.js?v=1.6.0";
import {
  historyView as renderHistory,
  historyDefaults,
  updateHistoryFilters,
  clearHistoryFilters,
  seriesView,
} from "./lib/history-view.js";
import { backupSummary } from "./lib/backup-view.js";
import { createFieldControls } from "./lib/field-controls.js";
let disposeMovement = () => {};
const $ = (s) => document.querySelector(s),
  main = $("#main");
const muscleMaps = createMuscleMapController(main);
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (n, d = 1) =>
  n === null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("pt-BR", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });
const shortDate = (k) =>
  dateFromKey(k).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
const fullDate = (k) =>
  dateFromKey(k).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
let data = account.data ?? defaults(),
  selected = dateKey(),
  selectedWorkout = null,
  runDrafts = new Map(),
  historyFilters = historyDefaults(),
  week = weekStart(selected),
  expanded = new Set(),
  expandedPlanDays = new Set([1]),
  references = {},
  pendingConfirmation = null,
  pendingImport = null,
  importGeneration = 0,
  dialogReturnFocus = null;
const motion = createMotion({ onStart: createMotionDiagnostics() });
const fieldControls = createFieldControls({ motion });
const mobileNav = createMobileNav($("nav"));
const historyMobile = matchMedia("(max-width: 600px)");
let historyDisclosureGeneration = 0;
function syncHistoryDisclosure() {
  const fields = $("#history-filter-fields");
  const toggle = $("#history-filters-toggle");
  if (!fields || !toggle) return;
  const toggleFocused = document.activeElement === toggle;
  if (historyMobile.matches && fields.contains(document.activeElement))
    historyFilters.expanded = true;
  const open = !historyMobile.matches || historyFilters.expanded;
  const generation = ++historyDisclosureGeneration;
  motion.stop(fields);
  const start = fields.hidden ? 0 : fields.getBoundingClientRect().height;
  if (!open && fields.contains(document.activeElement))
    toggle.focus({ preventScroll: true });
  fields.hidden = false;
  fields.inert = !open;
  toggle.disabled = !historyMobile.matches;
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute(
    "aria-label",
    open ? "Recolher filtros" : "Expandir filtros",
  );
  $(".history-filters").dataset.expanded = String(open);
  const end = open ? fields.scrollHeight : 0;
  fields.style.overflow = "hidden";
  motion
    .play(
      fields,
      [
        { height: `${start}px`, opacity: open ? 0 : 1 },
        { height: `${end}px`, opacity: open ? 1 : 0 },
      ],
      { duration: 200 },
    )
    .then(() => {
      if (generation !== historyDisclosureGeneration) return;
      fields.hidden = !open;
      fields.style.removeProperty("overflow");
    });
  if (!historyMobile.matches && toggleFocused)
    fieldControls.focus($("#history-period"));
}
historyMobile.addEventListener("change", syncHistoryDisclosure);
function announceHistory() {
  const visible = main.querySelectorAll(
    ".history-entry, .exercise-comparison tbody tr",
  ).length;
  $("#history-status").textContent = [
    $("[data-history-summary]")?.textContent,
    $("[data-history-period]")?.textContent,
    `Exibindo ${visible} ${visible === 1 ? "treino" : "treinos"}`,
    $("[data-history-pending]")?.textContent,
    $("#history-range-error")?.textContent,
  ]
    .filter(Boolean)
    .join(". ");
}
document.documentElement.classList.toggle(
  "no-motion-api",
  typeof Element.prototype.animate !== "function",
);
function rememberDisclosure(card, open) {
  const isPlan = card.dataset.planDay !== undefined;
  const collection = isPlan ? expandedPlanDays : expanded;
  const key = isPlan ? Number(card.dataset.planDay) : card.dataset.exercise;
  if (open) collection.add(key);
  else collection.delete(key);
}
const accordions = createAccordions(motion, rememberDisclosure);
const dialogs = createDialogController($("#guide-dialog"), motion, {
  onClosing() {
    fieldControls.close();
    disposeMovement();
    pendingConfirmation = null;
    pendingImport = null;
    importGeneration++;
  },
  onClose() {
    disposeMovement();
    pendingConfirmation = null;
    pendingImport = null;
    importGeneration++;
    dialogReturnFocus?.focus({ preventScroll: true });
    dialogReturnFocus = null;
  },
});
let currentRoute = routeFromHash();
const routePositions = new Map();
history.scrollRestoration = "manual";
const settingsUi = createSettingsController({
  getSettings: () => data.settings,
  navigate: (section) => navigateTo(`configuracoes/${section}`),
  async save(next) {
    data.settings = next;
    return persist("Alterações salvas.", { cloudOnly: true });
  },
});
fetch("./assets/references.json")
  .then((r) => {
    if (!r.ok) throw Error();
    return r.json();
  })
  .then((r) => {
    references = Object.fromEntries(r.exercises.map((e) => [e.id, e]));
  })
  .catch(() => {});
async function persist(message, { cloudOnly = false } = {}) {
  if (account.blocked) return false;
  try {
    const result = await account.remote.save(data);
    if (message && (result.saved === "cloud" || !cloudOnly))
      notify(result.saved === "cloud" ? message : account.status.message);
    return ["cloud", "local"].includes(result.saved);
  } catch (error) {
    notify(
      error.message ||
        "Não foi possível salvar. Exporte uma cópia antes de sair.",
    );
    return false;
  }
}
function currentSession(
  key = selected,
  id = key === selected ? selectedWorkout : null,
) {
  const items = scheduledWorkouts(data, key);
  return (
    items.find((s) => s.id === id) ??
    items.find((s) => !s.done) ??
    items[0] ??
    null
  );
}
function getType(key) {
  return currentSession(key)?.type ?? "rest";
}
function session(key = selected, id = selectedWorkout) {
  const day = materializeDay(data, key);
  const item = day.workouts.find((s) => s.id === id) ?? day.workouts[0];
  if (!item) throw Error("Adicione um treino antes de registrar.");
  if (key === selected) selectedWorkout = item.id;
  return item;
}
function draftKey(date = selected, id = currentSession(date)?.id) {
  return `${date}/${id}`;
}
function runValues(run) {
  return {
    minutes: String(run?.minutes ?? ""),
    km: String(run?.km ?? ""),
    rpe: String(run?.rpe ?? ""),
    notes: run?.notes ?? "",
    hardPace: run?.hardPace ? paceText(run.hardPace) : "",
    hardRpe: String(run?.hardRpe ?? ""),
  };
}
function captureRunDraft() {
  const form = $("#run-form");
  if (!form) return;
  const values = {
    ...runValues(null),
    ...Object.fromEntries(new FormData(form)),
  };
  const key = draftKey();
  if (
    JSON.stringify(values) === JSON.stringify(runValues(currentSession()?.run))
  )
    runDrafts.delete(key);
  else runDrafts.set(key, values);
  const notice = $("[data-run-draft-warning]");
  if (notice) notice.hidden = !runDrafts.has(key);
}
function selectDay(
  date,
  id,
  { session: open = false, keepScroll = true, replace = false } = {},
) {
  if (!validDate(date)) return;
  const old = draftKey();
  selected = date;
  selectedWorkout =
    id ??
    scheduledWorkouts(data, date).find((s) => !s.done)?.id ??
    scheduledWorkouts(data, date)[0]?.id ??
    null;
  if (old !== draftKey()) expanded.clear();
  navigateTo(`hoje/${date}${selectedWorkout ? `/${selectedWorkout}` : ""}`, {
    refresh: true,
    session: open,
    keepScroll,
    replace,
  });
}
const strengthSetCount = (type) => workouts[type].ids.length * 3;
const emptySets = () =>
  Array.from({ length: 3 }, () => ({ kg: "", reps: "", done: false }));
function exerciseSession(id) {
  const mode = withoutWeight(data.sessions, selected, id, selectedWorkout),
    s = session();
  s.withoutWeight ??= {};
  s.withoutWeight[id] ??= mode;
  s.sets[id] ??= emptySets();
  return s;
}
const weightText = (value) =>
  value === ""
    ? "—"
    : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
function setHistoryText(sets, noWeight) {
  return seriesView(sets, noWeight);
}
function count(key = selected, id = key === selected ? selectedWorkout : null) {
  return Object.values(currentSession(key, id)?.sets ?? {})
    .flat()
    .filter((s) => s.done).length;
}
function link(url, label, cls = "source-link", accessibleLabel = "") {
  return `<a class="${cls}" href="${escape(url)}" target="_blank" rel="noopener noreferrer" ${accessibleLabel ? `aria-label="${escape(accessibleLabel)}"` : ""}>${label} ↗</a>`;
}
const tag = (text, kind = "strength") =>
  `<span class="tag ${kind}">${text}</span>`;
const arrow = '<span aria-hidden="true">↗</span>';
function heading(kicker, title, description, action = "") {
  return `<div class="page-heading"><div>${kicker ? `<p class="eyebrow">${kicker}</p>` : ""}<h1>${title}</h1>${description ? `<p class="muted">${description}</p>` : ""}</div>${action}</div>`;
}
function routeFromHash() {
  return resolveRoute(location.hash).key;
}
function scrollToSession() {
  $("#session")?.scrollIntoView({
    behavior: motion.reduced ? "instant" : "smooth",
    block: "start",
  });
}
function applyNavigation(route, options = {}) {
  fieldControls.close();
  dialogs.forceClose();
  if (route === currentRoute && !options.refresh) {
    if (options.session) scrollToSession();
    return;
  }
  routePositions.set(currentRoute, {
    left: window.scrollX,
    top: window.scrollY,
  });
  const previous = resolveRoute(currentRoute),
    next = resolveRoute(route);
  const scrollBefore = window.scrollY;
  if (next.section === "hoje") {
    if (next.date) selected = next.date;
    if (next.workoutId) selectedWorkout = next.workoutId;
    const active = currentSession();
    selectedWorkout = active?.id ?? null;
  }
  currentRoute = route;
  if (
    previous.section === "configuracoes" &&
    next.section === "configuracoes" &&
    $("#settings-page") &&
    !options.refresh
  ) {
    window.scrollTo({
      ...(routePositions.get(route) ?? { left: 0, top: 0 }),
      behavior: "instant",
    });
    settingsUi.show(next.settingsSection, true);
    updateTitle(next);
    return;
  }
  render();
  main.focus({ preventScroll: true });
  window.scrollTo({
    ...(options.keepScroll
      ? { left: 0, top: scrollBefore }
      : (routePositions.get(route) ?? { left: 0, top: 0 })),
    behavior: "instant",
  });
  motion.enter(main);
  if (options.session) scrollToSession();
}
function navigateTo(hash, options = {}) {
  if (location.hash !== `#${hash}`)
    history[options.replace ? "replaceState" : "pushState"](
      null,
      "",
      `#${hash}`,
    );
  applyNavigation(routeFromHash(), options);
}
function syncTodayStatus() {
  if (resolveRoute(currentRoute).section !== "hoje") return;
  const summary = weekSummary(data, selected),
    ring = $(".progress-ring");
  if (ring) {
    ring.style.setProperty(
      "--progress",
      `${summary.planned ? (summary.done / summary.planned) * 100 : 0}%`,
    );
    ring.querySelector("b").innerHTML =
      `${summary.done}<small>/${summary.planned}</small>`;
  }
  const split = $(".split-stat");
  if (split)
    split.innerHTML = `<span>Musculação <b>${summary.strength.done}/${summary.strength.planned}</b></span><span>Corrida <b>${summary.run.done}/${summary.run.planned}</b></span>`;
  document.querySelectorAll(".week-strip .day").forEach((button) => {
    const key = button.dataset.date,
      state = dayState(data, key),
      items = scheduledWorkouts(data, key);
    button.classList.toggle("selected", key === selected);
    button.setAttribute("aria-pressed", String(key === selected));
    button.setAttribute(
      "aria-label",
      `${fullDate(key)}, ${items.map((s) => workouts[s.type].name).join(", ") || "Descanso"}, ${state.label}`,
    );
    const indicator = button.querySelector(".day-indicator");
    indicator.classList.toggle("done", state.key === "done");
    indicator.innerHTML = state.key === "done" ? icon("check") : "";
  });
  if ($(".hero .session-state"))
    $(".hero .session-state").textContent = sessionStatus().label;
  const link = $('.hero a[href="#session"]');
  if (link) link.innerHTML = `${sessionStatus().action} ${icon("arrow-down")}`;
  document.querySelectorAll("[data-workout-status]").forEach((el) => {
    const item = scheduledWorkouts(data, selected).find(
      (s) => s.id === el.dataset.workoutStatus,
    );
    el.textContent = runDrafts.has(draftKey(selected, item?.id))
      ? "Rascunho"
      : workoutState(item).label;
  });
  document.querySelectorAll('[data-action="move-workout"]').forEach((el) => {
    const item = scheduledWorkouts(data, selected).find(
      (s) => s.id === el.dataset.workout,
    );
    el.disabled =
      workoutStarted(item) || runDrafts.has(draftKey(selected, item?.id));
  });
}
function syncStrength(id) {
  if (!$(".progress-line")) return;
  const s = currentSession(),
    total = count(selected),
    planned = strengthSetCount(getType(selected));
  $(".count-pill").textContent = `${total}/${planned} séries`;
  $(".progress-line span").style.transform = `scaleX(${total / planned})`;
  const button = $('[data-action="finish-strength"]');
  button.classList.toggle("quiet", Boolean(s?.done));
  button.classList.toggle("primary", !s?.done);
  button.innerHTML = `${s?.done ? "Reabrir sessão" : "Concluir sessão"} ${icon(s?.done ? "rotate-ccw" : "check")}`;
  if (id) {
    const card = $(`[data-exercise="${id}"]`);
    const sets = s?.sets[id] ?? emptySets(),
      complete = sets.filter((set) => set.done).length;
    const badge = card.querySelector(".exercise-check");
    badge.classList.toggle("complete", complete === 3);
    badge.innerHTML = complete === 3 ? icon("check") : `${complete}/3`;
    badge.setAttribute("aria-label", `${complete} de 3 séries concluídas`);
    card.querySelectorAll('[data-field="done"]').forEach((input) => {
      input
        .closest(".sets-grid")
        .classList.toggle(
          "set-done",
          Boolean(sets[Number(input.dataset.index)].done),
        );
    });
    const noWeight = withoutWeight(
      data.sessions,
      selected,
      id,
      selectedWorkout,
    );
    card.querySelectorAll('[data-field="kg"]').forEach((input) => {
      input.disabled = noWeight;
    });
    card.querySelectorAll(".load-suggestion").forEach((hint) => {
      const index = Number(hint.dataset.index);
      hint.hidden = noWeight || hint.dataset.empty === "true";
      const use = hint.querySelector("button");
      if (use)
        use.disabled =
          noWeight ||
          Boolean(sets[index].done) ||
          use.dataset.usable === "false";
    });
    card.querySelectorAll('[data-action="step-load"]').forEach((button) => {
      const input = card.querySelector(
        `[data-field="kg"][data-index="${button.dataset.index}"]`,
      );
      button.disabled =
        noWeight ||
        (Number(button.dataset.direction) < 0
          ? input.value === "" || Number(input.value) <= 0
          : Number(input.value) >= 2000);
    });
    card.classList.toggle("without-weight", noWeight);
  }
  syncTodayStatus();
}
function refreshDay() {
  selectDay(selected, selectedWorkout);
}
function syncLongRun() {
  const { blocks, total, snapshot } = getRunPlan(
    "long",
    data.settings,
    data.sessions,
    selected,
    selectedWorkout,
  );
  $(".long-options label strong").textContent =
    `${data.settings.longMinutes} min`;
  $(".hero-stats b").textContent = data.settings.longMinutes;
  const overview = $(".run-overview");
  overview.querySelector(":scope > div:first-child b").innerHTML =
    `${total.minutes}<em>min</em>`;
  overview.querySelector(":scope > div:last-child b").innerHTML =
    `${total.known ? num(total.km, 2) : "—"}<em>km</em>`;
  const range = $("#long-distance-range");
  if (range) range.textContent = longRangeText(snapshot.easyPace);
  document.querySelectorAll(".run-block").forEach((row, i) => {
    row.querySelector(".block-values b").textContent =
      `${blocks[i].minutes} min`;
    row.querySelector(".block-values small").textContent =
      blocks[i].km === null ? "—" : `${num(blocks[i].km, 2)} km`;
  });
}
function updateTitle(route) {
  const title =
    route.section === "configuracoes"
      ? `${settingsSections.find((s) => s.id === route.settingsSection)?.label ?? "Corrida"} · Configurações`
      : ({
          hoje: "Hoje",
          semana: "Semana",
          treinos: route.planId ? "Treino Híbrido" : "Treinos",
          historico: "Histórico",
        }[route.section] ?? "Hoje");
  document.title = `${title} · HÍBRIDO`;
}
function render({ preserve = false, preserveHistoryCard = false } = {}) {
  const ui = preserve ? captureView() : null;
  const previousFilters = preserveHistoryCard ? $(".history-filters") : null;
  if (account.blocked) return;
  if (!previousFilters) fieldControls.reset({ preserveDrafts: true });
  muscleMaps.reset();
  settingsUi.unmount();
  accordions.finish();
  motion.finishAll();
  const route = resolveRoute(currentRoute);
  if (route.section === "hoje") {
    if (route.date) selected = route.date;
    if (route.workoutId) selectedWorkout = route.workoutId;
    selectedWorkout = currentSession()?.id ?? null;
  }
  mobileNav.setActive(route.section);
  $("#top-date").textContent = (
    route.section === "hoje" ? dateFromKey(selected) : new Date()
  ).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const content =
    (runDrafts.size && !(route.section === "hoje" && runDrafts.has(draftKey()))
      ? `<p class="caption run-draft-notice">Há rascunhos de corrida nesta visita. Eles se perdem ao recarregar. <a href="#hoje/${escape(runDrafts.keys().next().value)}">Ver rascunho</a></p>`
      : "") +
    (
      {
        hoje: todayView,
        treinos: () => plansView(data.settings, route, expandedPlanDays),
        historico: historyView,
        configuracoes: () => settingsView(data.settings, route.settingsSection),
      }[route.section] || todayView
    )();
  // Keep date fields and click targets alive when a blur commits a date.
  if (previousFilters) {
    const replacement = document.createElement("div");
    replacement.innerHTML = content;
    const next = replacement.querySelector(".history-filters");
    previousFilters.querySelector("[data-history-summary]").textContent =
      next.querySelector("[data-history-summary]").textContent;
    for (const id of ["history-range-hint", "history-range-error"]) {
      const old = previousFilters.querySelector(`#${id}`),
        fresh = next.querySelector(`#${id}`);
      if (old && fresh) old.textContent = fresh.textContent;
      else if (old) old.remove();
      else if (fresh)
        previousFilters.querySelector(".history-date-range").append(fresh);
    }
    for (const fresh of next.querySelectorAll('input[type="date"]')) {
      const old = previousFilters.querySelector(`#${fresh.id}`);
      for (const name of ["aria-invalid", "aria-describedby"])
        old.setAttribute(name, fresh.getAttribute(name));
    }
    const pending = previousFilters.querySelector("[data-history-pending]"),
      freshPending = next.querySelector("[data-history-pending]");
    if (pending && !freshPending) pending.remove();
    else if (!pending && freshPending)
      previousFilters.querySelector("header").after(freshPending);
    for (const child of [...main.childNodes])
      if (child !== previousFilters) child.remove();
    let afterFilters = false;
    for (const child of [...replacement.childNodes]) {
      if (child === next) afterFilters = true;
      else if (afterFilters) main.append(child);
      else main.insertBefore(child, previousFilters);
    }
  } else main.innerHTML = content;
  updateTitle(route);
  if (route.section !== "historico") $("#history-status").textContent = "";
  hydrateIcons();
  muscleMaps.refresh();
  if (route.section === "configuracoes")
    settingsUi.mount($("#settings-page"), route.settingsSection);
  fieldControls.refresh(main);
  if (ui) restoreView(ui);
}
function weekStrip(start = weekStart(selected)) {
  return `<div class="week-strip" role="group" aria-label="Dias da semana">${Array.from(
    { length: 7 },
    (_, i) => {
      const key = addDays(start, i),
        items = scheduledWorkouts(data, key),
        state = dayState(data, key);
      return `<button class="day ${key === selected ? "selected" : ""} ${items[0] ? workouts[items[0].type].kind : "rest"}" data-action="day" data-date="${key}" aria-pressed="${key === selected}" ${key === dateKey() ? 'aria-current="date"' : ""} aria-label="${escape(fullDate(key))}, ${escape(items.map((s) => workouts[s.type].name).join(", ") || "Descanso")}, ${state.label}"><span>${["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][dateFromKey(key).getDay()]}</span><b>${dateFromKey(key).getDate()}</b><small>${items.length ? `${items.length} ${items.length === 1 ? "treino" : "treinos"}` : "Pausa"}</small><i class="day-indicator ${state.key === "done" ? "done" : ""}">${state.key === "done" ? icon("check") : ""}</i></button>`;
    },
  ).join("")}</div>`;
}
function sessionStatus() {
  return workoutState(currentSession());
}
function dayWorkoutsView() {
  const items = scheduledWorkouts(data, selected);
  return `<section class="day-workouts" aria-label="Treinos do dia"><div class="section-title"><h2>Treinos do dia</h2><button class="button quiet" data-action="add-workout">Adicionar treino ${icon("plus")}</button></div><div class="day-workout-list">${items.map((item) => `<article class="panel day-workout ${item.id === selectedWorkout ? "is-selected" : ""}"><button class="workout-select" data-action="select-workout" data-workout="${item.id}" aria-pressed="${item.id === selectedWorkout}"><b>${workouts[item.type].name}</b><span data-workout-status="${item.id}">${runDrafts.has(draftKey(selected, item.id)) ? "Rascunho" : workoutState(item).label}</span><span>${item.id === selectedWorkout ? "Em exibição" : "Abrir"} ${icon("arrow-down")}</span></button><button class="text-button" data-action="move-workout" data-workout="${item.id}" ${workoutStarted(item) || runDrafts.has(draftKey(selected, item.id)) ? "disabled" : ""} aria-label="Mover ${workouts[item.type].name} para outra data">Mover</button></article>`).join("")}</div>${items.some((item) => workoutStarted(item) || runDrafts.has(draftKey(selected, item.id))) ? '<p class="caption">Treinos iniciados permanecem nesta data. Você pode adicionar outro treino.</p>' : ""}</section>`;
}
function heroView() {
  const type = getType(selected),
    w = workouts[type];
  return `<section class="hero ${w.kind}"><div class="hero-copy">${w.kind === "run" ? "" : tag(w.tag, w.kind)}<span class="session-state">${sessionStatus(selected).label}</span><p class="hero-overline">${selected === dateKey() ? "O TREINO DE HOJE" : "TREINO SELECIONADO"}</p><h2>${w.name}<span>.</span></h2><p>${w.subtitle}</p><div class="hero-stats">${w.kind === "strength" ? `<div><b>${String(w.ids.length).padStart(2, "0")}</b><span>exercícios</span></div><div><b>03</b><span>séries cada</span></div><div><b>6–8</b><span>repetições</span></div>` : w.kind === "run" ? `<div><b>${type === "interval" ? 40 : type === "easy" ? 30 : (currentSession()?.run?.plan?.longMinutes ?? data.settings.longMinutes)}</b><span>minutos</span></div><div><b>${type === "interval" ? "08" : "3–4"}</b><span>${type === "interval" ? "blocos" : "esforço / 10"}</span></div>` : "<div><b>01</b><span>pausa merecida</span></div>"}</div><a class="button primary" href="#session">${sessionStatus(selected).action} <span>↓</span></a></div><div class="hero-art" aria-hidden="true"><div class="orbit o1"></div><div class="orbit o2"></div><div class="orbit o3"></div><span class="art-cross">+</span></div></section>`;
}
function todayView() {
  const summary = weekSummary(data, selected),
    start = weekStart(selected);
  return (
    heading(
      "",
      selected === dateKey()
        ? 'Vamos nessa<span class="accent">.</span>'
        : 'Seu treino, no seu tempo<span class="accent">.</span>',
      fullDate(selected),
      `<button class="button quiet" data-action="reset-day" ${selected === dateKey() ? "hidden" : ""}>Ir para hoje</button>`,
    ) +
    `<div class="dashboard-grid">${heroView()}<section class="week-summary panel"><h2>Resumo da semana</h2><div class="progress-ring" style="--progress:${summary.planned ? (summary.done / summary.planned) * 100 : 0}%"><div><b>${summary.done}<small>/${summary.planned}</small></b><span>treinos concluídos</span></div></div><p class="caption">Concluídos / programados</p><div class="split-stat"><span>Musculação <b>${summary.strength.done}/${summary.strength.planned}</b></span><span>Corrida <b>${summary.run.done}/${summary.run.planned}</b></span></div></section></div>
  <section id="week-navigation" aria-label="Navegação semanal"><div class="week-controls"><button class="button quiet" data-action="prev-week" aria-label="Semana anterior">←</button><h2>${shortDate(start)} — ${shortDate(addDays(start, 6))}</h2><button class="button quiet" data-action="next-week" aria-label="Próxima semana">→</button><button class="text-button" data-action="current-week" ${weekStart(selected) === weekStart(dateKey()) ? "hidden" : ""}>Semana atual</button></div>${weekStrip(start)}</section>${dayWorkoutsView()}<section id="session" class="session-section" data-workout-id="${escape(selectedWorkout ?? "")}">${sessionView(getType(selected))}</section>`
  );
}
function sessionView(type) {
  const w = workouts[type];
  if (w.kind === "strength") return strengthView(type);
  if (w.kind === "run") return runView(type);
  return `<div class="rest-card panel"><div class="rest-icon">☾</div><p class="eyebrow">ESPAÇO PARA RECUPERAR</p><h2>Hoje, desacelere.</h2><p>O plano reserva este dia para descanso. Priorize o sono e chegue ao próximo treino com disposição.</p><span class="muted">Próximo treino: ${workouts[getType(addDays(selected, 1))].name}</span></div>`;
}
function strengthView(type) {
  const w = workouts[type],
    s = currentSession(),
    total = count(selected),
    planned = strengthSetCount(getType(selected));
  return `<div class="section-title"><div><p class="eyebrow">MUSCULAÇÃO · ${shortDate(selected)}</p><h2>Sua sessão de ${w.name}</h2></div><span class="count-pill">${total}/${planned} séries</span></div><div class="progress-line"><span style="transform:scaleX(${total / planned})"></span></div><p class="section-hint">3 séries de 6–8 repetições.</p><div class="exercise-list">${w.ids.map((id, index) => exerciseCard(id, index, s)).join("")}</div><div class="session-bottom"><button class="button ${s?.done ? "quiet" : "primary"}" data-action="finish-strength">${s?.done ? "Reabrir sessão" : "Concluir sessão"} ${s?.done ? "↶" : "✓"}</button></div>`;
}
function loadSuggestionReason(suggestion) {
  if (suggestion.percent)
    return `+${weightText(suggestion.percent)}% por atingir 8 repetições`;
  return suggestion.reps < 8
    ? "Manter: ainda abaixo de 8 repetições"
    : "Manter: progressão em 0%";
}
function exerciseHistory(id, previous, suggestions) {
  return `<details class="exercise-history"><summary><span>Histórico e sugestões</span>${icon("chevron-down")}</summary>
    <div class="exercise-history-content">${previous ? `<div class="previous"><b>Última sessão · ${shortDate(previous.date)}</b><br>${setHistoryText(previous.sets, previous.withoutWeight)}</div>` : '<p class="previous">Sem registros anteriores.</p>'}
    <ol class="load-reference">${suggestions.map((suggestion, i) => (suggestion ? `<li><b>${String(i + 1).padStart(2, "0")}</b><div id="load-reason-${id}-${i}"><span><strong>${weightText(suggestion.kg)} kg</strong> · ${loadSuggestionReason(suggestion)}</span><small>Referência · ${shortDate(suggestion.date)} · ${weightText(suggestion.previousKg)} kg × ${suggestion.reps}${!suggestion.usable ? " · acima do limite de 2000 kg" : ""}</small></div></li>` : "")).join("")}</ol>
    </div></details>`;
}
function exerciseCard(id, index, s) {
  const e = exercises[id],
    sets = s?.sets[id] || emptySets(),
    previous = previousSets(data.sessions, selected, id),
    noWeight = withoutWeight(data.sessions, selected, id, selectedWorkout),
    suggestions = loadSuggestions(
      data.sessions,
      selected,
      id,
      data.settings.loadProgression,
    ),
    complete = sets.filter((x) => x.done).length,
    perSide = [
      "single-rdl",
      "bulgarian",
      "leg-curl",
      "leg-extension",
      "wrist-curl",
    ].includes(id),
    loadLabel = perSide ? "Carga por lado (kg)" : "Carga (kg)";
  return `<details class="exercise-card ${noWeight ? "without-weight" : ""}" data-exercise="${id}" ${expanded.has(id) ? "open" : ""}>
    <summary><span class="exercise-number">${String(index + 1).padStart(2, "0")}</span><span class="exercise-name"><b>${e.name}</b><small>${e.muscles}</small></span><span class="exercise-check ${complete === 3 ? "complete" : ""}" aria-label="${complete} de 3 séries concluídas">${complete === 3 ? icon("check") : `${complete}/3`}</span><span class="chevron">${icon("chevron-down")}</span></summary>
    <div class="exercise-body"><div class="exercise-layout">${muscleMap(e)}<div class="exercise-entry"><p class="sr-only" id="weight-help-${id}">Sem peso adicional vale para as três séries. Registre apenas as repetições; as cargas digitadas são preservadas.</p><div class="exercise-tools"><label class="pace-toggle weight-toggle"><input type="checkbox" data-without-weight="${id}" aria-describedby="weight-help-${id}" ${noWeight ? "checked" : ""}><span>Sem peso adicional</span></label><button class="button quiet small exercise-guide" data-action="guide" data-id="${id}" aria-label="Como fazer ${e.name}">Como fazer ${arrow}</button></div>
    <div class="sets-grid set-header" aria-hidden="true"><span>Série</span><span>${loadLabel}</span><span>Reps</span><span>Feita</span></div>
    ${sets
      .map((set, i) => {
        const suggestion = suggestions[i];
        const verb = suggestion?.percent ? "Usar" : "Manter";
        return `<div class="sets-grid set-row ${set.done ? "set-done" : ""}"><b>${String(i + 1).padStart(2, "0")}</b><div class="load-cell"><div class="weight-stepper"><button type="button" class="weight-step" data-action="step-load" data-direction="-1" data-id="${id}" data-index="${i}" aria-label="Diminuir ${perSide ? "carga por lado" : "carga"} da série ${i + 1} de ${e.name} em 0,5 kg" ${noWeight || set.kg === "" || Number(set.kg) <= 0 ? "disabled" : ""}>−</button><input type="number" inputmode="decimal" min="0" max="2000" step="0.5" value="${set.kg}" ${noWeight ? "disabled" : ""} placeholder="—" aria-label="${loadLabel} da série ${i + 1} de ${e.name}" data-id="${id}" data-index="${i}" data-field="kg"><button type="button" class="weight-step" data-action="step-load" data-direction="1" data-id="${id}" data-index="${i}" aria-label="Aumentar ${perSide ? "carga por lado" : "carga"} da série ${i + 1} de ${e.name} em 0,5 kg" ${noWeight || Number(set.kg) >= 2000 ? "disabled" : ""}>+</button></div>
        <div class="load-suggestion" data-index="${i}" data-empty="${!suggestion}" ${noWeight || !suggestion ? "hidden" : ""}>${suggestion ? `<button type="button" class="button load-apply" data-action="use-load" data-id="${id}" data-index="${i}" data-usable="${suggestion.usable}" ${set.done || noWeight || !suggestion.usable ? "disabled" : ""} aria-describedby="load-reason-${id}-${i}" aria-label="${suggestion.usable ? `${verb} ${weightText(suggestion.kg)} kg na série ${i + 1} de ${e.name}` : `Fora do limite: sugestão de ${weightText(suggestion.kg)} kg na série ${i + 1} de ${e.name}`}">${suggestion.usable ? `${verb} <strong>${weightText(suggestion.kg)} kg</strong>` : "Fora do limite"}</button>` : ""}</div></div>
        <span class="mobile-set-label load-label" aria-hidden="true">${loadLabel}</span><span class="mobile-set-label reps-label" aria-hidden="true">Reps</span><input type="number" inputmode="numeric" min="0" max="1000" step="1" value="${set.reps}" placeholder="6–8" aria-label="Repetições da série ${i + 1} de ${e.name}" data-id="${id}" data-index="${i}" data-field="reps"><label class="check-label"><input type="checkbox" ${set.done ? "checked" : ""} aria-label="Concluir série ${i + 1} de ${e.name}" data-id="${id}" data-index="${i}" data-field="done"><span aria-hidden="true">${icon("check")}</span></label></div>`;
      })
      .join("")}
    ${exerciseHistory(id, previous, suggestions)}</div></div></div></details>`;
}
function longRangeText(pace) {
  return pace
    ? `${num(distance(60, pace), 1)}–${num(distance(90, pace), 1)} km`
    : "";
}
function effortOptions(selectedRpe) {
  return `<option value="">Selecione</option>${Array.from({ length: 11 }, (_, i) => `<option value="${i}" ${selectedRpe === i ? "selected" : ""}>${i}${i === 0 ? " · repouso" : i === 10 ? " · máximo" : ""}</option>`).join("")}`;
}
function paceHelp(plan) {
  const context = plan.saved
    ? "Planejamento salvo com esta sessão."
    : plan.adjustment.sourceDate
      ? "Calculado a partir de uma corrida anterior; abrir a tela não acumula ajustes."
      : "Usa o pace definido em Configurações.";
  return `O esforço real orienta o ritmo. Seus paces base são preservados. ${context}`;
}
function paceMethod(plan) {
  return plan.saved || plan.adjustment.sourceDate || plan.adjustment.pace
    ? `<details class="help-details pace-method"><summary>Entender esta sugestão</summary><p class="caption" data-plan-caption>${paceHelp(plan)}</p></details>`
    : "";
}
function paceAdvice(plan, type) {
  const a = plan.adjustment,
    [min, max] = effortTarget(type),
    reasons = {
      maintain: "Esforço dentro da faixa: manter o ritmo realizado.",
      ease: "Esforço acima da faixa: reduzir o ritmo para o próximo treino.",
      partial:
        "Progressão ativada: metade da pequena correção para desacelerar.",
      calibrate: "Esforço abaixo da faixa: aproximar o ritmo do esforço alvo.",
      progress: "Duas últimas sessões na faixa: avanço de 1% no pace.",
    };
  return `<section class="panel pace-advice ${a.blocked ? "pace-conflict" : ""}" aria-label="Sugestão de ritmo"><p class="eyebrow cyan-text">${plan.saved ? "PLANEJAMENTO REGISTRADO" : a.sourceDate ? "RITMO AJUSTADO AO HISTÓRICO" : "SEU PACE BASE"}</p><div class="pace-advice-title"><h3>${a.pace ? `${paceText(a.pace)} <small>/km</small>` : a.blocked ? "Recalibre seus ritmos" : "Pace não configurado"}</h3><span>Alvo ${min}–${max}/10${type === "interval" ? " nos blocos fortes" : ""}</span></div>
    ${a.sourceDate ? `<p>Referência: ${shortDate(a.sourceDate)} · ${paceText(a.previousPace)}/km · esforço ${a.rpe}/10.</p><p>${reasons[a.reason] || ""}${a.percent ? ` Ajuste de ${a.percent > 0 ? "+" : ""}${weightText(a.percent)}% no tempo por km.` : ""}</p>` : ""}
    ${a.blocked ? `<p class="form-error">${type === "interval" ? "O pace forte sugerido precisa ser mais rápido que a recuperação. As etapas fortes ficam sem estimativa até a recalibração." : "O ritmo calculado ficou fora da faixa de 0:01 a 99:59/km. A distância fica sem estimativa até a recalibração."} <a href="#configuracoes/corrida">Revisar paces base</a>.</p>` : ""}
    ${paceMethod(plan)}</section>`;
}
function runView(type) {
  const plan = getRunPlan(
      type,
      data.settings,
      data.sessions,
      selected,
      selectedWorkout,
    ),
    { blocks, total, snapshot } = plan,
    r = currentSession()?.run,
    v = runDrafts.get(draftKey()) ?? runValues(r),
    missing = !snapshot.easyPace || (type === "interval" && !snapshot.hardPace),
    isLong = type === "long";
  return `<div class="section-title"><div><p class="eyebrow cyan-text">CORRIDA · ${shortDate(selected)}</p><h2>Planejamento da corrida</h2></div></div>
    <div class="run-layout"><div><div class="run-overview panel"><div><small>DURAÇÃO PREVISTA</small><b>${total.minutes}<em>min</em></b></div><div><small>${total.complete ? "DISTÂNCIA ESTIMADA" : "DISTÂNCIA PARCIAL"}</small><b>${total.known ? num(total.km, 2) : "—"}<em>km</em></b></div></div>
    ${missing && !plan.adjustment.blocked ? '<div class="notice">Configure seus paces para estimar a distância. <a href="#configuracoes/corrida">Configurar paces →</a></div>' : ""}
    ${r && !plan.saved ? '<p class="notice subtle">Este registro antigo não guardava o planejamento original. O plano abaixo é uma simulação com as referências atuais.</p>' : ""}
    ${paceAdvice(plan, type)}
    ${isLong ? `<div class="panel long-options"><label for="long-minutes">Duração padrão do longão <strong>${snapshot.longMinutes} min</strong></label><input id="long-minutes" type="range" min="60" max="90" step="5" value="${snapshot.longMinutes}" ${plan.saved ? "disabled" : ""}><div class="range-labels"><span>60 min</span><span>90 min</span></div><p class="caption">${snapshot.easyPace ? `Faixa de 60–90 min: <span id="long-distance-range">${longRangeText(snapshot.easyPace)}</span>. ` : ""}<span data-long-caption>${plan.saved ? "Duração preservada no planejamento registrado." : "Ajusta o padrão dos próximos longões. Escolha conforme sua capacidade atual; a duração não aumenta automaticamente."}</span></p></div>` : ""}
    <div class="timeline" aria-hidden="true">${blocks.map((b) => `<span class="${b.kind}" style="flex:${b.minutes}"></span>`).join("")}</div><div class="run-blocks">${runBlocksView(blocks)}</div>${total.known && !total.complete ? `<p class="caption">Distância parcial: inclui apenas as etapas com pace informado.${type === "interval" && !snapshot.walkPace ? " Caminhada sem estimativa." : ""}</p>` : ""}</div>
    <aside><div class="panel effort-card"><span class="mini-icon">${icon("activity")}</span><h3>${type === "interval" ? "Forte. Sem sprint." : "O ritmo da conversa."}</h3><p>${type === "interval" ? "Blocos fortes em 7–8/10 de esforço: um ritmo repetível, com controle nos oito blocos. O ajuste usa apenas os dados desses blocos." : "Mantenha o esforço em 3–4/10, como no plano original. Você deve conseguir conversar com frases completas e sem dificuldade."}</p><a class="text-link" href="#configuracoes/corrida">Ajustar meus ritmos ${arrow}</a></div>
    <form id="run-form" class="panel run-form"><h3>Como foi a corrida?</h3><p class="run-draft-notice caption" data-run-draft-warning ${runDrafts.has(draftKey()) ? "" : "hidden"}>Rascunho nesta visita. Alterações não salvas se perdem ao recarregar.</p><label>Duração realizada (min)<input name="minutes" type="number" min="0.01" max="1440" step="0.01" inputmode="decimal" required value="${escape(v.minutes ?? "")}" placeholder="Ex.: 30"></label><label>Distância realizada (km)<input name="km" type="number" min="0.001" max="1000" step="0.001" inputmode="decimal" required value="${escape(v.km ?? "")}" placeholder="Ex.: 5"></label><div class="actual-pace">Pace realizado <strong id="actual-pace">${Number(v.minutes) > 0 && Number(v.km) > 0 ? paceText((Number(v.minutes) * 60) / Number(v.km)) : "—"} /km</strong></div><label>Esforço percebido da sessão (0–10)<select name="rpe" required>${effortOptions(v.rpe === "" ? null : Number(v.rpe))}</select></label>
    ${type === "interval" ? `<fieldset class="hard-run-fields"><legend>Blocos fortes <span class="optional">opcional</span></legend><p class="caption" id="hard-run-hint">Preencha os dois campos para ajustar o próximo intervalado. Não use a média da sessão inteira.</p><label>Pace médio dos blocos fortes<input name="hardPace" data-mask="pace" inputmode="numeric" maxlength="5" pattern="[0-9]{1,2}:[0-5][0-9]" value="${escape(v.hardPace ?? "")}" placeholder="mm:ss" aria-describedby="hard-run-hint"></label><label>Esforço dos blocos fortes (0–10)<select name="hardRpe">${effortOptions(v.hardRpe === "" ? null : Number(v.hardRpe))}</select></label></fieldset>` : ""}
    <label>Observações <span class="optional">opcional</span><textarea name="notes" maxlength="2000" rows="3" placeholder="Sensações, percurso, clima…">${escape(v.notes ?? "")}</textarea></label><p id="run-error" class="form-error" role="alert"></p><button class="button primary run-primary" type="submit">${r ? "Salvar alterações" : "Salvar e concluir"} ${icon("check")}</button></form></aside></div>`;
}
function historyView() {
  return renderHistory(data, historyFilters, { mobile: historyMobile.matches });
}
function captureView() {
  const active = document.activeElement,
    field = active?.closest("#main")
      ? {
          id: active.id,
          name: active.name,
          exercise: active.dataset.id,
          index: active.dataset.index,
          field: active.dataset.field,
          action: active.dataset.action,
          historyField: active.dataset.historyField,
        }
      : null;
  return {
    field,
    start: active?.selectionStart,
    end: active?.selectionEnd,
    y: window.scrollY,
    open: [...main.querySelectorAll("details[open]")]
      .map((el) =>
        el.dataset.exercise
          ? `[data-exercise="${el.dataset.exercise}"]`
          : el.dataset.muscleDisclosure
            ? `[data-muscle-disclosure="${el.dataset.muscleDisclosure}"]`
            : el.classList.contains("pace-method")
              ? ".pace-method"
              : el.classList.contains("exercise-history")
                ? `[data-exercise="${el.closest("[data-exercise]").dataset.exercise}"] .exercise-history`
                : null,
      )
      .filter(Boolean),
  };
}
function restoreView(ui) {
  for (const selector of ui.open) {
    const el = main.querySelector(selector);
    if (el) el.open = true;
  }
  let field;
  if (ui.field?.id) field = document.getElementById(ui.field.id);
  else if (ui.field?.name)
    field = main.querySelector(`[name="${CSS.escape(ui.field.name)}"]`);
  else if (ui.field?.field)
    field = main.querySelector(
      `[data-field="${ui.field.field}"][data-id="${ui.field.exercise}"][data-index="${ui.field.index}"]`,
    );
  else if (ui.field?.historyField)
    field = main.querySelector(
      `[data-history-field="${ui.field.historyField}"]`,
    );
  else if (ui.field?.action)
    field = main.querySelector(`[data-action="${ui.field.action}"]`);
  if (!field && ui.field?.action === "clear-history-filters")
    field = historyMobile.matches
      ? $("#history-filters-toggle")
      : $("#history-period");
  fieldControls.focus(field);
  try {
    if (ui.start !== null) field?.setSelectionRange(ui.start, ui.end);
  } catch {}
  window.scrollTo({ top: ui.y, behavior: "instant" });
}
function openDialog(html, compact = false) {
  fieldControls.close();
  disposeMovement();
  dialogReturnFocus = null;
  $("#guide-dialog").classList.toggle("confirm-dialog", compact);
  $("#guide-content").innerHTML = html;
  hydrateIcons($("#guide-content"));
  $("#guide-dialog > .dialog-top")?.remove();
  $("#guide-dialog > .dialog-actions")?.remove();
  $("#guide-dialog").prepend($("#guide-content .dialog-top"));
  const actions = $("#guide-content > .dialog-actions");
  if (actions) $("#guide-dialog").append(actions);
  dialogs.show();
  fieldControls.refresh($("#guide-dialog"));
  $("#guide-content").scrollTop = 0;
  disposeMovement = createMovementPlayer($(".movement-guide"));
}
function confirmSession(onConfirm) {
  const completed = count(selected),
    name = workouts[getType(selected)].name,
    planned = strengthSetCount(getType(selected));
  pendingConfirmation = onConfirm;
  openDialog(
    `<div class="dialog-top"><span class="eyebrow">FECHAR O TREINO</span><button class="close-button" data-action="close-dialog" aria-label="Fechar confirmação">${icon("x")}</button></div><div class="confirm-symbol">${icon("circle-check")}</div><h2 id="guide-title">Concluir sessão?</h2><p class="muted">${name} · ${shortDate(selected)}</p><div class="confirm-progress"><strong>${completed}<span>/${planned}</span></strong><span>séries marcadas</span></div>${completed < planned ? "<p>Você ainda tem séries não marcadas. Pode voltar ao treino ou concluir com os registros atuais.</p>" : ""}<div class="dialog-actions"><button class="button quiet" data-action="close-dialog">Voltar ao treino</button><button class="button primary" data-action="confirm-session">Concluir sessão ${icon("check")}</button></div>`,
    true,
  );
}
function importDialog() {
  importGeneration++;
  pendingImport = null;
  openDialog(
    `<div class="dialog-top"><span class="eyebrow">SEU DIÁRIO, COM VOCÊ</span><button class="close-button" data-action="close-dialog" aria-label="Fechar importação">${icon("x")}</button></div>
    <h2 id="guide-title">Importar backup</h2><p class="muted">Escolha um arquivo JSON exportado pelo HÍBRIDO. Você poderá conferir o conteúdo antes de restaurar.</p>
    <label class="import-dropzone" for="import-file"><span class="import-symbol" aria-hidden="true">${icon("arrow-up")}</span><strong>Escolher arquivo JSON</strong><small>Até 10 MB · versões 1, 2, 3 e 4</small><input id="import-file" type="file" accept="application/json,.json" aria-label="Escolher arquivo JSON"></label>
    <p id="import-file-name" class="import-file-name">Nenhum arquivo selecionado</p><p id="import-file-status" class="caption" role="status">A seleção do arquivo ainda não altera seu diário.</p>
    <p id="import-error" class="form-error" role="alert"></p><section id="import-summary" class="import-summary" aria-label="Resumo do backup" aria-live="polite" hidden></section>
    <p class="import-warning">Restaurar substitui os registros e as configurações da sua conta na nuvem. Requer conexão. Exporte uma cópia do diário atual se quiser guardá-lo.</p>
    <div class="dialog-actions import-actions"><p class="import-action-warning">Restaurar substitui os registros e as configurações da conta.</p><button class="button quiet" data-action="close-dialog">Cancelar</button><button class="button primary" data-action="restore-backup" disabled>Restaurar backup ${icon("check")}</button></div>`,
    true,
  );
}
function clearDialog() {
  const entries = recordedWorkouts(data.sessions).filter(({ workout }) =>
      workoutStarted(workout),
    ),
    total = entries.length;
  pendingConfirmation = async () => {
    try {
      await account.remote.replace(null);
      fieldControls.reset();
      settingsUi.reset();
      runDrafts.clear();
      expanded.clear();
      render();
      notify("Diário apagado da conta.");
    } catch (error) {
      notify(
        error.message || "Não foi possível limpar. O diário foi preservado.",
      );
    }
  };
  openDialog(
    `<div class="dialog-top"><span class="eyebrow">SEU DIÁRIO NA NUVEM</span><button class="close-button" data-action="close-dialog" aria-label="Fechar confirmação">${icon("x")}</button></div><h2 id="guide-title">Limpar este diário?</h2><p class="muted">${total ? `${total} ${total === 1 ? "sessão registrada será apagada" : "sessões registradas serão apagadas"}` : "As configurações deste app serão apagadas"}, junto com os paces e as preferências salvas na sua conta.</p><p class="import-warning">Requer conexão. Essa ação não pode ser desfeita pelo app. Guarde um backup antes de continuar.</p><div class="dialog-actions"><button class="button quiet" data-action="close-dialog">Manter meu diário</button><button class="button danger" data-action="confirm-action">Apagar dados deste app</button></div>`,
    true,
  );
}
function guide(id) {
  const ex = exercises[id],
    ref = references[id];
  openDialog(
    `<div class="dialog-top"><span class="eyebrow">GUIA DE MOVIMENTO</span><button class="close-button" data-action="close-dialog" aria-label="Fechar guia">×</button></div>${tag(ex.muscles)}<h2 id="guide-title">${ex.name}</h2><p class="muted">${ex.variant}</p>${illustration(ex)}<div class="guide-sections">${[
      ["01", "Prepare a posição", ex.setup],
      ["02", "Execute com controle", ex.execution],
      ["03", "Respire", ex.breathing],
      ["04", "Pontos de atenção", ex.mistakes],
    ]
      .map(
        ([n, title, text]) =>
          `<section><span>${n}</span><div><h3>${title}</h3><p>${text}</p></div></section>`,
      )
      .join(
        "",
      )}</div>${id === "reverse-crunch" ? '<p class="caption">A demonstração de referência usa o chão. Aqui, o mesmo movimento de elevação da pelve é adaptado ao banco, com a cabeça e as costas apoiadas.</p>' : ""}<div class="guide-footer">${ref ? `${link(ref.demo, "▷ Ver demonstração", "button primary", `Ver demonstração de ${ex.name}, abre em nova aba`)}${link(ref.source, "Fonte do exercício", "source-link", `Fonte de ${ex.name}, abre em nova aba`)}` : "<p>As referências não carregaram. Recarregue a página com internet para acessar os links.</p>"}</div>`,
  );
}
function sources() {
  openDialog(
    `<div class="dialog-top"><span class="eyebrow">TRANSPARÊNCIA</span><button class="close-button" data-action="close-dialog" aria-label="Fechar fontes">×</button></div><h2 id="guide-title">Fontes e método</h2><p>Plano de @thalleshirakawa, com exercícios, séries e durações do post original.</p>${link("https://www.instagram.com/p/Dd8zBnRkXkR/", "Plano original")}<h3>Corrida</h3><p>Usamos seu pace informado para converter duração em distância e velocidade. Não estimamos capacidade fisiológica nem aplicamos automaticamente as zonas VDOT.</p>${link("https://www.cdc.gov/physical-activity-basics/measuring/index.html", "CDC · intensidade relativa e teste da conversa")}${link("https://vdoto2.com/calculator/", "V.O2 · referência sobre ritmos de treino")}<p>O esforço 3–4/10 e o intervalado de 3 min + 1 min são do post. O V.O2 é referência conceitual de ritmos, não a origem dessa sessão nem uma fórmula aplicada pelo app.</p><h3>Progressão</h3><p>Ajustamos segundos por km em 2,5% por ponto fora da faixa, até +10% ou −5%. Com progressão ativa: metade da desaceleração para excesso de 1–2 pontos; excesso de 3 ou mais mantém correção integral. Duas últimas sessões equivalentes na faixa permitem −1%, sem somar outra correção. Essa é uma heurística do app, não uma conversão fisiológica exata.</p><p>A carga sugerida usa a referência de cada série: aumenta pelo percentual escolhido ao atingir 8 repetições. Esse gatilho foi escolhido para este plano.</p>${link("https://pubmed.ncbi.nlm.nih.gov/19204579/", "ACSM · progressão em musculação (2009)")}<h3>Musculação</h3><p>Textos resumidos em português e ilustrações esquemáticas originais. As demonstrações externas podem mostrar equipamentos ou variantes diferentes; observe as notas de cada guia.</p><div class="source-list">${Object.values(
      exercises,
    )
      .map((ex) =>
        references[ex.id]
          ? link(references[ex.id].source, ex.name)
          : `<p>${ex.name}: referência indisponível neste momento.</p>`,
      )
      .join(
        "",
      )}</div><p class="caption">Referências consultadas em 20/10/2026. Vídeos dependem dos sites de origem.</p>`,
  );
}
function addWorkoutDialog() {
  openDialog(
    `<div class="dialog-top"><span class="eyebrow">${escape(fullDate(selected))}</span><button class="close-button" data-action="close-dialog" aria-label="Fechar adição de treino">×</button></div><h2 id="guide-title">Adicionar treino</h2><p>Os treinos desta data serão mantidos.</p><form id="add-workout-form" data-date="${selected}"><label>Treino<select name="type" required>${Object.entries(
      workouts,
    )
      .filter(([type]) => type !== "rest")
      .map(([type, w]) => `<option value="${type}">${escape(w.name)}</option>`)
      .join(
        "",
      )}</select></label><div class="dialog-actions"><button type="button" class="button quiet" data-action="close-dialog">Cancelar</button><button type="submit" class="button primary">Adicionar treino</button></div></form>`,
    true,
  );
}
function moveWorkoutDialog(id) {
  const item = scheduledWorkouts(data, selected).find((s) => s.id === id);
  if (!item || workoutStarted(item) || runDrafts.has(draftKey(selected, id)))
    return;
  openDialog(
    `<div class="dialog-top"><span class="eyebrow">${escape(workouts[item.type].name)}</span><button class="close-button" data-action="close-dialog" aria-label="Fechar remanejamento">×</button></div><h2 id="guide-title">Mover treino</h2><form id="move-workout-form" data-date="${selected}" data-workout="${id}"><label>Data de destino<input type="date" name="destination" required></label><p class="caption" data-move-preview role="status">Os treinos do destino serão mantidos. Se a origem ficar sem treinos, será um dia de descanso.</p><p class="form-error" data-move-error role="alert"></p><div class="dialog-actions"><button type="button" class="button quiet" data-action="close-dialog">Cancelar</button><button type="submit" class="button primary">Mover treino</button></div></form>`,
    true,
  );
}
document.addEventListener("click", (event) => {
  if (account.blocked) return;
  const filterCard = event.target.closest(".history-filters");
  if (
    historyMobile.matches &&
    filterCard &&
    !event.target.closest(
      "button,input,select,textarea,label,a,[role],.field-control,.form-error,.history-filter-pending,.history-date-range p",
    ) &&
    !window.getSelection()?.toString()
  ) {
    historyFilters.expanded = !historyFilters.expanded;
    syncHistoryDisclosure();
    return;
  }
  const summary = event.target.closest(
    "details[data-exercise] > summary, details[data-plan-day] > summary",
  );
  if (summary) {
    event.preventDefault();
    accordions.toggle(summary.parentElement);
    return;
  }
  const link = event.target.closest('a[href^="#"]');
  if (
    link &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey &&
    event.button === 0
  ) {
    const hash = link.getAttribute("href").slice(1);
    if (isAppHash(hash)) {
      event.preventDefault();
      if (hash === "hoje" || link.hasAttribute("data-open-today")) {
        selectDay(dateKey(), null, { keepScroll: false });
        return;
      }
      if (hash === "semana") {
        selectDay(dateKey(), null, { keepScroll: false });
        $("#week-navigation")?.scrollIntoView({ block: "start" });
        return;
      }
      if (hash === "session") {
        selectDay(selected, selectedWorkout, { session: true });
        return;
      }
      navigateTo(hash);
      return;
    }
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "step-load") {
    const { id, index, direction } = button.dataset;
    if (withoutWeight(data.sessions, selected, id, selectedWorkout)) return;
    const input = $(
      `[data-exercise="${id}"] [data-field="kg"][data-index="${index}"]`,
    );
    const current = Number.isFinite(input.valueAsNumber)
      ? input.valueAsNumber
      : 0;
    const next =
      Number(direction) > 0
        ? (Math.floor(current * 2 + 1e-9) + 1) / 2
        : (Math.ceil(current * 2 - 1e-9) - 1) / 2;
    input.value = Math.max(0, Math.min(2000, next));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (action === "use-load") {
    const id = button.dataset.id,
      index = Number(button.dataset.index);
    if (
      withoutWeight(data.sessions, selected, id, selectedWorkout) ||
      currentSession()?.sets?.[id]?.[index]?.done
    )
      return;
    const suggestion = loadSuggestions(
      data.sessions,
      selected,
      id,
      data.settings.loadProgression,
    )[index];
    if (!suggestion?.usable) return;
    const s = exerciseSession(id);
    s.sets[id][index].kg = suggestion.kg;
    s.done = false;
    const input = $(
      `[data-exercise="${id}"] [data-field="kg"][data-index="${index}"]`,
    );
    input.value = suggestion.kg;
    persist("Carga aplicada.");
    syncStrength(id);
    motion.feedback(input);
    return;
  }
  if (action === "guide") return guide(button.dataset.id);
  if (action === "sources") return sources();
  if (action === "close-dialog") return dialogs.close();
  if (action === "confirm-session" || action === "confirm-action") {
    dialogs.close(pendingConfirmation);
    return;
  }
  if (action === "add-workout") return addWorkoutDialog();
  if (action === "move-workout")
    return moveWorkoutDialog(button.dataset.workout);
  if (action === "select-workout") {
    selectDay(selected, button.dataset.workout, { session: true });
    return;
  }
  if (action === "day" || action === "open-day") {
    selectDay(button.dataset.date, button.dataset.workout, {
      session: action === "open-day",
      keepScroll: action !== "open-day",
    });
    return;
  }
  if (action === "reset-day" || action === "current-week") {
    selectDay(dateKey());
    return;
  }
  if (action === "prev-week" || action === "next-week") {
    selectDay(addDays(selected, action === "prev-week" ? -7 : 7));
    return;
  }
  if (action === "more-history") {
    historyFilters.limit += 20;
    render({ preserve: true });
    announceHistory();
    return;
  }
  if (action === "toggle-history-filters") {
    if (!historyMobile.matches) return;
    historyFilters.expanded = !historyFilters.expanded;
    syncHistoryDisclosure();
    return;
  }
  if (action === "clear-history-filters") {
    fieldControls.reset();
    historyFilters = clearHistoryFilters(historyFilters);
    render({ preserve: true });
    announceHistory();
    return;
  }
  if (action === "finish-strength") {
    if (currentSession()?.done) {
      session().done = false;
      persist("Sessão reaberta.");
      syncStrength();
      return;
    }
    const key = selected,
      id = selectedWorkout;
    confirmSession(() => {
      session(key, id).done = true;
      persist("Sessão concluída. Bom trabalho!");
      syncStrength();
      motion.feedback($(".week-summary .progress-ring b"));
    });
    return;
  }
  if (action === "export") {
    const text = JSON.stringify(data, null, 2);
    const blob = new Blob([text], { type: "application/json" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `hibrido-backup-${dateKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Backup exportado.");
    return;
  }
  if (action === "import") return importDialog();
  if (action === "restore-backup") {
    const imported = pendingImport;
    if (!imported) return;
    dialogs.close(async () => {
      try {
        await account.remote.replace(imported);
        fieldControls.reset();
        settingsUi.reset();
        runDrafts.clear();
        expanded.clear();
        render();
        notify("Backup restaurado na nuvem.");
      } catch (error) {
        notify(
          error.message ||
            "Não foi possível restaurar. Confira seu diário na nuvem antes de tentar novamente.",
        );
      }
    });
    return;
  }
  if (action === "clear") return clearDialog();
});
document.addEventListener(
  "toggle",
  (event) => {
    if (
      event.target.matches?.("details[data-exercise], details[data-plan-day]")
    ) {
      const open =
        event.target.dataset.expanded === undefined
          ? event.target.open
          : event.target.dataset.expanded === "true";
      rememberDisclosure(event.target, open);
    }
  },
  true,
);
document.addEventListener("change", async (event) => {
  if (account.blocked) return;
  const input = event.target;
  if (input.closest("[data-settings-form]")) return;
  if (input.dataset.historyField) {
    historyFilters = updateHistoryFilters(
      historyFilters,
      input.dataset.historyField,
      input.value,
    );
    render({ preserve: true, preserveHistoryCard: input.type === "date" });
    announceHistory();
    return;
  }
  if (input.closest("#run-form")) {
    captureRunDraft();
    syncTodayStatus();
  }

  if (input.dataset.withoutWeight) {
    const id = input.dataset.withoutWeight,
      s = exerciseSession(id);
    s.withoutWeight[id] = input.checked;
    s.done = false;
    persist();
    syncStrength(id);
    return;
  }
  if (input.dataset.field) {
    if (
      input.dataset.field === "kg" &&
      input.value !== "" &&
      Number.isFinite(input.valueAsNumber) &&
      input.valueAsNumber >= 0 &&
      input.valueAsNumber <= 2000
    ) {
      input.value = roundLoadUp(input.valueAsNumber * 2) / 2;
    }
    if (!input.checkValidity()) {
      input.reportValidity();
      return;
    }
    const id = input.dataset.id,
      s = exerciseSession(id),
      i = Number(input.dataset.index),
      field = input.dataset.field;
    s.sets[id] ??= emptySets();
    s.sets[id][i][field] =
      field === "done"
        ? input.checked
        : input.value === ""
          ? ""
          : Number(input.value);
    s.done = false;
    persist();
    syncStrength(id);
    if (field === "done") motion.feedback(input.nextElementSibling);
    return;
  }
  if (input.id === "long-minutes") return;
  if (input.id === "import-file") {
    const generation = ++importGeneration;
    pendingImport = null;
    const restoreButton = $('[data-action="restore-backup"]');
    restoreButton.disabled = true;
    $("#import-summary").hidden = true;
    $("#import-error").textContent = "";
    const file = input.files[0];
    $("#import-file-name").textContent =
      file?.name || "Nenhum arquivo selecionado";
    if (!file) return;
    $("#import-file-status").textContent = "Lendo e validando…";
    try {
      if (file.size > 10_000_000) throw Error("O backup deve ter até 10 MB.");
      const parsed = JSON.parse(await file.text());
      const imported = validateBackup(parsed);
      if (generation !== importGeneration || !$("#import-summary")) return;
      pendingImport = imported;
      const entries = recordedWorkouts(imported.sessions);
      $("#import-summary").innerHTML = backupSummary(imported, parsed.version);
      $("#import-summary").hidden = false;
      $("#import-file-status").textContent =
        "Arquivo validado. Confira o resumo antes de restaurar.";
      restoreButton.disabled = false;
    } catch (error) {
      if (generation !== importGeneration || !$("#import-error")) return;
      $("#import-file-status").textContent =
        "Escolha outro arquivo para tentar novamente.";
      $("#import-error").textContent =
        error instanceof SyntaxError
          ? "Arquivo JSON inválido. Seu diário foi preservado."
          : error.message;
    }
  }
});
document.addEventListener("input", (event) => {
  if (account.blocked) return;
  const input = event.target;
  if (input.closest("[data-settings-form]")) return;
  if (input.id === "long-minutes" && !input.disabled) {
    data.settings.longMinutes = Number(input.value);
    persist();
    syncLongRun();
    return;
  }
  if (input.dataset.mask)
    applyTimeMask(input, (value) =>
      maskTime(value, input.dataset.mask === "duration" ? 6 : 4),
    );
  if (
    input.dataset.field &&
    input.dataset.field !== "done" &&
    input.checkValidity()
  ) {
    const id = input.dataset.id,
      s = exerciseSession(id);
    s.sets[id] ??= emptySets();
    s.sets[id][Number(input.dataset.index)][input.dataset.field] =
      input.value === "" ? "" : Number(input.value);
    s.done = false;
    persist();
    syncStrength(id);
  }
  if (input.closest("#move-workout-form") && input.name === "destination") {
    const preview = $("[data-move-preview]");
    if (validDate(input.value)) {
      const items = scheduledWorkouts(data, input.value);
      preview.textContent = `Destino: ${fullDate(input.value)}. ${items.length ? items.map((s) => workouts[s.type].name).join(", ") + " serão mantidos." : "Dia de descanso."} A origem sem treinos ficará em descanso.`;
    }
  }
  if (event.target.closest("#run-form")) {
    captureRunDraft();
    syncTodayStatus();
    const form = $("#run-form"),
      m = Number(form.elements.minutes.value),
      km = Number(form.elements.km.value);
    $("#actual-pace").textContent =
      `${m > 0 && km > 0 ? paceText((m * 60) / km) : "—"} /km`;
  }
});
document.addEventListener("submit", (event) => {
  if (account.blocked) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  const form = event.target,
    values = Object.fromEntries(new FormData(form));
  if (form.matches("[data-settings-form]")) return;
  if (!form.reportValidity()) return;
  if (form.id === "add-workout-form") {
    const date = form.dataset.date;
    form.querySelector('[type="submit"]').disabled = true;
    dialogs.close(() => {
      const item = addWorkout(data, date, values.type);
      persist();
      selectDay(date, item.id, { keepScroll: false });
    });
    return;
  }
  if (form.id === "move-workout-form") {
    const from = form.dataset.date,
      id = form.dataset.workout,
      to = values.destination;
    if (to === from) {
      $("[data-move-error]").textContent =
        "Escolha uma data diferente da origem.";
      return;
    }
    if (
      runDrafts.has(draftKey(from, id)) ||
      workoutStarted(scheduledWorkouts(data, from).find((s) => s.id === id))
    ) {
      $("[data-move-error]").textContent =
        "Treinos iniciados devem permanecer na data original.";
      return;
    }
    form.querySelector('[type="submit"]').disabled = true;
    dialogs.close(() => {
      try {
        moveWorkout(data, from, to, id);
        persist();
        selectDay(to, id, { keepScroll: false });
      } catch (error) {
        notify(error.message);
      }
    });
    return;
  }
  if (form.id === "run-form") {
    const s = session(),
      previous = s.run;
    let hardPace = null,
      hardRpe = null;
    if (s.type === "interval") {
      const hasPace = values.hardPace !== "",
        hasRpe = values.hardRpe !== "";
      if (hasPace !== hasRpe || (hasPace && !parsePace(values.hardPace))) {
        $("#run-error").textContent =
          "Preencha pace e esforço dos blocos fortes juntos, ou deixe os dois vazios. Use um pace maior que zero no formato mm:ss.";
        form.elements[
          !hasPace || !parsePace(values.hardPace) ? "hardPace" : "hardRpe"
        ].focus();
        return;
      }
      if (hasPace) {
        hardPace = parsePace(values.hardPace);
        hardRpe = Number(values.hardRpe);
      }
    }
    const plan =
      previous?.plan ??
      (!previous
        ? getRunPlan(
            s.type,
            data.settings,
            data.sessions,
            selected,
            selectedWorkout,
          ).snapshot
        : null);
    s.run = {
      minutes: Number(values.minutes),
      km: Number(values.km),
      rpe: Number(values.rpe),
      notes: values.notes.trim(),
      paceRevision: previous
        ? (previous.paceRevision ?? 0)
        : paceRevision(data.settings, s.type),
      ...(s.type === "interval" ? { hardPace, hardRpe } : {}),
      ...(plan ? { plan } : {}),
    };
    $("#run-error").textContent = "";
    if (plan) {
      const slider = $("#long-minutes");
      if (slider) slider.disabled = true;
      $(".pace-advice .eyebrow").textContent = "PLANEJAMENTO REGISTRADO";
      const savedPlan = getRunPlan(
        s.type,
        data.settings,
        data.sessions,
        selected,
        selectedWorkout,
      );
      const caption = $(".pace-advice [data-plan-caption]");
      if (caption) caption.textContent = paceHelp(savedPlan);
      else
        $(".pace-advice").insertAdjacentHTML(
          "beforeend",
          paceMethod(savedPlan),
        );
      const longCaption = $("[data-long-caption]");
      if (longCaption)
        longCaption.textContent =
          "Duração preservada no planejamento registrado.";
    }
    s.done = true;
    const key = draftKey(),
      submitted = JSON.stringify(runDrafts.get(key));
    persist("Corrida registrada. Mais um treino na conta!").then((saved) => {
      if (saved && JSON.stringify(runDrafts.get(key)) === submitted) {
        runDrafts.delete(key);
        if (key === draftKey()) {
          const notice = $("[data-run-draft-warning]");
          if (notice) notice.hidden = true;
          syncTodayStatus();
        }
      }
    });
    syncTodayStatus();
    $("#run-form button[type=submit]").innerHTML =
      `Salvar alterações ${icon("check")}`;
    motion.feedback($("#run-form button[type=submit]"));
  }
});
function handleLocation() {
  if (account.blocked) return;
  if (location.hash === "#main") return;
  if (location.hash === "#semana") {
    selectDay(dateKey(), null, { keepScroll: false, replace: true });
    $("#week-navigation")?.scrollIntoView({ block: "start" });
    return;
  }
  if (location.hash === "#hoje") {
    selectDay(dateKey(), null, { keepScroll: false, replace: true });
    return;
  }
  if (location.hash === "#session") {
    selectDay(selected, selectedWorkout, { session: true, replace: true });
    return;
  }
  applyNavigation(routeFromHash(), { session: location.hash === "#session" });
}
window.addEventListener("hashchange", handleLocation);
window.addEventListener("popstate", handleLocation);
$("#guide-dialog").addEventListener("click", (event) => {
  if (event.target === $("#guide-dialog")) {
    const r = event.target.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialogs.close();
  }
});
document.addEventListener("focusout", (event) => {
  if (
    !event.target.closest("[data-settings-form]") &&
    event.target.dataset.mask === "duration"
  ) {
    const seconds = parseDuration(event.target.value);
    if (seconds) event.target.value = durationText(seconds);
  }
});
account.update = (next, force = false) => {
  if (account.blocked) return;
  const stable = (value) =>
    JSON.stringify(value, (_key, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(
            Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
          )
        : v,
    );
  const changed = stable(data) !== stable(next);
  data = next;
  if (changed || force) render({ preserve: true });
};
account.lock = () => {
  fieldControls.reset();
  disposeMovement();
  dialogs.close();
  settingsUi.reset();
  runDrafts.clear();
  data = defaults();
  account.data = null;
  main.replaceChildren();
};
render();
if (location.hash === "#semana")
  $("#week-navigation")?.scrollIntoView({ block: "start" });
if (location.hash === "#session") scrollToSession();
