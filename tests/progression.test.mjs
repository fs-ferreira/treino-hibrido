import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { defaults, validateBackup, KEY, paceText } from "../lib/core.js";
import {
  withoutWeight,
  loadSuggestions,
  roundLoadUp,
  recommendPace,
  getRunPlan,
  nextPaceRevisions,
} from "../lib/progression.js";

const settings = () => ({
  ...defaults().settings,
  easyPace: "8:00",
  hardPace: "6:00",
});
const series = (kg = 20, reps = 8, done = true) =>
  Array.from({ length: 3 }, () => ({ kg, reps, done }));
const strength = (sets, mode) => ({
  type: "upper",
  done: false,
  sets: { "pec-deck": sets },
  run: null,
  ...(mode === undefined ? {} : { withoutWeight: { "pec-deck": mode } }),
});
const run = (type = "easy", rpe = 6, pace = 480, extra = {}) => ({
  type,
  done: true,
  sets: {},
  run: {
    minutes: type === "long" ? 60 : 30,
    km: (type === "long" ? 3600 : 1800) / pace,
    rpe,
    notes: "",
    ...extra,
  },
});
test("interface não usa alert, confirm ou prompt nativos bloqueantes", () => {
  const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.doesNotMatch(app, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
});
test("pace derivado fora da faixa suspende a estimativa sem gerar distância inválida", () => {
  const plan = getRunPlan(
    "easy",
    settings(),
    { "2026-10-15": run("easy", 6, 5990) },
    "2026-10-22",
  );
  assert.equal(plan.adjustment.blocked, true);
  assert.equal(plan.total.known, 0);
  assert.equal(plan.blocks[0].pace, null);
  assert.equal(plan.blocks[0].km, null);
});
test("backup rejeita plano com referência futura ou pace incoerente", () => {
  const data = defaults();
  Object.assign(data.settings, settings());
  data.sessions["2026-10-15"] = run("easy", 6);
  const plan = getRunPlan(
    "easy",
    data.settings,
    data.sessions,
    "2026-10-22",
  ).snapshot;
  data.sessions["2026-10-22"] = run("easy", 4, 504, { plan });
  assert.doesNotThrow(() => validateBackup(data));
  plan.adjustment.sourceDate = "2026-10-22";
  assert.throws(() => validateBackup(data));
  plan.adjustment.sourceDate = "2026-10-15";
  plan.easyPace = 480;
  assert.throws(() => validateBackup(data));
});

test("carga: cada série usa sua própria carga e atinge aumento com 8 ou mais repetições", () => {
  const sessions = {
    "2026-10-19": strength([
      { kg: 20, reps: 8, done: true },
      { kg: 18, reps: 9, done: true },
      { kg: 16, reps: 8, done: true },
    ]),
  };
  assert.deepEqual(
    loadSuggestions(sessions, "2026-10-26", "pec-deck", 5).map((s) => s.kg),
    [21, 19, 17],
  );
  sessions["2026-10-19"].sets["pec-deck"][1].reps = 7;
  assert.equal(
    loadSuggestions(sessions, "2026-10-26", "pec-deck", 5)[1].kg,
    18,
  );
  assert.deepEqual(
    loadSuggestions(sessions, "2026-10-26", "pec-deck", 0).map((s) => s.kg),
    [20, 18, 16],
  );
});
test("carga: pesquisa por posição pula séries incompletas e acha datas diferentes", () => {
  const sessions = {
    "2026-10-12": strength(series(10)),
    "2026-10-19": strength([
      { kg: 20, reps: 8, done: true },
      { kg: 18, reps: "", done: true },
      { kg: 16, reps: 8, done: false },
    ]),
    "2026-10-26": strength(series(100)),
    "2026-11-02": strength(series(200)),
  };
  const result = loadSuggestions(sessions, "2026-10-26", "pec-deck", 5);
  assert.deepEqual(
    result.map((s) => s.kg),
    [21, 11, 11],
  );
  assert.deepEqual(
    result.map((s) => s.date),
    ["2026-10-19", "2026-10-12", "2026-10-12"],
  );
});
test("carga: sem peso, zero, valores vazios e falta de histórico não viram referência", () => {
  const sessions = {
    "2026-10-12": strength(series(10)),
    "2026-10-19": strength(series(30), true),
  };
  assert.equal(
    loadSuggestions(sessions, "2026-10-26", "pec-deck", 5)[0].kg,
    11,
  );
  for (const kg of [0, "", NaN]) {
    sessions["2026-10-12"] = strength(series(kg));
    assert.deepEqual(loadSuggestions(sessions, "2026-10-26", "pec-deck", 5), [
      null,
      null,
      null,
    ]);
  }
  assert.deepEqual(loadSuggestions({}, "2026-10-26", "pec-deck", 5), [
    null,
    null,
    null,
  ]);
});
test("carga: arredonda para o próximo quilo inteiro e impede aplicar acima do limite do diário", () => {
  const sessions = { "2026-10-19": strength(series(12.75)) };
  assert.equal(
    loadSuggestions(sessions, "2026-10-26", "pec-deck", 2.5)[0].kg,
    14,
  );
  sessions["2026-10-19"] = strength(series(2000));
  assert.equal(
    loadSuggestions(sessions, "2026-10-26", "pec-deck", 10)[0].usable,
    false,
  );
});
test("sem peso: herda por exercício, respeita escolha explícita e mantém registros antigos com carga", () => {
  const sessions = {
    "2026-10-12": strength(series(0)),
    "2026-10-19": strength(series(20), true),
  };
  assert.equal(withoutWeight(sessions, "2026-10-12", "pec-deck"), false);
  assert.equal(withoutWeight(sessions, "2026-10-26", "pec-deck"), true);
  assert.equal(withoutWeight(sessions, "2026-10-26", "incline-press"), false);
  sessions["2026-10-26"] = strength(series(10), false);
  assert.equal(withoutWeight(sessions, "2026-10-26", "pec-deck"), false);
  assert.equal(withoutWeight(sessions, "2026-11-02", "pec-deck"), false);
});
test("pace: 8:00 com esforço 6 sugere 8:24 ou 8:12 com progressão", () => {
  const s = settings(),
    sessions = { "2026-10-15": run() };
  assert.equal(
    paceText(recommendPace("easy", s, sessions, "2026-10-22").pace),
    "8:24",
  );
  assert.equal(
    paceText(
      recommendPace(
        "easy",
        { ...s, paceProgression: true },
        sessions,
        "2026-10-22",
      ).pace,
    ),
    "8:12",
  );
});
test("pace: esforço muito alto corrige integralmente e desaceleração limita a 10%", () => {
  for (const rpe of [7, 10]) {
    const sessions = { "2026-10-15": run("easy", rpe) };
    assert.equal(
      recommendPace("easy", settings(), sessions, "2026-10-22").pace,
      recommendPace(
        "easy",
        { ...settings(), paceProgression: true },
        sessions,
        "2026-10-22",
      ).pace,
    );
  }
  assert.equal(
    recommendPace(
      "easy",
      settings(),
      { "2026-10-15": run("easy", 10) },
      "2026-10-22",
    ).percent,
    10,
  );
});
test("pace: esforço abaixo da faixa calibra até 5%, sem somar avanço", () => {
  const sessions = {
    "2026-10-08": run("easy", 3),
    "2026-10-15": run("easy", 1),
  };
  const result = recommendPace(
    "easy",
    { ...settings(), paceProgression: true },
    sessions,
    "2026-10-22",
  );
  assert.equal(result.percent, -5);
  assert.equal(result.pace, 456);
  assert.equal(result.reason, "calibrate");
});
test("pace: avanço de 1% exige duas últimas corridas equivalentes na faixa e checkbox ativo", () => {
  const sessions = {
      "2026-10-08": run("easy", 3),
      "2026-10-15": run("easy", 4),
    },
    s = settings();
  assert.equal(recommendPace("easy", s, sessions, "2026-10-22").pace, 480);
  assert.equal(
    recommendPace(
      "easy",
      { ...s, paceProgression: true },
      sessions,
      "2026-10-22",
    ).pace,
    475,
  );
  sessions["2026-10-08"].run.rpe = 5;
  assert.equal(
    recommendPace(
      "easy",
      { ...s, paceProgression: true },
      sessions,
      "2026-10-22",
    ).pace,
    480,
  );
  delete sessions["2026-10-08"];
  assert.equal(
    recommendPace(
      "easy",
      { ...s, paceProgression: true },
      sessions,
      "2026-10-22",
    ).pace,
    480,
  );
});
test("pace: não mistura tipos, futuro, própria data, repouso ou sessões não concluídas", () => {
  const sessions = {
    "2026-10-08": run("easy", 4),
    "2026-10-15": run("long", 10),
    "2026-10-20": { ...run("easy", 10), done: false },
    "2026-10-21": run("easy", 0),
    "2026-10-22": run("easy", 10),
    "2026-10-29": run("easy", 10),
  };
  const result = recommendPace("easy", settings(), sessions, "2026-10-22");
  assert.equal(result.sourceDate, "2026-10-08");
  assert.equal(result.pace, 480);
  assert.equal(recommendPace("long", settings(), {}, "2026-10-22").pace, 480);
});
test("intervalado: só dados dos blocos fortes ajustam o alvo 7–8", () => {
  const sessions = { "2026-10-13": run("interval", 10, 540) };
  assert.equal(
    recommendPace("interval", settings(), sessions, "2026-10-20").sourceDate,
    null,
  );
  Object.assign(sessions["2026-10-13"].run, { hardPace: 360, hardRpe: 9 });
  const result = recommendPace("interval", settings(), sessions, "2026-10-20");
  assert.equal(result.pace, 369);
  assert.equal(result.rpe, 9);
  const plan = getRunPlan("interval", settings(), sessions, "2026-10-20");
  assert.equal(plan.total.minutes, 40);
  assert.equal(plan.blocks.filter((b) => b.kind === "hard").length, 8);
  assert.ok(
    plan.blocks.filter((b) => b.kind === "hard").every((b) => b.pace === 369),
  );
  assert.ok(
    plan.blocks.filter((b) => b.kind === "easy").every((b) => b.pace === 480),
  );
  assert.equal(plan.blocks.at(-1).pace, null);
});
test("intervalado: conflito com recuperação suspende apenas as estimativas fortes", () => {
  const sessions = {
    "2026-10-13": run("interval", 9, 540, { hardPace: 479, hardRpe: 9 }),
  };
  const plan = getRunPlan("interval", settings(), sessions, "2026-10-20");
  assert.equal(plan.adjustment.blocked, true);
  assert.equal(plan.total.complete, false);
  assert.ok(
    plan.blocks.filter((b) => b.kind === "hard").every((b) => b.km === null),
  );
  assert.equal(plan.blocks[0].pace, 480);
});
test("pace: referências são reiniciadas ao mudar base, incluindo vínculo com corrida recente", () => {
  const before = settings(),
    after = { ...before, easyPace: "9:00" };
  after.paceRevisions = nextPaceRevisions(before, after);
  assert.deepEqual(after.paceRevisions, { easy: 1, hard: 1 });
  assert.equal(
    recommendPace("easy", after, { "2026-10-15": run() }, "2026-10-22").pace,
    540,
  );
  const hard = {
    ...before,
    useRecentPace: true,
    recentRun: { km: 5, seconds: 1650, date: "2026-10-19" },
  };
  assert.deepEqual(nextPaceRevisions(before, hard), { easy: 0, hard: 1 });
  assert.deepEqual(
    nextPaceRevisions(before, {
      ...before,
      paceProgression: true,
      loadProgression: 2.5,
      walkPace: "12:00",
    }),
    { easy: 0, hard: 0 },
  );
  const sameValue = {
    ...before,
    useRecentPace: true,
    recentRun: { km: 5, seconds: 1800, date: "2026-10-19" },
  };
  assert.deepEqual(nextPaceRevisions(before, sameValue), { easy: 0, hard: 0 });
});
test("pace: cálculos são puros, sem acumular ajustes ao abrir telas ou avançar semanas", () => {
  const s = settings(),
    sessions = { "2026-10-15": run() },
    original = JSON.stringify({ s, sessions });
  const first = getRunPlan("easy", s, sessions, "2026-10-22");
  for (const date of ["2026-10-22", "2026-10-29", "2026-11-05"])
    assert.deepEqual(getRunPlan("easy", s, sessions, date), first);
  assert.equal(JSON.stringify({ s, sessions }), original);
});
test("plano salvo conserva paces e duração apesar de configurações e histórico editados", () => {
  const s = settings(),
    sessions = { "2026-10-10": run("long", 6) };
  const original = getRunPlan("long", s, sessions, "2026-10-17");
  sessions["2026-10-17"] = run("long", 4, 504, {
    plan: original.snapshot,
    paceRevision: 0,
  });
  sessions["2026-10-10"].run.rpe = 10;
  const current = getRunPlan(
    "long",
    { ...s, easyPace: "10:00", longMinutes: 90, paceProgression: true },
    sessions,
    "2026-10-17",
  );
  assert.equal(current.saved, true);
  assert.deepEqual(current.blocks, original.blocks);
  assert.equal(current.total.minutes, 60);
});
test("backups v1/v2 migram para v3 sem transformar zero em sem peso nem inventar blocos", () => {
  const old = defaults();
  old.version = 2;
  delete old.settings.loadProgression;
  delete old.settings.paceProgression;
  delete old.settings.paceRevisions;
  old.sessions = {
    "2026-10-19": strength(series(0)),
    "2026-10-20": run("interval"),
  };
  const copy = validateBackup(old);
  assert.equal(copy.version, 3);
  assert.equal(KEY, "treino-hibrido:v1");
  assert.equal(copy.settings.loadProgression, 5);
  assert.equal(copy.settings.paceProgression, false);
  assert.equal(withoutWeight(copy.sessions, "2026-10-19", "pec-deck"), false);
  assert.equal(copy.sessions["2026-10-20"].run.hardPace, undefined);
  assert.deepEqual(copy.sessions, old.sessions);
});
test("backup v3 restaura cargas retidas, modos, referências e planejamento sem perder precisão", () => {
  const data = defaults();
  Object.assign(data.settings, settings(), {
    loadProgression: 2.5,
    paceProgression: true,
  });
  data.sessions = { "2026-10-19": strength(series(18.9), true) };
  const plan = getRunPlan("interval", data.settings, {}, "2026-10-20").snapshot;
  data.sessions["2026-10-20"] = run("interval", 6, 480, {
    hardPace: 360,
    hardRpe: 8,
    plan,
    paceRevision: 0,
  });
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data))), data);
});
test("backup inválido rejeita progressão, modo e campos de corrida antes de substituir dados", () => {
  const original = defaults();
  const invalid = [
    (d) => (d.settings.loadProgression = 10.5),
    (d) => (d.settings.loadProgression = 2.3),
    (d) => (d.settings.paceProgression = "true"),
    (d) => (d.settings.paceRevisions.easy = -1),
    (d) => (d.sessions["2026-10-19"] = strength(series(20), "sim")),
    (d) =>
      (d.sessions["2026-10-20"] = run("interval", 5, 480, {
        hardPace: 360,
        hardRpe: null,
      })),
    (d) =>
      (d.sessions["2026-10-20"] = run("interval", 5, 480, {
        hardPace: 0,
        hardRpe: 8,
      })),
    (d) =>
      (d.sessions["2026-10-20"] = run("interval", 5, 480, {
        plan: { easyPace: -1 },
      })),
  ];
  for (const mutate of invalid) {
    const draft = structuredClone(original);
    mutate(draft);
    assert.throws(() => validateBackup(draft));
    assert.deepEqual(original, defaults());
  }
});

test("carga: arredonda toda fração para cima sem avançar inteiros por ruído numérico", () => {
  for (const [value, expected] of [
    [10.1, 11],
    [10.5, 11],
    [10.01, 11],
    [10, 10],
    [0, 0],
    [2000, 2000],
    [100 * 1.1, 110],
  ])
    assert.equal(roundLoadUp(value), expected);
  const sessions = { "2026-10-19": strength(series(10.1, 7)) };
  assert.equal(
    loadSuggestions(sessions, "2026-10-26", "pec-deck", 5)[0].kg,
    11,
  );
  assert.equal(
    loadSuggestions(sessions, "2026-10-26", "pec-deck", 0)[0].kg,
    11,
  );
  assert.equal(sessions["2026-10-19"].sets["pec-deck"][0].kg, 10.1);
});
