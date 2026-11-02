import test from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../lib/exercises.js";
import { exerciseMuscles, muscles } from "../lib/muscle-data.js";
import { muscleMap, muscleRegions, muscleViews } from "../lib/muscle-map.js";

test("all 23 variants have explicit, disjoint targets with drawable regions", () => {
  assert.deepEqual(
    Object.keys(exerciseMuscles).sort(),
    Object.keys(exercises).sort(),
  );
  assert.equal(Object.keys(exerciseMuscles).length, 23);
  for (const profile of Object.values(exerciseMuscles)) {
    assert.ok(profile.primary.length > 0);
    const active = [...profile.primary, ...profile.secondary];
    assert.equal(new Set(active).size, active.length);
    for (const muscle of active) {
      assert.ok(muscles[muscle], `Missing name: ${muscle}`);
      assert.ok(
        muscleRegions.front[muscle] || muscleRegions.back[muscle],
        `Missing region: ${muscle}`,
      );
    }
    const views = muscleViews(profile);
    assert.ok(
      active.every((muscle) =>
        views.some((view) => muscleRegions[view][muscle]),
      ),
    );
    if (views.length === 2)
      for (const view of views)
        assert.ok(active.some((muscle) => !muscleRegions[view][muscle]));
  }
});

test("view selection uses front on ties and both only when required", () => {
  assert.deepEqual(muscleViews(exerciseMuscles["pec-deck"]), ["front"]);
  assert.deepEqual(muscleViews(exerciseMuscles["lateral-raise"]), ["front"]);
  assert.deepEqual(muscleViews(exerciseMuscles["single-rdl"]), ["back"]);
  assert.deepEqual(muscleViews(exerciseMuscles["seated-calf"]), ["back"]);
  assert.deepEqual(muscleViews(exerciseMuscles["incline-press"]), [
    "front",
    "back",
  ]);
  assert.deepEqual(muscleViews(exerciseMuscles.bulgarian), ["front", "back"]);
});

test("calf variants reverse emphasis; abdominal variants share the rectus target", () => {
  assert.deepEqual(exerciseMuscles["seated-calf"], {
    primary: ["soleus"],
    secondary: ["gastrocnemius"],
  });
  assert.deepEqual(exerciseMuscles["standing-calf"], {
    primary: ["gastrocnemius"],
    secondary: ["soleus"],
  });
  for (const id of ["machine-crunch", "reverse-crunch"])
    assert.deepEqual(exerciseMuscles[id].primary, ["rectus-abdominis"]);
  for (const id of [
    "leg-extension",
    "leg-curl",
    "rope-pushdown",
    "french-press",
  ])
    assert.deepEqual(exerciseMuscles[id].secondary, []);
});

test("rendered active regions carry roles, names and both sides, including unilateral exercises", () => {
  for (const exercise of Object.values(exercises)) {
    const html = muscleMap(exercise);
    const profile = exerciseMuscles[exercise.id];
    for (const [role, ids] of Object.entries(profile))
      for (const id of ids) {
        const regions = [
          ...html.matchAll(
            new RegExp(
              `<g class="muscle-region muscle-${role}" data-muscle="${id}"[^>]*>(.*?)</g>`,
              "g",
            ),
          ),
        ];
        assert.ok(regions.length, `${exercise.id}: ${id} must be visible`);
        for (const region of regions) {
          assert.match(region[0], /role="button" tabindex="0"/);
          assert.ok(region[0].includes(`aria-label="${muscles[id]} ·`));
          assert.match(region[1], /data-side="left"/);
          assert.match(region[1], /data-side="right"/);
        }
      }
    assert.match(html, /aria-describedby="session-muscles-/);
    assert.match(html, /role="status" aria-live="polite"/);
    if (!profile.secondary.length) {
      assert.match(html, /Secundários: nenhum destacado/);
      assert.doesNotMatch(html, /data-muscle-role="secondary"/);
    }
  }
});

test("maps in separate contexts have separate descriptions and escape exercise names", () => {
  const exercise = { ...exercises["pec-deck"], name: 'Peito <teste> "a"' };
  assert.match(muscleMap(exercise), /Peito &lt;teste&gt; &quot;a&quot;/);
  assert.match(
    muscleMap(exercise, "plan"),
    /id="plan-muscles-pec-deck-description"/,
  );
  assert.doesNotMatch(muscleMap(exercise, "plan"), /id="session-/);
  assert.equal(muscleMap({ id: "unknown" }), "");
});
