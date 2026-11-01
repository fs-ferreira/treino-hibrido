import { test, expect } from "@playwright/test";
import { mockCloud } from "./helpers/cloud-api-fixture.mjs";
import { defaults } from "../lib/core.js";
import {
  openExerciseCard,
  CARD_DATE,
  CARD_ID,
} from "./helpers/exercise-card-fixture.mjs";

const accessError = "Não foi possível acessar. Tente novamente.",
  technicalMessage =
    "PRIVATE_BACKEND_DETAIL postgres://internal.test:5432/diary /api/auth STACK_TRACE";

async function mockSignedOut(page) {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: 401,
      json: { code: "AUTH_REQUIRED", message: technicalMessage },
    }),
  );
}

async function openRecovery(page, generation = "test-generation") {
  await mockSignedOut(page);
  await page.goto("/");
  await expect(page.locator("#google-login")).toBeEnabled();
  const snapshot = defaults();
  snapshot.settings.loadProgression = 7;
  await page.evaluate(
    async ({ snapshot, generation }) => {
      const { createJournal } = await import("/lib/remote-diary.js");
      await createJournal().put("fixture-user", {
        sessionId: "previous-session",
        generation,
        snapshot,
        operations: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            path: "/settings",
            value: snapshot.settings,
            sending: false,
          },
        ],
        blocked: false,
      });
    },
    { snapshot, generation },
  );
  const cloud = await mockCloud(page);
  await page.reload();
  await expect(page.locator("#account-recovery")).toBeVisible();
  return cloud;
}

test("private diary is not mounted before Google authentication", async ({
  page,
}) => {
  await mockSignedOut(page);
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
  await expect(page.locator("#google-login")).toBeEnabled();
  await expect(page.locator("#toast")).not.toHaveClass(/visible/);
  await expect(page.locator("#account-gate")).not.toContainText(
    technicalMessage,
  );
  await expect(page.locator("#account-message")).toHaveText(
    "Entre para acompanhar seus treinos.",
  );
});

test("initial check is discreet and respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release;
  const wait = new Promise((resolve) => (release = resolve));
  await page.route("**/api/me", async (route) => {
    await wait;
    await route.fulfill({ status: 401, json: { code: "AUTH_REQUIRED" } });
  });
  await page.goto("/");
  await expect(page.locator("#google-login")).toBeDisabled();
  await expect(page.locator("#google-login")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(page.locator(".login-spinner")).toBeVisible();
  await expect(page.locator(".login-spinner")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator("#account-progress")).toHaveText(
    "Preparando seu acesso…",
  );
  expect(await page.locator("body").innerText()).not.toMatch(
    /conectando|servidor|api/i,
  );
  release();
  await expect(page.locator("#google-login")).toBeEnabled();
  await expect(page.locator(".login-spinner")).toBeHidden();
});

for (const failure of ["server", "invalid-json", "network"]) {
  test(`initial ${failure} failure shows only a generic toast and can retry`, async ({
    page,
  }) => {
    await page.route("**/api/me", (route) => {
      if (failure === "network") return route.abort("failed");
      if (failure === "invalid-json")
        return route.fulfill({ status: 200, body: technicalMessage });
      return route.fulfill({
        status: 503,
        json: { code: "PRIVATE_ERROR", message: technicalMessage },
      });
    });
    await page.goto("/");
    await expect(page.locator("#toast.visible")).toHaveText(accessError);
    await expect(page.locator("#google-login")).toBeEnabled();
    await expect(page.locator("#main")).toBeEmpty();
    expect(await page.locator("body").innerText()).not.toContain(
      technicalMessage,
    );
    await mockCloud(page);
    await page
      .getByRole("button", { name: "Tentar novamente", exact: true })
      .click();
    await expect(page.locator(".shell")).toBeVisible();
    await expect(page.locator("#account-gate")).toBeHidden();
    await expect(page.locator("#toast")).not.toHaveClass(/visible/);
  });
}

for (const [scenario, response] of [
  ["server error", { status: 503, json: { message: technicalMessage } }],
  ["invalid JSON", { status: 200, body: technicalMessage }],
  [
    "untrusted destination",
    { json: { url: "https://internal.test/callback" } },
  ],
  [
    "insecure destination",
    { json: { url: "http://accounts.google.com/o/oauth2/auth" } },
  ],
  ["malformed destination", { json: { url: "INVALID_URL" } }],
  ["missing destination", { json: {} }],
]) {
  test(`Google login handles ${scenario} without exposing details`, async ({
    page,
  }) => {
    await mockSignedOut(page);
    await page.route("**/api/auth/sign-in/social", (route) =>
      route.fulfill(response),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar com Google" }).click();
    await expect(page.locator("#toast.visible")).toHaveText(accessError);
    await expect(page.locator("#google-login")).toBeEnabled();
    await expect(page.locator("#google-login")).toBeFocused();
    await expect(page.locator("#account-gate")).toHaveAttribute(
      "data-state",
      "idle",
    );
    expect(await page.locator("body").innerText()).not.toContain(
      technicalMessage,
    );
    await expect(page).toHaveURL("/");
  });
}

test("Google login sends once, stays busy and follows only the Google destination", async ({
  page,
}) => {
  await mockSignedOut(page);
  const destination = "https://accounts.google.com/o/oauth2/auth?fixture=1";
  await page.route("https://accounts.google.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Google fixture</h1>",
    }),
  );
  let release,
    requests = 0;
  const wait = new Promise((resolve) => (release = resolve));
  await page.route("**/api/auth/sign-in/social", async (route) => {
    requests++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ provider: "google" });
    await wait;
    await route.fulfill({ json: { url: destination } });
  });
  await page.goto("/");
  const button = page.locator("#google-login");
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toHaveText("Entrando…");
  await expect(button).toHaveAttribute("aria-busy", "true");
  await button.evaluate((el) => {
    el.click();
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await expect.poll(() => requests).toBe(1);
  release();
  await expect(page).toHaveURL(destination);
  expect(requests).toBe(1);
});

test("OAuth return clears its error parameter and the generic toast dismisses after four seconds", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-01T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-01T12:01:00Z"));
  await mockSignedOut(page);
  await page.goto("/?authError=PRIVATE_ERROR&source=login#hoje");
  await expect(page).toHaveURL("/?source=login#hoje");
  await expect(page.locator("#toast.visible")).toHaveText(accessError);
  await expect(page.locator("#google-login")).toBeEnabled();
  await page.clock.fastForward(3999);
  await expect(page.locator("#toast")).toHaveClass(/visible/);
  await page.clock.fastForward(1);
  await expect(page.locator("#toast")).not.toHaveClass(/visible/);
});

test("local recovery keeps changes on failure and supports export before resuming", async ({
  page,
}) => {
  const cloud = await openRecovery(page);
  expect(cloud.writes).toBe(0);
  await expect(page.locator("#main")).toBeEmpty();
  const failVerification = (route) =>
    route.fulfill({
      status: 503,
      json: { message: technicalMessage },
    });
  await page.route("**/api/me", failVerification);
  await page.locator("#pending-resume").click();
  await expect(page.locator("#toast.visible")).toHaveText(
    "Não foi possível concluir. Tente novamente.",
  );
  await expect(page.locator("#account-recovery")).toBeVisible();
  expect(cloud.writes).toBe(0);
  expect(await page.locator("body").innerText()).not.toContain(
    technicalMessage,
  );
  const downloading = page.waitForEvent("download");
  await page.locator("#pending-export").click();
  expect((await downloading).suggestedFilename()).toBe(
    "hibrido-pendencias.json",
  );
  await page.unroute("**/api/me", failVerification);
  await page.locator("#pending-resume").click();
  await expect(page.locator(".shell")).toBeVisible();
  expect(cloud.data.settings.loadProgression).toBe(7);
  expect(cloud.writes).toBe(1);
});

test("incompatible local recovery requires an explicit choice to discard", async ({
  page,
}) => {
  const cloud = await openRecovery(page, "previous-generation");
  await expect(page.locator("#pending-resume")).toBeDisabled();
  await expect(page.locator("#pending-export")).toBeVisible();
  expect(cloud.writes).toBe(0);
  await page
    .getByRole("button", { name: "Descartar alterações locais e continuar" })
    .click();
  await expect(page.locator(".shell")).toBeVisible();
  expect(cloud.data.settings.loadProgression).toBe(
    defaults().settings.loadProgression,
  );
  expect(cloud.writes).toBe(0);
});

test("session revoked during recovery never mounts the private diary", async ({
  page,
}) => {
  await openRecovery(page);
  await page.route("**/api/settings", (route) =>
    route.fulfill({
      status: 401,
      json: { code: "SESSION_REVOKED", message: technicalMessage },
    }),
  );
  await page.locator("#pending-resume").click();
  await expect(page.locator("#toast.visible")).toHaveText(accessError);
  await expect(page.locator("#account-gate")).toBeVisible();
  await expect(page.locator(".shell")).toBeHidden();
  await expect(page.locator("#main")).toBeEmpty();
  await expect(page.locator("#pending-export")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain(
    technicalMessage,
  );
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
  { width: 844, height: 390 },
]) {
  test(`login fits ${viewport.width}x${viewport.height} and has visible keyboard focus`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockSignedOut(page);
    await page.goto("/");
    const button = page.locator("#google-login");
    await expect(button).toBeEnabled();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
      button: document.querySelector("#google-login").getBoundingClientRect()
        .height,
    }));
    expect(dimensions.page).toBe(dimensions.viewport);
    expect(dimensions.button).toBeGreaterThanOrEqual(48);
    await page.screenshot({
      path: testInfo.outputPath("login.png"),
      fullPage: true,
    });
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
    await expect(button).toHaveCSS("outline-style", "solid");
    await expect(button).toHaveCSS("outline-width", "2px");
  });
}
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
  await expect(page.locator("#account-message")).toHaveText(
    "Entre para acompanhar seus treinos.",
  );
  await expect(page.locator("#toast.visible")).toHaveText(accessError);
  await expect(page.locator("#google-login")).toBeFocused();
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
