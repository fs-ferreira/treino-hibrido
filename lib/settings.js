import {
  parsePace,
  paceText,
  parseDuration,
  durationText,
  recentRunPace,
  validDate,
  dateKey,
  maskTime,
} from "./core.js?v=1.6.0";
import { nextPaceRevisions } from "./progression.js?v=1.6.0";
import { applyTimeMask } from "./ui.js?v=1.6.0";
import { icon } from "./icons.js?v=1.6.0";

export const settingsSections = Object.freeze([
  {
    id: "corrida",
    label: "Corrida",
    title: "Ritmos da corrida",
    description: "Seus paces base e a corrida que serve de referência.",
  },
  {
    id: "progressao",
    label: "Progressão",
    title: "Progresso com referência",
    description: "Ajuste as sugestões de carga e ritmo ao seu objetivo.",
  },
  {
    id: "semana",
    label: "Semana",
    title: "Sua semana de treino",
    description: "Escolha quando correr o longão e por quanto tempo.",
  },
  {
    id: "dados",
    label: "Dados",
    title: "Seu diário, com você",
    description:
      "Guarde uma cópia dos seus registros e saiba como são armazenados.",
  },
]);
export const DRAFT_KEY = "treino-hibrido:settings-draft:v1";
const fields = {
  corrida: [
    "easyPace",
    "hardPace",
    "walkPace",
    "recentKm",
    "recentTime",
    "recentDate",
    "useRecentPace",
    "manualHardPace",
  ],
  progressao: ["loadProgression", "paceProgression"],
  semana: ["longDay", "longMinutes"],
};
const booleans = new Set(["useRecentPace", "paceProgression"]);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function settingsDraft(section, s) {
  if (section === "corrida")
    return {
      easyPace: s.easyPace,
      hardPace: s.hardPace,
      walkPace: s.walkPace,
      recentKm: String(s.recentRun.km),
      recentTime: durationText(s.recentRun.seconds),
      recentDate: s.recentRun.date,
      useRecentPace: s.useRecentPace,
      manualHardPace: s.useRecentPace ? s.manualHardPace : s.hardPace,
    };
  if (section === "progressao")
    return {
      loadProgression: String(s.loadProgression),
      paceProgression: s.paceProgression,
    };
  if (section === "semana")
    return { longDay: String(s.longDay), longMinutes: String(s.longMinutes) };
  return {};
}
export function validateSettings(section, raw, current, today = dateKey()) {
  const errors = {},
    next = { ...current };
  for (const key of fields[section] ?? []) {
    if (
      booleans.has(key)
        ? typeof raw[key] !== "boolean"
        : typeof raw[key] !== "string"
    )
      errors[key] = "Confira o valor deste campo.";
  }
  if (Object.keys(errors).length) return { settings: null, errors };
  if (section === "corrida") {
    const recentFilled = ["recentKm", "recentTime", "recentDate"].some(
      (k) => raw[k] !== "",
    );
    const run = {
      km: raw.recentKm === "" ? "" : Number(raw.recentKm),
      seconds: parseDuration(raw.recentTime) ?? "",
      date: raw.recentDate,
    };
    if (recentFilled || raw.useRecentPace) {
      if (!Number.isFinite(run.km) || run.km < 0.001 || run.km > 1000)
        errors.recentKm = "Informe uma distância entre 0,001 e 1.000 km.";
      if (!run.seconds)
        errors.recentTime =
          "Informe um tempo maior que zero, até 24 horas, no formato hh:mm:ss.";
      if (!validDate(run.date) || run.date > today)
        errors.recentDate = "Informe uma data válida até hoje.";
      if (!Object.keys(errors).length && !recentRunPace(run))
        errors.recentTime =
          "Confira distância e tempo: o pace deve ficar entre 0:01 e 99:59/km.";
    }
    const hard = raw.useRecentPace
      ? recentRunPace(run)
        ? paceText(recentRunPace(run))
        : ""
      : raw.hardPace;
    for (const [key, value] of Object.entries({
      easyPace: raw.easyPace,
      hardPace: hard,
      walkPace: raw.walkPace,
    })) {
      if (value && !parsePace(value))
        errors[key] =
          "Use mm:ss com um pace maior que zero e segundos de 00 a 59.";
    }
    if (Boolean(raw.easyPace) !== Boolean(hard))
      errors[raw.easyPace ? "hardPace" : "easyPace"] =
        "Informe os paces leve e moderado-forte juntos, ou deixe os dois vazios.";
    if (
      parsePace(hard) &&
      parsePace(raw.easyPace) &&
      parsePace(hard) >= parsePace(raw.easyPace)
    )
      errors.hardPace =
        "O pace moderado-forte precisa ser menor (mais rápido) que o leve.";
    Object.assign(next, {
      easyPace: raw.easyPace,
      hardPace: hard,
      walkPace: raw.walkPace,
      recentRun: run,
      useRecentPace: raw.useRecentPace,
      manualHardPace: raw.useRecentPace
        ? parsePace(raw.manualHardPace)
          ? raw.manualHardPace
          : ""
        : hard,
    });
  } else if (section === "progressao") {
    const n = Number(raw.loadProgression);
    if (
      raw.loadProgression.trim() === "" ||
      !Number.isFinite(n) ||
      n < 0 ||
      n > 10 ||
      !Number.isInteger(n * 2)
    )
      errors.loadProgression = "Use de 0 a 10%, em passos de 0,5.";
    Object.assign(next, {
      loadProgression: n,
      paceProgression: raw.paceProgression,
    });
  } else if (section === "semana") {
    if (!["0", "6"].includes(raw.longDay))
      errors.longDay = "Escolha sábado ou domingo.";
    if (!["60", "65", "70", "75", "80", "85", "90"].includes(raw.longMinutes))
      errors.longMinutes = "Escolha uma duração de 60 a 90 minutos.";
    Object.assign(next, {
      longDay: Number(raw.longDay),
      longMinutes: Number(raw.longMinutes),
    });
  } else
    return {
      settings: null,
      errors: { section: "Categoria de configuração desconhecida." },
    };
  if (Object.keys(errors).length) return { settings: null, errors };
  next.paceRevisions = nextPaceRevisions(current, next);
  return { settings: next, errors };
}

export function createSettingsDrafts(storage) {
  let drafts = {},
    warning = "";
  const unavailable = () => {
    warning =
      "Não foi possível guardar o rascunho na sessão. Ele continuará em memória nesta visita.";
  };
  try {
    const saved = storage?.getItem(DRAFT_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (
        parsed.version !== 1 ||
        !parsed.drafts ||
        typeof parsed.drafts !== "object"
      )
        throw Error();
      for (const [section, names] of Object.entries(fields)) {
        const raw = parsed.drafts[section];
        if (!raw) continue;
        if (
          !names.every((k) =>
            booleans.has(k)
              ? typeof raw[k] === "boolean"
              : typeof raw[k] === "string" && raw[k].length <= 200,
          )
        )
          throw Error();
        drafts[section] = Object.fromEntries(names.map((k) => [k, raw[k]]));
      }
    }
    if (!storage) unavailable();
  } catch {
    drafts = {};
    unavailable();
  }
  function write() {
    try {
      if (!storage) throw Error();
      if (Object.keys(drafts).length)
        storage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, drafts }));
      else storage.removeItem(DRAFT_KEY);
      warning = "";
    } catch {
      unavailable();
    }
  }
  return {
    get(section, settings) {
      return { ...(drafts[section] ?? settingsDraft(section, settings)) };
    },
    dirty(section, settings) {
      return (
        Boolean(drafts[section]) &&
        JSON.stringify(drafts[section]) !==
          JSON.stringify(settingsDraft(section, settings))
      );
    },
    capture(section, raw, settings) {
      const clean = Object.fromEntries(fields[section].map((k) => [k, raw[k]]));
      if (
        JSON.stringify(clean) ===
        JSON.stringify(settingsDraft(section, settings))
      )
        delete drafts[section];
      else drafts[section] = clean;
      write();
    },
    discard(section) {
      delete drafts[section];
      write();
    },
    clear() {
      drafts = {};
      write();
    },
    get warning() {
      return warning;
    },
  };
}

function field(name, label, hint, attrs = "") {
  return `<label for="setting-${name}">${label}<input id="setting-${name}" name="${name}" ${attrs} aria-describedby="hint-${name} error-${name}"><small id="hint-${name}">${hint}</small><span class="field-error" id="error-${name}" hidden></span></label>`;
}
function toggle(name, label, hint) {
  return `<label class="pace-toggle" for="setting-${name}"><input id="setting-${name}" name="${name}" type="checkbox" aria-describedby="hint-${name}"><span>${label}<small id="hint-${name}">${hint}</small></span></label>`;
}
function sectionBody(id, settings) {
  if (id === "corrida")
    return `<p class="caption">Digite os números: 600 vira 6:00. Paces em minutos por quilômetro.</p><div class="form-pair">
    ${field("easyPace", "Pace leve", "Conversa confortável, com frases completas.", 'data-mask="pace" inputmode="numeric" maxlength="5" placeholder="mm:ss"')}
    ${field("hardPace", "Pace moderado-forte", "Controlado e repetível. Calibrado pelo seu esforço.", 'data-mask="pace" inputmode="numeric" maxlength="5" placeholder="mm:ss"')}
    </div>${field("walkPace", 'Pace de caminhada <span class="optional">opcional</span>', "Usado nos 3 minutos finais do intervalado.", 'data-mask="pace" inputmode="numeric" maxlength="5" placeholder="mm:ss"')}
    <section class="recent-run-card" aria-labelledby="recent-run-title"><h3 id="recent-run-title">Maior corrida recente</h3><p class="muted">Distância, tempo e data para calcular seu pace médio.</p>
    ${settings.recentRunNote ? `<p class="legacy-note">Registro anterior: ${esc(settings.recentRunNote)}</p>` : ""}
    <div class="recent-run-fields">${field("recentKm", "Distância (km)", "Deixe os três campos vazios se ainda não tiver uma referência.", 'type="number" inputmode="decimal" min="0.001" max="1000" step="0.001" placeholder="Ex.: 8"')}
    ${field("recentTime", "Tempo (hh:mm:ss)", "48 minutos = 00:48:00.", 'data-mask="duration" inputmode="numeric" maxlength="8" placeholder="00:48:00"')}
    ${field("recentDate", "Data", "Data da corrida, até hoje.", `type="date" max="${dateKey()}"`)}</div>
    <div class="actual-pace">Pace da corrida<strong data-recent-pace aria-live="polite">— /km</strong></div>
    ${toggle("useRecentPace", "Usar este pace como moderado-forte padrão", "Enquanto marcado, o pace moderado-forte fica vinculado a esta corrida.")}</section>
    <details class="help-details"><summary>Como usamos seus paces</summary><p>O pace base define a estimativa de distância e velocidade. O histórico pode ajustar o próximo ritmo sugerido pelo esforço, sem sobrescrever a base.</p><p>Alterar um pace base reinicia as referências adaptativas correspondentes, preservando as corridas realizadas.</p><button class="text-button" type="button" data-action="sources">Consultar fontes ${icon("arrow-up-right")}</button></details>`;
  if (id === "progressao")
    return `<div class="settings-subheading"><span class="tag">MUSCULAÇÃO</span><h3>Carga por série</h3></div>
    ${field("loadProgression", "Progressão de carga (%)", "De 0 a 10%, em passos de 0,5. Use 0% para manter as cargas.", 'type="number" inputmode="decimal" min="0" max="10" step="0.5" required')}
    <p class="settings-explanation">A sugestão aumenta ao atingir pelo menos 8 repetições na série anterior. Abaixo disso, mantém a carga. Você decide quando usar.</p>
    <div class="settings-subheading"><span class="tag run">CORRIDA</span><h3>Ritmo com referência</h3></div>
    ${toggle("paceProgression", "Progressão de pace", "Suaviza pequenas correções para desacelerar e permite avanço gradual após duas corridas na faixa de esforço.")}
    <details class="help-details"><summary>Entender o ajuste de ritmo</summary><p>O ajuste ao esforço funciona mesmo com a progressão desligada. Leve e longão usam alvo de 3–4/10; blocos fortes, 7–8/10.</p><p>Com progressão, o app aplica metade da desaceleração para excesso de 1–2 pontos. Após duas corridas equivalentes na faixa, sugere um pace 1% menor. É uma estimativa gradual, não uma avaliação fisiológica.</p></details>`;
  if (id === "semana")
    return `<div class="form-pair"><label for="setting-longDay">Dia do longão<select id="setting-longDay" name="longDay" aria-describedby="error-longDay"><option value="6">Sábado</option><option value="0">Domingo</option></select><span class="field-error" id="error-longDay" hidden></span></label>
    <label for="setting-longMinutes">Duração do longão<select id="setting-longMinutes" name="longMinutes" aria-describedby="error-longMinutes">${[60, 65, 70, 75, 80, 85, 90].map((n) => `<option value="${n}">${n} minutos</option>`).join("")}</select><span class="field-error" id="error-longMinutes" hidden></span></label></div>
    <div class="notice subtle">O outro dia do fim de semana fica reservado ao descanso. O volume não aumenta automaticamente e sessões já registradas preservam seu planejamento.</div><a class="text-link" href="#semana">Consultar calendário ${icon("calendar-days")}</a>`;
  return `<section class="data-card"><h3>Backup do diário</h3><p>Os registros ficam neste navegador. Exporte uma cópia para guardar ou transferir para outro dispositivo.</p><div class="data-actions"><button class="button" type="button" data-action="export">${icon("arrow-down")} Exportar backup JSON</button><button class="button" type="button" data-action="import">${icon("arrow-up")} Importar backup</button></div><p class="caption">O backup inclui apenas dados salvos. Rascunhos de Configurações não entram no arquivo.</p></section>
    <section class="data-card"><h3>Armazenamento e privacidade</h3><p>Um perfil por navegador, sem login nem sincronização. Seus dados de treino não são enviados ao repositório. Os rascunhos ficam separados, na sessão desta aba.</p><button class="text-button" type="button" data-action="sources">Fontes e método ${icon("arrow-up-right")}</button></section>
    <section class="data-card danger-zone"><h3>Limpar o diário</h3><p>Apaga registros, configurações e rascunhos deste app no navegador. Exporte um backup antes de continuar.</p><button class="button danger" type="button" data-action="clear">Limpar dados deste app</button></section>`;
}
export function settingsView(settings, active = "corrida") {
  return `<div id="settings-page"><div class="page-heading"><div><p class="eyebrow">DO SEU JEITO</p><h1>Configurações<span class="accent">.</span></h1><p class="muted">Ajuste uma categoria por vez. Você escolhe quando salvar.</p></div></div>
    <div class="settings-tabs" role="tablist" aria-label="Categorias de configurações">${settingsSections.map((s) => `<button type="button" role="tab" id="settings-tab-${s.id}" data-settings-tab="${s.id}" aria-controls="settings-panel-${s.id}" aria-selected="${s.id === active}" tabindex="${s.id === active ? 0 : -1}">${s.label}<span class="pending-dot" aria-hidden="true" hidden></span></button>`).join("")}</div>
    <p class="notice draft-warning" data-draft-warning role="status" hidden></p>
    ${settingsSections.map((s) => `<section class="panel settings-panel" id="settings-panel-${s.id}" role="tabpanel" aria-labelledby="settings-tab-${s.id}" ${s.id === active ? "" : "hidden"}><header class="settings-panel-heading"><h2>${s.title}</h2><p class="muted">${s.description}</p></header>${s.id === "dados" ? sectionBody(s.id, settings) : `<form data-settings-form="${s.id}" novalidate><div class="form-errors" data-settings-errors role="alert" hidden></div>${sectionBody(s.id, settings)}<div class="settings-actions"><p data-settings-status role="status">Sem alterações pendentes</p><div><button class="button quiet" type="button" data-settings-discard="${s.id}">Descartar alterações</button><button class="button primary" type="submit">Salvar alterações ${icon("check")}</button></div></div></form>`}</section>`).join("")}</div>`;
}

export function createSettingsController({
  getSettings,
  save,
  navigate,
  storage,
  window: win = globalThis.window,
}) {
  const drafts = createSettingsDrafts(storage),
    errors = {},
    messages = {};
  let root = null,
    active = "corrida",
    cleanups = [];
  const listen = (target, name, fn) => {
    target?.addEventListener(name, fn);
    cleanups.push(() => target?.removeEventListener(name, fn));
  };
  const formFor = (id) => root?.querySelector(`[data-settings-form="${id}"]`);
  function read(form) {
    const id = form.dataset.settingsForm,
      raw = drafts.get(id, getSettings());
    for (const input of form.elements)
      if (fields[id].includes(input.name))
        raw[input.name] =
          input.type === "checkbox" ? input.checked : input.value;
    return raw;
  }
  function showErrors(id) {
    const form = formFor(id);
    if (!form) return;
    const found = errors[id] ?? {};
    for (const input of form.elements) {
      if (!input.name) continue;
      const message = found[input.name],
        node = root.querySelector(`#error-${input.name}`);
      if (message) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
      if (node) {
        node.textContent = message ?? "";
        node.hidden = !message;
      }
    }
    const summary = form.querySelector("[data-settings-errors]");
    summary.hidden = !Object.keys(found).length;
    summary.innerHTML = summary.hidden
      ? ""
      : `<strong>Confira os campos antes de salvar</strong><ul>${Object.entries(
          found,
        )
          .map(
            ([name, text]) =>
              `<li><a href="#setting-${name}" data-error-field="${name}">${esc(text)}</a></li>`,
          )
          .join("")}</ul>`;
  }
  function updateStatus(id) {
    const form = formFor(id);
    if (!form) return;
    const dirty = drafts.dirty(id, getSettings()),
      status = form.querySelector("[data-settings-status]");
    form.dataset.pending = String(dirty);
    const text = dirty
      ? "Alterações pendentes"
      : (messages[id] ?? "Sem alterações pendentes");
    if (status.textContent !== text) status.textContent = text;
    form.querySelector('[type="submit"]').disabled = !dirty;
    form.querySelector("[data-settings-discard]").disabled = !dirty;
    const tab = root.querySelector(`[data-settings-tab="${id}"]`),
      section = settingsSections.find((s) => s.id === id);
    tab.querySelector(".pending-dot").hidden = !dirty;
    tab.setAttribute(
      "aria-label",
      `${section.label}${dirty ? ", alterações pendentes" : ""}`,
    );
    const warning = root.querySelector("[data-draft-warning]");
    warning.textContent = drafts.warning;
    warning.hidden = !drafts.warning;
  }
  function hydrate(id) {
    const form = formFor(id);
    if (!form) return;
    const raw = drafts.get(id, getSettings());
    for (const input of form.elements)
      if (Object.hasOwn(raw, input.name)) {
        if (input.type === "checkbox") input.checked = raw[input.name];
        else input.value = raw[input.name];
      }
    if (id === "corrida") preview(form, raw);
    updateStatus(id);
    showErrors(id);
  }
  function preview(form, raw) {
    const run = {
      km: Number(raw.recentKm),
      seconds: parseDuration(raw.recentTime),
      date: raw.recentDate,
    };
    const pace = recentRunPace(run),
      hard = form.elements.hardPace;
    form.querySelector("[data-recent-pace]").textContent = pace
      ? `${paceText(pace)} /km`
      : "— /km";
    hard.readOnly = raw.useRecentPace;
    hard.setAttribute("aria-readonly", String(raw.useRecentPace));
    if (raw.useRecentPace)
      hard.value = raw.hardPace = pace ? paceText(pace) : "";
    form.querySelector("#hint-hardPace").textContent = raw.useRecentPace
      ? "Vinculado à corrida recente. Desmarque a opção para editar."
      : "Controlado e repetível. Calibrado pelo seu esforço.";
  }
  function capture(form, input, isChange = false) {
    const id = form.dataset.settingsForm,
      raw = read(form);
    if (id === "corrida") {
      if (input?.name === "useRecentPace" && isChange) {
        if (input.checked) raw.manualHardPace = form.elements.hardPace.value;
        else form.elements.hardPace.value = raw.hardPace = raw.manualHardPace;
      }
      if (input?.name === "hardPace" && !input.readOnly)
        raw.manualHardPace = input.value;
      preview(form, raw);
    }
    drafts.capture(id, raw, getSettings());
    if (Object.keys(errors[id] ?? {}).length) {
      errors[id] = validateSettings(id, raw, getSettings()).errors;
      showErrors(id);
    }
    messages[id] = "";
    updateStatus(id);
  }
  function viewport() {
    if (!root) return;
    const height = win.visualViewport?.height;
    root.classList.toggle(
      "settings-short-viewport",
      !height || height < 560 || height < win.innerHeight - 140,
    );
  }
  function revealField() {
    const input = root?.ownerDocument.activeElement;
    if (!input?.matches("input,select,textarea") || !root.contains(input))
      return;
    const form = input.closest("[data-settings-form]"),
      actions = form?.querySelector(".settings-actions");
    if (!actions) return;
    const r = input.getBoundingClientRect(),
      footer = actions.getBoundingClientRect(),
      tabs = root.querySelector('[role="tablist"]').getBoundingClientRect();
    if (
      r.bottom >
        Math.min(footer.top, win.visualViewport?.height ?? win.innerHeight) -
          16 ||
      r.top < Math.max(tabs.bottom, 0) + 12
    )
      input.scrollIntoView({ block: "center", behavior: "instant" });
  }
  function show(id, focus = false) {
    active = settingsSections.some((s) => s.id === id) ? id : "corrida";
    if (!root) return;
    for (const s of settingsSections) {
      const tab = root.querySelector(`[data-settings-tab="${s.id}"]`);
      tab.setAttribute("aria-selected", String(s.id === active));
      tab.tabIndex = s.id === active ? 0 : -1;
      root.querySelector(`#settings-panel-${s.id}`).hidden = s.id !== active;
    }
    const tab = root.querySelector(`[data-settings-tab="${active}"]`);
    if (focus) {
      tab.focus({ preventScroll: true });
      tab.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "instant",
      });
    }
    viewport();
  }
  function unmount() {
    cleanups.forEach((fn) => fn());
    cleanups = [];
    root = null;
  }
  return {
    mount(element, id) {
      unmount();
      root = element;
      for (const section of Object.keys(fields)) hydrate(section);
      listen(root, "input", (e) => {
        const form = e.target.closest("[data-settings-form]");
        if (!form || e.target.type === "checkbox") return;
        if (e.target.dataset.mask)
          applyTimeMask(e.target, (v) =>
            maskTime(v, e.target.dataset.mask === "duration" ? 6 : 4),
          );
        capture(form, e.target);
        revealField();
      });
      listen(root, "change", (e) => {
        const form = e.target.closest("[data-settings-form]");
        if (form) capture(form, e.target, true);
      });
      listen(root, "focusin", revealField);
      listen(root, "focusout", (e) => {
        const form = e.target.closest("[data-settings-form]");
        if (form && e.target.dataset.mask === "duration") {
          const seconds = parseDuration(e.target.value);
          if (seconds) {
            e.target.value = durationText(seconds);
            capture(form, e.target);
          }
        }
        if (
          e.target.closest('[role="tablist"]') &&
          !e.relatedTarget?.closest?.('[role="tablist"]')
        )
          for (const tab of root.querySelectorAll("[data-settings-tab]"))
            tab.tabIndex = tab.dataset.settingsTab === active ? 0 : -1;
      });
      listen(root, "click", (e) => {
        const tab = e.target.closest("[data-settings-tab]");
        if (tab) {
          navigate(tab.dataset.settingsTab);
          return;
        }
        const discard = e.target.closest("[data-settings-discard]");
        if (discard) {
          const id = discard.dataset.settingsDiscard;
          drafts.discard(id);
          delete errors[id];
          messages[id] = "Alterações descartadas";
          hydrate(id);
          formFor(id)
            .querySelector("input,select")
            ?.focus({ preventScroll: true });
        }
        const target = e.target.closest("[data-error-field]");
        if (target) {
          e.preventDefault();
          formFor(active)?.elements[target.dataset.errorField]?.focus();
        }
      });
      listen(root, "keydown", (e) => {
        const tab = e.target.closest("[data-settings-tab]");
        if (
          !tab ||
          e.altKey ||
          e.ctrlKey ||
          e.metaKey ||
          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
        )
          return;
        e.preventDefault();
        const tabs = [...root.querySelectorAll("[data-settings-tab]")],
          i = tabs.indexOf(tab);
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? tabs.length - 1
              : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                tabs.length;
        tabs.forEach((t, j) => (t.tabIndex = j === next ? 0 : -1));
        tabs[next].focus({ preventScroll: true });
        tabs[next].scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "instant",
        });
      });
      listen(root, "submit", (e) => {
        const form = e.target.closest("[data-settings-form]");
        if (!form) return;
        e.preventDefault();
        const id = form.dataset.settingsForm;
        capture(form, null);
        const result = validateSettings(id, read(form), getSettings());
        errors[id] = result.errors;
        showErrors(id);
        if (!result.settings) {
          form.elements[Object.keys(result.errors)[0]]?.focus();
          return;
        }
        if (!save(result.settings)) {
          form.querySelector("[data-settings-status]").textContent =
            "Não foi possível salvar. Seu rascunho foi preservado.";
          return;
        }
        drafts.discard(id);
        errors[id] = {};
        messages[id] = "Salvo neste navegador";
        hydrate(id);
      });
      listen(win, "resize", viewport);
      listen(win.visualViewport, "resize", viewport);
      show(id);
    },
    show,
    unmount,
    reset() {
      drafts.clear();
      for (const id of Object.keys(fields)) {
        delete errors[id];
        delete messages[id];
      }
    },
  };
}
