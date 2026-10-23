import test from "node:test";
import assert from "node:assert/strict";
import {
  trainingPlans,
  getActivePlan,
  getPlan,
  planWeek,
} from "../lib/plans.js";
import { plansView } from "../lib/plans-view.js";
import { resolveRoute, isAppHash, sections } from "../lib/routes.js";
import { workouts } from "../lib/exercises.js";
import { defaults, workoutFor, validateBackup } from "../lib/core.js";

test("catálogo tem um plano ativo, os 21 exercícios e a divisão 3/3/1", () => {
  assert.equal(trainingPlans.length, 1);
  assert.equal(getActivePlan().id, "hibrido-3x3");
  assert.equal(getPlan("inexistente"), null);
  const week = planWeek(defaults().settings);
  assert.deepEqual(
    week.map((d) => d.day),
    [1, 2, 3, 4, 5, 6, 0],
  );
  assert.deepEqual(
    week.map((d) => d.type),
    ["upper", "interval", "lower", "easy", "upper2", "long", "rest"],
  );
  const ids = week.flatMap((d) => workouts[d.type].ids || []);
  assert.equal(ids.length, 21);
  assert.equal(new Set(ids).size, 21);
  assert.equal(week.filter((d) => workouts[d.type].kind === "run").length, 3);
  assert.ok(Object.isFrozen(getActivePlan().weekdays));
});
test("catálogo e calendário mantêm a mesma divisão, inclusive com longão no domingo", () => {
  for (const longDay of [0, 6]) {
    const s = { ...defaults().settings, longDay };
    const dates = [
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ];
    assert.deepEqual(
      planWeek(s).map((d) => d.type),
      dates.map((date) => workoutFor(date, s)),
    );
  }
});
test("lista e detalhe consultam o plano sem criar sessões ou modificar configurações", () => {
  const data = defaults(),
    original = JSON.stringify(data);
  const list = plansView(data.settings, resolveRoute("#treinos"));
  assert.match(list, /ATIVO/);
  assert.match(list, /href="#treinos\/hibrido-3x3"/);
  data.settings.longMinutes = 75;
  data.settings.longDay = 0;
  const detail = plansView(data.settings, resolveRoute("#treinos/hibrido-3x3"));
  assert.equal((detail.match(/data-plan-day=/g) || []).length, 7);
  assert.equal((detail.match(/data-action="guide"/g) || []).length, 21);
  assert.match(detail, /75 minutos/);
  assert.match(detail, /8 × \(3 \+ 1 min\)/);
  assert.match(detail, /data-open-today/);
  assert.match(detail, /Voltar para Treinos/);
  assert.doesNotMatch(detail, /<input|<select|<textarea|data-field=/);
  data.settings.longMinutes = 60;
  data.settings.longDay = 6;
  assert.equal(JSON.stringify(data), original);
  assert.equal(validateBackup(data).version, 3);
});
test("rotas distinguem lista e detalhe, preservam Treinos e tratam identificador desconhecido", () => {
  assert.deepEqual(sections, [
    "hoje",
    "semana",
    "treinos",
    "historico",
    "configuracoes",
  ]);
  const list = resolveRoute("#treinos"),
    detail = resolveRoute("#treinos/hibrido-3x3"),
    missing = resolveRoute("#treinos/nao-existe");
  assert.notEqual(list.key, detail.key);
  assert.equal(detail.section, "treinos");
  assert.equal(detail.planId, "hibrido-3x3");
  assert.equal(missing.section, "treinos");
  assert.equal(missing.missingPlan, true);
  assert.match(
    plansView(defaults().settings, missing),
    /Treino não encontrado/,
  );
  assert.equal(resolveRoute("#session").key, "hoje");
  assert.equal(resolveRoute("#fora").key, "hoje");
  assert.ok(isAppHash("treinos/hibrido-3x3"));
  assert.ok(isAppHash("session"));
  assert.equal(isAppHash("main"), false);
});
