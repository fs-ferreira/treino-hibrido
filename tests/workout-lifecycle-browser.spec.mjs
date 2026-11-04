import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  defaults,
  materializeDay,
  addWorkout,
  completeWorkout,
  cancelWorkout,
} from "../lib/core.js";
import { mockCloud } from "./helpers/cloud-api-fixture.mjs";
import { enterDate, choose } from "./helpers/field-controls-fixture.mjs";

const DATE = "2026-11-02",
  NOW = "2026-11-04T15:30:00.000Z";
async function open(
  page,
  data = defaults(),
  hash = `hoje/${DATE}`,
  width = 390,
) {
  await page.setViewportSize({ width, height: 844 });
  await page.clock.setFixedTime(new Date(NOW));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const cloud = await mockCloud(page, data);
  await page.goto(`/#${hash}`);
  await expect(page.locator("#main h1")).toBeVisible();
  return cloud;
}
async function cancel(page) {
  await page
    .locator('.day-workouts [data-action="move-workout"]')
    .first()
    .click();
  await page.getByText("Cancelar treino", { exact: true }).click();
  await expect(page.locator("[data-move-fields]")).toBeHidden();
  await page
    .getByRole("button", { name: "Confirmar cancelamento", exact: true })
    .click();
  await expect(page.locator("#guide-dialog")).not.toBeVisible();
}

test("past cancellation survives reload, preserves the weekly goal and reactivates without starting", async ({
  page,
}) => {
  const cloud = await open(page);
  await expect(page.locator(".hero .session-state")).toContainText(
    "Não realizado",
  );
  const goal = await page.locator(".progress-ring b").textContent();
  await cancel(page);
  await expect(page.locator(".hero .session-state")).toHaveText("Cancelado");
  await mkdir("test-results/workout-lifecycle", { recursive: true });
  await page
    .locator(".hero")
    .screenshot({ path: "test-results/workout-lifecycle/canceled-mobile.png" });
  await expect(page.locator(".hero-context")).toContainText("04/11/2026");
  await expect(page.locator(".progress-ring b")).toHaveText(goal);
  await expect(
    page.locator(`[data-date="${DATE}"] .workout-indicator.canceled`),
  ).toHaveCount(1);
  await expect(page.locator("#session input")).toHaveCount(0);
  await expect
    .poll(() => cloud.data.sessions[DATE]?.workouts[0].canceledAt)
    .toBe(NOW);
  await page.reload();
  await expect(page.locator(".hero .session-state")).toHaveText("Cancelado");
  await page.evaluate(() => {
    location.hash = "historico";
  });
  await expect(page.locator(".history-entry.is-canceled")).toHaveCount(1);
  await expect(page.locator(".history-entry")).toContainText(
    "Nenhum resultado registrado",
  );
  await page.locator('.history-entry [data-action="open-day"]').click();
  await page.locator('.hero [data-action="reactivate-workout"]').click();
  await expect(page.locator(".hero .session-state")).toHaveText(
    "Não realizado",
  );
  await expect
    .poll(() => cloud.data.sessions[DATE].workouts[0].canceledAt)
    .toBe(null);
  await page.locator('.hero a[href="#session"]').click();
  expect(cloud.data.sessions[DATE].workouts[0].sets).toEqual({});
});

test("mixed days expose individual states and responsive cards; calendar has a single border and Monday navigation", async ({
  page,
}) => {
  const data = defaults(),
    done = materializeDay(data, DATE).workouts[0];
  completeWorkout(done, NOW);
  const canceled = addWorkout(data, DATE, "easy");
  cancelWorkout(data, DATE, canceled.id, NOW);
  const partial = addWorkout(data, DATE, "upper");
  partial.sets["pec-deck"] = [0, 1, 2].map((i) => ({
    kg: i === 0 ? 10 : "",
    reps: "",
    done: i === 0,
  }));
  addWorkout(data, DATE, "long");
  await open(page, data, `hoje/${DATE}/${done.id}`, 1440);
  const day = page.locator(`.week-strip [data-date="${DATE}"]`);
  await expect(day.locator(".workout-indicator")).toHaveCount(3);
  await expect(day).toContainText("1 de 4 feitos");
  await expect(day).toHaveAttribute(
    "aria-label",
    /Concluído.*Cancelado.*Em andamento.*Não realizado/,
  );
  await mkdir("test-results/workout-lifecycle", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.screenshot({
      path: `test-results/workout-lifecycle/dashboard-${width}.png`,
    });
  }
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1440,
  );
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
    location.hash = "hoje/2026-11-04";
  });
  await page
    .locator('.day-workouts [data-action="move-workout"]')
    .first()
    .click();
  const display = page.locator(".field-date-text");
  expect(
    await display.evaluate((el) => getComputedStyle(el).borderTopWidth),
  ).toBe("0px");
  await page
    .getByRole("button", { name: "Abrir calendário: Data de destino" })
    .click();
  await page.screenshot({
    path: "test-results/workout-lifecycle/calendar-desktop.png",
  });
  await expect(page.locator(".field-calendar-footer")).toBeInViewport({
    ratio: 1,
  });
  await expect(page.locator(".field-weekdays span").first()).toHaveText("seg");
  await page.locator('.field-days button[tabindex="0"]').press("Home");
  const focused = await page.evaluate(
    () => document.activeElement.dataset.date,
  );
  expect(new Date(focused + "T12:00:00").getDay()).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("#guide-dialog")).toBeVisible();
  await enterDate(page.locator('[name="destination"]'), "2026-11-05");
  await page.screenshot({
    path: "test-results/workout-lifecycle/reorganize-desktop.png",
  });
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
});

test("new conclusions record time; reopening clears it and records block reorganization", async ({
  page,
}) => {
  const cloud = await open(page);
  await page.locator('[data-exercise="pec-deck"] > summary').click();
  await page.locator('[data-field="kg"]').first().fill("12");
  await expect(page.locator(".hero .session-state")).toHaveText("Em andamento");
  await expect(
    page.locator('.day-workouts [data-action="move-workout"]'),
  ).toBeDisabled();
  await page.locator('[data-action="finish-strength"]').click();
  await page.locator('[data-action="confirm-session"]').click();
  await expect
    .poll(() => cloud.data.sessions[DATE]?.workouts[0].completedAt)
    .toBe(NOW);
  await expect(page.locator(".hero-context")).toContainText("Concluído em");
  await page.locator('[data-action="finish-strength"]').click();
  await expect
    .poll(() => cloud.data.sessions[DATE]?.workouts[0].completedAt)
    .toBe(null);
  await expect(page.locator(".hero .session-state")).toHaveText("Em andamento");
});

test("closing does not cancel, and offline cancellation remains durable after reload", async ({
  page,
}) => {
  const cloud = await open(page);
  await page.locator('.day-workouts [data-action="move-workout"]').click();
  await page.getByText("Cancelar treino", { exact: true }).click();
  await page.keyboard.press("Escape");
  expect(cloud.writes).toBe(0);
  cloud.fail = true;
  await cancel(page);
  await expect(page.locator("[data-sync-status]")).toHaveAttribute(
    "data-state",
    "local",
  );
  cloud.fail = false;
  await page.reload();
  await expect(page.locator(".hero .session-state")).toHaveText("Cancelado");
  await expect
    .poll(() => cloud.data.sessions[DATE]?.workouts[0].canceledAt)
    .toBe(NOW);
});

test("network plus storage failure keeps the modal and retries the same cancellation", async ({
  page,
}) => {
  const cloud = await open(page);
  await page.evaluate(() => {
    window.originalJournalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = () => {
      throw Error("simulated storage failure");
    };
  });
  cloud.fail = true;
  await page.locator('.day-workouts [data-action="move-workout"]').click();
  await page.getByText("Cancelar treino", { exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmar cancelamento", exact: true })
    .click();
  await expect(page.locator("[data-move-error]")).toContainText(
    "Alteração apenas nesta aba",
  );
  await expect(page.locator("#guide-dialog")).toBeVisible();
  expect(cloud.writes).toBe(0);
  cloud.fail = false;
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = window.originalJournalPut;
  });
  await page
    .getByRole("button", { name: "Tentar salvar novamente", exact: true })
    .click();
  await expect(page.locator("#guide-dialog")).not.toBeVisible();
  await expect(page.locator(".hero .session-state")).toHaveText("Cancelado");
  expect(cloud.writes).toBe(1);
});

test("date changes refresh missed states without persisting virtual workouts", async ({
  page,
}) => {
  const cloud = await open(page, defaults(), "hoje/2026-11-04");
  await expect(page.locator(".hero .session-state")).toHaveText("Programado");
  await page.clock.setFixedTime(new Date("2026-11-05T15:30:00.000Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".hero .session-state")).toHaveText(
    "Não realizado",
  );
  expect(cloud.writes).toBe(0);
});

test("saving a completed run preserves its original completion time", async ({
  page,
}) => {
  const data = defaults();
  Object.assign(data.settings, { easyPace: "6:00", hardPace: "5:00" });
  const run = addWorkout(data, DATE, "easy");
  const cloud = await open(page, data, `hoje/${DATE}/${run.id}`);
  await page.locator('[name="minutes"]').fill("30");
  await page.locator('[name="km"]').fill("5");
  await choose(page.locator('[name="rpe"]'), "4");
  await page.locator('#run-form [type="submit"]').click();
  await expect
    .poll(
      () =>
        cloud.data.sessions[DATE].workouts.find((s) => s.id === run.id)
          .completedAt,
    )
    .toBe(NOW);
  await page.clock.setFixedTime(new Date("2026-11-04T17:30:00.000Z"));
  await page.locator('[name="notes"]').fill("Observação posterior");
  await expect(page.locator(".hero .session-state")).toContainText(
    "alterações não salvas",
  );
  await page.locator('#run-form [type="submit"]').click();
  await expect(page.locator(".hero .session-state")).toHaveText("Concluído");
  expect(
    cloud.data.sessions[DATE].workouts.find((s) => s.id === run.id).completedAt,
  ).toBe(NOW);
});

test("reorganization validates required dates and calendar fits a narrow mobile modal", async ({
  page,
}) => {
  const cloud = await open(page, defaults(), `hoje/${DATE}`, 320);
  await page.locator('.day-workouts [data-action="move-workout"]').click();
  await page.getByRole("button", { name: "Mover treino", exact: true }).click();
  await expect(page.locator(".field-date-error")).toContainText(
    "Informe uma data",
  );
  await page
    .getByRole("button", { name: "Abrir calendário: Data de destino" })
    .click();
  const calendar = page.locator(".field-calendar");
  const bounds = await calendar.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await mkdir("test-results/workout-lifecycle", { recursive: true });
  await page.screenshot({
    path: "test-results/workout-lifecycle/calendar-mobile.png",
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("#guide-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  expect(cloud.writes).toBe(0);
});
