import test from "node:test";
import assert from "node:assert/strict";
import { defaults, validateBackup, runningPlan } from "../lib/core.js";
import {
  settingsSections,
  settingsDraft,
  validateSettings,
  createSettingsEdits,
  settingsView,
  createSettingsController,
} from "../lib/settings.js";
import { resolveRoute, isAppHash } from "../lib/routes.js";
import { runBlocksView } from "../lib/run-view.js";

test("configurações: quatro categorias, formulários independentes e rotas compatíveis", () => {
  assert.deepEqual(
    settingsSections.map((s) => s.id),
    ["corrida", "progressao", "semana", "dados"],
  );
  assert.equal(resolveRoute("#configuracoes").settingsSection, "corrida");
  for (const { id } of settingsSections) {
    const r = resolveRoute(`#configuracoes/${id}`);
    assert.equal(r.section, "configuracoes");
    assert.equal(r.settingsSection, id);
    assert.ok(isAppHash(r.key));
  }
  assert.equal(
    resolveRoute("#configuracoes/inexistente").settingsSection,
    "corrida",
  );
  const html = settingsView(defaults().settings, "progressao");
  assert.equal((html.match(/role="tab"/g) || []).length, 4);
  assert.equal((html.match(/role="tabpanel"/g) || []).length, 4);
  assert.equal((html.match(/data-settings-form=/g) || []).length, 3);
  assert.match(
    html,
    /settings-tab-progressao[^>]+aria-selected="true" tabindex="0"/,
  );
  assert.doesNotMatch(html, /data-settings-form="dados"/);
  assert.doesNotMatch(html, /Descartar alterações|data-settings-discard/);
  assert.equal(
    (html.match(/class="button primary settings-save"/g) || []).length,
    3,
  );
});
test("salvar Progressão ou Semana ignora rascunhos inválidos de Corrida e preserva campos de outras categorias", () => {
  const s = defaults().settings,
    raw = settingsDraft("progressao", s);
  const original = JSON.stringify(s);
  raw.loadProgression = "2.5";
  raw.paceProgression = true;
  const result = validateSettings("progressao", raw, s).settings;
  assert.equal(result.loadProgression, 2.5);
  assert.equal(result.paceProgression, true);
  assert.equal(result.easyPace, "");
  assert.equal(JSON.stringify(s), original);
  const week = validateSettings(
    "semana",
    { longDay: "0", longMinutes: "75" },
    result,
  ).settings;
  assert.equal(week.longDay, 0);
  assert.equal(week.longMinutes, 75);
  assert.equal(week.loadProgression, 2.5);
  assert.equal(validateBackup({ ...defaults(), settings: week }).version, 3);
});
test("progressão e semana validam limites, passo, valores vazios e tipos", () => {
  const s = defaults().settings;
  for (const value of ["", "-1", "10.5", "4.3", "Infinity", "texto"])
    assert.ok(
      validateSettings(
        "progressao",
        { loadProgression: value, paceProgression: false },
        s,
      ).errors.loadProgression,
    );
  for (const value of ["0", "0.5", "10"])
    assert.ok(
      validateSettings(
        "progressao",
        { loadProgression: value, paceProgression: false },
        s,
      ).settings,
    );
  assert.ok(
    validateSettings(
      "progressao",
      { loadProgression: "5", paceProgression: "false" },
      s,
    ).errors.paceProgression,
  );
  assert.ok(
    validateSettings("semana", { longDay: "1", longMinutes: "61" }, s).errors
      .longDay,
  );
  assert.ok(
    validateSettings("semana", { longDay: "0", longMinutes: "61" }, s).errors
      .longMinutes,
  );
});
test("corrida valida paces, pares, ordem dos ritmos e referência recente sem inventar valores", () => {
  const s = defaults().settings,
    raw = settingsDraft("corrida", s),
    check = (r) => validateSettings("corrida", r, s, "2026-10-23");
  assert.ok(check(raw).settings);
  assert.ok(check({ ...raw, easyPace: "6:00" }).errors.hardPace);
  assert.ok(
    check({ ...raw, easyPace: "6:00", hardPace: "6:30" }).errors.hardPace,
  );
  assert.ok(
    check({ ...raw, easyPace: "0:00", hardPace: "5:00" }).errors.easyPace,
  );
  assert.ok(check({ ...raw, walkPace: "10:99" }).errors.walkPace);
  assert.ok(check({ ...raw, recentKm: "8" }).errors.recentTime);
  assert.ok(
    check({
      ...raw,
      recentKm: "8",
      recentTime: "00:48:00",
      recentDate: "2026-10-24",
    }).errors.recentDate,
  );
  assert.ok(
    check({
      ...raw,
      recentKm: "0",
      recentTime: "00:48:00",
      recentDate: "2026-10-20",
    }).errors.recentKm,
  );
});
test("corrida vinculada preserva o pace forte manual e reinicia somente as referências necessárias", () => {
  const s = {
      ...defaults().settings,
      easyPace: "7:00",
      hardPace: "5:30",
      manualHardPace: "5:30",
    },
    raw = {
      ...settingsDraft("corrida", s),
      recentKm: "8",
      recentTime: "00:48:00",
      recentDate: "2026-10-20",
      useRecentPace: true,
    };
  const result = validateSettings("corrida", raw, s, "2026-10-23").settings;
  assert.equal(result.hardPace, "6:00");
  assert.equal(result.manualHardPace, "5:30");
  assert.equal(result.paceRevisions.easy, s.paceRevisions.easy);
  assert.ok(result.paceRevisions.hard > s.paceRevisions.hard);
  const changed = validateSettings(
    "corrida",
    { ...settingsDraft("corrida", result), easyPace: "7:30" },
    result,
    "2026-10-23",
  ).settings;
  assert.ok(changed.paceRevisions.easy > result.paceRevisions.easy);
  assert.equal(
    validateBackup({ ...defaults(), settings: changed }).settings.hardPace,
    "6:00",
  );
});
test("edições parciais ficam apenas na página atual e não sobrevivem a uma nova instância", () => {
  const saved = defaults().settings,
    edits = createSettingsEdits();
  const raw = {
    ...settingsDraft("corrida", saved),
    easyPace: "6:",
    recentTime: "00:4",
  };
  edits.capture("corrida", raw, saved);
  assert.deepEqual(edits.get("corrida", saved), raw);
  assert.equal(saved.easyPace, "");
  assert.equal(createSettingsEdits().get("corrida", saved).easyPace, "");
  assert.equal(createSettingsEdits().dirty("corrida", saved), false);
});
test("salvar uma categoria libera só suas edições, mantendo as demais em memória", () => {
  const saved = defaults().settings,
    edits = createSettingsEdits();
  edits.capture(
    "corrida",
    { ...settingsDraft("corrida", saved), easyPace: "6:" },
    saved,
  );
  edits.capture(
    "progressao",
    { loadProgression: "7.5", paceProgression: true },
    saved,
  );
  Object.assign(
    saved,
    validateSettings("progressao", edits.get("progressao", saved), saved)
      .settings,
  );
  edits.saved("progressao");
  assert.equal(edits.dirty("progressao", saved), false);
  assert.equal(edits.dirty("corrida", saved), true);
  assert.equal(edits.get("corrida", saved).easyPace, "6:");
});
test("edições não entram no backup e voltar aos valores salvos remove a pendência", () => {
  const data = defaults(),
    edits = createSettingsEdits();
  edits.capture("semana", { longDay: "0", longMinutes: "90" }, data.settings);
  assert.equal(
    validateBackup(JSON.parse(JSON.stringify(data))).settings.longMinutes,
    60,
  );
  edits.capture(
    "semana",
    settingsDraft("semana", data.settings),
    data.settings,
  );
  assert.equal(edits.dirty("semana", data.settings), false);
});
test("edições são cópias independentes e reset não altera o diário salvo", () => {
  const saved = defaults().settings,
    original = JSON.stringify(saved),
    edits = createSettingsEdits();
  const raw = { loadProgression: "9", paceProgression: true };
  edits.capture("progressao", raw, saved);
  raw.loadProgression = "3";
  const copy = edits.get("progressao", saved);
  copy.loadProgression = "1";
  assert.equal(edits.get("progressao", saved).loadProgression, "9");
  edits.clear();
  assert.equal(edits.dirty("progressao", saved), false);
  assert.equal(JSON.stringify(saved), original);
});
test("intervalado agrupado mantém os 18 estágios e oito ciclos com total de 40 minutos", () => {
  const s = {
    ...defaults().settings,
    easyPace: "6:00",
    hardPace: "5:00",
    walkPace: "12:00",
  };
  const blocks = runningPlan("interval", s),
    original = JSON.stringify(blocks),
    html = runBlocksView(blocks);
  assert.equal((html.match(/data-run-block=/g) || []).length, 18);
  assert.equal((html.match(/class="interval-cycle"/g) || []).length, 8);
  assert.match(html, /8 × forte \+ recuperação/);
  assert.match(html, /32 min/);
  assert.equal(
    blocks.reduce((sum, b) => sum + b.minutes, 0),
    40,
  );
  assert.equal(JSON.stringify(blocks), original);
  assert.doesNotMatch(
    runBlocksView(runningPlan("easy", s)),
    /interval-repeats/,
  );
});

// Minimal DOM boundary: events and rendered controls, without implementing form logic.
function controllerFixture(commit = () => true) {
  const listeners = new Map(),
    saved = defaults().settings,
    doc = { activeElement: null };
  const node = (extra = {}) => ({
    hidden: false,
    textContent: "",
    attrs: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    removeAttribute(k) {
      delete this.attrs[k];
    },
    focus() {
      doc.activeElement = this;
    },
    scrollIntoView() {},
    ...extra,
  });
  const tabs = Object.fromEntries(
    settingsSections.map(({ id }) => [
      id,
      node({
        dataset: { settingsTab: id },
        querySelector: () => node(),
      }),
    ]),
  );
  const forms = Object.fromEntries(
    ["corrida", "progressao", "semana"].map((id) => {
      const controls = Object.entries(settingsDraft(id, saved)).map(
        ([name, value]) =>
          node({
            name,
            value,
            checked: value,
            dataset: {},
            type: typeof value === "boolean" ? "checkbox" : "text",
          }),
      );
      for (const input of controls) controls[input.name] = input;
      const parts = new Map();
      const form = node({
        dataset: { settingsForm: id },
        elements: controls,
        querySelector(selector) {
          if (selector === "input,select") return controls[0];
          if (!parts.has(selector)) parts.set(selector, node());
          return parts.get(selector);
        },
      });
      form.closest = () => form;
      for (const input of controls) input.closest = () => form;
      return [id, form];
    }),
  );
  const other = new Map();
  const root = {
    ownerDocument: doc,
    classList: { toggle() {} },
    addEventListener(name, fn) {
      listeners.set(name, fn);
    },
    removeEventListener(name) {
      listeners.delete(name);
    },
    querySelector(selector) {
      const form = selector.match(/^\[data-settings-form="(.*?)"\]$/);
      if (form) return forms[form[1]];
      const tab = selector.match(/^\[data-settings-tab="(.*?)"\]$/);
      if (tab) return tabs[tab[1]];
      if (!other.has(selector)) other.set(selector, node());
      return other.get(selector);
    },
  };
  let commits = 0;
  const controller = createSettingsController({
    getSettings: () => saved,
    save(next) {
      commits++;
      if (!commit(next)) return false;
      Object.assign(saved, next);
      return true;
    },
    navigate() {},
    window: { addEventListener() {}, removeEventListener() {} },
  });
  controller.mount(root, "progressao");
  return {
    controller,
    forms,
    saved,
    listeners,
    remount() {
      controller.unmount();
      controller.mount(root, "progressao");
    },
    commits: () => commits,
    submit(id) {
      return listeners.get("submit")({
        target: forms[id],
        preventDefault() {},
      });
    },
  };
}

test("controller: falha ao salvar conserva rascunho, ajustes e mensagem, sem confirmação de sucesso", async () => {
  const f = controllerFixture(() => false);
  f.forms.progressao.elements.loadProgression.value = "8.5";
  await f.submit("progressao");
  assert.equal(f.saved.loadProgression, 5);
  assert.equal(f.commits(), 1);
  assert.match(
    f.forms.progressao.querySelector("[data-settings-status]").textContent,
    /Não foi possível salvar/,
  );
  assert.equal(
    f.forms.progressao.querySelector('[type="submit"]').disabled,
    false,
  );
  f.controller.unmount();
  assert.equal(f.listeners.size, 0);
  f.remount();
  assert.equal(f.forms.progressao.elements.loadProgression.value, "8.5");
  assert.equal(f.saved.loadProgression, 5);
});

test("controller: salvar somente uma categoria preserva o outro formulário e seu rascunho inválido", async () => {
  const f = controllerFixture();
  f.forms.corrida.elements.easyPace.value = "6:00";
  await f.submit("corrida");
  assert.equal(f.commits(), 0);
  assert.equal(f.forms.corrida.elements.hardPace.attrs["aria-invalid"], "true");
  f.forms.progressao.elements.loadProgression.value = "7.5";
  await f.submit("progressao");
  assert.equal(f.commits(), 1);
  assert.equal(f.saved.loadProgression, 7.5);
  assert.equal(f.saved.easyPace, "");
  assert.equal(f.forms.corrida.elements.easyPace.value, "6:00");
  f.remount();
  assert.equal(f.forms.corrida.elements.easyPace.value, "6:00");
  assert.equal(
    f.forms.progressao.querySelector('[type="submit"]').disabled,
    true,
  );
  assert.equal(
    f.forms.progressao.querySelector("[data-settings-status]").textContent,
    "Salvo na nuvem",
  );
});

test("controller: reset após substituição do diário invalida rascunhos e mensagens anteriores", async () => {
  const f = controllerFixture();
  f.forms.corrida.elements.easyPace.value = "6:00";
  await f.submit("corrida");
  f.controller.reset();
  f.controller.unmount();
  f.remount();
  assert.equal(f.forms.corrida.elements.easyPace.value, "");
  assert.equal(
    f.forms.progressao.querySelector("[data-settings-status]").textContent,
    "Sem alterações pendentes",
  );
});
