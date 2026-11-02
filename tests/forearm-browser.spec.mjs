import { test, expect } from "@playwright/test";
import { defaults } from "../lib/core.js";
import { workouts } from "../lib/exercises.js";
import { mockCloud } from "./helpers/cloud-api-fixture.mjs";

const cases = [
  {
    type: "upper",
    date: "2026-11-02",
    id: "reverse-curl",
    after: "cable-curl",
    primary: "brachioradialis",
    name: "Rosca inversa",
  },
  {
    type: "upper2",
    date: "2026-11-06",
    id: "wrist-curl",
    after: "preacher-curl",
    primary: "wrist-flexors",
    name: "Rosca de punho unilateral",
  },
];
const sets = () =>
  Array.from({ length: 3 }, () => ({ kg: 5, reps: 8, done: true }));

for (const width of [390, 1280])
  for (const exercise of cases)
    test(`${exercise.id}: order, map, guide and saved records at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.clock.setFixedTime(
        new Date(`${exercise.date}T15:00:00-03:00`),
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      const cloud = await mockCloud(page);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/#hoje");
      const cards = page.locator(".exercise-list > .exercise-card");
      await expect(cards).toHaveCount(8);
      expect(
        await cards.evaluateAll((elements) =>
          elements.map((element) => element.dataset.exercise),
        ),
      ).toEqual(workouts[exercise.type].ids);
      await expect(page.locator(".hero-stats")).toContainText("08");
      await expect(page.locator(".count-pill")).toHaveText("0/24 séries");
      const card = page.locator(`[data-exercise="${exercise.id}"]`);
      await card.locator(":scope > summary").click();
      const map = card.locator(".muscle-map");
      if (width < 1024)
        await card.locator(".muscle-disclosure>summary").click();
      const primary = map.locator(`[data-muscle="${exercise.primary}"]`);
      await primary.focus();
      await expect(map.locator('[role="status"]')).toContainText("Principal");
      await primary.press("Enter");
      await expect(primary).toHaveAttribute("aria-pressed", "true");
      await expect(card.locator(".set-row")).toHaveCount(3);
      const load = card.locator('[data-field="kg"]').first();
      if (exercise.id === "wrist-curl")
        await expect(load).toHaveAccessibleName(/Carga por lado/);
      await card.screenshot({
        path: testInfo.outputPath(`${exercise.id}-card-${width}.png`),
      });
      await card.locator('[data-action="guide"]').click();
      const guide = page.locator("#guide-dialog");
      await expect(guide).toBeVisible();
      await expect(
        guide.locator(`svg[data-scene="${exercise.id}"]`),
      ).toHaveCount(1);
      await expect(guide.locator(".motion-controls")).toBeHidden();
      await guide.locator('[data-motion="end"]').click();
      await expect(guide.locator(".motion-status")).toHaveText("Final");
      if (exercise.id === "wrist-curl") {
        await expect(guide).toContainText("Repita do outro lado.");
        await expect(guide).toContainText("6–8 repetições em cada braço");
        await expect(guide.locator('[data-entity="load.0"]')).toHaveCount(1);
        await expect(guide.locator('[data-entity="load.1"]')).toHaveCount(0);
      }
      await guide.screenshot({
        path: testInfo.outputPath(`${exercise.id}-guide-${width}.png`),
      });
      await guide.locator('[data-action="close-dialog"]').click();
      expect(cloud.writes).toBe(0);
      await load.fill("5");
      await card.locator('[data-field="reps"]').first().fill("8");
      await card.locator('[data-field="done"]').first().check();
      await expect(page.locator(".count-pill")).toHaveText("1/24 séries");
      await expect
        .poll(
          () =>
            cloud.data.sessions[exercise.date]?.workouts[0]?.sets?.[
              exercise.id
            ]?.[0],
        )
        .toEqual({ kg: 5, reps: 8, done: true });
      await page.reload();
      await card.locator(":scope > summary").click();
      await expect(card.locator('[data-field="kg"]').first()).toHaveValue("5");
      await expect(card.locator('[data-field="done"]').first()).toBeChecked();
      await page.evaluate(() => {
        location.hash = "historico";
      });
      await expect(page.locator(".history-entry")).toContainText(exercise.name);
      await page.evaluate(() => {
        location.hash = "semana";
      });
      await expect(page.locator("#week-navigation")).toBeVisible();
      await expect(page.locator('[data-nav="semana"]')).toHaveCount(0);
      await page.evaluate(() => {
        location.hash = "treinos/hibrido-3x3";
      });
      await expect(page.locator(".plan-overview")).toContainText("23");
      const day = page.locator(
        `[data-plan-day="${exercise.type === "upper" ? 1 : 5}"]`,
      );
      if ((await day.getAttribute("open")) === null)
        await day.locator(":scope > summary").click();
      await expect(day.locator(".plan-day-meta")).toHaveText("8 exercícios");
      if (width < 1024)
        await day
          .locator(
            `[data-muscle-disclosure="plan-muscles-${exercise.id}"]>summary`,
          )
          .click();
      await expect(
        day.locator(`[data-muscle-map="${exercise.id}"]`),
      ).toBeVisible();
      await day
        .locator(`[data-action="guide"][data-id="${exercise.id}"]`)
        .click();
      await expect(
        guide.locator(`svg[data-scene="${exercise.id}"]`),
      ).toHaveCount(1);
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });

test("existing completed sessions stay completed; progress and confirmation account for all 24 sets", async ({
  page,
}) => {
  const data = defaults();
  const legacy = {
    type: "upper",
    done: true,
    sets: Object.fromEntries(
      workouts.upper.ids
        .filter((id) => id !== "reverse-curl")
        .map((id) => [id, sets()]),
    ),
    run: null,
  };
  data.sessions["2026-11-02"] = legacy;
  await page.clock.setFixedTime(new Date("2026-11-02T15:00:00-03:00"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const cloud = await mockCloud(page, data);
  await page.goto("/#hoje");
  await expect(page.locator(".count-pill")).toHaveText("21/24 séries");
  await expect(page.locator('[data-action="finish-strength"]')).toHaveText(
    /Reabrir sessão/,
  );
  expect(cloud.writes).toBe(0);
  expect(cloud.data.sessions["2026-11-02"].workouts[0]).toEqual({
    id: "legacy-2026-11-02",
    ...legacy,
  });
  await page.locator('[data-action="finish-strength"]').click();
  const card = page.locator('[data-exercise="reverse-curl"]');
  await card.locator(":scope > summary").click();
  await card.locator('[data-field="done"]').nth(0).check();
  await card.locator('[data-field="done"]').nth(1).check();
  await page.locator('[data-action="finish-strength"]').click();
  await expect(page.locator(".confirm-progress strong")).toHaveText("23/24");
  await expect(page.locator("#guide-dialog")).toContainText(
    "séries não marcadas",
  );
  await page
    .getByRole("button", { name: "Voltar ao treino", exact: true })
    .click();
  await card.locator('[data-field="done"]').nth(2).check();
  await expect(page.locator(".count-pill")).toHaveText("24/24 séries");
  await expect(page.locator(".progress-line span")).toHaveAttribute(
    "style",
    /scaleX\(1\)/,
  );
  await page.locator('[data-action="finish-strength"]').click();
  await expect(page.locator(".confirm-progress strong")).toHaveText("24/24");
  await expect(page.locator("#guide-dialog")).not.toContainText(
    "séries não marcadas",
  );
  await page.locator('[data-action="confirm-session"]').click();
  await expect
    .poll(() => cloud.data.sessions["2026-11-02"].workouts[0].done)
    .toBe(true);
});
