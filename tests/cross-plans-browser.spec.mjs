import { test, expect } from "@playwright/test";
import { defaults, materializeDay } from "../lib/core.js";
import { CROSS_PLAN_ID } from "../lib/plans.js";
import { mockCloud } from "./helpers/cloud-api-fixture.mjs";
import { choose, enterDate } from "./helpers/field-controls-fixture.mjs";
const TODAY = "2026-11-05";
async function open(page, width = 390, data = defaults(), hash = "treinos") {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(new Date(TODAY + "T15:00:00-03:00"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const cloud = await mockCloud(page, data);
  await page.goto("/#" + hash);
  await expect(page.locator("#main h1")).toBeVisible();
  return cloud;
}
async function nav(page, hash) {
  await page.evaluate((h) => (location.hash = h), hash);
  await expect(page).toHaveURL(new RegExp("#" + hash + "$"));
  await expect(page.locator("#main h1")).toBeVisible();
}
async function activate(page) {
  await page.locator('a.plan-card[href="#treinos/hibrido-cross"]').click();
  await page.getByRole("button", { name: "Ativar plano", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#activate-plan-form")).toBeVisible();
  expect(
    (
      await page
        .locator('#activate-plan-form [type="radio"]')
        .first()
        .boundingBox()
    ).width,
  ).toBeLessThanOrEqual(24);
  await page.screenshot({
    path: `test-results/cross-activation-${page.viewportSize().width}.png`,
    fullPage: true,
  });
  await page.locator('#activate-plan-form [type="submit"]').click();
  await expect(page.locator("#guide-dialog")).not.toBeVisible();
}
for (const width of [390, 1280])
  test(
    "activate, record Cross and choose Saturday bonus at " + width,
    async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const cloud = await open(page, width);
      await expect(page.locator(".plan-card")).toHaveCount(2);
      await page.screenshot({
        path: `test-results/cross-catalog-${width}.png`,
        fullPage: true,
      });
      await activate(page);
      await expect
        .poll(() => cloud.data.settings.planHistory.at(-1).planId)
        .toBe(CROSS_PLAN_ID);
      await nav(page, "hoje/" + TODAY);
      await expect(page.locator(".hero h2")).toContainText("Cross");
      await page.screenshot({
        path: `test-results/cross-session-${width}.png`,
        fullPage: true,
      });
      await page.locator('#cross-form [name="minutes"]').fill("45");
      await choose(page.locator('#cross-form [name="rpe"]'), "7");
      await page.locator('#cross-form [name="notes"]').fill("Aula de hoje");
      await nav(page, "treinos");
      await nav(page, "hoje/" + TODAY);
      await expect(page.locator('#cross-form [name="minutes"]')).toHaveValue(
        "45",
      );
      await page.locator('#cross-form [type="submit"]').click();
      await expect
        .poll(() => cloud.data.sessions[TODAY]?.workouts[0].cross?.minutes)
        .toBe(45);
      const completed = cloud.data.sessions[TODAY].workouts[0].completedAt;
      await page.locator('#cross-form [name="notes"]').fill("Aula editada");
      await page.locator('#cross-form [type="submit"]').click();
      await expect
        .poll(() => cloud.data.sessions[TODAY]?.workouts[0].cross?.notes)
        .toBe("Aula editada");
      expect(cloud.data.sessions[TODAY].workouts[0].completedAt).toBe(
        completed,
      );
      await nav(page, "hoje/2026-11-07");
      await expect(page.locator(".hero h2")).toContainText("Sábado opcional");
      await expect(page.locator(".progress-ring b")).toHaveText("1/5");
      await page.locator('.hero [data-action="choose-optional"]').click();
      await choose(
        page.locator('#optional-workout-form [name="type"]'),
        "cross",
      );
      await page.locator('#optional-workout-form [type="submit"]').click();
      await expect(page.locator("#guide-dialog")).not.toBeVisible();
      await page.locator('#cross-form [name="minutes"]').fill("40");
      await choose(page.locator('#cross-form [name="rpe"]'), "6");
      await page.locator('#cross-form [type="submit"]').click();
      await expect
        .poll(() => cloud.data.sessions["2026-11-07"]?.workouts[0].done)
        .toBe(true);
      await expect(page.locator(".progress-ring b")).toHaveText("1/5");
      await expect(page.locator("[data-summary-details]")).toContainText(
        "1 bônus concluído",
      );
      await page.reload();
      await expect(page.locator('#cross-form [name="minutes"]')).toHaveValue(
        "40",
      );
      await nav(page, "historico");
      await expect(page.locator(".history-entry")).toHaveCount(2);
      await expect(
        page.locator(".history-note").filter({ hasText: "Aula editada" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      await page.screenshot({
        path: "test-results/cross-plans-" + width + ".png",
        fullPage: true,
      });
    },
  );
test("schedule, change date, cancel and activate automatically without altering saved days", async ({
  page,
}) => {
  const d = defaults();
  materializeDay(d, "2026-11-12");
  d.sessions["2026-11-13"] = { workouts: [] };
  const saved = structuredClone(d.sessions);
  const cloud = await open(page, 390, d);
  await page.locator('a.plan-card[href="#treinos/hibrido-cross"]').click();
  await page.getByRole("button", { name: "Ativar plano", exact: true }).click();
  await page.locator('#activate-plan-form [value="date"]').check();
  await enterDate(
    page.locator('#activate-plan-form [name="from"]'),
    "2026-11-09",
  );
  await page.locator('#activate-plan-form [type="submit"]').click();
  await expect(page.locator("#guide-dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Alterar data", exact: true }),
  ).toBeVisible();
  await nav(page, "treinos");
  await expect(
    page.locator(".plan-card").filter({ hasText: "força e corrida" }),
  ).toContainText("Ativo");
  await expect(
    page.locator(".plan-card").filter({ hasText: "Cross" }),
  ).toContainText("09/11/2026");
  await page.locator('a.plan-card[href="#treinos/hibrido-cross"]').click();
  await page.getByRole("button", { name: "Alterar data", exact: true }).click();
  await enterDate(
    page.locator('#activate-plan-form [name="from"]'),
    "2026-11-16",
  );
  await page.locator('#activate-plan-form [type="submit"]').click();
  await expect(page.locator("#guide-dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Cancelar agendamento", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar cancelamento", exact: true })
    .click();
  await expect(page.locator("#guide-dialog")).not.toBeVisible();
  await expect.poll(() => cloud.data.settings.planHistory.length).toBe(1);
  await page.getByRole("button", { name: "Ativar plano", exact: true }).click();
  await page.locator('#activate-plan-form [value="date"]').check();
  await enterDate(
    page.locator('#activate-plan-form [name="from"]'),
    "2026-11-09",
  );
  await page.locator('#activate-plan-form [type="submit"]').click();
  await expect(page.locator("#guide-dialog")).not.toBeVisible();
  await page.clock.setFixedTime(new Date("2026-11-09T15:00:00-03:00"));
  await nav(page, "treinos");
  await expect(
    page.locator(".plan-card").filter({ hasText: "Cross" }),
  ).toContainText("Ativo");
  expect(cloud.data.sessions).toEqual(saved);
  await nav(page, "hoje/2026-11-13");
  await expect(page.locator(".hero h2")).toContainText("descanso");
});
test("switch blocks affected running draft and Saturday choices can change or clear before starting", async ({
  page,
}) => {
  const d = defaults();
  Object.assign(d.settings, { easyPace: "6:00", hardPace: "5:00" });
  await open(page, 390, d, "hoje/" + TODAY);
  await page.locator('#run-form [name="minutes"]').fill("30");
  await nav(page, "treinos");
  await page.locator('a.plan-card[href="#treinos/hibrido-cross"]').click();
  await page.getByRole("button", { name: "Ativar plano", exact: true }).click();
  await page.locator('#activate-plan-form [type="submit"]').click();
  await expect(page.locator("[data-plan-error]")).toContainText(
    "Salve os rascunhos",
  );
  await page.locator('[aria-label="Fechar ativação de plano"]').click();
  await nav(page, "hoje/" + TODAY);
  await page.locator('#run-form [name="km"]').fill("5");
  await choose(page.locator('#run-form [name="rpe"]'), "4");
  await page.locator('#run-form [type="submit"]').click();
  await expect(page.locator("[data-run-draft-warning]")).toBeHidden();
  await nav(page, "treinos");
  await activate(page);
  await nav(page, "hoje/2026-11-07");
  for (const value of ["long", "upper2", "rest"]) {
    await page.locator('.day-workouts [data-action="choose-optional"]').click();
    await choose(page.locator('#optional-workout-form [name="type"]'), value);
    await page.locator('#optional-workout-form [type="submit"]').click();
    await expect(page.locator("#guide-dialog")).not.toBeVisible();
  }
  await expect(page.locator(".day-workout")).toHaveCount(0);
  await expect(page.locator(".hero h2")).toContainText("Sábado opcional");
});

test("failed plan activation keeps its pending operation and confirms only after cloud recovery", async ({
  page,
}) => {
  const cloud = await open(page);
  await page.locator('a.plan-card[href="#treinos/hibrido-cross"]').click();
  await page.getByRole("button", { name: "Ativar plano", exact: true }).click();
  cloud.fail = true;
  await page.locator('#activate-plan-form [type="submit"]').click();
  await expect(page.locator("[data-plan-error]")).toContainText(
    "pendente de sincronização",
  );
  await expect(page.locator("#guide-dialog")).toBeVisible();
  expect(cloud.data.settings.planHistory).toHaveLength(1);
  await expect(page.locator("#toast")).not.toHaveText("Planejamento salvo.");
  cloud.fail = false;
  await page.locator('#activate-plan-form [type="submit"]').click();
  await expect(page.locator("#guide-dialog")).not.toBeVisible();
  await expect
    .poll(() => cloud.data.settings.planHistory.at(-1).planId)
    .toBe(CROSS_PLAN_ID);
  await expect(page.locator("#toast")).toHaveText("Planejamento salvo.");
});
