import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { defaults, materializeDay } from "../lib/core.js";
import { getRunPlan } from "../lib/progression.js";
import { mockCloud } from "./helpers/cloud-api-fixture.mjs";
import { choose } from "./helpers/field-controls-fixture.mjs";

const DATE = "2026-11-03";
async function open(page, data, hash, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.clock.setFixedTime(new Date("2026-11-05T15:00:00-03:00"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const cloud = await mockCloud(page, data);
  await page.goto(`/#${hash}`);
  await expect(page.locator("#main h1")).toBeVisible();
  return cloud;
}
const configured = () => {
  const data = defaults();
  Object.assign(data.settings, {
    easyPace: "6:00",
    hardPace: "5:00",
    walkPace: "12:00",
    heartRate: { birthMonth: "1996-11", sex: "male" },
  });
  return data;
};
const navigate = (page, hash) =>
  page.evaluate((value) => {
    location.hash = value;
  }, hash);

test("nascimento MM/AAAA e sexo estimam ambas as fórmulas, salvam sem pace e sobrevivem à recarga", async ({
  page,
}) => {
  const cloud = await open(page, defaults(), "configuracoes/corrida");
  const panel = page.locator("#settings-panel-corrida");
  const birth = page.getByLabel("Nascimento (mês/ano)");
  await birth.fill("111996");
  await expect(birth).toHaveValue("11/1996");
  await choose(page.locator('[name="heartRateSex"]'), "male");
  await expect(page.locator("[data-heart-rate-preview]")).toContainText(
    "190 bpm · 30 anos · masculino (220 − idade)",
  );
  await choose(page.locator('[name="heartRateSex"]'), "female");
  await expect(page.locator("[data-heart-rate-preview]")).toContainText(
    "196 bpm · 30 anos · feminino (226 − idade)",
  );
  await panel.getByRole("button", { name: "Salvar alterações" }).click();
  await expect
    .poll(() => cloud.data.settings.heartRate)
    .toEqual({ birthMonth: "1996-11", sex: "female" });
  await page.reload();
  await expect(birth).toHaveValue("11/1996");
  await expect(page.locator("[data-heart-rate-preview]")).toContainText(
    "196 bpm",
  );
  await expect(panel.getByRole("textbox", { name: /FC máxima/ })).toHaveCount(
    0,
  );
  await birth.fill("13/1996");
  await panel.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(birth).toHaveAttribute("aria-invalid", "true");
  await expect(birth).toBeFocused();
  await expect(page.locator("#error-heartRateBirthMonth")).toBeVisible();
  expect(cloud.data.settings.heartRate.birthMonth).toBe("1996-11");
});

for (const width of [320, 1440]) {
  test(`etapas e resumo exibem FC estimada, teclado e catálogo compartilham metas em ${width}px`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await open(page, configured(), `hoje/${DATE}`, width);
    const session = page.locator("#session");
    const repeats = session.locator(".interval-repeats");
    await expect(repeats).not.toHaveAttribute("open", "");
    await expect(repeats.locator("summary")).toContainText(
      "Forte · FC de referência: 152–171 bpm · Z4",
    );
    await expect(repeats.locator("summary")).toContainText(
      "Recuperação · FC de referência: 95–133 bpm · Z1–Z2",
    );
    await repeats.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(repeats).toHaveAttribute("open", "");
    await expect(session.locator("[data-run-block]")).toHaveCount(18);
    await expect(session.locator("[data-run-block='1']")).toContainText(
      "estimada",
    );
    await expect(session.locator("[data-run-block='2']")).toContainText(
      "FC pode continuar alta",
    );
    await session.locator(".heart-rate-guide summary").click();
    await expect(session.locator(".heart-rate-guide")).toContainText(
      "não precisa chegar à faixa antes do próximo bloco",
    );
    await mkdir("test-results/heart-rate", { recursive: true });
    await page.screenshot({
      path: `test-results/heart-rate/interval-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await navigate(page, "treinos/hibrido-3x3");
    const day = page.locator('[data-plan-day="2"]');
    await day.locator(":scope > summary").click();
    await expect(day.locator(".interval-repeats > summary")).toContainText(
      "152–171 bpm",
    );
    await expect(day.locator(".heart-rate-reference")).toContainText(
      "FC máxima estimada: 190 bpm",
    );
    await page.screenshot({
      path: `test-results/heart-rate/catalog-${width}.png`,
      fullPage: true,
    });
    await navigate(page, "configuracoes/corrida");
    await expect(page.getByLabel("Nascimento (mês/ano)")).toHaveValue(
      "11/1996",
    );
    await page.screenshot({
      path: `test-results/heart-rate/settings-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("salvar corrida preserva a estimativa após editar sexo e ao recarregar", async ({
  page,
}) => {
  const cloud = await open(page, configured(), `hoje/${DATE}`);
  await page.locator('[name="minutes"]').fill("40");
  await page.locator('[name="km"]').fill("6");
  await choose(page.locator('[name="rpe"]'), "8");
  await page.locator("#run-form [type=submit]").click();
  await expect
    .poll(
      () => cloud.data.sessions[DATE]?.workouts[0].run?.plan?.heartRate.maxBpm,
    )
    .toBe(190);
  await navigate(page, "configuracoes/corrida");
  await choose(page.locator('[name="heartRateSex"]'), "female");
  await page.locator("#settings-panel-corrida [type=submit]").click();
  await expect.poll(() => cloud.data.settings.heartRate.sex).toBe("female");
  await navigate(page, `hoje/${DATE}`);
  await expect(page.locator("#session .heart-rate-reference")).toContainText(
    "190 bpm",
  );
  await page.reload();
  await expect(page.locator("#session .heart-rate-reference")).toContainText(
    "190 bpm",
  );
  await navigate(page, "hoje/2026-11-05");
  await expect(page.locator("#session .heart-rate-reference")).toContainText(
    "196 bpm",
  );
});

test("sem configuração ou referência histórica mostra somente zonas sem inventar bpm", async ({
  page,
}) => {
  const data = configured();
  const item = materializeDay(data, DATE).workouts[0];
  const snapshot = getRunPlan(
    "interval",
    data.settings,
    data.sessions,
    DATE,
    item.id,
  ).snapshot;
  delete snapshot.heartRate;
  item.run = { minutes: 40, km: 6, rpe: 8, notes: "", plan: snapshot };
  await open(page, data, `hoje/${DATE}`);
  await expect(page.locator("#session .heart-rate-reference")).toContainText(
    "Orientação geral",
  );
  await expect(page.locator("#session .run-blocks")).not.toContainText("bpm");
  await expect(page.locator("#session .run-blocks")).toContainText("80–90%");
});
