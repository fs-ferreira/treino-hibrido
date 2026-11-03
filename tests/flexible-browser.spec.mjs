import { test, expect } from "@playwright/test";
import {
  defaults,
  addWorkout,
  addDays,
  scheduledWorkouts,
} from "../lib/core.js";
import { mockCloud } from "./helpers/cloud-api-fixture.mjs";
const TODAY = "2026-11-02";
async function open(page, data = defaults(), hash = "hoje", width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-11-02T15:00:00-03:00"));
  const cloud = await mockCloud(page, data);
  await page.goto(`/#${hash}`);
  await expect(page.locator("#main h1")).toBeVisible();
  return cloud;
}
async function navigate(page, hash) {
  await page.evaluate((h) => (location.hash = h), hash);
  await expect(page.locator("#main")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#${hash}(?:/.*)?$`));
}
async function add(page, type) {
  await page.getByRole("button", { name: /^Adicionar treino/ }).click();
  await page.locator('#add-workout-form [name="type"]').selectOption(type);
  await page.locator('#add-workout-form [type="submit"]').click();
  await expect(page.locator("#guide-dialog")).not.toBeVisible();
}
test("legacy aliases replace their entry without trapping browser Back", async ({
  page,
}) => {
  await open(page, defaults(), "hoje/2026-10-27");
  await navigate(page, "historico");
  await page.evaluate(() => (location.hash = "hoje"));
  await expect(page).toHaveURL(/hoje\/2026-11-02/);
  await page.goBack();
  await expect(page).toHaveURL(/#historico$/);
  await page.goBack();
  await expect(page).toHaveURL(/#hoje\/2026-10-27$/);
  await expect(page.locator("#top-date")).toContainText("27 de outubro");
  await page.evaluate(() => (location.hash = "semana"));
  await expect(page).toHaveURL(/hoje\/2026-11-02/);
  await page.goBack();
  await expect(page).toHaveURL(/#hoje\/2026-10-27$/);
});
test("add and move preserve both days, workout identity and explicit rest after reload", async ({
  page,
}) => {
  const cloud = await open(page);
  await add(page, "easy");
  await add(page, "easy");
  await expect(page.locator(".day-workout")).toHaveCount(3);
  await expect.poll(() => cloud.data.sessions[TODAY]?.workouts.length).toBe(3);
  const movedId = cloud.data.sessions[TODAY].workouts[0].id;
  await page
    .locator(`[data-action="move-workout"][data-workout="${movedId}"]`)
    .click();
  await page.locator('[name="destination"]').fill("2026-11-03");
  await expect(page.locator("[data-move-preview]")).toContainText(
    "Intervalado",
  );
  await page.locator('#move-workout-form [type="submit"]').click();
  await expect(page.locator(".day-workout")).toHaveCount(2);
  await expect
    .poll(() => cloud.data.sessions["2026-11-03"]?.workouts[1].id)
    .toBe(movedId);
  await expect(page).toHaveURL(new RegExp(`hoje/2026-11-03/${movedId}$`));
  await page.reload();
  await expect(page.locator("#session h2")).toContainText("Upper");
  await page.locator('[data-action="day"][data-date="2026-11-04"]').click();
  const id = scheduledWorkouts(cloud.data, "2026-11-04")[0].id;
  await page.locator('[data-action="move-workout"]').click();
  await page.locator('[name="destination"]').fill(TODAY);
  await page.locator('#move-workout-form [type="submit"]').click();
  await expect
    .poll(() => cloud.data.sessions["2026-11-04"]?.workouts)
    .toEqual([]);
  await page.locator('[data-action="day"][data-date="2026-11-04"]').click();
  await expect(page.locator(".rest-card")).toBeVisible();
  await page.reload();
  await expect(page.locator(".rest-card")).toBeVisible();
  expect(cloud.data.sessions[TODAY].workouts.some((s) => s.id === id)).toBe(
    true,
  );
});
test("independent series and conclusions; a started workout cannot move", async ({
  page,
}) => {
  const cloud = await open(page);
  await add(page, "upper");
  const extra = cloud.data.sessions[TODAY].workouts[1].id;
  await page.locator('[data-exercise="pec-deck"]>summary').click();
  await page.locator('[data-field="kg"]').first().fill("12.5");
  await page.locator('[data-field="reps"]').first().fill("8");
  await page.locator('[data-field="done"]').first().check();
  await expect(
    page.locator(`[data-action="move-workout"][data-workout="${extra}"]`),
  ).toBeDisabled();
  await page.locator('[data-action="finish-strength"]').click();
  await page.locator('[data-action="confirm-session"]').click();
  await expect
    .poll(() => cloud.data.sessions[TODAY].workouts[1].done)
    .toBe(true);
  const original = cloud.data.sessions[TODAY].workouts[0];
  expect(original.done).toBe(false);
  expect(original.sets).toEqual({});
  await page
    .locator(`[data-action="select-workout"][data-workout="${original.id}"]`)
    .click();
  await expect(page.locator(".count-pill")).toHaveText("0/24 séries");
  await page
    .locator(`[data-action="select-workout"][data-workout="${extra}"]`)
    .click();
  await page.locator('[data-exercise="pec-deck"]>summary').click();
  await expect(page.locator('[data-field="kg"]').first()).toHaveValue("12.5");
});
test("run drafts survive screens and workout changes; save retains keyboard focus and help", async ({
  page,
}) => {
  const data = defaults();
  Object.assign(data.settings, { easyPace: "6:00", hardPace: "5:00" });
  const cloud = await open(page, data);
  await add(page, "interval");
  const id = cloud.data.sessions[TODAY].workouts[1].id;
  await page.locator('[name="minutes"]').fill("40");
  await page.locator('[name="km"]').fill("6");
  await page.locator('[name="rpe"]').selectOption("5");
  await page.locator('[name="notes"]').fill("rascunho");
  await expect(
    page.locator(`[data-action="move-workout"][data-workout="${id}"]`),
  ).toBeDisabled();
  await navigate(page, "historico");
  await navigate(page, `hoje/${TODAY}/${id}`);
  await expect(page.locator('[name="minutes"]')).toHaveValue("40");
  await expect(page.locator('[name="notes"]')).toHaveValue("rascunho");
  await expect(page.locator("[data-run-draft-warning]")).toBeVisible();
  await page.locator(".pace-method>summary").click();
  const submit = page.locator('#run-form [type="submit"]');
  await submit.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => cloud.data.sessions[TODAY].workouts[1].done)
    .toBe(true);
  await expect(page.locator("[data-run-draft-warning]")).toBeHidden();
  await expect(submit).toBeFocused();
  await expect(page.locator(".pace-method")).toHaveAttribute("open", "");
  await page.reload();
  await expect(page.locator('[name="notes"]')).toHaveValue("rascunho");
});
test("date URLs reload correctly and Hoje returns to today; old Semana opens weekly controls", async ({
  page,
}) => {
  await open(page, defaults(), "hoje/2026-10-27");
  await expect(page.locator("#top-date")).toContainText("27 de outubro");
  await page.reload();
  await expect(page.locator("#top-date")).toContainText("27 de outubro");
  await page.locator('[data-nav="hoje"]').click();
  await expect(page).toHaveURL(/hoje\/2026-11-02/);
  await page.locator('[data-action="next-week"]').click();
  await expect(page).toHaveURL(/hoje\/2026-11-09/);
  await page.locator('[data-action="current-week"]').click();
  await expect(page).toHaveURL(/hoje\/2026-11-02/);
  await page.goto("/#semana");
  await expect(page.locator("#week-navigation")).toBeVisible();
  await expect(page.locator('[data-nav="semana"]')).toHaveCount(0);
});
test("pending sync remains on screen and recovery removes its visual space", async ({
  page,
}) => {
  const cloud = await open(page);
  await page.locator('.hero a[href="#session"]').click();
  await page.locator('[data-exercise="pec-deck"]>summary').click();
  cloud.fail = true;
  await page.locator('[data-field="kg"]').first().fill("16");
  const status = page.locator("[data-sync-status]");
  await expect(status).toHaveAttribute("data-state", "local");
  await page.evaluate(() => scrollBy(0, 300));
  expect((await status.boundingBox()).y).toBeGreaterThanOrEqual(0);
  expect((await status.boundingBox()).y).toBeLessThan(3);
  cloud.fail = false;
  await page.evaluate(async () => {
    const { account } = await import("/lib/account.js");
    await account.remote.check();
  });
  await expect(status).toHaveClass(/sr-only/);
  expect((await status.boundingBox()).height).toBe(1);
});
test("mobile maps are collapsed after inputs; desktop maps and four circular destinations work", async ({
  page,
}) => {
  await open(page);
  await page.locator('[data-exercise="pec-deck"]>summary').click();
  const map = page.locator('[data-exercise="pec-deck"] .muscle-disclosure');
  await expect(map).not.toHaveAttribute("open", "");
  await map.locator("summary").click();
  await expect(map.locator("figure")).toBeVisible();
  const input = await page.locator('[data-field="kg"]').first().boundingBox(),
    mapRect = await map.boundingBox();
  expect(input.y).toBeLessThan(mapRect.y);
  await expect(page.locator("[data-nav]")).toHaveCount(4);
  const before = page.url();
  await page.locator('[data-nav-step="1"]').click();
  expect(page.url()).toBe(before);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(map).toHaveAttribute("open", "");
  await expect(map.locator("summary")).toBeHidden();
});
test("history filters, 20-item pagination and exercise comparison count workouts independently", async ({
  page,
}) => {
  const data = defaults();
  for (let i = 0; i < 26; i++) {
    const date = addDays(TODAY, -i),
      s = addWorkout(data, date, i % 2 ? "upper" : "easy");
    s.done = true;
    if (s.type === "easy") s.run = { minutes: 30, km: 5, rpe: 4, notes: "" };
    else
      s.sets["pec-deck"] = [0, 1, 2].map(() => ({
        kg: 10 + i,
        reps: 8,
        done: true,
      }));
  }
  const extra = addWorkout(data, TODAY, "easy");
  extra.done = true;
  extra.run = { minutes: 30, km: 4, rpe: 5, notes: "" };
  await open(page, data, "historico");
  await expect(page.locator(".history-entry")).toHaveCount(20);
  await page.getByRole("button", { name: "Mostrar mais 20 treinos" }).click();
  await expect(page.locator(".history-entry")).toHaveCount(27);
  await page.locator("#history-filters-toggle").click();
  await page.locator('[data-history-field="type"]').selectOption("upper");
  await page
    .locator('[data-history-field="exercise"]')
    .selectOption("pec-deck");
  await expect(page.locator(".exercise-comparison tbody tr")).toHaveCount(13);
  await navigate(page, "configuracoes/dados");
  await navigate(page, "historico");
  await expect(page.locator('[data-history-field="exercise"]')).toHaveValue(
    "pec-deck",
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  }
});
function historyDiary() {
  const data = defaults();
  for (let i = 0; i < 52; i++) {
    const workout = addWorkout(
      data,
      addDays(TODAY, -i),
      i % 2 ? "upper" : "easy",
    );
    workout.done = true;
    if (workout.type === "easy")
      workout.run = { minutes: 30, km: 5, rpe: 4, notes: "" };
    else
      workout.sets["pec-deck"] = [0, 1, 2].map(() => ({
        kg: 10 + i,
        reps: 8,
        done: true,
      }));
  }
  return data;
}
test("history pending dates preserve results, metrics and pagination until the entire recorte is valid", async ({
  page,
}) => {
  const cloud = await open(page, historyDiary(), "historico");
  await page.getByRole("button", { name: "Mostrar mais 20 treinos" }).click();
  const summary = await page.locator("[data-history-summary]").textContent();
  const metrics = await page.locator(".history-metrics").innerText();
  const results = await page.locator(".history-list").innerText();
  await page.locator("#history-filters-toggle").click();
  await page
    .getByRole("combobox", { name: "Período", exact: true })
    .selectOption("custom");
  await expect(page.locator("#history-range-error")).toHaveCount(0);
  await expect(page.locator("#history-range-hint")).toContainText(
    "Preencha as duas datas",
  );
  await page
    .getByRole("combobox", { name: "Treino", exact: true })
    .selectOption("upper");
  await page
    .getByRole("combobox", { name: "Exercício", exact: true })
    .selectOption("pec-deck");
  await page.getByLabel("De", { exact: true }).fill(TODAY);
  await page.getByLabel("Até", { exact: true }).fill("2026-10-01");
  await expect(page.locator("#history-range-error")).toContainText("inicial");
  await expect(page.locator("#history-from")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.locator("[data-history-summary]")).toHaveText(summary);
  await expect(page.locator(".history-metrics")).toHaveText(metrics, {
    useInnerText: true,
  });
  await expect(page.locator(".history-list")).toHaveText(results, {
    useInnerText: true,
  });
  await expect(page.locator(".history-entry")).toHaveCount(40);
  await expect(page.locator("#history-status")).toContainText("pendentes");
  await page.getByRole("button", { name: "Mostrar mais 20 treinos" }).click();
  await expect(page.locator(".history-entry")).toHaveCount(52);
  await page.getByLabel("Até", { exact: true }).fill(TODAY);
  await expect(
    page.getByText("Nenhum treino neste recorte.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-history-summary]")).toHaveText(
    "02/11/2026 a 02/11/2026 · Upper · Crucifixo na máquina",
  );
  await page
    .getByRole("combobox", { name: "Treino", exact: true })
    .selectOption("easy");
  await expect(page.locator(".history-entry")).toHaveCount(1);
  await expect(page.locator("[data-history-period]")).toHaveText(
    "1 treino registrado",
  );
  await expect(page.locator(".history-metrics .panel b")).toHaveText([
    "01",
    "5,0km",
    "0",
  ]);
  expect(cloud.writes).toBe(0);
});
test("history pending workout changes keep the applied exercise comparison coherent", async ({
  page,
}) => {
  const cloud = await open(page, historyDiary(), "historico");
  await page.locator("#history-filters-toggle").click();
  await page
    .getByRole("combobox", { name: "Exercício", exact: true })
    .selectOption("pec-deck");
  await page.getByRole("button", { name: "Mostrar mais 20 treinos" }).click();
  const comparison = await page.locator(".exercise-comparison").innerText();
  const metrics = await page.locator(".history-metrics").innerText();
  await page
    .getByRole("combobox", { name: "Período", exact: true })
    .selectOption("custom");
  await page
    .getByRole("combobox", { name: "Treino", exact: true })
    .selectOption("easy");
  await expect(page.locator("#history-exercise")).toHaveCount(0);
  await expect(page.locator(".exercise-comparison")).toHaveText(comparison, {
    useInnerText: true,
  });
  await expect(page.locator(".exercise-comparison tbody tr")).toHaveCount(26);
  await expect(page.locator(".history-metrics")).toHaveText(metrics, {
    useInnerText: true,
  });
  await expect(page.locator("[data-history-summary]")).toContainText(
    "Crucifixo na máquina",
  );
  await page.getByLabel("De", { exact: true }).fill("2026-10-31");
  await page.getByLabel("Até", { exact: true }).fill("2026-11-01");
  await expect(page.locator(".exercise-comparison")).toHaveCount(0);
  await expect(page.locator(".history-entry")).toHaveCount(1);
  await expect(page.locator("[data-history-summary]")).toHaveText(
    "31/10/2026 a 01/11/2026 · Corrida leve",
  );
  expect(cloud.writes).toBe(0);
});
test("history disclosure supports keyboard, focus, navigation and desktop resizing", async ({
  page,
}) => {
  const cloud = await open(page, historyDiary(), "historico");
  const toggle = page.locator("#history-filters-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#history-filter-fields")).toBeHidden();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(page.locator("#history-period")).toBeFocused();
  await page.locator("#history-period").selectOption("30");
  await expect(page.locator("#history-period")).toBeFocused();
  const y = await page.evaluate(() => scrollY);
  await page.locator("#history-period").selectOption("90");
  expect(await page.evaluate(() => scrollY)).toBe(y);
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#history-filter-fields")).toBeHidden();
  await expect(toggle).toBeFocused();
  await page.setViewportSize({ width: 1024, height: 844 });
  await expect(page.locator("#history-filter-fields")).toBeVisible();
  await expect(toggle).toBeHidden();
  await expect(page.locator("#history-period")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#history-period")).toBeFocused();
  await navigate(page, "configuracoes/dados");
  await navigate(page, "historico");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#history-period")).toHaveValue("90");
  await page
    .locator('.history-filters [data-action="clear-history-filters"]')
    .click();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#history-period")).toHaveValue("all");
  await expect(page.locator(".history-entry")).toHaveCount(20);
  await expect(page.locator("#history-status")).toContainText(
    "Exibindo 20 treinos",
  );
  expect(cloud.writes).toBe(0);
});
test("history exercise compatibility, empty results and reset preserve the diary", async ({
  page,
}) => {
  const cloud = await open(page, historyDiary(), "historico", 1440);
  await expect(
    page.locator('.history-filters [data-action="clear-history-filters"]'),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Exercício", exact: true })
    .selectOption("pec-deck");
  await page
    .getByRole("combobox", { name: "Treino", exact: true })
    .selectOption("upper");
  await expect(page.locator("#history-exercise")).toHaveValue("pec-deck");
  await expect(page.locator("#history-exercise option")).toHaveCount(9);
  await page
    .getByRole("combobox", { name: "Treino", exact: true })
    .selectOption("lower");
  await expect(page.locator("#history-exercise")).toHaveValue("");
  await expect(page.locator("#history-exercise option")).toHaveCount(8);
  await expect(
    page.getByText("Nenhum treino neste recorte.", { exact: true }),
  ).toBeVisible();
  await page
    .locator('.empty-state [data-action="clear-history-filters"]')
    .click();
  await expect(page.locator("#history-period")).toBeFocused();
  await expect(page.locator(".history-entry")).toHaveCount(20);
  await expect(page.locator("#history-exercise option")).toHaveCount(24);
  expect(cloud.writes).toBe(0);
  await page.reload();
  await expect(page.locator("[data-history-summary]")).toHaveText(
    "Todo o período · Todos os treinos",
  );
});
test("history responsive layouts keep fields accessible and capture the default, expanded and custom states", async ({
  page,
}) => {
  const cloud = await open(page, historyDiary(), "historico", 320);
  const measurements = [];
  for (const [width, height] of [
    [320, 844],
    [390, 844],
    [600, 844],
    [601, 844],
    [768, 844],
    [1024, 844],
    [1440, 900],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const mobile = width <= 600;
    if (mobile && (await page.locator("#history-filter-fields").isVisible()))
      await page.locator("#history-filters-toggle").click();
    await page.screenshot({
      path: test.info().outputPath(`history-${width}x${height}-default.png`),
    });
    if (mobile) {
      const panelHeight = await page
        .locator(".history-filters")
        .evaluate((el) => el.offsetHeight);
      expect(panelHeight).toBeLessThan(200);
      measurements.push({ width, collapsedHeight: panelHeight });
      await page.locator("#history-filters-toggle").click();
    }
    await page.screenshot({
      path: test.info().outputPath(`history-${width}x${height}-expanded.png`),
    });
    await page.locator("#history-period").selectOption("custom");
    await page.locator("#history-from").fill(TODAY);
    await page.locator("#history-to").fill(TODAY);
    await page.locator("#history-filters-title").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`history-${width}x${height}-custom.png`),
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    for (const control of await page
      .locator(".history-filters input, .history-filters select")
      .all()) {
      const box = await control.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(48);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await page
      .locator('.history-filters [data-action="clear-history-filters"]')
      .click();
  }
  await test.info().attach("history-measurements", {
    body: JSON.stringify(measurements),
    contentType: "application/json",
  });
  expect(cloud.writes).toBe(0);
});
test("backup v4 preview distinguishes days, workouts and programming without restoring", async ({
  page,
}) => {
  await open(page, defaults(), "configuracoes/dados");
  const data = defaults();
  const item = addWorkout(data, TODAY, "easy");
  item.done = true;
  item.run = { minutes: 30, km: 5, rpe: 4, notes: "" };
  addWorkout(data, TODAY, "upper");
  data.sessions["2026-11-03"] = { workouts: [] };
  await page.locator('[data-action="import"]').click();
  await page.locator("#import-file").setInputFiles({
    name: "v4.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.locator("#import-summary")).toContainText(
    "Treinos programados",
  );
  await expect(page.locator("#import-summary")).toContainText("2026-11-02");
  await expect(page.locator("#import-summary")).toContainText("versão 4");
  await page.locator("#import-summary summary").click();
  await expect(page.locator(".backup-settings")).toContainText(
    "Duração padrão",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#guide-dialog")).toBeHidden();
});
