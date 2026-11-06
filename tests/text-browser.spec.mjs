import { choose, enterDate } from "./helpers/field-controls-fixture.mjs";
import { test, expect } from "@playwright/test";
import { defaults } from "../lib/core.js";
import { getRunPlan } from "../lib/progression.js";
import { exercises } from "../lib/exercises.js";
import { mockCloud } from "./helpers/cloud-api-fixture.mjs";
import { openExerciseCard } from "./helpers/exercise-card-fixture.mjs";

async function openApp(page, data = defaults(), hash = "hoje") {
  await page.clock.setFixedTime(new Date("2026-10-28T15:00:00-03:00"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const cloud = await mockCloud(page, data);
  await page.goto(`/#${hash}`);
  await expect(page.locator("#main h1")).toBeVisible();
  return cloud;
}

async function navigate(page, hash) {
  await page.evaluate((value) => {
    location.hash = value;
  }, hash);
  await expect(page).toHaveURL(
    hash === "hoje" || hash === "semana"
      ? /#hoje(?:\/.*)?$/
      : new RegExp(`#${hash}$`),
  );
  const title = hash.startsWith("configuracoes/")
    ? {
        corrida: "Corrida",
        progressao: "Progressão",
        semana: "Semana",
        dados: "Dados",
      }[hash.split("/")[1]] + " · Configurações"
    : {
        hoje: "Hoje",
        semana: "Hoje",
        treinos: "Treinos",
        historico: "Histórico",
      }[hash] || "Treino Híbrido";
  await expect(page).toHaveTitle(`${title} · HÍBRIDO`);
}

async function selectRun(page, date) {
  await page.locator(`[data-action="day"][data-date="${date}"]`).click();
  await expect(page.locator(".run-form")).toBeVisible();
}

function configured() {
  const data = defaults();
  data.settings.easyPace = "6:00";
  data.settings.hardPace = "5:00";
  return data;
}

test("sync success stays accessible without taking space; failures persist until recovery", async ({
  page,
}) => {
  const card = await openExerciseCard(page),
    cloud = page.cloudFixture;
  const status = page.locator("[data-sync-status]");
  await expect(status).toHaveCount(1);
  await expect(status).toHaveText("Salvo na nuvem");
  await expect(status).toHaveClass(/sr-only/);
  expect((await status.boundingBox()).width).toBe(1);
  expect((await status.boundingBox()).height).toBe(1);
  await expect(status).toHaveAttribute("role", "status");
  await page.evaluate(async () => {
    window.syncTextChanges = 0;
    new MutationObserver(() => window.syncTextChanges++).observe(
      document.querySelector("[data-sync-status]"),
      { childList: true, characterData: true, subtree: true },
    );
    const { account } = await import("/lib/account.js");
    await account.remote.check();
  });
  await expect.poll(() => page.evaluate(() => window.syncTextChanges)).toBe(0);
  cloud.fail = true;
  await card.locator('[data-field="kg"]').first().fill("15");
  await expect(status).toHaveAttribute("data-state", "local");
  await expect(status).not.toHaveClass(/sr-only/);
  await expect(status).toContainText("sincronização pendente");
  await expect(
    page.locator(".side-bottom, .session-bottom [data-sync-status]"),
  ).toHaveCount(0);
  cloud.fail = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(status).toHaveAttribute("data-state", "cloud");
  await expect(status).toHaveClass(/sr-only/);
});

test("draft warning follows all categories and manual cloud save confirms once for four seconds", async ({
  page,
}) => {
  await openApp(page, defaults(), "configuracoes/progressao");
  const warning = page.locator("[data-settings-draft-warning]");
  const panel = page.locator("#settings-panel-progressao");
  await expect(warning).toBeHidden();
  await expect(panel.locator(".settings-save-status")).toHaveClass(/sr-only/);
  await page.locator("#setting-loadProgression").fill("6");
  await expect(warning).toBeVisible();
  await page.getByRole("tab", { name: "Dados", exact: true }).click();
  await expect(warning).toBeVisible();
  await expect(page.locator("#settings-panel-dados form")).toHaveCount(0);
  await navigate(page, "hoje");
  await navigate(page, "configuracoes/dados");
  await expect(warning).toBeVisible();
  await page.getByRole("tab", { name: /Progressão/ }).click();
  await page.clock.install({ time: new Date("2026-10-28T18:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-28T18:00:01Z"));
  await panel.getByRole("button", { name: "Salvar alterações" }).click();
  const toast = page.locator("#toast");
  await expect(toast).toHaveText("Alterações salvas.");
  await expect(toast).toHaveClass("visible");
  await expect(warning).toBeHidden();
  await expect(panel.locator(".settings-save-status")).toHaveClass(/sr-only/);
  await expect(panel.locator("[data-settings-status]")).toHaveText(
    "Sem alterações pendentes",
  );
  await page.clock.fastForward(3999);
  await expect(toast).toHaveClass("visible");
  await page.clock.fastForward(1);
  await expect(toast).not.toHaveClass("visible");
});

test("local settings save uses persistent sync warning without cloud success toast", async ({
  page,
}) => {
  const cloud = await openApp(page, defaults(), "configuracoes/progressao");
  cloud.fail = true;
  await page.locator("#setting-loadProgression").fill("6");
  await page.locator("#settings-panel-progressao [type=submit]").click();
  await expect(page.locator("[data-sync-status]")).toHaveAttribute(
    "data-state",
    "local",
  );
  await expect(page.locator("[data-sync-status]")).not.toHaveClass(/sr-only/);
  await expect(page.locator("#toast")).not.toHaveClass("visible");
  await expect(
    page.locator("#settings-panel-progressao [type=submit]"),
  ).toBeDisabled();
  await expect(page.locator("[data-settings-draft-warning]")).toBeHidden();
});

for (const date of ["2026-10-27", "2026-10-29", "2026-10-31"])
  test(`missing paces have one contextual notice and no invented reference on ${date}`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openApp(page);
    await selectRun(page, date);
    await expect(page.locator(".setup-banner")).toHaveCount(0);
    await expect(page.locator("#session .notice")).toHaveCount(1);
    await expect(page.locator("#session .notice")).toContainText(
      "Configure seus paces para estimar a distância.",
    );
    await expect(page.locator(".block-pace").first()).toHaveText(
      "Pace não informado",
    );
    await expect(page.locator(".run-details")).not.toHaveAttribute("open", "");
    await expect(page.locator("#session")).not.toContainText(
      "Usamos seu ritmo configurado",
    );
    await expect(page.locator("#session")).not.toContainText(
      "sem estimativa para caminhada.",
    );
    if (date === "2026-10-31") {
      await expect(page.locator("#long-distance-range")).toHaveCount(0);
      await page.locator("#long-minutes").evaluate((el) => {
        el.value = "75";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await expect(page.locator("#long-minutes")).toHaveValue("75");
      await expect(page.locator(".run-overview strong").first()).toContainText(
        "75",
      );
    }
    expect(errors).toEqual([]);
  });

test("pace explanation distinguishes base, history and saved planning", async ({
  page,
}) => {
  const data = configured();
  data.sessions["2026-10-22"] = {
    type: "easy",
    done: true,
    sets: {},
    run: { minutes: 30, km: 5, rpe: 6, notes: "", paceRevision: 0 },
  };
  await openApp(page, data);
  await selectRun(page, "2026-10-27");
  await page.locator(".run-details > summary").click();
  await expect(page.locator("[data-plan-caption]")).toHaveCount(0);

  await expect(page.locator("#session")).toContainText(
    "sem estimativa para caminhada.",
  );
  await selectRun(page, "2026-10-29");
  await page.locator(".run-details > summary").click();
  await expect(page.locator(".block-pace").first()).toContainText("6:18");
  await expect(page.locator("[data-plan-caption]")).toContainText(
    "referência 22/10/2026",
  );
  await expect(page.locator("#session")).not.toContainText(
    "sem estimativa para caminhada.",
  );
  await page.locator('[name="minutes"]').fill("30");
  await page.locator('[name="km"]').fill("5");
  await choose(page.locator('[name="rpe"]'), "4");
  await page.locator("#run-form [type=submit]").click();
  await expect(page.locator(".pace-advice .eyebrow")).toHaveText(
    "Plano registrado",
  );
  await page.reload();
  await selectRun(page, "2026-10-29");
  await expect(page.locator(".pace-advice .eyebrow")).toHaveText(
    "Plano registrado",
  );
});

test("pace conflict keeps recalibration warning without duplicate setup notice", async ({
  page,
}) => {
  const data = configured();
  data.settings.hardPace = "5:50";
  data.sessions["2026-10-20"] = {
    type: "interval",
    done: true,
    sets: {},
    run: {
      minutes: 40,
      km: 6,
      rpe: 8,
      hardPace: 355,
      hardRpe: 10,
      notes: "",
      paceRevision: 0,
    },
  };
  await openApp(page, data);
  await selectRun(page, "2026-10-27");
  await expect(
    page
      .locator(".block-pace")
      .filter({ hasText: "Pace não informado" })
      .first(),
  ).toBeVisible();
  await expect(page.locator(".pace-advice .form-error")).toContainText(
    "precisa ser mais rápido que a recuperação",
  );
  await expect(page.locator("#session .notice")).toHaveCount(0);
  await expect(page.locator("[data-plan-caption]")).toContainText(
    "referência 20/10/2026",
  );
});

test("saving long run without a pace creates saved help and preserves the selected duration", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openApp(page);
  await selectRun(page, "2026-10-31");
  await page.locator('[name="minutes"]').fill("60");
  await page.locator('[name="km"]').fill("8");
  await choose(page.locator('[name="rpe"]'), "4");
  await page.locator("#run-form [type=submit]").click();
  await expect(page.locator("#long-minutes")).toBeDisabled();
  await expect(page.locator(".pace-advice .eyebrow")).toHaveText(
    "Plano registrado",
  );
  await expect(page.locator("[data-long-caption]")).toHaveText(
    "Duração preservada no planejamento registrado.",
  );
  expect(errors).toEqual([]);
});

test("saved planning and legacy simulation remain distinct; partial totals require a missing stage", async ({
  page,
}) => {
  const data = configured();
  data.settings.walkPace = "12:00";
  data.sessions["2026-10-29"] = {
    type: "easy",
    done: true,
    sets: {},
    run: { minutes: 30, km: 5, rpe: 4, notes: "", paceRevision: 0 },
  };
  data.sessions["2026-10-31"] = {
    type: "long",
    done: true,
    sets: {},
    run: {
      minutes: 60,
      km: 10,
      rpe: 4,
      notes: "",
      paceRevision: 0,
      plan: getRunPlan("long", data.settings, data.sessions, "2026-10-31")
        .snapshot,
    },
  };
  await openApp(page, data);
  await selectRun(page, "2026-10-27");
  await expect(page.locator("#session")).not.toContainText(
    "Distância parcial:",
  );
  await selectRun(page, "2026-10-29");
  await expect(page.locator("#session")).toContainText(
    "O plano abaixo é uma simulação",
  );
  await selectRun(page, "2026-10-31");
  await expect(page.locator("#session")).not.toContainText(
    "O plano abaixo é uma simulação",
  );
  await expect(page.locator("#long-minutes")).toBeDisabled();
  await expect(page.locator(".run-distance")).toContainText("10,00 km");
});

for (const width of [320, 390, 768, 1440])
  test(`contextual load labels and all main screens fit at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1100 });
    await openApp(page, configured());
    for (const id of ["single-rdl", "bulgarian", "leg-curl", "leg-extension"]) {
      const card = page.locator(`[data-exercise="${id}"]`);
      await card.locator(":scope > summary").click();
      await expect(
        card.locator('[data-field="kg"]').first(),
      ).toHaveAccessibleName(
        `Carga por lado (kg) da série 1 de ${exercises[id].name}`,
      );
      await expect(card.locator(".exercise-side-note")).toHaveCount(0);
      await expect(
        card.getByRole("checkbox", { name: "Sem peso adicional", exact: true }),
      ).toHaveAccessibleDescription(/três séries.*cargas digitadas/);
      const labels =
        width <= 600
          ? card.locator(".load-label")
          : card.locator(".set-header > span").nth(1);
      await expect(labels.first()).toHaveText("Carga por lado (kg)");
      await expect(labels.first()).toBeVisible();
    }
    for (const route of [
      "hoje",
      "semana",
      "treinos",
      "treinos/hibrido-3x3",
      "historico",
      "configuracoes/corrida",
      "configuracoes/progressao",
      "configuracoes/semana",
      "configuracoes/dados",
    ]) {
      await navigate(page, route);
      await expect(page.locator("#main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });

test("catalogue guidance covers unilateral days; all guides retain execution and accessible external links", async ({
  page,
}) => {
  const references = page.waitForResponse((response) =>
    response.url().includes("assets/references.json"),
  );
  await openApp(page, defaults(), "treinos/hibrido-3x3");
  await (await references).finished();
  for (const day of [1, 3, 5]) {
    const item = page.locator(`[data-plan-day="${day}"]`);
    if ((await item.getAttribute("open")) === null)
      await item.locator(":scope > summary").click();
    if (day === 3 || day === 5)
      await expect(item).toContainText("Complete os dois lados.");
    else await expect(item).not.toContainText("Complete os dois lados.");
    await expect(item.locator(".plan-exercises")).not.toContainText("3 × 6–8");
  }
  for (const id of Object.keys(exercises)) {
    await page.locator(`[data-action="guide"][data-id="${id}"]`).click();
    const dialog = page.locator("#guide-dialog");
    await expect(dialog.locator(".guide-sections h3")).toHaveCount(4);
    await expect(
      dialog.getByRole("link", { name: /abre em nova aba/ }),
    ).toHaveCount(2);
    await expect(dialog).not.toContainText("Ilustração didática.");
    await expect(dialog).not.toContainText("O vídeo abre em outra página.");
    if (id === "reverse-crunch")
      await expect(dialog).toContainText(
        "A demonstração de referência usa o chão.",
      );
    await dialog.locator(".close-button").click();
  }
});

test("backup preview retains replacement warning without promising browser-only restoration", async ({
  page,
}) => {
  await openApp(page, defaults(), "configuracoes/dados");
  await page.locator('[data-action="import"]').click();
  await page.locator("#import-file").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(defaults())),
  });
  await expect(page.locator("#import-summary")).toBeVisible();
  await expect(page.locator("#import-summary")).toContainText(
    "Configurações incluídas.",
  );
  await expect(page.locator("#guide-dialog")).not.toContainText(
    "Nenhum dado será enviado",
  );
  await expect(page.locator(".import-warning")).toContainText(
    "sua conta na nuvem",
  );
  await page.locator("#import-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(page.locator("#import-error")).toContainText(
    "Seu diário foi preservado.",
  );
  await expect(page.locator('[data-action="restore-backup"]')).toBeDisabled();
});
