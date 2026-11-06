import { test, expect } from "@playwright/test";
import { defaults, addWorkout, validateBackup } from "../lib/core.js";
import { mockCloud } from "./helpers/cloud-api-fixture.mjs";
import { choose, enterDate } from "./helpers/field-controls-fixture.mjs";
import { mkdir } from "node:fs/promises";

const DATE = "2026-11-05";
async function open(page, type = "easy", width = 390) {
  const data = defaults(),
    workout = addWorkout(data, DATE, type);
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(new Date("2026-11-06T15:00:00-03:00"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const cloud = await mockCloud(page, data);
  const hash = `hoje/${DATE}/${workout.id}`;
  await page.goto(`/#${hash}`);
  await expect(page.locator("#main h1")).toBeVisible();
  return {
    cloud,
    hash,
    id: workout.id,
    saved: () =>
      cloud.data.sessions[DATE].workouts.find((s) => s.id === workout.id),
  };
}
async function nav(page, hash) {
  await page.evaluate((value) => {
    location.hash = value;
  }, hash);
  await expect(page).toHaveURL(new RegExp(`#${hash}$`));
  await expect(page.locator("#main h1")).toBeVisible();
}

test("run saves seconds, previews exact pace, reloads and edits without changing completion time", async ({
  page,
}) => {
  const { cloud, saved } = await open(page);
  const form = page.locator("#run-form");
  await form.locator('[name="minutes"]').fill("21");
  await form.locator('[name="seconds"]').fill("55");
  await form.locator('[name="km"]').fill("2.82");
  await choose(form.locator('[name="rpe"]'), "4");
  await expect(page.locator("#actual-pace")).toHaveText("7:46 /km");
  await mkdir("test-results/duration", { recursive: true });
  await form.screenshot({ path: "test-results/duration/run-entry-390.png" });
  await form.locator('[type="submit"]').click();
  await expect.poll(() => saved().run?.minutes).toBe(1315 / 60);
  await expect(page.locator(".hero-stats")).toContainText("21 min 55 s");
  const completedAt = saved().completedAt;
  expect(
    validateBackup(JSON.parse(JSON.stringify(cloud.data))).sessions,
  ).toEqual(cloud.data.sessions);
  await page.reload();
  await expect(form.locator('[name="minutes"]')).toHaveValue("21");
  await expect(form.locator('[name="seconds"]')).toHaveValue("55");
  await page.clock.setFixedTime(new Date("2026-11-06T16:00:00-03:00"));
  await form.locator('[name="seconds"]').fill("56");
  await form.locator('[type="submit"]').click();
  await expect.poll(() => saved().run.minutes).toBe(1316 / 60);
  expect(saved().completedAt).toBe(completedAt);
  await nav(page, "historico");
  const entry = page
    .locator(".history-entry")
    .filter({ has: page.locator(`[data-workout="${saved().id}"]`) });
  await expect(entry.locator(".history-run")).toContainText("21 min 56 s");
  await entry.locator(".history-comparison summary").click();
  await expect(entry.locator(".history-comparison")).toContainText(
    "21 min 56 s",
  );
});

test("invalid duration never saves, hides pace, preserves raw drafts and restores focus", async ({
  page,
}) => {
  const { hash, saved } = await open(page);
  const form = page.locator("#run-form");
  await form.locator('[name="km"]').fill("2.82");
  await choose(form.locator('[name="rpe"]'), "4");
  for (const [minutes, seconds] of [
    ["", ""],
    ["0", "0"],
    ["21", "60"],
    ["21.55", ""],
    ["-1", ""],
    ["1440", "1"],
  ]) {
    await form.locator('[name="minutes"]').fill(minutes);
    await form.locator('[name="seconds"]').fill(seconds);
    await expect(page.locator("#actual-pace")).toHaveText("— /km");
    await form.locator('[type="submit"]').click();
    expect(saved().run).toBeFalsy();
    expect(saved().done).toBe(false);
    await expect(form.locator("[data-duration-error]")).toBeVisible();
  }
  await form.locator('[name="minutes"]').fill("21,");
  await form.locator('[name="seconds"]').fill("55");
  await nav(page, "treinos");
  await nav(page, hash);
  await expect(form.locator('[name="minutes"]')).toHaveValue("21,");
  await expect(form.locator('[name="seconds"]')).toHaveValue("55");
  await expect(page.locator("#actual-pace")).toHaveText("— /km");
  await form.locator('[name="minutes"]').fill("21");
  await form.locator('[name="seconds"]').focus();
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(form.locator('[name="seconds"]')).toBeFocused();
});

test("Cross accepts seconds alone and retains duration drafts before saving", async ({
  page,
}) => {
  const { hash, saved } = await open(page, "cross");
  const form = page.locator("#cross-form");
  await form.locator('[name="seconds"]').fill("55");
  await choose(form.locator('[name="rpe"]'), "7");
  await nav(page, "treinos");
  await nav(page, hash);
  await expect(form.locator('[name="minutes"]')).toHaveValue("");
  await expect(form.locator('[name="seconds"]')).toHaveValue("55");
  await form.locator('[type="submit"]').click();
  await expect.poll(() => saved().cross?.minutes).toBe(55 / 60);
  await page.reload();
  await expect(form.locator('[name="minutes"]')).toHaveValue("0");
  await expect(form.locator('[name="seconds"]')).toHaveValue("55");
  await nav(page, "historico");
  await expect(
    page.locator(".history-entry").filter({ hasText: "Cross" }),
  ).toContainText("0 min 55 s");
});

test("editing notes preserves legacy fractional minutes in run and Cross records", async ({
  page,
}) => {
  for (const type of ["easy", "cross"]) {
    const { saved } = await open(page, type);
    const kind = type === "cross" ? "cross" : "run";
    saved()[kind] = {
      minutes: 21.55321,
      rpe: 4,
      notes: "Anterior",
      ...(kind === "run" ? { km: 2.82 } : {}),
    };
    saved().done = true;
    saved().completedAt = "2026-11-05T15:00:00.000Z";
    await page.reload();
    const form = page.locator(`#${kind}-form`);
    await expect(form.locator('[name="minutes"]')).toHaveValue("21");
    await expect(form.locator('[name="seconds"]')).toHaveValue("33");
    await form.locator('[name="notes"]').fill("Somente observação alterada");
    await form.locator('[type="submit"]').click();
    await expect
      .poll(() => saved()[kind].notes)
      .toBe("Somente observação alterada");
    expect(saved()[kind].minutes).toBe(21.55321);
    expect(saved().completedAt).toBe("2026-11-05T15:00:00.000Z");
  }
});

test("recent run shares duration validation, pending edits and linked pace", async ({
  page,
}) => {
  const { cloud } = await open(page);
  await nav(page, "configuracoes/corrida");
  const form = page.locator('[data-settings-form="corrida"]');
  await form.locator('[name="easyPace"]').fill("8:00");
  await form.locator('[name="recentKm"]').fill("2.82");
  await form.locator('[name="recentMinutes"]').fill("21");
  await form.locator('[name="recentSeconds"]').fill("60");
  await enterDate(form.locator('[name="recentDate"]'), DATE);
  await form.locator('[name="useRecentPace"]').check();
  await form.locator('[type="submit"]').click();
  await expect(page.locator("#error-recentMinutes")).toContainText("0 a 59");
  expect(cloud.data.settings.recentRun.seconds).toBe("");
  await nav(page, "treinos");
  await nav(page, "configuracoes/corrida");
  await expect(form.locator('[name="recentSeconds"]')).toHaveValue("60");
  await expect(page.locator("#error-recentMinutes")).toBeVisible();
  await form.locator('[name="recentSeconds"]').fill("55");
  await expect(form.locator("[data-recent-pace]")).toHaveText("7:46 /km");
  await expect(form.locator('[name="hardPace"]')).toHaveValue("7:46");
  await form.locator('[type="submit"]').click();
  await expect.poll(() => cloud.data.settings.recentRun.seconds).toBe(1315);
  await page.reload();
  await expect(form.locator('[name="recentMinutes"]')).toHaveValue("21");
  await expect(form.locator('[name="recentSeconds"]')).toHaveValue("55");
  await expect(form.locator('[type="submit"]')).toBeDisabled();
});

test("long-run duration retains five-minute steps and locks its saved planning", async ({
  page,
}) => {
  const { cloud, saved } = await open(page, "long");
  const planned = page.locator("#long-minutes");
  await planned.fill("75");
  await expect.poll(() => cloud.data.settings.longMinutes).toBe(75);
  await expect(page.locator(".run-overview strong")).toHaveText("75 min");
  for (const value of ["61", "59", "95", "75.5"]) {
    await planned.fill(value);
    await expect(
      page.locator(".long-options [data-duration-error]"),
    ).toBeVisible();
    expect(cloud.data.settings.longMinutes).toBe(75);
  }
  await planned.fill("90");
  await expect.poll(() => cloud.data.settings.longMinutes).toBe(90);
  const form = page.locator("#run-form");
  await form.locator('[name="minutes"]').fill("89");
  await form.locator('[name="seconds"]').fill("59");
  await form.locator('[name="km"]').fill("10");
  await choose(form.locator('[name="rpe"]'), "4");
  await form.locator('[type="submit"]').click();
  await expect.poll(() => saved().run?.plan?.longMinutes).toBe(90);
  await expect(planned).toBeDisabled();
  await nav(page, "configuracoes/semana");
  const settingsForm = page.locator('[data-settings-form="semana"]');
  await settingsForm.locator('[name="longMinutes"]').fill("61");
  await settingsForm.locator('[type="submit"]').click();
  await expect(page.locator("#error-longMinutes")).toBeVisible();
  expect(cloud.data.settings.longMinutes).toBe(90);
  await settingsForm.locator('[name="longMinutes"]').fill("60");
  await settingsForm.locator('[type="submit"]').click();
  await expect.poll(() => cloud.data.settings.longMinutes).toBe(60);
  await page.reload();
  await nav(page, `hoje/${DATE}/${saved().id}`);
  await expect(planned).toHaveValue("90");
  await expect(planned).toBeDisabled();
});

test("all duration fields fit mobile and desktop with seconds beside minutes", async ({
  page,
}) => {
  const { hash } = await open(page);
  await mkdir("test-results/duration", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, route, selector] of [
      ["run", hash, "#run-form [data-duration-field]"],
      [
        "recent",
        "configuracoes/corrida",
        ".recent-run-fields [data-duration-field]",
      ],
      [
        "planned",
        "configuracoes/semana",
        "#settings-panel-semana [data-duration-field]",
      ],
    ]) {
      await nav(page, route);
      const field = page.locator(selector);
      await expect(field).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      const inputs = await field.locator("input").all();
      if (inputs.length === 2) {
        const [minutes, seconds] = await Promise.all(
          inputs.map((input) => input.boundingBox()),
        );
        expect(seconds.y).toBe(minutes.y);
        expect(seconds.x).toBeGreaterThan(minutes.x + minutes.width);
        expect(seconds.x + seconds.width).toBeLessThanOrEqual(width);
      }
      await field.screenshot({
        path: `test-results/duration/${name}-${width}.png`,
      });
    }
  }
});
