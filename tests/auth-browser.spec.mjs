import { test, expect } from "@playwright/test";
import { mockCloud } from "./helpers/cloud-api-fixture.mjs";
import {
  openExerciseCard,
  CARD_DATE,
  CARD_ID,
} from "./helpers/exercise-card-fixture.mjs";
test("private diary is not mounted before Google authentication", async ({
  page,
}) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: 401,
      json: { code: "AUTH_REQUIRED", message: "Entre novamente." },
    }),
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      "treino-hibrido:v1",
      JSON.stringify({ secret: "PRIVATE LEGACY NOTE" }),
    ),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Entrar com Google" }),
  ).toBeVisible();
  await expect(page.locator(".shell")).not.toBeVisible();
  await expect(page.locator("#main")).toBeEmpty();
  await expect(page.locator("body")).not.toContainText("PRIVATE LEGACY NOTE");
});
test("writes go to the server, fallback survives a reload, and recovers without input replacement", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const card = await openExerciseCard(page),
    cloud = page.cloudFixture;
  const kg = card.locator('[data-field="kg"]').first();
  const handle = await kg.elementHandle();
  await kg.fill("15.5");
  await kg.blur();
  await expect(page.locator(".topbar [data-sync-status]")).toHaveText(
    "Salvo na nuvem",
  );
  expect(cloud.data.sessions[CARD_DATE].sets[CARD_ID][0].kg).toBe(15.5);
  cloud.fail = true;
  await kg.fill("16");
  await kg.blur();
  await expect(page.locator(".topbar [data-sync-status]")).toContainText(
    "sincronização pendente",
  );
  expect(await kg.evaluate((el, old) => el === old, handle)).toBe(true);
  cloud.fail = false;
  await page.reload();
  const reopened = page.locator(`[data-exercise="${CARD_ID}"]`);
  await reopened.locator(":scope > summary").click();
  await expect(reopened.locator('[data-field="kg"]').first()).toHaveValue("16");
  await expect(page.locator(".topbar [data-sync-status]")).toHaveText(
    "Salvo na nuvem",
  );
  expect(cloud.data.sessions[CARD_DATE].sets[CARD_ID][0].kg).toBe(16);
});
test("revoked session blocks editing and removes rendered private data", async ({
  page,
}) => {
  await openExerciseCard(page);
  page.cloudFixture.revoked = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("#account-gate")).toBeVisible();
  await expect(page.locator("#main")).toBeEmpty();
  await expect(page.locator("#account-message")).toContainText(
    "sessão terminou",
  );
});
test("logout revokes session and gate returns; private source files cannot be downloaded", async ({
  page,
  request,
}) => {
  await mockCloud(page);
  await page.goto("/");
  await expect(page.locator(".shell")).toBeVisible();
  for (const path of [
    "/server/config.js",
    "/db/migrations/001_auth_diary.sql",
    "/.env.local",
    "/package.json",
  ]) {
    expect((await request.get(path)).status()).toBeGreaterThanOrEqual(400);
  }
  await page.locator(".account-menu > summary").click();
  let signedOut = false;
  await page.route("**/api/auth/sign-out", async (route) => {
    signedOut = true;
    await route.fulfill({ json: { success: true } });
  });
  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: signedOut ? 401 : 200,
      json: signedOut
        ? { code: "AUTH_REQUIRED" }
        : {
            user: {
              id: "fixture-user",
              name: "Teste",
              email: "teste@example.test",
            },
            sessionId: "fixture-session",
            generation: "test-generation",
          },
    }),
  );
  await page
    .getByRole("button", { name: "Sair da conta", exact: true })
    .click();
  await expect(page.locator("#account-gate")).toBeVisible();
  expect(signedOut).toBe(true);
});

test("settings drafts stay local until Save and survive typing during the request", async ({
  page,
}) => {
  const cloud = await mockCloud(page);
  await page.goto("/#configuracoes/progressao");
  const input = page.locator("#setting-loadProgression");
  await expect(input).toBeVisible();
  await input.fill("7");
  expect(cloud.writes).toBe(0);
  let release;
  const wait = new Promise((resolve) => (release = resolve));
  await page.route("**/api/settings", async (route) => {
    await wait;
    const body = route.request().postDataJSON();
    cloud.data.settings = body.value;
    await route.fulfill({ json: { generation: "test-generation" } });
  });
  await page
    .locator('[data-settings-form="progressao"] button[type="submit"]')
    .click();
  await input.fill("8");
  release();
  await expect(page.locator(".topbar [data-sync-status]")).toHaveText(
    "Salvo na nuvem",
  );
  await expect(input).toHaveValue("8");
  await expect(
    page.locator('[data-settings-form="progressao"] [data-settings-status]'),
  ).toHaveText("Alterações pendentes");
  expect(cloud.data.settings.loadProgression).toBe(7);
});
