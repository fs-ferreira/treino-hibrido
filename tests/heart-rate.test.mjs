import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  heartRateReference,
  heartRateTarget,
  createHeartRatePlan,
  ageAtMonth,
  parseBirthMonth,
  maskBirthMonth,
  validateHeartRateSettings,
  validateHeartRatePlan,
  heartRateText,
} from "../lib/heart-rate.js";
import {
  defaults,
  VERSION,
  runningPlan,
  planTotal,
  validateBackup,
  materializeDay,
  preserveSettingsMetadata,
  preserveWorkoutMetadata,
} from "../lib/core.js";
import { getRunPlan } from "../lib/progression.js";
import { settingsDraft, validateSettings } from "../lib/settings.js";
import {
  runBlocksView,
  runDetailsView,
  heartRateNotice,
} from "../lib/run-view.js";
import { plansView } from "../lib/plans-view.js";

beforeEach((t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-11-05T12:00:00").getTime(),
  });
});

test("FC: nascimento e sexo estimam FC máxima e limites são arredondados", () => {
  assert.equal(parseBirthMonth("12/1996"), "1996-12");
  assert.equal(maskBirthMonth("111996"), "11/1996");
  assert.equal(ageAtMonth("1996-12", "2026-11-05"), 29);
  assert.equal(ageAtMonth("1996-12", "2026-12-01"), 30);
  assert.equal(ageAtMonth("1996-12", "2027-01-01"), 30);
  assert.deepEqual(heartRateReference(), {
    source: "none",
    age: null,
    sex: null,
    maxBpm: null,
  });
  assert.deepEqual(
    heartRateReference({ birthMonth: "1996-11", sex: "male" }, "2026-11"),
    { source: "age", age: 30, sex: "male", maxBpm: 190 },
  );
  assert.deepEqual(
    heartRateReference({ birthMonth: "1996-11", sex: "female" }, "2026-11"),
    { source: "age", age: 30, sex: "female", maxBpm: 196 },
  );
  assert.equal(
    heartRateReference({ birthMonth: "1995-11", sex: "male" }, "2026-11")
      .maxBpm,
    189,
  );
  assert.equal(
    heartRateText(heartRateTarget("steady", 190)),
    "FC de referência: 114–133 bpm · Z2 · 60–70% da FC máxima",
  );
  assert.equal(
    heartRateText(heartRateTarget("hard", 187)),
    "FC de referência: 150–168 bpm · Z4 · 80–90% da FC máxima",
  );
});

test("FC: nascimento e sexo são preenchidos juntos e o mês de aniversário atualiza só novos planos", () => {
  const settings = defaults().settings;
  for (const patch of [
    { heartRateBirthMonth: "11/1996" },
    { heartRateSex: "female" },
  ]) {
    assert.equal(
      validateSettings(
        "corrida",
        { ...settingsDraft("corrida", settings), ...patch },
        settings,
      ).settings,
      null,
    );
  }
  settings.heartRate = { birthMonth: "1996-12", sex: "female" };
  const november = getRunPlan("easy", settings, {}, "2026-11-05");
  const december = getRunPlan("easy", settings, {}, "2026-12-01");
  assert.equal(november.snapshot.heartRate.maxBpm, 197);
  assert.equal(december.snapshot.heartRate.maxBpm, 196);
  assert.equal(november.snapshot.heartRate.maxBpm, 197);
});

test("FC: configurações são opcionais e não exigem paces, validam limites e não reiniciam progressão", () => {
  const settings = defaults().settings;
  for (const [birth, sex] of [
    ["11/2008", "male"],
    ["11/1926", "female"],
    ["11/1996", "male"],
    ["", ""],
  ]) {
    const result = validateSettings(
      "corrida",
      {
        ...settingsDraft("corrida", settings),
        heartRateBirthMonth: birth,
        heartRateSex: sex,
      },
      settings,
      "2026-11-05",
    );
    assert.deepEqual(result.errors, {});
    assert.deepEqual(result.settings.heartRate, {
      birthMonth: parseBirthMonth(birth),
      sex: sex || null,
    });
    assert.deepEqual(result.settings.paceRevisions, settings.paceRevisions);
  }
  for (const [key, values] of Object.entries({
    heartRateBirthMonth: ["11/2009", "11/1925", "13/1990", "11/2099", "abc"],
    heartRateSex: ["other"],
  }))
    for (const value of values)
      assert.ok(
        validateSettings(
          "corrida",
          { ...settingsDraft("corrida", settings), [key]: value },
          settings,
          "2026-11-05",
        ).errors[key],
      );
  for (const value of [
    null,
    [],
    { birthMonth: "1990-13", sex: "male" },
    { birthMonth: null, sex: "invalid" },
    { birthMonth: "1990-01", sex: null },
  ])
    assert.throws(() => validateHeartRateSettings(value));
});

test("FC: todas as 18 etapas têm metas corretas, sem mudar tempo, pace ou distância", () => {
  const settings = {
    ...defaults().settings,
    easyPace: "6:00",
    hardPace: "5:00",
    walkPace: "12:00",
    heartRate: { birthMonth: "1996-11", sex: "male" },
  };
  const blocks = runningPlan("interval", settings);
  assert.equal(blocks.length, 18);
  assert.deepEqual(planTotal(blocks), {
    minutes: 40,
    km: 7.216666666666667,
    complete: true,
    known: 18,
  });
  assert.deepEqual(blocks[0].heartRate, heartRateTarget("warmup", 190));
  for (let i = 1; i < 17; i++) {
    const phase = i % 2 ? "hard" : "recovery";
    assert.deepEqual(blocks[i].heartRate, heartRateTarget(phase, 190));
    assert.equal(blocks[i].pace, phase === "hard" ? 300 : 360);
  }
  assert.deepEqual(blocks[17].heartRate, heartRateTarget("cooldown", 190));
  for (const type of ["easy", "long"]) {
    const plan = runningPlan(type, settings);
    assert.equal(plan[0].minutes, type === "easy" ? 30 : 60);
    assert.deepEqual(plan[0].heartRate, heartRateTarget("steady", 190));
  }
  const noPace = runningPlan("easy", { ...settings, easyPace: "" });
  assert.equal(noPace[0].km, null);
  assert.equal(noPace[0].heartRate.minBpm, 114);
});

test("FC: snapshot individual é imutável e registros antigos não recebem bpm retroativos", () => {
  const data = defaults(),
    date = "2026-11-03";
  data.settings.heartRate = { birthMonth: "1996-11", sex: "male" };
  const item = materializeDay(data, date).workouts[0];
  const snapshot = getRunPlan(
    "interval",
    data.settings,
    data.sessions,
    date,
    item.id,
  ).snapshot;
  item.run = { minutes: 40, km: 6, rpe: 8, notes: "", plan: snapshot };
  data.settings.heartRate = { birthMonth: "1976-11", sex: "female" };
  const saved = getRunPlan(
    "interval",
    data.settings,
    data.sessions,
    date,
    item.id,
  );
  assert.deepEqual(saved.snapshot, snapshot);
  assert.equal(saved.blocks[1].heartRate.minBpm, 152);
  assert.deepEqual(
    validateBackup(JSON.parse(JSON.stringify(data))).sessions[date].workouts[0]
      .run.plan,
    snapshot,
  );
  delete item.run.plan.heartRate;
  assert.equal(
    getRunPlan("interval", data.settings, data.sessions, date, item.id)
      .blocks[1].heartRate.minBpm,
    null,
  );
  delete item.run.plan;
  const legacy = getRunPlan(
    "interval",
    data.settings,
    data.sessions,
    date,
    item.id,
  );
  assert.equal(legacy.blocks[1].heartRate.minBpm, null);
  assert.equal(legacy.snapshot.heartRate, undefined);
  assert.match(heartRateNotice(undefined, true), /Orientação geral/);
});

test("FC: backups 1–5 migram sem inferir referência e v6 preserva metas e valida corrupção", () => {
  for (const version of [1, 2, 3, 4, 5]) {
    const data = defaults();
    data.version = version;
    delete data.settings.heartRate;
    if (version === 1) data.settings.recentRun = "";
    const restored = validateBackup(data);
    assert.equal(restored.version, VERSION);
    assert.deepEqual(restored.settings.heartRate, {
      birthMonth: null,
      sex: null,
    });
  }
  const plan = createHeartRatePlan("interval", {
    birthMonth: "1996-11",
    sex: "male",
  });
  assert.deepEqual(validateHeartRatePlan(plan, "interval"), plan);
  for (const mutate of [
    (p) => p.maxBpm++,
    (p) => (p.age = 17),
    (p) => p.targets.pop(),
    (p) => p.targets[1].minBpm++,
    (p) => (p.targets[2].zone = "Z4"),
    (p) => (p.version = 2),
    (p) => (p.source = "watch"),
  ]) {
    const corrupt = structuredClone(plan);
    mutate(corrupt);
    assert.throws(() => validateHeartRatePlan(corrupt, "interval"));
  }
});

test("FC: omissão em operações antigas preserva metadados, null explícito limpa configurações", () => {
  const current = defaults().settings;
  current.heartRate = { birthMonth: "1996-11", sex: "male" };
  const incoming = structuredClone(current);
  delete incoming.heartRate;
  const original = JSON.stringify(incoming);
  assert.deepEqual(
    preserveSettingsMetadata(incoming, current).heartRate,
    current.heartRate,
  );
  assert.equal(JSON.stringify(incoming), original);
  incoming.heartRate = { birthMonth: null, sex: null };
  assert.deepEqual(
    preserveSettingsMetadata(incoming, current).heartRate,
    incoming.heartRate,
  );
  const previous = {
    run: {
      plan: { heartRate: createHeartRatePlan("easy", current.heartRate) },
    },
  };
  assert.deepEqual(
    preserveWorkoutMetadata({ run: { plan: {} } }, previous).run.plan.heartRate,
    previous.run.plan.heartRate,
  );
});

test("FC: Hoje e Treinos compartilham apresentação e resumo recolhido inclui ambas as metas", () => {
  const settings = defaults().settings;
  Object.assign(settings, {
    easyPace: "6:00",
    hardPace: "5:00",
    walkPace: "12:00",
  });
  settings.heartRate = { birthMonth: "1996-11", sex: "male" };
  const html = runBlocksView(runningPlan("interval", settings));
  assert.match(html, /Pace/);
  assert.match(html, /FC 152–171 bpm/);
  assert.match(html, /FC 95–133 bpm/);
  assert.doesNotMatch(
    html,
    /FC de referência|% da FC máxima|km\/h|estimada|responde com atraso/,
  );
  assert.match(html, /Ver 8 ciclos/);
  assert.equal((html.match(/data-run-block=/g) || []).length, 18);
  const details = runDetailsView(
    runningPlan("interval", settings),
    createHeartRatePlan("interval", settings.heartRate),
    "interval",
  );
  assert.match(details, /Z4 · 80–90%/);
  assert.match(details, /km\/h/);
  assert.equal((details.match(/A FC responde com atraso/g) || []).length, 1);
  const catalog = plansView(
    settings,
    { planId: "hibrido-3x3" },
    new Set([2, 4, 6]),
  );
  assert.ok(catalog.includes(html));
  assert.match(catalog, /FC máxima estimada: 190 bpm/);
  assert.match(catalog, /não comprovam um pace específico/);
  assert.match(catalog, /não precisa chegar à faixa antes do próximo bloco/);
});
