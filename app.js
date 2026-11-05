import { account } from "./lib/account.js";
import { notify } from "./lib/notifications.js";
import {
  defaults,
  scheduledWorkouts,
  materializeDay,
  workoutStarted,
  workoutState,
  recordedWorkouts,
  weekSummary,
  addWorkout,
  moveWorkout,
  cancelWorkout,
  reactivateWorkout,
  reopenWorkout,
  completeWorkout,
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
} from "./lib/core.js?v=6.0.0";
import {
  withoutWeight,
  loadSuggestions,
  roundLoadUp,
  getRunPlan,
  paceRevision,
  effortTarget,
} from "./lib/progression.js?v=6.0.0";
import { workouts, exercises } from "./lib/exercises.js";
import { muscleMap, createMuscleMapController } from "./lib/muscle-map.js";
import {
  runBlocksView,
  heartRateNotice,
  runDetailsView,
} from "./lib/run-view.js?v=6.1.0";
import { plansView } from "./lib/plans-view.js?v=6.1.0";
import { resolveRoute, isAppHash } from "./lib/routes.js?v=4.0.0";
import {
  settingsView,
  createSettingsController,
  settingsSections,
} from "./lib/settings.js?v=6.1.0";
import { createMobileNav } from "./lib/mobile-nav.js?v=6.1.0";
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
import { createFieldControls } from "./lib/field-controls.js?v=6.1.0";
import {
  workoutHero,
  dayContents,
  dayLabel,
  statusBadge,
  summaryDetails,
} from "./lib/workout-view.js";
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
const pendingReorganizations = new WeakMap();
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
    items.find((s) => !s.done && !s.canceledAt) ??
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
  if (item.canceledAt) throw Error("Reative o treino antes de registrar.");
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
    scheduledWorkouts(data, date).find((s) => !s.done && !s.canceledAt)?.id ??
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
  const details = $("[data-summary-details]");
  if (details) details.innerHTML = summaryDetails(summary);
  document.querySelectorAll(".week-strip .day").forEach((button) => {
    const key = button.dataset.date,
      items = scheduledWorkouts(data, key),
      states = items.map((item) => stateFor(item, key));
    button.setAttribute("aria-label", dayLabel(key, items, states));
    if (key === dateKey()) button.setAttribute("aria-current", "date");
    else button.removeAttribute("aria-current");
    button.innerHTML = dayContents(key, items, states);
  });
  const hero = $(".hero");
  if (hero) {
    const focused = hero.contains(document.activeElement)
      ? document.activeElement
      : null;
    const focusAction = focused?.dataset.action,
      focusHref = focused?.getAttribute("href");
    const fresh = document.createElement("div");
    fresh.innerHTML = heroView();
    hero.className = fresh.firstElementChild.className;
    hero.innerHTML = fresh.firstElementChild.innerHTML;
    if (focused) {
      const next = [...hero.querySelectorAll("button,a")].find((el) =>
        focusAction
          ? el.dataset.action === focusAction
          : el.getAttribute("href") === focusHref,
      );
      (
        next ?? hero.querySelector(".hero-actions button,.hero-actions a")
      )?.focus({ preventScroll: true });
    }
  }
  const todayButton = $('[data-action="reset-day"]');
  if (todayButton) todayButton.hidden = selected === dateKey();
  document.querySelectorAll("[data-workout-status]").forEach((el) => {
    const item = scheduledWorkouts(data, selected).find(
      (s) => s.id === el.dataset.workoutStatus,
    );
    el.innerHTML = statusBadge(stateFor(item));
  });
  document.querySelectorAll('[data-action="move-workout"]').forEach((el) => {
    const item = scheduledWorkouts(data, selected).find(
      (s) => s.id === el.dataset.workout,
    );
    el.disabled = !canReorganize(item);
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
  $(".run-overview strong").textContent = `${total.minutes} min`;
  const range = $("#long-distance-range");
  if (range) range.textContent = longRangeText(snapshot.easyPace);
  $("#session .run-blocks").innerHTML = runBlocksView(blocks);
  const help = $("#session .run-details"),
    open = help.open;
  const plan = getRunPlan(
    "long",
    data.settings,
    data.sessions,
    selected,
    selectedWorkout,
  );
  help.outerHTML = runDetailsView(
    blocks,
    snapshot.heartRate,
    "long",
    paceMethod(plan, "long"),
  );
  $("#session .run-details").open = open;
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
  if (route.section === "hoje" && matchMedia("(max-width: 600px)").matches) {
    const strip = $(".week-strip"),
      day = strip?.querySelector(".selected");
    if (day)
      strip.scrollLeft +=
        day.getBoundingClientRect().left -
        strip.getBoundingClientRect().left -
        (strip.clientWidth - day.offsetWidth) / 2;
  }
  if (ui) restoreView(ui);
}
function stateFor(item, date = selected) {
  return workoutState(item, {
    date,
    hasDraft: runDrafts.has(draftKey(date, item?.id)),
  });
}
function canReorganize(item) {
  return Boolean(
    item &&
      !item.canceledAt &&
      !workoutStarted(item) &&
      !runDrafts.has(draftKey(selected, item.id)),
  );
}
function weekStrip(start = weekStart(selected)) {
  return `<div class="week-strip" role="group" aria-label="Dias da semana">${Array.from(
    { length: 7 },
    (_, i) => {
      const key = addDays(start, i),
        items = scheduledWorkouts(data, key),
        states = items.map((item) => stateFor(item, key));
      return `<button class="day ${key === selected ? "selected" : ""} ${items[0] ? workouts[items[0].type].kind : "rest"}" data-action="day" data-date="${key}" aria-pressed="${key === selected}" ${key === dateKey() ? 'aria-current="date"' : ""} aria-label="${escape(dayLabel(key, items, states))}">${dayContents(key, items, states)}</button>`;
    },
  ).join("")}</div>`;
}
function dayWorkoutsView() {
  const items = scheduledWorkouts(data, selected);
  return `<section class="day-workouts" aria-label="Treinos do dia"><div class="section-title"><h2>Treinos do dia</h2><button class="button quiet" data-action="add-workout">Adicionar treino ${icon("plus")}</button></div><div class="day-workout-list">${items.map((item) => `<article class="panel day-workout ${item.id === selectedWorkout ? "is-selected" : ""}"><button class="workout-select" data-action="select-workout" data-workout="${item.id}" aria-pressed="${item.id === selectedWorkout}"><b>${workouts[item.type].name}</b><span data-workout-status="${item.id}">${statusBadge(stateFor(item))}</span><span>${item.id === selectedWorkout ? "Em exibição" : "Abrir"} ${icon("arrow-down")}</span></button>${item.canceledAt ? `<button class="text-button" data-action="reactivate-workout" data-workout="${item.id}">Reativar</button>` : `<button class="text-button" data-action="move-workout" data-workout="${item.id}" ${canReorganize(item) ? "" : "disabled"} aria-label="Reorganizar ${workouts[item.type].name}" aria-describedby="reorganize-help">Reorganizar</button>`}</article>`).join("")}</div><p class="caption" id="reorganize-help">Treinos com registros não podem ser movidos ou cancelados.${items.some((item) => runDrafts.has(draftKey(selected, item.id))) ? " Salve o rascunho de corrida antes de reorganizar." : ""}</p></section>`;
}
function heroView() {
  const item = currentSession();
  return workoutHero(item, selected, data.settings, {
    hasDraft: runDrafts.has(draftKey(selected, item?.id)),
  });
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
    `<div class="dashboard-grid">${heroView()}<section class="week-summary panel"><h2>Resumo da semana</h2><div class="progress-ring" style="--progress:${summary.planned ? (summary.done / summary.planned) * 100 : 0}%"><div><b>${summary.done}<small>/${summary.planned}</small></b><span>treinos concluídos</span></div></div><p class="caption">Concluídos / programados</p><div class="split-stat"><span>Musculação <b>${summary.strength.done}/${summary.strength.planned}</b></span><span>Corrida <b>${summary.run.done}/${summary.run.planned}</b></span></div><p class="summary-details" data-summary-details>${summaryDetails(summary)}</p></section></div>
  <section id="week-navigation" aria-label="Navegação semanal"><div class="week-controls"><button class="button quiet" data-action="prev-week" aria-label="Semana anterior">←</button><h2>${shortDate(start)} — ${shortDate(addDays(start, 6))}</h2><button class="button quiet" data-action="next-week" aria-label="Próxima semana">→</button><button class="text-button" data-action="current-week" ${weekStart(selected) === weekStart(dateKey()) ? "hidden" : ""}>Semana atual</button></div>${weekStrip(start)}</section>${dayWorkoutsView()}<section id="session" class="session-section" data-workout-id="${escape(selectedWorkout ?? "")}">${sessionView(getType(selected))}</section>`
  );
}
function sessionView(type) {
  const w = workouts[type];
  if (currentSession()?.canceledAt)
    return `<div class="panel canceled-session"><span class="eyebrow">TREINO CANCELADO</span><h2>O plano continua aqui.</h2><p>Reative o treino para registrar seus resultados.</p>${w.kind === "strength" ? `<ul>${w.ids.map((id) => `<li><span>${escape(exercises[id].name)}</span><button class="text-button" data-action="guide" data-id="${id}">Como fazer ${icon("arrow-up-right")}</button></li>`).join("")}</ul>` : `<p>${escape(w.subtitle)} · ${type === "interval" ? "40 minutos, 8 blocos" : type === "easy" ? "30 minutos" : data.settings.longMinutes + " minutos"}</p>`}<button class="button quiet" data-action="reactivate-workout" data-workout="${selectedWorkout}">Reativar treino ${icon("rotate-ccw")}</button></div>`;
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
function paceMethod(plan, type) {
  const a = plan.adjustment;
  const reasons = {
    maintain: "Esforço na faixa: manter o ritmo realizado.",
    ease: "Esforço acima da faixa: reduzir o ritmo.",
    partial: "Progressão ativa: metade da pequena correção para desacelerar.",
    calibrate: "Esforço abaixo da faixa: aproximar do alvo.",
    progress: "Duas corridas na faixa: avanço de 1% no pace.",
  };
  return `<section class="pace-method"><h3>Ritmo e esforço</h3><p class="caption" data-plan-caption>${paceHelp(plan)}</p><p>Alvo ${effortTarget(type).join("–")}/10${type === "interval" ? " nos blocos fortes" : ""}.</p>${a.sourceDate ? `<p>${reasons[a.reason] || ""}</p><p>Referência: ${shortDate(a.sourceDate)} · ${paceText(a.previousPace)}/km · esforço ${a.rpe}/10.${a.percent ? ` Ajuste de ${a.percent > 0 ? "+" : ""}${weightText(a.percent)}% no tempo por km.` : ""}</p>` : ""}${type === "long" && plan.snapshot.easyPace ? `<p>Faixa de 60–90 min: <span id="long-distance-range">${longRangeText(plan.snapshot.easyPace)}</span>.</p>` : ""}</section>`;
}
function paceAdvice(plan, type) {
  return `<div class="pace-advice ${plan.adjustment.blocked ? "pace-conflict" : ""}" aria-label="Origem do ritmo"><p class="eyebrow cyan-text">${plan.saved ? "Plano registrado" : plan.adjustment.sourceDate ? "Ritmo ajustado" : "Pace base"}</p>${plan.adjustment.blocked ? `<p class="form-error">${type === "interval" ? "O pace forte sugerido precisa ser mais rápido que a recuperação. As etapas fortes ficam sem estimativa até a recalibração." : "O ritmo calculado ficou fora da faixa de 0:01 a 99:59/km. A distância fica sem estimativa até a recalibração."} <a href="#configuracoes/corrida">Revisar paces base</a>.</p>` : ""}</div>`;
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
    <div class="run-layout"><div><div class="run-overview"><span>Duração prevista</span><strong>${total.minutes} min</strong></div>
    ${missing && !plan.adjustment.blocked ? '<div class="notice">Configure seus paces para estimar a distância. <a href="#configuracoes/corrida">Configurar paces →</a></div>' : ""}
    ${r && !plan.saved ? '<p class="notice subtle">Este registro antigo não guardava o planejamento original. O plano abaixo é uma simulação com as referências atuais.</p>' : ""}
    ${paceAdvice(plan, type)}
    ${heartRateNotice(snapshot.heartRate, Boolean(r && !snapshot.heartRate))}
    ${isLong ? `<div class="panel long-options"><label for="long-minutes">Duração padrão do longão <strong>${snapshot.longMinutes} min</strong></label><input id="long-minutes" type="range" min="60" max="90" step="5" value="${snapshot.longMinutes}" ${plan.saved ? "disabled" : ""}><div class="range-labels"><span>60 min</span><span>90 min</span></div><p class="caption"><span data-long-caption>${plan.saved ? "Duração preservada no planejamento registrado." : "Padrão dos próximos longões. A duração não aumenta automaticamente."}</span></p></div>` : ""}
    <div class="timeline" aria-hidden="true">${blocks.map((b) => `<span class="${b.kind}" style="flex:${b.minutes}"></span>`).join("")}</div><div class="run-blocks">${runBlocksView(blocks)}</div>${runDetailsView(blocks, snapshot.heartRate, type, paceMethod(plan, type))}</div>
    <aside>
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
    `<div class="dialog-top"><span class="eyebrow">TRANSPARÊNCIA</span><button class="close-button" data-action="close-dialog" aria-label="Fechar fontes">×</button></div><h2 id="guide-title">Fontes e método</h2><p>Plano de @thalleshirakawa, com exercícios, séries e durações do post original.</p>${link("https://www.instagram.com/p/Dd8zBnRkXkR/", "Plano original")}<h3>Corrida</h3><p>Usamos seu pace informado para converter duração em distância e velocidade. Não estimamos capacidade fisiológica nem aplicamos automaticamente as zonas VDOT.</p>${link("https://www.cdc.gov/physical-activity-basics/measuring/index.html", "CDC · intensidade relativa e teste da conversa")}${link("https://vdoto2.com/calculator/", "V.O2 · referência sobre ritmos de treino")}<p>O esforço 3–4/10 e o intervalado de 3 min + 1 min são do post. O V.O2 é referência conceitual de ritmos, não a origem dessa sessão nem uma fórmula aplicada pelo app.</p><h3>Frequência cardíaca</h3><p>As metas por etapa são uma orientação adotada pelo app usando percentuais da FC máxima: leve e longão em Z2 (60–70%), aquecimento e recuperação em Z1–Z2 (50–70%), blocos fortes em Z4 (80–90%) e caminhada em direção a Z1 (50–60%). Não são uma conversão de batimentos em pace.</p><p>Calculamos a idade pelo mês/ano de nascimento e estimamos 220 − idade para masculino ou 226 − idade para feminino. As fórmulas por sexo são a convenção adotada neste app. Os limites das faixas são arredondados para bpm inteiros. Uma estimativa pela idade pode diferir da FC máxima real.</p><p>Nos intervalados a FC responde com atraso. Não acelere para atingir a faixa imediatamente e não exija que a FC caia para a referência durante 1 minuto de recuperação ou 3 minutos de caminhada. Mantenha esforço controlado e use também o teste da conversa.</p>${link("https://www.polar.com/us-en/guide/heart-rate-zones", "Polar · zonas em percentuais da FC máxima")}${link("https://www8.garmin.com/manuals/webhelp/vivosmarthr/EN-US/GUID-A8716C0B-B267-4C42-B45F-B9C7928BCA19.html", "Garmin · cálculo das zonas cardíacas")}${link("https://support.polar.com/e_manuals/Team_Pro/Polar_Team_Pro_user_manual_English/polar_heart_rate_zones.htm", "Polar · resposta gradual da frequência cardíaca")}${link("https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/target-heart-rates", "American Heart Association · estimativa geral de 220 − idade")}<p class="caption">Referências de frequência cardíaca consultadas em 05/11/2026.</p><h3>Progressão</h3><p>Ajustamos segundos por km em 2,5% por ponto fora da faixa, até +10% ou −5%. Com progressão ativa: metade da desaceleração para excesso de 1–2 pontos; excesso de 3 ou mais mantém correção integral. Duas últimas sessões equivalentes na faixa permitem −1%, sem somar outra correção. Essa é uma heurística do app, não uma conversão fisiológica exata.</p><p>A carga sugerida usa a referência de cada série: aumenta pelo percentual escolhido ao atingir 8 repetições. Esse gatilho foi escolhido para este plano.</p>${link("https://pubmed.ncbi.nlm.nih.gov/19204579/", "ACSM · progressão em musculação (2009)")}<h3>Musculação</h3><p>Textos resumidos em português e ilustrações esquemáticas originais. As demonstrações externas podem mostrar equipamentos ou variantes diferentes; observe as notas de cada guia.</p><div class="source-list">${Object.values(
      exercises,
    )
      .map((ex) =>
        references[ex.id]
          ? link(references[ex.id].source, ex.name)
          : `<p>${ex.name}: referência indisponível neste momento.</p>`,
      )
      .join(
        "",
      )}</div><p class="caption">Referências de musculação consultadas em 20/10/2026. Vídeos dependem dos sites de origem.</p>`,
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
  if (!canReorganize(item)) return;
  openDialog(
    `<div class="dialog-top"><span class="eyebrow">${escape(workouts[item.type].name)}</span><button class="close-button" data-action="close-dialog" aria-label="Fechar reorganização de treino">${icon("x")}</button></div><h2 id="guide-title">Reorganizar treino</h2><p class="reorganize-date">${icon("calendar-days")} ${escape(fullDate(selected))}</p><form id="move-workout-form" data-date="${selected}" data-workout="${id}"><fieldset class="reorganize-options"><legend class="sr-only">O que deseja fazer?</legend><label><input type="radio" name="operation" value="move" checked><span>${icon("calendar-days")}<b>Mover treino</b><small>Escolher outra data</small></span></label><label><input type="radio" name="operation" value="cancel"><span>${icon("minus")}<b>Cancelar treino</b><small>Não realizar esta sessão</small></span></label></fieldset><div data-move-fields><label>Data de destino<input type="date" name="destination" required></label><p class="caption" data-move-preview role="status">Os treinos do destino serão mantidos. Se a origem ficar sem treinos, será um dia de descanso.</p></div><div class="cancel-explanation" data-cancel-fields hidden>${icon("circle")}<p>Este treino será marcado como cancelado e continuará no histórico e na meta da semana. Você poderá reativá-lo depois.</p></div><p class="form-error" data-move-error role="alert"></p><div class="dialog-actions"><button type="button" class="button quiet" data-action="close-dialog">Voltar</button><button type="submit" class="button primary">Mover treino</button></div></form>`,
    true,
  );
}

async function saveWorkoutChange(form, change) {
  const submit = form.querySelector('[type="submit"]');
  if (form.getAttribute("aria-busy") === "true") return;
  form.setAttribute("aria-busy", "true");
  submit.disabled = true;
  submit.textContent = "Salvando…";
  for (const control of form.querySelectorAll('fieldset, [name="destination"]'))
    control.disabled = true;
  fieldControls.refresh(form);
  try {
    data = change.candidate;
    const result = await account.remote.save(change.candidate);
    if (!["cloud", "local"].includes(result.saved)) {
      form.querySelector("[data-move-error]").textContent =
        result.saved === "memory"
          ? "Alteração apenas nesta aba. Não foi possível salvar no dispositivo nem na nuvem. Tente salvar novamente ou exporte uma cópia antes de sair."
          : "Não foi possível confirmar o salvamento. Suas pendências foram preservadas.";
      submit.textContent = "Tentar salvar novamente";
      if (!account.blocked) render({ preserve: true });
      return;
    }
    pendingReorganizations.delete(form);
    if (form.isConnected && $("#guide-dialog").open)
      dialogs.close(() =>
        selectDay(change.to, change.id, {
          keepScroll: change.action !== "move",
        }),
      );
    else if (!$("#guide-dialog").open) render({ preserve: true });
    notify(
      result.saved === "local"
        ? "Salvo neste dispositivo · sincronização pendente"
        : change.action === "move"
          ? "Treino movido."
          : change.action === "cancel"
            ? "Treino cancelado. Você pode reativá-lo depois."
            : "Treino reativado.",
    );
  } catch (error) {
    if (form.isConnected)
      form.querySelector("[data-move-error]").textContent =
        error.message || "Não foi possível salvar. Tente novamente.";
    submit.textContent = "Tentar salvar novamente";
  } finally {
    form.removeAttribute("aria-busy");
    submit.disabled = false;
  }
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
    reopenWorkout(s);
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
  if (action === "reactivate-workout") {
    if (
      !scheduledWorkouts(data, selected).some(
        (item) => item.id === button.dataset.workout && item.canceledAt,
      )
    )
      return;
    button.disabled = true;
    const date = selected,
      id = button.dataset.workout;
    const candidate = structuredClone(data);
    reactivateWorkout(candidate, date, id);
    data = candidate;
    account.remote
      .save(candidate)
      .then((result) => {
        if (selected === date && selectedWorkout === id) selectDay(date, id);
        else render({ preserve: true });
        notify(
          result.saved === "cloud"
            ? "Treino reativado."
            : result.saved === "local"
              ? "Salvo neste dispositivo · sincronização pendente"
              : "Alteração apenas nesta aba. Exporte uma cópia antes de sair.",
        );
      })
      .catch((error) => {
        button.disabled = false;
        notify(error.message);
      });
    return;
  }
  if (action === "move-workout" || action === "reorganize-selected")
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
      reopenWorkout(session());
      persist("Sessão reaberta.");
      syncStrength();
      return;
    }
    const key = selected,
      id = selectedWorkout;
    confirmSession(() => {
      completeWorkout(session(key, id));
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
  if (input.matches('#move-workout-form [name="operation"]')) {
    fieldControls.close();
    const form = input.form,
      cancel = input.value === "cancel",
      destination = form.elements.destination;
    destination.disabled = cancel;
    destination.required = !cancel;
    form.querySelector("[data-move-fields]").hidden = cancel;
    form.querySelector("[data-cancel-fields]").hidden = !cancel;
    form.querySelector('[type="submit"]').textContent = cancel
      ? "Confirmar cancelamento"
      : "Mover treino";
    form.querySelector("[data-move-error]").textContent = "";
    fieldControls.refresh(form);
    return;
  }
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
    reopenWorkout(s);
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
    reopenWorkout(s);
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
    reopenWorkout(s);
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
    if (form.getAttribute("aria-busy") === "true") return;
    if (pendingReorganizations.has(form)) {
      void saveWorkoutChange(form, pendingReorganizations.get(form));
      return;
    }
    const from = form.dataset.date,
      id = form.dataset.workout,
      action = values.operation === "cancel" ? "cancel" : "move",
      to = action === "cancel" ? from : values.destination;
    if (action === "move" && to === from) {
      $("[data-move-error]").textContent =
        "Escolha uma data diferente da origem.";
      return;
    }
    if (
      runDrafts.has(draftKey(from, id)) ||
      !canReorganize(scheduledWorkouts(data, from).find((s) => s.id === id))
    ) {
      $("[data-move-error]").textContent =
        "Treinos iniciados devem permanecer na data original.";
      return;
    }
    try {
      const candidate = structuredClone(data);
      if (action === "cancel") cancelWorkout(candidate, from, id);
      else moveWorkout(candidate, from, to, id);
      const change = { candidate, from, to, id, action };
      pendingReorganizations.set(form, change);
      void saveWorkoutChange(form, change);
    } catch (error) {
      $("[data-move-error]").textContent = error.message;
    }
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
      $(".pace-advice .eyebrow").textContent = "Plano registrado";
      const savedPlan = getRunPlan(
        s.type,
        data.settings,
        data.sessions,
        selected,
        selectedWorkout,
      );
      const caption = $(".run-details [data-plan-caption]");
      if (caption) caption.textContent = paceHelp(savedPlan);
      else
        $(".run-details-body").insertAdjacentHTML(
          "beforeend",
          paceMethod(savedPlan, s.type),
        );
      const longCaption = $("[data-long-caption]");
      if (longCaption)
        longCaption.textContent =
          "Duração preservada no planejamento registrado.";
    }
    completeWorkout(s);
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
let statusDate = dateKey();
function refreshCalendarDate() {
  const today = dateKey();
  if (today !== statusDate && !account.blocked) {
    statusDate = today;
    syncTodayStatus();
  }
}
function watchCalendarDate() {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 50);
  setTimeout(() => {
    refreshCalendarDate();
    watchCalendarDate();
  }, midnight.getTime() - Date.now());
}
watchCalendarDate();
window.addEventListener("focus", refreshCalendarDate);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshCalendarDate();
});
if (location.hash === "#semana")
  $("#week-navigation")?.scrollIntoView({ block: "start" });
if (location.hash === "#session") scrollToSession();
