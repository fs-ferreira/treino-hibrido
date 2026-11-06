import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { defaults, addWorkout } from "../lib/core.js";
import { mockCloud } from "./helpers/cloud-api-fixture.mjs";
import { choose, enterDate } from "./helpers/field-controls-fixture.mjs";

async function open(page, hash = "historico", width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.clock.setFixedTime(new Date("2026-11-02T15:00:00-03:00"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const data = defaults();
  for (const date of ["2026-10-30", "2026-11-01", "2026-11-02"]) {
    const workout = addWorkout(data, date, "easy");
    workout.run = { km: 5, minutes: 30, rpe: 4, notes: "" };
    workout.done = true;
  }
  const cloud = await mockCloud(page, data);
  await page.goto(`/#${hash}`);
  await expect(page.locator("#main h1")).toBeVisible();
  return cloud;
}

test("select menus support search, independent highlight, keyboard, bounds and disabled state", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const cloud = await open(page);
  await page.locator("[data-history-summary]").click();
  const period = page.locator("#history-period-trigger");
  await period.focus();
  await period.press("ArrowDown");
  await period.press("ArrowDown");
  await expect(
    page.getByRole("option", { name: "Todo o período", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("option", { name: "Últimos 30 dias", exact: true }),
  ).toHaveAttribute("data-highlighted", "true");
  await period.press("Enter");
  await expect(page.locator("#history-period")).toHaveValue("30");
  await expect(period).toBeFocused();
  await page.locator("#history-exercise-trigger").click();
  const search = page.getByRole("combobox", {
    name: "Buscar exercício",
    exact: true,
  });
  await search.fill("triceps");
  await expect(page.getByRole("option")).not.toHaveCount(0);
  for (const label of await page.getByRole("option").allTextContents())
    expect(label.toLowerCase()).toContain("tríceps");
  await search.fill("inexistente");
  await expect(page.getByText("Nenhum exercício encontrado.")).toBeVisible();
  await search.press("Escape");
  await expect(page.locator("#history-exercise-trigger")).toBeFocused();
  await period.click();
  const menu = await page.locator(".field-menu").boundingBox();
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(390);
  await page.locator(".history-metrics").click();
  await expect(page.locator(".field-menu")).toHaveCount(0);
  await page.locator("#history-type").evaluate((node) => {
    node.disabled = true;
  });
  await expect(page.locator("#history-type-trigger")).toBeDisabled();
  await expect(page.locator("#history-filters-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(cloud.writes).toBe(0);
  expect(errors).toEqual([]);
});

test("manual dates preserve invalid drafts and applied results; calendar selections preserve the card", async ({
  page,
}) => {
  const cloud = await open(page);
  await page.locator(".history-filters").click({ position: { x: 5, y: 5 } });
  const before = await page.locator("[data-history-summary]").textContent();
  await choose(page.locator("#history-period"), "custom");
  await enterDate(page.locator("#history-from"), "31/02/2026");
  await expect(page.locator("#history-from-date-error")).toContainText(
    "válida",
  );
  await expect(page.locator("[data-history-summary]")).toHaveText(before);
  await expect(page.locator("#history-from-display")).toHaveValue("31/02/2026");
  await enterDate(page.locator("#history-from"), "2026-11-01");
  await enterDate(page.locator("#history-to"), "2026-10-30");
  await expect(page.locator("#history-range-error")).toContainText("inicial");
  await page
    .getByRole("button", { name: "Abrir calendário: Até", exact: true })
    .click();
  const sheet = page.getByRole("dialog", {
    name: "Calendário: Até",
    exact: true,
  });
  await expect(sheet).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Abrir calendário: Até",
      exact: true,
      includeHidden: true,
    }),
  ).toHaveAttribute("aria-expanded", "true");
  await sheet.locator('[data-date="2026-11-01"]').click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator("#history-to-display")).toBeFocused();
  await expect(page.locator("[data-history-summary]")).toHaveText(
    "01/11/2026 a 01/11/2026 · Todos os treinos",
  );
  await page
    .getByRole("button", { name: "Abrir calendário: De", exact: true })
    .click();
  await expect(
    page.locator('.field-calendar [data-date="2026-11-01"]'),
  ).toHaveAttribute("data-range-edge", "true");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.locator('.field-calendar [data-date="2026-11-02"]'),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#history-from-display")).toBeFocused();
  await expect(page.locator("#history-filters-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .first()
    .click();
  await expect(page.locator("#history-filter-fields")).toBeVisible();
  expect(cloud.writes).toBe(0);
});

test("committing dates on blur keeps the next field and menu usable; clearing removes invalid drafts", async ({
  page,
}) => {
  await open(page);
  await page.locator("#history-filters-toggle").click();
  await choose(page.locator("#history-period"), "custom");
  await page.locator("#history-from-display").fill("01/11/2026");
  await page.locator("#history-to-display").fill("02/11/2026");
  await page.locator("#history-type-trigger").click();
  await expect(
    page.getByRole("listbox", { name: "Treino", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-history-summary]")).toHaveText(
    "01/11/2026 a 02/11/2026 · Todos os treinos",
  );
  await enterDate(page.locator("#history-from"), "31/02/2026");
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .first()
    .click();
  await choose(page.locator("#history-period"), "custom");
  await expect(page.locator("#history-from-display")).toHaveValue("");
  await expect(page.locator("#history-from-date-error")).toBeHidden();
});

test("date bounds, leap day, month/year navigation and nested dialogs work without submissions", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const cloud = await open(page, "configuracoes/corrida");
  await page
    .getByRole("button", { name: "Abrir calendário: Data", exact: true })
    .click();
  await expect(page.locator('[data-date="2026-11-03"]')).toBeDisabled();
  await page.getByRole("button", { name: "Escolher ano", exact: true }).click();
  await page.locator('[data-year="2024"]').click();
  await page.locator('[data-month="1"]').click();
  await page.locator('[data-date="2024-02-29"]').click();
  await expect(page.locator("#setting-recentDate")).toHaveValue("2024-02-29");
  await expect(page.locator("#setting-recentDate-display")).toHaveValue(
    "29/02/2024",
  );
  await enterDate(page.locator("#setting-recentDate"), "2026-11-03");
  await expect(page.locator("#setting-recentDate-date-error")).toContainText(
    "02/11/2026",
  );
  await page.evaluate(() => {
    location.hash = "hoje/2026-11-02";
  });
  await page.locator('[data-action="move-workout"]').first().click();
  await page
    .getByRole("button", {
      name: "Abrir calendário: Data de destino",
      exact: true,
    })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#guide-dialog")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Abrir calendário: Data de destino",
      exact: true,
    })
    .click();
  await page.locator('.field-calendar [data-date="2026-11-03"]').click();
  await expect(page.locator("#guide-dialog")).toBeVisible();
  await expect(page.locator('[name="destination"]')).toHaveValue("2026-11-03");
  await expect(page.locator("[data-move-preview]")).toContainText(
    "Intervalado",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("button", {
      name: "Abrir calendário: Data de destino",
      exact: true,
    })
    .click();
  await expect(page.locator(".field-calendar-sheet")).toHaveCount(0);
  await expect(page.locator("#guide-dialog .field-calendar")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#guide-dialog")).toBeVisible();
  expect(cloud.writes).toBe(0);
  expect(errors).toEqual([]);
});

test("settings selects retain drafts across screens and save through the original form", async ({
  page,
}) => {
  const cloud = await open(page, "configuracoes/semana");
  await choose(page.locator("#setting-longDay"), "0");
  await page.locator("#setting-longMinutes").fill("75");
  await page.evaluate(() => {
    location.hash = "historico";
  });
  await expect(page.locator("#main h1")).toContainText("evolução");
  await page.evaluate(() => {
    location.hash = "configuracoes/semana";
  });
  await expect(page.locator("#setting-longDay-trigger")).toHaveText(/Domingo/);
  await expect(page.locator("#setting-longMinutes")).toHaveValue("75");
  await page.locator('#settings-panel-semana [type="submit"]').click();
  await expect.poll(() => cloud.data.settings.longDay).toBe(0);
  await expect.poll(() => cloud.data.settings.longMinutes).toBe(75);
});

test("responsive controls fit the viewport and deliver mobile screenshots", async ({
  page,
}) => {
  await open(page);
  await mkdir("test-results/design-mobile", { recursive: true });
  await page.screenshot({
    path: "test-results/design-mobile/filters-collapsed.png",
  });
  await page.locator("#history-filters-toggle").click();
  await page.screenshot({
    path: "test-results/design-mobile/filters-expanded.png",
  });
  await page.locator("#history-exercise-trigger").click();
  await page.screenshot({ path: "test-results/design-mobile/select-open.png" });
  await page.keyboard.press("Escape");
  await choose(page.locator("#history-period"), "custom");
  await enterDate(page.locator("#history-from"), "2026-10-30");
  await enterDate(page.locator("#history-to"), "2026-11-02");
  await page
    .getByRole("button", { name: "Abrir calendário: Até", exact: true })
    .click();
  await page.mouse.move(380, 100);
  await page.screenshot({
    path: "test-results/design-mobile/calendar-open.png",
  });
  await page.keyboard.press("Escape");
  for (const width of [320, 390, 600, 601, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator("#history-filter-fields")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    for (const field of await page
      .locator(".field-trigger,.field-date-input")
      .all()) {
      const box = await field.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(48);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await page
      .getByRole("button", { name: "Abrir calendário: Até", exact: true })
      .click();
    const calendar = await page.locator(".field-calendar").boundingBox();
    expect(calendar.x).toBeGreaterThanOrEqual(0);
    expect(calendar.x + calendar.width).toBeLessThanOrEqual(width);
    expect(calendar.y + calendar.height).toBeLessThanOrEqual(844);
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator("#history-filters-toggle").click();
  await expect(page.locator("#history-filter-fields")).toBeHidden();
  await page.locator("#history-filters-toggle").click();
  await expect(page.locator("#history-filter-fields")).toBeVisible();
});
