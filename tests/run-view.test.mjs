import test from "node:test";
import assert from "node:assert/strict";
import { defaults, runningPlan } from "../lib/core.js";
import { runBlocksView, runDetailsView } from "../lib/run-view.js";
import { plansView } from "../lib/plans-view.js";
import { illustration } from "../lib/diagrams.js";
import { exercises } from "../lib/exercises.js";
const settings = () => ({
  ...defaults().settings,
  easyPace: "6:00",
  hardPace: "5:00",
  walkPace: "12:00",
});
test("help has two or three short sections without repeating phase metrics or generic method", () => {
  const s = settings(),
    blocks = runningPlan("interval", s);
  const detail = runDetailsView(blocks, null, "interval");
  assert.equal((detail.match(/<section/g) || []).length, 2);
  assert.equal((detail.match(/data-action="sources"/g) || []).length, 1);
  assert.doesNotMatch(
    detail,
    /km\/h|run-secondary|% da FC máxima|Plano registrado/,
  );
  assert.match(detail, /A FC responde com atraso/);
  const adjusted = runDetailsView(blocks, null, "interval", {
    adjustment: {
      sourceDate: "2026-11-03",
      previousPace: 300,
      rpe: 9,
      reason: "ease",
      percent: 2.5,
    },
  });
  assert.equal((adjusted.match(/<section/g) || []).length, 3);
  assert.match(adjusted, /03\/11\/2026, 5:00\/km, esforço 9\/10/);
  assert.match(adjusted, /Reduzir o ritmo/);
});
test("partial and missing estimates are explicit while walking instruction is not repeated", () => {
  const s = settings();
  s.walkPace = "";
  const blocks = runningPlan("interval", s),
    detail = runDetailsView(blocks, null, "interval");
  assert.match(
    detail,
    /Parcial: <strong>[\d,]+ km<\/strong> · sem estimativa para caminhada/,
  );
  assert.equal((detail.match(/Parcial:/g) || []).length, 1);
  assert.doesNotMatch(runBlocksView(blocks), /Caminhe\./);
  assert.match(runBlocksView(blocks), /Forte, sem sprint/);
  assert.match(runBlocksView(blocks), /Reduza o esforço/);
  const empty = runDetailsView(
    runningPlan("easy", defaults().settings),
    null,
    "easy",
  );
  assert.match(empty, /Sem estimativa/);
  assert.doesNotMatch(empty, /0,00 km|bpm/);
});
test("catalog keeps one sets/repetitions overview and specific unilateral guidance", () => {
  const html = plansView(settings(), { planId: "hibrido-cross" });
  assert.equal((html.match(/3 × 6–8/g) || []).length, 1);
  assert.doesNotMatch(html, /3 séries de 6–8|plan-effort[^>]*>40|8 × \(3/);
  assert.equal((html.match(/Complete os dois lados\./g) || []).length, 2);
});
test("movement markup exposes one accessible control without step or reset controls", () => {
  const html = illustration(exercises["pec-deck"]);
  assert.equal((html.match(/<button/g) || []).length, 1);
  assert.match(html, /data-motion="toggle"/);
  assert.match(html, /motion-status sr-only/);
  assert.doesNotMatch(
    html,
    /motion-steps|data-motion="reset"|data-motion="end"/,
  );
});
