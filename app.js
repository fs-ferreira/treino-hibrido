import {
  KEY,
  defaults,
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
} from "./lib/core.js?v=1.6.0";
import {
  withoutWeight,
  loadSuggestions,
  getRunPlan,
  paceRevision,
  effortTarget,
} from "./lib/progression.js?v=1.6.0";
import { workouts, exercises } from "./lib/exercises.js";
import { runBlocksView } from "./lib/run-view.js?v=1.7.0";
import { plansView } from "./lib/plans-view.js?v=1.7.0";
import { resolveRoute, isAppHash } from "./lib/routes.js?v=1.7.1";
import {
  settingsView,
  createSettingsController,
  settingsSections,
} from "./lib/settings.js?v=1.7.1";
import { createMobileNav } from "./lib/mobile-nav.js?v=1.7.3";
import { illustration } from "./lib/diagrams.js";
import { createMovementPlayer } from "./lib/movement-player.js";
import { hydrateIcons, applyTimeMask } from "./lib/ui.js?v=1.6.0";
import { icon } from "./lib/icons.js?v=1.6.0";
import { createMotionDiagnostics } from "./lib/motion-diagnostics.js?v=1.6.0";
import {
  createMotion,
  createAccordions,
  createDialogController,
} from "./lib/motion.js?v=1.6.0";
let disposeMovement = () => {};
const $ = (s) => document.querySelector(s),
  main = $("#main");
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
  });
let data = defaults(),
  storageProblem = "",
  storageLocked = false,
  selected = dateKey(),
  week = weekStart(selected),
  expanded = new Set(),
  expandedPlanDays = new Set([1]),
  references = {},
  toastTimer,
  pendingConfirmation = null,
  pendingImport = null,
  importGeneration = 0,
  dialogReturnFocus = null;
const motion = createMotion({ onStart: createMotionDiagnostics() });
const mobileNav = createMobileNav($("nav"));
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
try {
  const saved = localStorage.getItem(KEY);
  if (saved) data = validateBackup(JSON.parse(saved));
} catch (error) {
  storageLocked = true;
  storageProblem =
    "Não foi possível ler o diário salvo. Seus dados não serão sobrescritos. Exporte uma cópia em Configurações → Dados antes de limpar o armazenamento.";
}
const settingsUi = createSettingsController({
  getSettings: () => data.settings,
  navigate: (section) => navigateTo(`configuracoes/${section}`),
  save(next) {
    const previous = data.settings;
    data.settings = next;
    if (persist("Ajustes salvos neste navegador.")) return true;
    data.settings = previous;
    return false;
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
function notify(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 4000);
}
function persist(message) {
  if (storageLocked) {
    notify(storageProblem);
    return false;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    storageProblem = "";
    if (message) notify(message);
    return true;
  } catch {
    storageProblem =
      "O navegador não conseguiu salvar. Os dados continuam nesta aba; exporte um backup antes de sair.";
    notify(storageProblem);
    if (!$("#storage-alert"))
      main.insertAdjacentHTML(
        "afterbegin",
        `<div class="notice" id="storage-alert" role="alert">${storageProblem}</div>`,
      );
    return false;
  }
}
function getType(key) {
  return data.sessions[key]?.type || workoutFor(key, data.settings);
}
function session(key = selected) {
  return (data.sessions[key] ??= {
    type: workoutFor(key, data.settings),
    done: false,
    sets: {},
    run: null,
  });
}
const emptySets = () =>
  Array.from({ length: 3 }, () => ({ kg: "", reps: "", done: false }));
function exerciseSession(id) {
  const mode = withoutWeight(data.sessions, selected, id),
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
  return sets
    .map(
      (set) =>
        `${noWeight ? "Sem peso adicional" : `${weightText(set.kg)} kg`} × ${set.reps === "" ? "—" : set.reps}${set.done ? " ✓" : ""}`,
    )
    .join(" / ");
}
function count(key) {
  return Object.values(data.sessions[key]?.sets || {})
    .flat()
    .filter((s) => s.done).length;
}
function link(url, label, cls = "source-link") {
  return `<a class="${cls}" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
}
const tag = (text, kind = "strength") =>
  `<span class="tag ${kind}">${text}</span>`;
const arrow = '<span aria-hidden="true">↗</span>';
function heading(kicker, title, description, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="muted">${description}</p></div>${action}</div>`;
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
    ...(routePositions.get(route) ?? { left: 0, top: 0 }),
    behavior: "instant",
  });
  motion.enter(main);
  if (options.session) scrollToSession();
}
function navigateTo(hash, options = {}) {
  if (location.hash !== `#${hash}`) history.pushState(null, "", `#${hash}`);
  applyNavigation(routeFromHash(), options);
}
function syncTodayStatus() {
  if (currentRoute !== "hoje") return;
  const start = weekStart(selected);
  const done = Array.from(
    { length: 7 },
    (_, i) => data.sessions[addDays(start, i)],
  ).filter((s) => s?.done && s.type !== "rest").length;
  const ring = $(".progress-ring");
  if (ring) {
    ring.style.setProperty("--progress", `${Math.min(done / 6, 1) * 100}%`);
    ring.querySelector("b").innerHTML = `${done}<small>/6</small>`;
  }
  document.querySelectorAll(".week-strip .day").forEach((button) => {
    const key = button.dataset.date,
      finished = Boolean(data.sessions[key]?.done);
    button.classList.toggle("selected", key === selected);
    button.setAttribute("aria-pressed", String(key === selected));
    button.setAttribute(
      "aria-label",
      `${fullDate(key)}, ${workouts[getType(key)].name}${finished ? ", concluído" : ""}`,
    );
    const indicator = button.querySelector(".day-indicator");
    indicator.classList.toggle("done", finished);
    indicator.innerHTML = finished ? icon("check") : "";
  });
  const link = $(".hero .button");
  if ($(".hero .session-state"))
    $(".hero .session-state").textContent = sessionStatus(selected).label;
  if (link)
    link.innerHTML = `${sessionStatus(selected).action} ${icon("arrow-down")}`;
}
function syncStrength(id) {
  if (!$(".progress-line")) return;
  const s = data.sessions[selected],
    total = count(selected);
  $(".count-pill").textContent = `${total}/21 séries`;
  $(".progress-line span").style.transform = `scaleX(${total / 21})`;
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
    const noWeight = withoutWeight(data.sessions, selected, id);
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
    card.classList.toggle("without-weight", noWeight);
  }
  syncTodayStatus();
}
function refreshDay() {
  accordions.finish();
  motion.finishAll();
  const before = $(".week-strip").getBoundingClientRect().top;
  $(".page-heading h1").innerHTML =
    selected === dateKey()
      ? 'Vamos nessa<span class="accent">.</span>'
      : 'Seu treino, no seu tempo<span class="accent">.</span>';
  $(".page-heading .muted").textContent = fullDate(selected);
  $(".hero").outerHTML = heroView();
  $("[data-action=reset-day]").hidden = selected === dateKey();
  $(".setup-banner")?.remove();
  $(".dashboard-grid").insertAdjacentHTML("beforebegin", setupBanner());
  $("#session").innerHTML = sessionView(getType(selected));
  if ($(".week-strip .day").dataset.date !== weekStart(selected))
    $(".week-strip").outerHTML = weekStrip();
  hydrateIcons($(".hero"));
  hydrateIcons($("#session"));
  syncTodayStatus();
  if (window.scrollY > 0)
    window.scrollBy({
      top: $(".week-strip").getBoundingClientRect().top - before,
      behavior: "instant",
    });
  motion.enter($(".hero"), "day");
  motion.enter($("#session"), "day");
}
function syncLongRun() {
  const { blocks, total, snapshot } = getRunPlan(
    "long",
    data.settings,
    data.sessions,
    selected,
  );
  $(".long-options label strong").textContent =
    `${data.settings.longMinutes} min`;
  $(".hero-stats b").textContent = data.settings.longMinutes;
  const overview = $(".run-overview");
  overview.querySelector(":scope > div:first-child b").innerHTML =
    `${total.minutes}<em>min</em>`;
  overview.querySelector(":scope > div:last-child b").innerHTML =
    `${total.known ? num(total.km, 2) : "—"}<em>km</em>`;
  $("#long-distance-range").textContent = longRangeText(snapshot.easyPace);
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
function render() {
  settingsUi.unmount();
  accordions.finish();
  motion.finishAll();
  const route = resolveRoute(currentRoute);
  mobileNav.setActive(route.section);
  $("#top-date").textContent = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  main.innerHTML =
    (storageProblem
      ? `<div class="notice" id="storage-alert" role="alert">${storageProblem}</div>`
      : "") +
    (
      {
        hoje: todayView,
        semana: weekView,
        treinos: () => plansView(data.settings, route, expandedPlanDays),
        historico: historyView,
        configuracoes: () => settingsView(data.settings, route.settingsSection),
      }[route.section] || todayView
    )();
  updateTitle(route);
  hydrateIcons();
  if (route.section === "configuracoes")
    settingsUi.mount($("#settings-page"), route.settingsSection);
}
function weekStrip(start = weekStart(selected)) {
  return `<div class="week-strip" aria-label="Dias da semana">${Array.from(
    { length: 7 },
    (_, i) => {
      const key = addDays(start, i),
        d = dateFromKey(key),
        type = getType(key),
        done = data.sessions[key]?.done;
      return `<button class="day ${key === selected ? "selected" : ""} ${workouts[type].kind}" data-action="day" data-date="${key}" aria-label="${fullDate(key)}, ${workouts[type].name}${done ? ", concluído" : ""}" aria-pressed="${key === selected}"><span>${["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][d.getDay()]}</span><b>${String(d.getDate()).padStart(2, "0")}</b><i class="day-indicator ${done ? "done" : ""}">${done ? "✓" : ""}</i></button>`;
    },
  ).join("")}</div>`;
}
function sessionStatus(key) {
  const s = data.sessions[key],
    kind = workouts[getType(key)].kind;
  const started = Boolean(
    s?.run ||
      Object.values(s?.sets ?? {}).some((sets) =>
        sets.some((set) => set.done || set.kg !== "" || set.reps !== ""),
      ),
  );
  return s?.done
    ? { label: "Concluído", action: "Rever treino" }
    : kind === "rest"
      ? { label: "Descanso", action: "Ver recuperação" }
      : started
        ? { label: "Em andamento", action: "Continuar treino" }
        : { label: "Planejado", action: "Abrir treino" };
}
function setupBanner() {
  return workouts[getType(selected)].kind === "run" && !data.settings.easyPace
    ? '<div class="setup-banner"><div><strong>Prepare seus ritmos de corrida.</strong><p>Informe seus paces para estimar distância e velocidade.</p></div><a class="button" href="#configuracoes/corrida">Configurar ritmos ' +
        icon("arrow-up-right") +
        "</a></div>"
    : "";
}
function heroView() {
  const type = getType(selected),
    w = workouts[type];
  return `<section class="hero ${w.kind}"><div class="hero-copy">${tag(w.tag, w.kind)}<span class="session-state">${sessionStatus(selected).label}</span><p class="hero-overline">${selected === dateKey() ? "O TREINO DE HOJE" : "TREINO SELECIONADO"}</p><h2>${w.name}<span>.</span></h2><p>${w.subtitle}</p><div class="hero-stats">${w.kind === "strength" ? "<div><b>07</b><span>exercícios</span></div><div><b>03</b><span>séries cada</span></div><div><b>6–8</b><span>repetições</span></div>" : w.kind === "run" ? `<div><b>${type === "interval" ? 40 : type === "easy" ? 30 : (data.sessions[selected]?.run?.plan?.longMinutes ?? data.settings.longMinutes)}</b><span>minutos</span></div><div><b>${type === "interval" ? "08" : "3–4"}</b><span>${type === "interval" ? "blocos" : "esforço / 10"}</span></div>` : "<div><b>01</b><span>pausa merecida</span></div>"}</div><a class="button primary" href="#session">${sessionStatus(selected).action} <span>↓</span></a></div><div class="hero-art" aria-hidden="true"><div class="orbit o1"></div><div class="orbit o2"></div><div class="orbit o3"></div><span class="art-word">${w.kind === "strength" ? "STR" : w.kind === "run" ? "RUN" : "RST"}</span><span class="art-cross">+</span><span class="art-caption">STRENGTH × ENDURANCE</span></div></section>`;
}
function todayView() {
  const type = getType(selected),
    w = workouts[type],
    start = weekStart(selected),
    done = Array.from(
      { length: 7 },
      (_, i) => data.sessions[addDays(start, i)],
    ).filter((s) => s?.done && s.type !== "rest").length;
  return (
    heading(
      "SEU DIÁRIO DE MOVIMENTO",
      selected === dateKey()
        ? 'Vamos nessa<span class="accent">.</span>'
        : 'Seu treino, no seu tempo<span class="accent">.</span>',
      fullDate(selected),
      `<button class="button quiet" data-action="reset-day" ${selected === dateKey() ? "hidden" : ""}>Ir para hoje</button>`,
    ) +
    setupBanner() +
    `<div class="dashboard-grid">${heroView()}<section class="week-summary panel"><p class="eyebrow">CONSISTÊNCIA &gt; PRESSA</p><h2>Uma semana.<br>Seis movimentos.</h2><div class="progress-ring" style="--progress:${Math.min(done / 6, 1) * 100}%"><div><b>${done}<small>/6</small></b><span>treinos concluídos</span></div></div><div class="split-stat"><span><i class="dot lime"></i> Musculação <b>3</b></span><span><i class="dot cyan"></i> Corrida <b>3</b></span></div></section></div><div class="section-title"><h2>Sua semana</h2><a class="text-link" href="#semana">Ver calendário ${arrow}</a></div>${weekStrip(start)}<section id="session" class="session-section">${sessionView(type)}</section>`
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
    s = data.sessions[selected],
    total = count(selected);
  return `<div class="section-title"><div><p class="eyebrow">MUSCULAÇÃO · ${shortDate(selected)}</p><h2>Sua sessão de ${w.name}</h2></div><span class="count-pill">${total}/21 séries</span></div><div class="progress-line"><span style="transform:scaleX(${total / 21})"></span></div><p class="section-hint">Abra um exercício para registrar as séries. Toque em “Como fazer” para ver o guia.</p><div class="exercise-list">${w.ids.map((id, index) => exerciseCard(id, index, s)).join("")}</div><div class="session-bottom"><p><span class="status-dot"></span> ${storageProblem ? "Confira o aviso de armazenamento" : "Alterações salvas neste navegador"}</p><button class="button ${s?.done ? "quiet" : "primary"}" data-action="finish-strength">${s?.done ? "Reabrir sessão" : "Concluir sessão"} ${s?.done ? "↶" : "✓"}</button></div>`;
}
function loadSuggestionReason(suggestion) {
  if (suggestion.percent)
    return `+${weightText(suggestion.percent)}% por atingir 8 repetições`;
  return suggestion.reps < 8
    ? "Manter: ainda abaixo de 8 repetições"
    : "Manter: progressão em 0%";
}
function exerciseHistory(id, previous, suggestions) {
  return `<details class="exercise-history"><summary><span>Histórico e sugestões</span>${previous ? `<time datetime="${previous.date}">${shortDate(previous.date)}</time>` : ""}${icon("chevron-down")}</summary>
    <div class="exercise-history-content">${previous ? `<p class="previous"><b>Última sessão · ${shortDate(previous.date)}</b><br>${setHistoryText(previous.sets, Boolean(data.sessions[previous.date].withoutWeight?.[id]))}</p>` : '<p class="previous">Sem registros anteriores.</p>'}
    <ol class="load-reference">${suggestions.map((suggestion, i) => (suggestion ? `<li><b>${String(i + 1).padStart(2, "0")}</b><div id="load-reason-${id}-${i}"><span><strong>${weightText(suggestion.kg)} kg</strong> · ${loadSuggestionReason(suggestion)}</span><small>Referência · ${shortDate(suggestion.date)} · ${weightText(suggestion.previousKg)} kg × ${suggestion.reps}${!suggestion.usable ? " · acima do limite de 2000 kg" : ""}</small></div></li>` : "")).join("")}</ol>
    <p class="weight-help" id="weight-help-${id}">Sem peso adicional vale para as três séries. Registre apenas as repetições; as cargas digitadas são preservadas.</p></div></details>`;
}
function exerciseCard(id, index, s) {
  const e = exercises[id],
    sets = s?.sets[id] || emptySets(),
    previous = previousSets(data.sessions, selected, id),
    noWeight = withoutWeight(data.sessions, selected, id),
    suggestions = loadSuggestions(
      data.sessions,
      selected,
      id,
      data.settings.loadProgression,
    ),
    complete = sets.filter((x) => x.done).length;
  return `<details class="exercise-card ${noWeight ? "without-weight" : ""}" data-exercise="${id}" ${expanded.has(id) ? "open" : ""}>
    <summary><span class="exercise-number">${String(index + 1).padStart(2, "0")}</span><span class="exercise-name"><b>${e.name}</b><small>${e.muscles} <span>· 3 × 6–8</span></small></span><span class="exercise-check ${complete === 3 ? "complete" : ""}" aria-label="${complete} de 3 séries concluídas">${complete === 3 ? icon("check") : `${complete}/3`}</span><span class="chevron">${icon("chevron-down")}</span></summary>
    <div class="exercise-body"><div class="exercise-tools"><label class="pace-toggle weight-toggle"><input type="checkbox" data-without-weight="${id}" aria-describedby="weight-help-${id}" ${noWeight ? "checked" : ""}><span>Sem peso adicional</span></label><button class="button quiet small exercise-guide" data-action="guide" data-id="${id}" aria-label="Como fazer ${e.name}">Como fazer ${arrow}</button></div>
    <div class="sets-grid set-header" aria-hidden="true"><span>Série</span><span>Carga (kg)</span><span>Reps</span><span>Feita</span></div>
    ${sets
      .map((set, i) => {
        const suggestion = suggestions[i];
        const verb = suggestion?.percent ? "Usar" : "Manter";
        return `<div class="sets-grid set-row ${set.done ? "set-done" : ""}"><b>${String(i + 1).padStart(2, "0")}</b><div class="load-cell"><input type="number" inputmode="decimal" min="0" max="2000" step="0.01" value="${set.kg}" ${noWeight ? "disabled" : ""} placeholder="—" aria-label="Carga da série ${i + 1} de ${e.name}" data-id="${id}" data-index="${i}" data-field="kg">
        <div class="load-suggestion" data-index="${i}" data-empty="${!suggestion}" ${noWeight || !suggestion ? "hidden" : ""}>${suggestion ? `<button type="button" class="button load-apply" data-action="use-load" data-id="${id}" data-index="${i}" data-usable="${suggestion.usable}" ${set.done || noWeight || !suggestion.usable ? "disabled" : ""} aria-describedby="load-reason-${id}-${i}" aria-label="${suggestion.usable ? `${verb} ${weightText(suggestion.kg)} kg na série ${i + 1} de ${e.name}` : `Fora do limite: sugestão de ${weightText(suggestion.kg)} kg na série ${i + 1} de ${e.name}`}">${suggestion.usable ? `${verb} <strong>${weightText(suggestion.kg)} kg</strong>` : "Fora do limite"}</button>` : ""}</div></div>
        <input type="number" inputmode="numeric" min="0" max="1000" step="1" value="${set.reps}" placeholder="6–8" aria-label="Repetições da série ${i + 1} de ${e.name}" data-id="${id}" data-index="${i}" data-field="reps"><label class="check-label"><input type="checkbox" ${set.done ? "checked" : ""} aria-label="Concluir série ${i + 1} de ${e.name}" data-id="${id}" data-index="${i}" data-field="done"><span aria-hidden="true">${icon("check")}</span></label></div>`;
      })
      .join("")}
    ${["single-rdl", "bulgarian", "leg-curl", "leg-extension"].includes(id) ? '<p class="exercise-side-note">Carga por lado · complete os dois lados</p>' : ""}${exerciseHistory(id, previous, suggestions)}</div></details>`;
}
function longRangeText(pace) {
  return pace
    ? `${num(distance(60, pace), 1)}–${num(distance(90, pace), 1)} km`
    : "uma distância calculada com seu pace leve";
}
function effortOptions(selectedRpe) {
  return `<option value="">Selecione</option>${Array.from({ length: 11 }, (_, i) => `<option value="${i}" ${selectedRpe === i ? "selected" : ""}>${i}${i === 0 ? " · repouso" : i === 10 ? " · máximo" : ""}</option>`).join("")}`;
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
  return `<section class="panel pace-advice ${a.blocked ? "pace-conflict" : ""}" aria-label="Sugestão de ritmo"><p class="eyebrow cyan-text">${plan.saved ? "PLANEJAMENTO REGISTRADO" : a.sourceDate ? "RITMO AJUSTADO AO HISTÓRICO" : "SEU PACE BASE"}</p><div class="pace-advice-title"><h3>${a.pace ? `${paceText(a.pace)} <small>/km</small>` : "Recalibre seus ritmos"}</h3><span>Alvo ${min}–${max}/10${type === "interval" ? " nos blocos fortes" : ""}</span></div>
    ${a.sourceDate ? `<p>Referência: ${shortDate(a.sourceDate)} · ${paceText(a.previousPace)}/km · esforço ${a.rpe}/10.</p><p>${reasons[a.reason] || ""}${a.percent ? ` Ajuste de ${a.percent > 0 ? "+" : ""}${weightText(a.percent)}% no tempo por km.` : ""}</p>` : "<p>Sem corrida equivalente elegível nesta referência. Usamos seu ritmo configurado.</p>"}
    ${a.blocked ? `<p class="form-error">${type === "interval" ? "O pace forte sugerido precisa ser mais rápido que a recuperação. As etapas fortes ficam sem estimativa até a recalibração." : "O ritmo calculado ficou fora da faixa de 0:01 a 99:59/km. A distância fica sem estimativa até a recalibração."} <a href="#configuracoes/corrida">Revisar paces base</a>.</p>` : ""}
    <details class="help-details pace-method"><summary>Entender esta sugestão</summary><p class="caption" data-plan-caption>Estimativa gradual do app; o esforço real continua orientando a execução. Seus paces base ficam preservados. ${plan.saved ? "Este plano foi salvo com a sessão." : "O cálculo parte de uma corrida realizada; abrir a tela não acumula ajustes."}</p></details></section>`;
}
function runView(type) {
  const plan = getRunPlan(type, data.settings, data.sessions, selected),
    { blocks, total, snapshot } = plan,
    r = data.sessions[selected]?.run,
    missing = !snapshot.easyPace || (type === "interval" && !snapshot.hardPace),
    isLong = type === "long";
  return `<div class="section-title"><div><p class="eyebrow cyan-text">CORRIDA · ${shortDate(selected)}</p><h2>O caminho de hoje</h2></div>${tag("RITMO CONTROLADO", "run")}</div>
    <div class="run-layout"><div><div class="run-overview panel"><div><small>DURAÇÃO PREVISTA</small><b>${total.minutes}<em>min</em></b></div><div><small>${total.complete ? "DISTÂNCIA ESTIMADA" : "DISTÂNCIA PARCIAL"}</small><b>${total.known ? num(total.km, 2) : "—"}<em>km</em></b></div></div>
    ${missing && !plan.adjustment.blocked ? '<div class="notice">Informe seus ritmos para completar os cálculos. <a href="#configuracoes/corrida">Configurar paces →</a></div>' : ""}
    ${r && !plan.saved ? '<p class="notice subtle">Este registro antigo não guardava o planejamento original. O plano abaixo é uma simulação com as referências atuais.</p>' : ""}
    ${paceAdvice(plan, type)}
    ${isLong ? `<div class="panel long-options"><label for="long-minutes">Duração do longão <strong>${snapshot.longMinutes} min</strong></label><input id="long-minutes" type="range" min="60" max="90" step="5" value="${snapshot.longMinutes}" ${plan.saved ? "disabled" : ""}><div class="range-labels"><span>60 min</span><span>90 min</span></div><p class="caption">A faixa do plano equivale a <span id="long-distance-range">${longRangeText(snapshot.easyPace)}</span>. ${plan.saved ? "Duração preservada no planejamento registrado." : "Escolha conforme sua capacidade atual; a duração não aumenta automaticamente."}</p></div>` : ""}
    <div class="timeline" aria-hidden="true">${blocks.map((b) => `<span class="${b.kind}" style="flex:${b.minutes}"></span>`).join("")}</div><div class="run-blocks">${runBlocksView(blocks)}</div>${!total.complete ? '<p class="caption">O total parcial soma somente as etapas com pace informado. A caminhada pode ficar sem estimativa.</p>' : ""}</div>
    <aside><div class="panel effort-card"><span class="mini-icon">${icon("activity")}</span><p class="eyebrow">FOCO DO TREINO</p><h3>${type === "interval" ? "Forte. Sem sprint." : "O ritmo da conversa."}</h3><p>${type === "interval" ? "Blocos fortes em 7–8/10 de esforço: um ritmo repetível, com controle nos oito blocos. O ajuste usa apenas os dados desses blocos." : "Mantenha o esforço em 3–4/10, como no plano original. Você deve conseguir conversar com frases completas e sem dificuldade."}</p><a class="text-link" href="#configuracoes/corrida">Ajustar meus ritmos ${arrow}</a></div>
    <form id="run-form" class="panel run-form"><p class="eyebrow">DEPOIS DO TREINO</p><h3>Como foi a corrida?</h3><label>Duração realizada (min)<input name="minutes" type="number" min="0.01" max="1440" step="0.01" inputmode="decimal" required value="${r?.minutes ?? ""}" placeholder="Ex.: 30"></label><label>Distância realizada (km)<input name="km" type="number" min="0.001" max="1000" step="0.001" inputmode="decimal" required value="${r?.km ?? ""}" placeholder="Ex.: 5"></label><div class="actual-pace">Pace realizado <strong id="actual-pace">${r ? paceText((r.minutes * 60) / r.km) : "—"} /km</strong></div><label>Esforço percebido da sessão (0–10)<select name="rpe" required>${effortOptions(r?.rpe)}</select></label>
    ${type === "interval" ? `<fieldset class="hard-run-fields"><legend>Blocos fortes <span class="optional">opcional</span></legend><p class="caption" id="hard-run-hint">Preencha os dois campos para ajustar o próximo intervalado. Não use a média da sessão inteira.</p><label>Pace médio dos blocos fortes<input name="hardPace" data-mask="pace" inputmode="numeric" maxlength="5" pattern="[0-9]{1,2}:[0-5][0-9]" value="${r?.hardPace ? paceText(r.hardPace) : ""}" placeholder="mm:ss" aria-describedby="hard-run-hint"></label><label>Esforço dos blocos fortes (0–10)<select name="hardRpe">${effortOptions(r?.hardRpe)}</select></label></fieldset>` : ""}
    <label>Observações <span class="optional">opcional</span><textarea name="notes" maxlength="2000" rows="3" placeholder="Sensações, percurso, clima…">${escape(r?.notes || "")}</textarea></label><p id="run-error" class="form-error" role="alert"></p><button class="button primary run-primary" type="submit">${r ? "Salvar alterações" : "Salvar e concluir"} ${icon("check")}</button></form></aside></div>`;
}
function calendarView() {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  return `<div class="calendar-grid">${dates
    .map((key) => {
      const type = getType(key),
        w = workouts[type],
        s = data.sessions[key];
      return `<button class="calendar-card ${w.kind} ${key === dateKey() ? "is-today" : ""}" data-action="open-day" data-date="${key}" aria-pressed="${key === selected}" ${key === dateKey() ? 'aria-current="date"' : ""}><div class="calendar-top"><span>${dateFromKey(key).toLocaleDateString("pt-BR", { weekday: "long" })}</span><b>${dateFromKey(key).getDate()}</b></div>${key === dateKey() || key === selected ? `<span class="day-context">${key === dateKey() ? "Hoje" : "Dia selecionado"}</span>` : ""}${tag(w.kind === "strength" ? "FORÇA" : w.kind === "run" ? "CORRIDA" : "PAUSA", w.kind)}<h3>${w.name}</h3><p>${w.kind === "strength" ? "7 exercícios · 3 × 6–8" : type === "interval" ? "40 min · 8 blocos" : type === "easy" ? "30 min · leve" : type === "long" ? "60–90 min · leve" : "Recupere a energia"}</p><div class="calendar-status">${s?.done ? "✓ Concluído" : s ? "◐ Em andamento" : "○ Planejado"} <span>↗</span></div></button>`;
    })
    .join("")}</div>`;
}
function weekView() {
  return (
    heading(
      "OLHE PARA O TODO",
      'Uma semana equilibrada<span class="accent">.</span>',
      "Três dias de força. Três de corrida. Um para recuperar.",
    ) +
    `<div class="week-controls"><button class="button quiet" data-action="prev-week" aria-label="Semana anterior">←</button><h2>${shortDate(week)} — ${shortDate(addDays(week, 6))}</h2><button class="button quiet" data-action="next-week" aria-label="Próxima semana">→</button><button class="text-button" data-action="current-week" ${week === weekStart(dateKey()) ? "hidden" : ""}>Semana atual</button></div>${calendarView()}<div class="notice subtle">Longão no ${data.settings.longDay === 6 ? "sábado" : "domingo"}. <a href="#configuracoes/semana">Trocar o dia</a>. Sessões já registradas mantêm o treino original.</div>`
  );
}
function historyView() {
  const entries = Object.entries(data.sessions)
    .filter(
      ([, s]) =>
        s.done ||
        s.run ||
        Object.values(s.sets).some((arr) =>
          arr.some((x) => x.done || x.kg !== "" || x.reps !== ""),
        ),
    )
    .sort(([a], [b]) => b.localeCompare(a));
  const totalKm = entries.reduce((sum, [, s]) => sum + (s.run?.km || 0), 0),
    finished = entries.filter(([, s]) => s.done).length;
  return (
    heading(
      "CADA REGISTRO CONTA",
      'Sua evolução<span class="accent">.</span>',
      "Uma memória dos treinos que você fez.",
    ) +
    `<div class="history-metrics"><div class="panel"><small>SESSÕES CONCLUÍDAS</small><b>${String(finished).padStart(2, "0")}</b></div><div class="panel"><small>QUILÔMETROS REGISTRADOS</small><b class="cyan-text">${num(totalKm, 1)}<em>km</em></b></div><div class="panel"><small>SÉRIES CONCLUÍDAS</small><b>${entries.reduce((sum, [key]) => sum + count(key), 0)}</b></div></div>` +
    (entries.length
      ? `<div class="history-list">${entries
          .map(
            ([key, s], index) =>
              `${index === 0 || entries[index - 1][0].slice(0, 7) !== key.slice(0, 7) ? `<h2 class="history-month">${dateFromKey(key).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>` : ""}<article class="panel history-entry"><div class="history-title"><div>${tag(workouts[s.type].kind === "run" ? "CORRIDA" : "FORÇA", workouts[s.type].kind)}<h3>${workouts[s.type].name}</h3><p>${fullDate(key)}</p></div><button class="button quiet" data-action="open-day" data-date="${key}">Abrir ${arrow}</button></div>${
                s.run
                  ? `<div class="history-run"><span><b>${num(s.run.km, 2)}</b> km</span><span><b>${num(s.run.minutes, 1)}</b> min</span><span><b>${paceText((s.run.minutes * 60) / s.run.km)}</b> /km</span><span>Esforço <b>${s.run.rpe}/10</b></span></div>${s.run.hardPace ? `<p class="caption">Blocos fortes · ${paceText(s.run.hardPace)}/km · esforço ${s.run.hardRpe}/10</p>` : ""}${s.run.plan ? `<p class="caption">Planejado · ${paceText(s.type === "interval" ? s.run.plan.hardPace : s.run.plan.easyPace)}/km · ${s.type === "interval" ? 40 : s.type === "easy" ? 30 : s.run.plan.longMinutes} min</p>` : ""}${s.run.notes ? `<p class="history-note">${escape(s.run.notes)}</p>` : ""}`
                  : `<details class="history-strength"><summary>Consultar séries registradas ${icon("chevron-down")}</summary><div class="history-sets">${Object.entries(
                      s.sets,
                    )
                      .filter(([, sets]) =>
                        sets.some(
                          (x) => x.done || x.kg !== "" || x.reps !== "",
                        ),
                      )
                      .map(
                        ([id, sets]) =>
                          `<div><span>${escape(exercises[id]?.name || id)}</span><b>${setHistoryText(sets, Boolean(s.withoutWeight?.[id]))}</b></div>`,
                      )
                      .join("")}</div></details>`
              }<p class="caption">${s.done ? "✓ Sessão concluída" : "◐ Sessão em andamento"}</p></article>`,
          )
          .join("")}</div>`
      : `<div class="empty-state panel"><span>↗</span><h2>Sua história começa no próximo treino.</h2><p>Registre as séries ou uma corrida e volte aqui para acompanhar.</p><a class="button primary" href="#hoje">Ver meu treino ${arrow}</a></div>`)
  );
}
function openDialog(html, compact = false) {
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
  $("#guide-content").scrollTop = 0;
  disposeMovement = createMovementPlayer($(".movement-guide"));
}
function confirmSession(onConfirm) {
  const completed = count(selected),
    name = workouts[getType(selected)].name;
  pendingConfirmation = onConfirm;
  openDialog(
    `<div class="dialog-top"><span class="eyebrow">FECHAR O TREINO</span><button class="close-button" data-action="close-dialog" aria-label="Fechar confirmação">${icon("x")}</button></div><div class="confirm-symbol">${icon("circle-check")}</div><h2 id="guide-title">Concluir sessão?</h2><p class="muted">${name} · ${shortDate(selected)}</p><div class="confirm-progress"><strong>${completed}<span>/21</span></strong><span>séries marcadas</span></div><p>${completed < 21 ? "Você ainda tem séries não marcadas. Pode voltar ao treino ou concluir com os registros atuais." : "Todas as séries estão marcadas. Salve a conclusão para acompanhar seu progresso no histórico."}</p><div class="dialog-actions"><button class="button quiet" data-action="close-dialog">Voltar ao treino</button><button class="button primary" data-action="confirm-session">Concluir sessão ${icon("check")}</button></div>`,
    true,
  );
}
function importDialog() {
  importGeneration++;
  pendingImport = null;
  openDialog(
    `<div class="dialog-top"><span class="eyebrow">SEU DIÁRIO, COM VOCÊ</span><button class="close-button" data-action="close-dialog" aria-label="Fechar importação">${icon("x")}</button></div>
    <h2 id="guide-title">Importar backup</h2><p class="muted">Escolha um arquivo JSON exportado pelo HÍBRIDO. Você poderá conferir o conteúdo antes de restaurar.</p>
    <label class="import-dropzone" for="import-file"><span class="import-symbol" aria-hidden="true">${icon("arrow-up")}</span><strong>Escolher arquivo JSON</strong><small>Até 10 MB · versões 1, 2 e 3</small><input id="import-file" type="file" accept="application/json,.json" aria-label="Escolher arquivo JSON"></label>
    <p id="import-file-name" class="import-file-name">Nenhum arquivo selecionado</p><p id="import-file-status" class="caption" role="status">A seleção do arquivo ainda não altera seu diário.</p>
    <p id="import-error" class="form-error" role="alert"></p><section id="import-summary" class="import-summary" aria-label="Resumo do backup" aria-live="polite" hidden></section>
    <p class="import-warning">Restaurar substitui os registros e as configurações deste app neste navegador. Exporte uma cópia do diário atual se quiser guardá-lo.</p>
    <div class="dialog-actions"><button class="button quiet" data-action="close-dialog">Cancelar</button><button class="button primary" data-action="restore-backup" disabled>Restaurar backup ${icon("check")}</button></div>`,
    true,
  );
}
function clearDialog() {
  const entries = Object.values(data.sessions),
    total = entries.length;
  pendingConfirmation = () => {
    try {
      localStorage.removeItem(KEY);
      data = defaults();
      settingsUi.reset();
      storageLocked = false;
      storageProblem = "";
      expanded.clear();
      render();
      dialogReturnFocus = main;
      notify("Dados do app apagados.");
    } catch {
      notify(
        "O navegador não permitiu limpar o armazenamento. Seus dados foram preservados.",
      );
    }
  };
  openDialog(
    `<div class="dialog-top"><span class="eyebrow">ARMAZENAMENTO LOCAL</span><button class="close-button" data-action="close-dialog" aria-label="Fechar confirmação">${icon("x")}</button></div><h2 id="guide-title">Limpar este diário?</h2><p class="muted">${total ? `${total} ${total === 1 ? "sessão registrada será apagada" : "sessões registradas serão apagadas"}` : "As configurações deste app serão apagadas"}, junto com os paces e as preferências salvas neste navegador.</p><p class="import-warning">Essa ação não pode ser desfeita pelo app. Guarde um backup antes de continuar.</p><div class="dialog-actions"><button class="button quiet" data-action="close-dialog">Manter meu diário</button><button class="button danger" data-action="confirm-action">Apagar dados deste app</button></div>`,
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
      )}</div>${id === "reverse-crunch" ? '<p class="caption">A demonstração de referência usa o chão. Aqui, o mesmo movimento de elevação da pelve é adaptado ao banco, com a cabeça e as costas apoiadas.</p>' : ""}<div class="guide-footer">${ref ? `${link(ref.demo, "▷ Ver demonstração", "button primary")}${link(ref.source, "Fonte do exercício")}` : "<p>As referências não carregaram. Recarregue a página com internet para acessar os links.</p>"}<p class="caption">O vídeo abre em outra página. As instruções e ilustrações permanecem disponíveis aqui.</p></div>`,
  );
}
function sources() {
  openDialog(
    `<div class="dialog-top"><span class="eyebrow">TRANSPARÊNCIA</span><button class="close-button" data-action="close-dialog" aria-label="Fechar fontes">×</button></div><h2 id="guide-title">Fontes e método</h2><p>A divisão semanal, os exercícios, as séries e as durações reproduzem as imagens fornecidas do post de @thalleshirakawa.</p>${link("https://www.instagram.com/p/Dd8zBnRkXkR/", "Plano original")}<h3>Corrida</h3><p>Usamos seu pace informado para converter duração em distância e velocidade. Não estimamos capacidade fisiológica nem aplicamos automaticamente as zonas VDOT.</p>${link("https://www.cdc.gov/physical-activity-basics/measuring/index.html", "CDC · intensidade relativa e teste da conversa")}${link("https://vdoto2.com/calculator/", "V.O2 · referência sobre ritmos de treino")}<p>O esforço 3–4/10 e o intervalado de 3 min + 1 min são do post. O V.O2 é referência conceitual de ritmos, não a origem dessa sessão nem uma fórmula aplicada pelo app.</p><h3>Progressão</h3><p>Ajustamos segundos por km em 2,5% por ponto fora da faixa, até +10% ou −5%. Com progressão ativa: metade da desaceleração para excesso de 1–2 pontos; excesso de 3 ou mais mantém correção integral. Duas últimas sessões equivalentes na faixa permitem −1%, sem somar outra correção. Essa é uma heurística do app, não uma conversão fisiológica exata.</p><p>A carga sugerida usa a referência de cada série: aumenta pelo percentual escolhido ao atingir 8 repetições. Esse gatilho foi escolhido para este plano.</p>${link("https://pubmed.ncbi.nlm.nih.gov/19204579/", "ACSM · progressão em musculação (2009)")}<h3>Musculação</h3><p>Textos resumidos em português e ilustrações esquemáticas originais. As demonstrações externas podem mostrar equipamentos ou variantes diferentes; observe as notas de cada guia.</p><div class="source-list">${Object.values(
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
document.addEventListener("click", (event) => {
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
      if (link.hasAttribute("data-open-today")) {
        selected = dateKey();
        expanded.clear();
        navigateTo("hoje", { refresh: true, session: true });
        return;
      }
      navigateTo(hash, { session: hash === "session" });
      return;
    }
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "use-load") {
    const id = button.dataset.id,
      index = Number(button.dataset.index);
    if (
      withoutWeight(data.sessions, selected, id) ||
      data.sessions[selected]?.sets?.[id]?.[index]?.done
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
    input.focus({ preventScroll: true });
    persist("Carga sugerida aplicada. Ajuste ao peso disponível na academia.");
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
  if (action === "day" || action === "open-day") {
    const changed = selected !== button.dataset.date;
    selected = button.dataset.date;
    if (changed) expanded.clear();
    if (action === "open-day")
      navigateTo("hoje", { session: true, refresh: true });
    else if (changed) refreshDay();
    return;
  }
  if (action === "reset-day") {
    if (selected !== dateKey()) {
      selected = dateKey();
      expanded.clear();
      refreshDay();
    }
    return;
  }
  if (["prev-week", "next-week", "current-week"].includes(action)) {
    const before = week;
    week =
      action === "current-week"
        ? weekStart(dateKey())
        : addDays(week, action === "prev-week" ? -7 : 7);
    if (before !== week) {
      $(".week-controls h2").textContent =
        `${shortDate(week)} — ${shortDate(addDays(week, 6))}`;
      motion.stop($(".calendar-grid"));
      $(".calendar-grid").outerHTML = calendarView();
      hydrateIcons($(".calendar-grid"));
      $("[data-action=current-week]").hidden = week === weekStart(dateKey());
      motion.enter($(".calendar-grid"), "week", week > before ? 1 : -1);
    }
    return;
  }
  if (action === "finish-strength") {
    if (data.sessions[selected]?.done) {
      session().done = false;
      persist("Sessão reaberta.");
      syncStrength();
      return;
    }
    const key = selected;
    confirmSession(() => {
      session(key).done = true;
      persist("Sessão concluída. Bom trabalho!");
      syncStrength();
      motion.feedback($(".week-summary .progress-ring b"));
    });
    return;
  }
  if (action === "export") {
    let text;
    if (storageLocked) {
      try {
        text = localStorage.getItem(KEY) || JSON.stringify(data);
      } catch {
        text = JSON.stringify(data);
      }
    } else text = JSON.stringify(data, null, 2);
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
    dialogs.close(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(imported));
        data = imported;
        settingsUi.reset();
        storageLocked = false;
        storageProblem = "";
        expanded.clear();
        render();
        dialogReturnFocus = $('[data-action="import"]') ?? main;
        notify("Backup restaurado com sucesso.");
      } catch {
        notify(
          "O navegador não conseguiu restaurar o backup. O diário anterior foi preservado.",
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
  const input = event.target;
  if (input.closest("[data-settings-form]")) return;
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
      const entries = Object.values(imported.sessions);
      const series = entries.flatMap((s) => Object.values(s.sets).flat());
      $("#import-summary").innerHTML =
        `<p class="eyebrow">O QUE SERÁ RESTAURADO</p><dl class="import-metrics"><div><dt>Sessões</dt><dd>${entries.length}</dd></div><div><dt>Concluídas</dt><dd>${entries.filter((s) => s.done).length}</dd></div><div><dt>Séries feitas</dt><dd>${series.filter((s) => s.done).length}</dd></div><div><dt>Corridas</dt><dd>${entries.filter((s) => s.run).length}</dd></div></dl><p class="caption">${parsed.version === 3 ? "Backup versão 3." : `Backup versão ${parsed.version}, atualizado para versão 3 ao restaurar.`} Configurações incluídas. Nenhum dado será enviado para fora deste navegador.</p>`;
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
  if (event.target.closest("#run-form")) {
    const form = $("#run-form"),
      m = Number(form.elements.minutes.value),
      km = Number(form.elements.km.value);
    $("#actual-pace").textContent =
      `${m > 0 && km > 0 ? paceText((m * 60) / km) : "—"} /km`;
  }
});
document.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target,
    values = Object.fromEntries(new FormData(form));
  if (form.matches("[data-settings-form]")) return;
  if (!form.reportValidity()) return;
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
        ? getRunPlan(s.type, data.settings, data.sessions, selected).snapshot
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
      $(".pace-advice [data-plan-caption]").textContent =
        "Estimativa gradual do app; o esforço real continua orientando a execução. Seus paces base ficam preservados. Este plano foi salvo com a sessão.";
    }
    s.done = true;
    persist("Corrida registrada. Mais um treino na conta!");
    syncTodayStatus();
    $("#run-form button[type=submit]").innerHTML =
      `Salvar alterações ${icon("check")}`;
    motion.feedback($("#run-form button[type=submit]"));
  }
});
function handleLocation() {
  if (location.hash === "#main") return;
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
render();
if (location.hash === "#session") scrollToSession();
