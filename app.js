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
  runningPlan,
  planTotal,
  distance,
  speed,
  validateBackup,
  previousSets,
  maskTime,
  parseDuration,
  durationText,
  validDate,
  recentRunPace,
} from "./lib/core.js";
import { workouts, exercises } from "./lib/exercises.js";
import { illustration } from "./lib/diagrams.js";
import { hydrateIcons, applyTimeMask } from "./lib/ui.js";
import { icon } from "./lib/icons.js";
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
  references = {},
  toastTimer,
  pendingConfirmation = null,
  draftManualPace = "";
try {
  const saved = localStorage.getItem(KEY);
  if (saved) data = validateBackup(JSON.parse(saved));
} catch (error) {
  storageLocked = true;
  storageProblem =
    "Não foi possível ler o diário salvo. Seus dados não serão sobrescritos. Exporte uma cópia em Configurações antes de limpar o armazenamento.";
}
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
function render() {
  const rawRoute = location.hash.slice(1);
  const route = ["hoje", "semana", "historico", "configuracoes"].includes(
    rawRoute,
  )
    ? rawRoute
    : "hoje";
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const active = a.dataset.nav === route;
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
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
        historico: historyView,
        configuracoes: settingsView,
      }[route] || todayView
    )();
  document.title = `${{ hoje: "Hoje", semana: "Semana", historico: "Histórico", configuracoes: "Configurações" }[route] || "Hoje"} · HÍBRIDO`;
  hydrateIcons();
  if (route === "configuracoes") {
    draftManualPace = data.settings.useRecentPace
      ? data.settings.manualHardPace
      : data.settings.hardPace;
    updateRecentPace();
  }
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
      `<button class="button quiet" data-action="reset-day">Ir para hoje</button>`,
    ) +
    (!data.settings.easyPace
      ? `<div class="setup-banner"><span class="setup-symbol">↗</span><div><strong>Seu ritmo é o ponto de partida.</strong><p>Configure seus paces para calcular os treinos de corrida.</p></div><a class="button" href="#configuracoes">Configurar ritmos ${arrow}</a></div>`
      : "") +
    `<div class="dashboard-grid"><section class="hero ${w.kind}"><div class="hero-copy">${tag(w.tag, w.kind)}<p class="hero-overline">${selected === dateKey() ? "O TREINO DE HOJE" : "TREINO SELECIONADO"}</p><h2>${w.name}<span>.</span></h2><p>${w.subtitle}</p><div class="hero-stats">${w.kind === "strength" ? "<div><b>07</b><span>exercícios</span></div><div><b>03</b><span>séries cada</span></div><div><b>6–8</b><span>repetições</span></div>" : w.kind === "run" ? `<div><b>${type === "interval" ? 40 : type === "easy" ? 30 : data.settings.longMinutes}</b><span>minutos</span></div><div><b>${type === "interval" ? "08" : "3–4"}</b><span>${type === "interval" ? "blocos" : "esforço / 10"}</span></div>` : "<div><b>01</b><span>pausa merecida</span></div>"}</div><a class="button primary" href="#session">${data.sessions[selected]?.done ? "Rever treino" : w.kind === "rest" ? "Ver recuperação" : "Abrir treino"} <span>↓</span></a></div><div class="hero-art" aria-hidden="true"><div class="orbit o1"></div><div class="orbit o2"></div><div class="orbit o3"></div><span class="art-word">${w.kind === "strength" ? "STR" : w.kind === "run" ? "RUN" : "RST"}</span><span class="art-cross">+</span><span class="art-caption">STRENGTH × ENDURANCE</span></div></section><section class="week-summary panel"><p class="eyebrow">CONSISTÊNCIA &gt; PRESSA</p><h2>Uma semana.<br>Seis movimentos.</h2><div class="progress-ring" style="--progress:${Math.min(done / 6, 1) * 100}%"><div><b>${done}<small>/6</small></b><span>treinos concluídos</span></div></div><div class="split-stat"><span><i class="dot lime"></i> Musculação <b>3</b></span><span><i class="dot cyan"></i> Corrida <b>3</b></span></div></section></div><div class="section-title"><h2>Sua semana</h2><a class="text-link" href="#semana">Ver calendário ${arrow}</a></div>${weekStrip(start)}<section id="session" class="session-section">${sessionView(type)}</section>`
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
  return `<div class="section-title"><div><p class="eyebrow">MUSCULAÇÃO · ${shortDate(selected)}</p><h2>Sua sessão de ${w.name}</h2></div><span class="count-pill">${total}/21 séries</span></div><div class="progress-line"><span style="width:${(total / 21) * 100}%"></span></div><p class="section-hint">Abra um exercício para registrar as séries. Toque em “Como fazer” para ver o guia.</p><div class="exercise-list">${w.ids.map((id, index) => exerciseCard(id, index, s)).join("")}</div><div class="session-bottom"><p><span class="status-dot"></span> ${storageProblem ? "Confira o aviso de armazenamento" : "Alterações salvas neste navegador"}</p><button class="button ${s?.done ? "quiet" : "primary"}" data-action="finish-strength">${s?.done ? "Reabrir sessão" : "Concluir sessão"} ${s?.done ? "↶" : "✓"}</button></div>`;
}
function exerciseCard(id, index, s) {
  const e = exercises[id],
    sets = s?.sets[id] || emptySets(),
    previous = previousSets(data.sessions, selected, id),
    complete = sets.filter((x) => x.done).length;
  return `<details class="exercise-card" data-exercise="${id}" ${expanded.has(id) ? "open" : ""}><summary><span class="exercise-number">${String(index + 1).padStart(2, "0")}</span><span class="exercise-name"><b>${e.name}</b><small>${e.muscles} <span>· 3 × 6–8</span></small></span><span class="exercise-check ${complete === 3 ? "complete" : ""}">${complete === 3 ? "✓" : `${complete}/3`}</span><span class="chevron">⌄</span></summary><div class="exercise-body"><div class="exercise-tools"><span>${e.variant}</span><button class="button small" data-action="guide" data-id="${id}">Como fazer ${arrow}</button></div>${previous ? `<p class="previous">Última sessão · ${shortDate(previous.date)}: ${previous.sets.map((x) => `${x.kg === "" ? "—" : num(x.kg, 0)} kg × ${x.reps === "" ? "—" : x.reps}`).join(" / ")}</p>` : '<p class="previous">Seu primeiro registro. Comece com uma carga que permita controlar o movimento.</p>'}<div class="sets-grid set-header"><span>SÉRIE</span><span>CARGA (KG)</span><span>REPETIÇÕES</span><span>FEITA</span></div>${sets.map((set, i) => `<div class="sets-grid ${set.done ? "set-done" : ""}"><b>${String(i + 1).padStart(2, "0")}</b><input type="number" inputmode="decimal" min="0" max="2000" step="0.01" value="${set.kg}" placeholder="—" aria-label="Carga da série ${i + 1} de ${e.name}" data-id="${id}" data-index="${i}" data-field="kg"><input type="number" inputmode="numeric" min="0" max="1000" step="1" value="${set.reps}" placeholder="6–8" aria-label="Repetições da série ${i + 1} de ${e.name}" data-id="${id}" data-index="${i}" data-field="reps"><label class="check-label"><input type="checkbox" ${set.done ? "checked" : ""} aria-label="Concluir série ${i + 1} de ${e.name}" data-id="${id}" data-index="${i}" data-field="done"><span aria-hidden="true">✓</span></label></div>`).join("")}${["single-rdl", "bulgarian", "leg-curl", "leg-extension"].includes(id) ? '<p class="caption">Uma série corresponde à execução nos dois lados. Registre a carga usada por lado.</p>' : ""}</div></details>`;
}
function runView(type) {
  const blocks = runningPlan(type, data.settings),
    total = planTotal(blocks),
    r = data.sessions[selected]?.run,
    missing =
      !data.settings.easyPace ||
      (type === "interval" && !data.settings.hardPace);
  return `<div class="section-title"><div><p class="eyebrow cyan-text">CORRIDA · ${shortDate(selected)}</p><h2>O caminho de hoje</h2></div>${tag("RITMO CONTROLADO", "run")}</div><div class="run-layout"><div><div class="run-overview panel"><div><small>DURAÇÃO PREVISTA</small><b>${total.minutes}<em>min</em></b></div><div><small>${total.complete ? "DISTÂNCIA ESTIMADA" : "DISTÂNCIA PARCIAL"}</small><b>${total.known ? num(total.km, 2) : "—"}<em>km</em></b></div></div>${missing ? '<div class="notice">Informe seus ritmos para completar os cálculos. <a href="#configuracoes">Configurar paces →</a></div>' : ""}${type === "long" ? `<div class="panel long-options"><label for="long-minutes">Duração do longão <strong>${data.settings.longMinutes} min</strong></label><input id="long-minutes" type="range" min="60" max="90" step="5" value="${data.settings.longMinutes}"><div class="range-labels"><span>60 min</span><span>90 min</span></div><p class="caption">A faixa do plano equivale a ${parsePace(data.settings.easyPace) ? `${num(distance(60, parsePace(data.settings.easyPace)), 1)}–${num(distance(90, parsePace(data.settings.easyPace)), 1)} km` : "uma distância calculada com seu pace leve"}. Escolha conforme sua capacidade atual; não há aumento automático.</p></div>` : ""}<div class="timeline" aria-hidden="true">${blocks.map((b) => `<span class="${b.kind}" style="flex:${b.minutes}"></span>`).join("")}</div><div class="run-blocks">${blocks.map((b, i) => `<div class="run-block"><span class="block-index ${b.kind}">${String(i + 1).padStart(2, "0")}</span><div><b>${b.label}</b><small>${b.pace ? `${paceText(b.pace)} /km · ${num(b.kph)} km/h` : "Pace não informado"}</small></div><div class="block-values"><b>${b.minutes} min</b><small>${b.km === null ? "—" : num(b.km, 2) + " km"}</small></div></div>`).join("")}</div>${!total.complete ? '<p class="caption">O total parcial soma somente as etapas com pace informado. A caminhada pode ficar sem estimativa.</p>' : ""}</div><aside><div class="panel effort-card"><span class="mini-icon">≈</span><p class="eyebrow">FOCO DO TREINO</p><h3>${type === "interval" ? "Forte. Sem sprint." : "O ritmo da conversa."}</h3><p>${type === "interval" ? "Use um pace moderado-forte que você consiga repetir com controle nos oito blocos. Ajuste o ritmo à sua percepção de esforço." : "Mantenha o esforço em 3–4/10, como no plano original. Você deve conseguir conversar com frases completas e sem dificuldade."}</p><a class="text-link" href="#configuracoes">Ajustar meus ritmos ↗</a></div><form id="run-form" class="panel run-form"><p class="eyebrow">DEPOIS DO TREINO</p><h3>Como foi a corrida?</h3><label>Duração realizada (min)<input name="minutes" type="number" min="0.01" max="1440" step="0.01" inputmode="decimal" required value="${r?.minutes ?? ""}" placeholder="Ex.: 30"></label><label>Distância realizada (km)<input name="km" type="number" min="0.001" max="1000" step="0.001" inputmode="decimal" required value="${r?.km ?? ""}" placeholder="Ex.: 5"></label><div class="actual-pace">Pace realizado <strong id="actual-pace">${r ? paceText((r.minutes * 60) / r.km) : "—"} /km</strong></div><label>Esforço percebido (0–10)<select name="rpe" required><option value="">Selecione</option>${Array.from({ length: 11 }, (_, i) => `<option value="${i}" ${r?.rpe === i ? "selected" : ""}>${i}${i === 0 ? " · repouso" : i === 10 ? " · máximo" : ""}</option>`).join("")}</select></label><label>Observações <span class="optional">opcional</span><textarea name="notes" maxlength="2000" rows="3" placeholder="Sensações, percurso, clima…">${escape(r?.notes || "")}</textarea></label><button class="button primary run-primary" type="submit">${r ? "Salvar alterações" : "Salvar e concluir"} ✓</button></form></aside></div>`;
}
function weekView() {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  return (
    heading(
      "OLHE PARA O TODO",
      'Uma semana equilibrada<span class="accent">.</span>',
      "Três dias de força. Três de corrida. Um para recuperar.",
    ) +
    `<div class="week-controls"><button class="button quiet" data-action="prev-week" aria-label="Semana anterior">←</button><h2>${shortDate(week)} — ${shortDate(addDays(week, 6))}</h2><button class="button quiet" data-action="next-week" aria-label="Próxima semana">→</button><button class="text-button" data-action="current-week">Semana atual</button></div><div class="calendar-grid">${dates
      .map((key) => {
        const type = getType(key),
          w = workouts[type],
          s = data.sessions[key];
        return `<button class="calendar-card ${w.kind} ${key === dateKey() ? "is-today" : ""}" data-action="open-day" data-date="${key}"><div class="calendar-top"><span>${dateFromKey(key).toLocaleDateString("pt-BR", { weekday: "long" })}</span><b>${dateFromKey(key).getDate()}</b></div>${tag(w.kind === "strength" ? "FORÇA" : w.kind === "run" ? "CORRIDA" : "PAUSA", w.kind)}<h3>${w.name}</h3><p>${w.kind === "strength" ? "7 exercícios · 3 × 6–8" : type === "interval" ? "40 min · 8 blocos" : type === "easy" ? "30 min · leve" : type === "long" ? "60–90 min · leve" : "Recupere a energia"}</p><div class="calendar-status">${s?.done ? "✓ Concluído" : s ? "◐ Em andamento" : "○ Planejado"} <span>↗</span></div></button>`;
      })
      .join(
        "",
      )}</div><div class="notice subtle">Longão no ${data.settings.longDay === 6 ? "sábado" : "domingo"}. <a href="#configuracoes">Trocar o dia</a>. Sessões já registradas mantêm o treino original.</div>`
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
            ([key, s]) =>
              `<article class="panel history-entry"><div class="history-title"><div>${tag(workouts[s.type].kind === "run" ? "CORRIDA" : "FORÇA", workouts[s.type].kind)}<h2>${workouts[s.type].name}</h2><p>${fullDate(key)}</p></div><button class="button quiet" data-action="open-day" data-date="${key}">Abrir ${arrow}</button></div>${
                s.run
                  ? `<div class="history-run"><span><b>${num(s.run.km, 2)}</b> km</span><span><b>${num(s.run.minutes, 1)}</b> min</span><span><b>${paceText((s.run.minutes * 60) / s.run.km)}</b> /km</span><span>Esforço <b>${s.run.rpe}/10</b></span></div>${s.run.notes ? `<p class="history-note">${escape(s.run.notes)}</p>` : ""}`
                  : `<div class="history-sets">${Object.entries(s.sets)
                      .filter(([, sets]) =>
                        sets.some(
                          (x) => x.done || x.kg !== "" || x.reps !== "",
                        ),
                      )
                      .map(
                        ([id, sets]) =>
                          `<div><span>${escape(exercises[id]?.name || id)}</span><b>${sets.map((x) => `${x.kg === "" ? "—" : num(x.kg, 0)} kg × ${x.reps === "" ? "—" : x.reps}${x.done ? " ✓" : ""}`).join(" / ")}</b></div>`,
                      )
                      .join("")}</div>`
              }<p class="caption">${s.done ? "✓ Sessão concluída" : "◐ Sessão em andamento"}</p></article>`,
          )
          .join("")}</div>`
      : `<div class="empty-state panel"><span>↗</span><h2>Sua história começa no próximo treino.</h2><p>Registre as séries ou uma corrida e volte aqui para acompanhar.</p><a class="button primary" href="#hoje">Ver meu treino ${arrow}</a></div>`)
  );
}
function settingsView() {
  const s = data.settings,
    run = s.recentRun;
  return (
    heading(
      "AJUSTE AO SEU RITMO",
      'Seu ponto de partida<span class="accent">.</span>',
      "Informe os ritmos que você pratica. O planejador faz as contas.",
    ) +
    `
  <div class="settings-layout">
    <form id="settings-form" class="panel settings-form">
      <p class="eyebrow">01 / CORRIDA</p><h2>Seus ritmos, em min/km</h2>
      <p class="muted">Digite apenas os números. Os dois-pontos são inseridos automaticamente.</p>
      <div class="form-pair">
        <label for="easy-pace">Pace leve<input id="easy-pace" name="easyPace" data-mask="pace" inputmode="numeric" maxlength="5" pattern="[0-9]{1,2}:[0-5][0-9]" required value="${escape(s.easyPace)}" placeholder="mm:ss" aria-describedby="easy-pace-hint"><small id="easy-pace-hint">Conversa confortável, com frases completas.</small></label>
        <label for="hard-pace">Pace moderado-forte<input id="hard-pace" name="hardPace" data-mask="pace" inputmode="numeric" maxlength="5" pattern="[0-9]{1,2}:[0-5][0-9]" required ${s.useRecentPace ? "readonly" : ""} value="${escape(s.hardPace)}" placeholder="mm:ss" aria-describedby="hard-pace-hint"><small id="hard-pace-hint">Controlado e repetível. Calibrado pelo seu esforço.</small></label>
      </div>
      <label for="walk-pace">Pace de caminhada <span class="optional">opcional</span><input id="walk-pace" name="walkPace" data-mask="pace" inputmode="numeric" maxlength="5" pattern="[0-9]{1,2}:[0-5][0-9]" value="${escape(s.walkPace)}" placeholder="mm:ss"><small>Usado nos 3 minutos finais do intervalado.</small></label>
      <section class="recent-run-card" aria-labelledby="recent-run-title">
        <h3 id="recent-run-title">Maior corrida recente</h3>
        <p class="muted">Registre os dados para calcular seu pace médio.</p>
        ${s.recentRunNote ? `<p class="legacy-note">Registro anterior: ${escape(s.recentRunNote)}</p>` : ""}
        <div class="recent-run-fields">
          <label for="recent-km">Distância (km)<input id="recent-km" name="recentKm" type="number" inputmode="decimal" min="0.001" max="1000" step="0.001" required value="${run.km}" placeholder="Ex.: 8"></label>
          <label for="recent-time">Tempo (hh:mm:ss)<input id="recent-time" name="recentTime" data-mask="duration" inputmode="numeric" maxlength="8" required value="${durationText(run.seconds)}" placeholder="00:48:00"><small>Ex.: 48 minutos = 00:48:00.</small></label>
          <label for="recent-date">Data<input id="recent-date" name="recentDate" type="date" required max="${dateKey()}" value="${run.date}"></label>
        </div>
        <div class="actual-pace">Pace da corrida<strong id="recent-pace" aria-live="polite">— /km</strong></div>
        <label class="pace-toggle" for="use-recent-pace"><input id="use-recent-pace" name="useRecentPace" type="checkbox" ${s.useRecentPace ? "checked" : ""}><span>Usar este pace como moderado-forte padrão<small>O campo fica vinculado a esta corrida e não pode ser editado enquanto a opção estiver marcada.</small></span></label>
      </section>
      <hr><p class="eyebrow">02 / SUA SEMANA</p>
      <div class="form-pair"><label>Dia do longão<select name="longDay"><option value="6" ${s.longDay === 6 ? "selected" : ""}>Sábado</option><option value="0" ${s.longDay === 0 ? "selected" : ""}>Domingo</option></select></label><label>Duração do longão<select name="longMinutes">${[60, 65, 70, 75, 80, 85, 90].map((n) => `<option value="${n}" ${s.longMinutes === n ? "selected" : ""}>${n} minutos</option>`).join("")}</select></label></div>
      <p class="caption">O outro dia do fim de semana fica reservado ao descanso.</p>
      <button class="button primary" type="submit">Salvar configurações ✓</button><p id="settings-error" class="form-error" role="alert"></p>
    </form>
    <aside><section class="panel backup-card"><p class="eyebrow">SEU DIÁRIO É SEU</p><h2>Guarde uma cópia.</h2><p>Os registros ficam neste navegador. Exporte um backup para guardar ou transferir para outro dispositivo.</p><button class="button" data-action="export">↓ Exportar backup JSON</button><label class="button import-label">↑ Importar backup<input id="import-file" type="file" accept="application/json,.json"></label><p class="caption">A importação substitui o diário atual após confirmação.</p></section>
    <section class="panel method-card"><p class="eyebrow">COMO CALCULAMOS</p><h3>Tempo × seu ritmo.</h3><p>A distância estimada é o tempo dividido pelo pace. Os alvos de esforço e a divisão semanal vêm do plano das imagens.</p><p>Você pode informar o pace moderado-forte ou vincular o pace médio da corrida recente por sua escolha. Isso não faz uma avaliação automática de intensidade.</p><button class="text-button" data-action="sources">Consultar fontes ↗</button></section><button class="danger-button" data-action="clear">Limpar todos os dados deste app</button></aside>
  </div>`
  );
}

function openDialog(html, compact = false) {
  $("#guide-dialog").classList.toggle("confirm-dialog", compact);
  $("#guide-content").innerHTML = html;
  hydrateIcons($("#guide-content"));
  $("#guide-dialog").showModal();
  $("#guide-dialog").scrollTop = 0;
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
function readRecentRun(form) {
  return {
    km:
      form.elements.recentKm.value === ""
        ? ""
        : Number(form.elements.recentKm.value),
    seconds: parseDuration(form.elements.recentTime.value) ?? "",
    date: form.elements.recentDate.value,
  };
}
function updateRecentPace() {
  const form = $("#settings-form");
  if (!form) return;
  const run = readRecentRun(form),
    pace = recentRunPace(run),
    checked = form.elements.useRecentPace.checked,
    hard = form.elements.hardPace;
  $("#recent-pace").textContent = pace ? `${paceText(pace)} /km` : "— /km";
  hard.readOnly = checked;
  hard.setAttribute("aria-readonly", String(checked));
  if (checked) hard.value = pace ? paceText(pace) : "";
  $("#hard-pace-hint").textContent = checked
    ? "Vinculado à corrida recente. Desmarque a opção abaixo para editar."
    : "Controlado e repetível. Calibrado pelo seu esforço.";
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
    `<div class="dialog-top"><span class="eyebrow">TRANSPARÊNCIA</span><button class="close-button" data-action="close-dialog" aria-label="Fechar fontes">×</button></div><h2 id="guide-title">Fontes e método</h2><p>A divisão semanal, os exercícios, as séries e as durações reproduzem as imagens fornecidas do post de @thalleshirakawa.</p>${link("https://www.instagram.com/p/Dd8zBnRkXkR/", "Plano original")}<h3>Corrida</h3><p>Usamos seu pace informado para converter duração em distância e velocidade. Não estimamos capacidade fisiológica nem aplicamos automaticamente as zonas VDOT.</p>${link("https://www.cdc.gov/physical-activity-basics/measuring/index.html", "CDC · intensidade relativa e teste da conversa")}${link("https://vdoto2.com/calculator/", "V.O2 · referência sobre ritmos de treino")}<p>O esforço 3–4/10 e o intervalado de 3 min + 1 min são do post. O V.O2 é referência conceitual de ritmos, não a origem dessa sessão nem uma fórmula aplicada pelo app.</p><h3>Musculação</h3><p>Textos resumidos em português e ilustrações esquemáticas originais. As demonstrações externas podem mostrar equipamentos ou variantes diferentes; observe as notas de cada guia.</p><div class="source-list">${Object.values(
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
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "guide") return guide(button.dataset.id);
  if (action === "sources") return sources();
  if (action === "close-dialog") return $("#guide-dialog").close();
  if (action === "confirm-session") {
    const callback = pendingConfirmation;
    pendingConfirmation = null;
    $("#guide-dialog").close();
    callback?.();
    return;
  }
  if (action === "day" || action === "open-day") {
    selected = button.dataset.date;
    expanded.clear();
    if (action === "open-day") {
      location.hash = "hoje";
      render();
      main.scrollIntoView({ behavior: "smooth" });
    } else render();
    return;
  }
  if (action === "reset-day") {
    selected = dateKey();
    expanded.clear();
    render();
    return;
  }
  if (action === "prev-week" || action === "next-week") {
    week = addDays(week, action === "prev-week" ? -7 : 7);
    render();
    return;
  }
  if (action === "current-week") {
    week = weekStart(dateKey());
    render();
    return;
  }
  if (action === "finish-strength") {
    if (data.sessions[selected]?.done) {
      session().done = false;
      persist("Sessão reaberta.");
      render();
      return;
    }
    const key = selected;
    confirmSession(() => {
      session(key).done = true;
      persist("Sessão concluída. Bom trabalho!");
      render();
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
  if (action === "clear") {
    if (
      !confirm(
        "Apagar todos os registros e configurações deste app neste navegador? Essa ação não pode ser desfeita.",
      )
    )
      return;
    try {
      localStorage.removeItem(KEY);
      data = defaults();
      storageLocked = false;
      storageProblem = "";
      render();
      notify("Dados do app apagados.");
    } catch {
      notify("O navegador não permitiu limpar o armazenamento.");
    }
    return;
  }
});
document.addEventListener(
  "toggle",
  (event) => {
    if (event.target.matches?.("details[data-exercise]")) {
      if (event.target.open) expanded.add(event.target.dataset.exercise);
      else expanded.delete(event.target.dataset.exercise);
    }
  },
  true,
);
document.addEventListener("change", async (event) => {
  const input = event.target;
  if (input.name === "useRecentPace") {
    const hard = $("#hard-pace");
    if (input.checked) draftManualPace = hard.value;
    else hard.value = draftManualPace;
    updateRecentPace();
    return;
  }
  if (input.dataset.field) {
    if (!input.checkValidity()) {
      input.reportValidity();
      return;
    }
    const s = session(),
      id = input.dataset.id,
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
    if (field === "done") {
      render();
      document
        .querySelector(
          `[data-id="${id}"][data-index="${i}"][data-field="done"]`,
        )
        ?.focus();
    }
    return;
  }
  if (input.id === "long-minutes") {
    data.settings.longMinutes = Number(input.value);
    persist();
    render();
    return;
  }
  if (input.id === "import-file") {
    try {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 10_000_000) throw Error("O backup deve ter até 10 MB.");
      const imported = validateBackup(JSON.parse(await file.text()));
      if (
        !confirm(
          "Substituir os dados atuais pelo backup selecionado? Exporte antes se quiser guardar o diário atual.",
        )
      )
        return;
      const encoded = JSON.stringify(imported);
      localStorage.setItem(KEY, encoded);
      data = imported;
      storageLocked = false;
      storageProblem = "";
      render();
      notify("Backup restaurado com sucesso.");
    } catch (error) {
      notify(
        error instanceof SyntaxError
          ? "Arquivo JSON inválido. Seus dados foram preservados."
          : error.message,
      );
    } finally {
      input.value = "";
    }
  }
});
document.addEventListener("input", (event) => {
  const input = event.target;
  if (input.dataset.mask)
    applyTimeMask(input, (value) =>
      maskTime(value, input.dataset.mask === "duration" ? 6 : 4),
    );
  if (
    input.closest("#settings-form") &&
    ["recentKm", "recentTime", "recentDate"].includes(input.name)
  )
    updateRecentPace();
  if (input.name === "hardPace" && !input.readOnly)
    draftManualPace = input.value;
  if (
    input.dataset.field &&
    input.dataset.field !== "done" &&
    input.checkValidity()
  ) {
    const s = session(),
      id = input.dataset.id;
    s.sets[id] ??= emptySets();
    s.sets[id][Number(input.dataset.index)][input.dataset.field] =
      input.value === "" ? "" : Number(input.value);
    s.done = false;
    persist();
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
  if (form.id === "settings-form") {
    const error = $("#settings-error");
    const recentRun = readRecentRun(form),
      useRecentPace = form.elements.useRecentPace.checked;
    if (
      !recentRunPace(recentRun) ||
      !validDate(recentRun.date) ||
      recentRun.date > dateKey()
    ) {
      error.textContent =
        "Informe uma distância e um tempo maiores que zero e uma data válida até hoje. Use hh:mm:ss para o tempo.";
      return;
    }
    if (useRecentPace) values.hardPace = paceText(recentRunPace(recentRun));
    for (const key of ["easyPace", "hardPace", "walkPace"]) {
      if ((key !== "walkPace" || values[key]) && !parsePace(values[key])) {
        error.textContent =
          "Use um pace maior que zero no formato mm:ss (segundos entre 00 e 59).";
        return;
      }
    }
    if (parsePace(values.hardPace) >= parsePace(values.easyPace)) {
      error.textContent =
        "O pace moderado-forte deve ser menor (mais rápido) que o pace leve. Confira os valores.";
      return;
    }
    data.settings = {
      easyPace: values.easyPace,
      hardPace: values.hardPace,
      walkPace: values.walkPace,
      recentRun,
      recentRunNote: data.settings.recentRunNote,
      useRecentPace,
      manualHardPace: useRecentPace
        ? parsePace(draftManualPace)
          ? draftManualPace
          : ""
        : values.hardPace,
      longDay: Number(values.longDay),
      longMinutes: Number(values.longMinutes),
    };
    persist("Configurações salvas. Seu planejador está pronto.");
    error.textContent = "";
    return;
  }
  if (form.id === "run-form") {
    const s = session();
    s.run = {
      minutes: Number(values.minutes),
      km: Number(values.km),
      rpe: Number(values.rpe),
      notes: values.notes.trim(),
    };
    s.done = true;
    persist("Corrida registrada. Mais um treino na conta!");
    render();
  }
});
window.addEventListener("hashchange", () => {
  if (location.hash === "#session") {
    document.getElementById("session")?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  render();
  window.scrollTo(0, 0);
});
$("#guide-dialog").addEventListener("click", (event) => {
  if (event.target === $("#guide-dialog")) {
    const r = event.target.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      event.target.close();
  }
});
$("#guide-dialog").addEventListener("close", () => {
  pendingConfirmation = null;
});
document.addEventListener("focusout", (event) => {
  if (event.target.dataset.mask === "duration") {
    const seconds = parseDuration(event.target.value);
    if (seconds) event.target.value = durationText(seconds);
  }
});
render();
