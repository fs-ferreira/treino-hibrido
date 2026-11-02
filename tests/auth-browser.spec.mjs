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

async function holdResponse(page, pattern) {
  let release, arrived;
  const waiting = new Promise((resolve) => (release = resolve)),
    requested = new Promise((resolve) => (arrived = resolve));
  await page.route(pattern, async (route) => {
    arrived(route.request());
    const response = await waiting;
    if (response) await route.fulfill(response);
    else await route.fallback();
  });
  return { release, requested };
}

async function expectDiaryReady(page) {
  await expect(page.locator("#auth-splash")).toBeHidden();
  await expect(page.locator(".shell")).toBeVisible();
  await expect(page.locator(".shell")).not.toHaveAttribute("inert");
}

async function restoreFromHistory(page) {
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
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
  await expect(page.locator("#auth-splash")).toBeHidden();
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

test("initial splash is available before the bootstrap module loads", async ({
  page,
}) => {
  await mockSignedOut(page);
  const module = await holdResponse(page, "**/bootstrap.js?*");
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.locator("#auth-splash")).toBeVisible();
  await expect(page.locator("#account-gate")).toBeHidden();
  await expect(page.locator(".shell")).toBeHidden();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(12, 13, 15)",
  );
  await expect(page.getByRole("button")).toHaveCount(0);
  module.release();
  await expect(page.locator("#google-login")).toBeEnabled();
  await expect(page.locator("#auth-splash")).toBeHidden();
});

test("initial splash blocks focus and respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pending = await holdResponse(page, "**/api/me");
  await page.goto("/");
  await expect(page.locator("#auth-splash")).toBeVisible();
  await expect(page.locator("#account-gate")).toBeHidden();
  await expect(page.locator(".shell")).toBeHidden();
  for (const selector of ["#account-gate", ".shell", ".skip"])
    await expect(page.locator(selector)).toHaveAttribute("inert", "");
  await expect(page.locator("#google-login")).toBeDisabled();
  await expect(page.locator("#google-login")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  expect(
    await page
      .locator(".auth-splash-mark")
      .evaluate((el) => getComputedStyle(el, "::after").animationName),
  ).toBe("none");
  await expect(page.locator("#auth-splash-status")).toHaveText(
    "Preparando seu acesso…",
  );
  await expect(page.locator("#auth-splash-status")).toHaveCSS(
    "clip-path",
    "inset(50%)",
  );
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => document.activeElement === document.body),
  ).toBe(true);
  pending.release({ status: 401, json: { code: "AUTH_REQUIRED" } });
  await expect(page.locator("#google-login")).toBeEnabled();
  await expect(page.locator("#auth-splash")).toBeHidden();
  await expect(page.locator("#account-gate")).not.toHaveAttribute("inert");
});

test("authenticated opening waits for diary data and the application module", async ({
  page,
}) => {
  await mockCloud(page);
  const diary = await holdResponse(page, "**/api/diary"),
    module = await holdResponse(page, "**/app.js?*");
  await page.goto("/?source=google#historico");
  await diary.requested;
  await expect(page.locator("#auth-splash-status")).toHaveText(
    "Abrindo seu diário…",
  );
  await expect(page.locator("#main")).toBeEmpty();
  await expect(page.locator("#account-gate")).toBeHidden();
  diary.release();
  await module.requested;
  await expect(page.locator("#auth-splash")).toBeVisible();
  await expect(page.locator(".shell")).toHaveAttribute("inert", "");
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveAttribute("id", "auth-splash");
  module.release();
  await expectDiaryReady(page);
  await expect(
    page.getByRole("heading", { name: /Sua evolução/ }),
  ).toBeVisible();
  await expect(page).toHaveURL("/?source=google#historico");
});

test("failed diary loading leaves the splash and can retry", async ({
  page,
}) => {
  await mockCloud(page);
  const pending = await holdResponse(page, "**/api/diary");
  await page.goto("/");
  await pending.requested;
  pending.release({ status: 503, json: { message: technicalMessage } });
  await expect(page.locator("#toast.visible")).toHaveText(accessError);
  await expect(page.locator("#auth-splash")).toBeHidden();
  await expect(page.locator("#main")).toBeEmpty();
  await page.unroute("**/api/diary");
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expectDiaryReady(page);
});

test("request timeout leaves the splash and offers retry", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  const pending = await holdResponse(page, "**/api/me");
  await page.goto("/");
  await pending.requested;
  await expect(page.locator("#auth-splash")).toBeVisible();
  await page.clock.runFor(12001);
  await expect(page.locator("#auth-splash")).toBeHidden();
  await expect(page.locator("#toast.visible")).toHaveText(accessError);
  await expect(
    page.getByRole("button", { name: "Tentar novamente", exact: true }),
  ).toBeEnabled();
  pending.release({ status: 401, json: { code: "AUTH_REQUIRED" } });
});

test("failed application loading offers a working retry", async ({ page }) => {
  await mockCloud(page);
  const module = await holdResponse(page, "**/app.js?*");
  await page.goto("/");
  await module.requested;
  module.release({ status: 503, contentType: "text/javascript", body: "" });
  await expect(page.locator("#toast.visible")).toHaveText(accessError);
  await expect(page.locator("#auth-splash")).toBeHidden();
  await expect(page.locator("#main")).toBeEmpty();
  await page.unroute("**/app.js?*");
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expectDiaryReady(page);
});

test("splash transitions also work without the animation API", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Element.prototype.animate = undefined;
  });
  await mockCloud(page);
  await page.goto("/");
  await expectDiaryReady(page);
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
  await expect(page.locator("#auth-splash")).toBeVisible();
  await expect(page.locator("#auth-splash-status")).toHaveText("Entrando…");
  await expect(page.locator("#account-gate")).toBeHidden();
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
    const pending = await holdResponse(page, "**/api/me");
    await page.goto("/");
    await expect(page.locator("#auth-splash")).toBeVisible();
    const splashDimensions = await page
      .locator(".auth-splash-mark")
      .evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          centerX: rect.x + rect.width / 2,
          centerY: rect.y + rect.height / 2,
          pageWidth: document.documentElement.scrollWidth,
          animation: getComputedStyle(el, "::after").animationName,
        };
      });
    expect(splashDimensions.width).toBe(64);
    expect(splashDimensions.height).toBe(64);
    expect(splashDimensions.centerX).toBeCloseTo(viewport.width / 2, 0);
    expect(splashDimensions.centerY).toBeCloseTo(viewport.height / 2, 0);
    expect(splashDimensions.pageWidth).toBe(viewport.width);
    expect(splashDimensions.animation).toBe("auth-splash-pulse");
    await page.screenshot({ path: testInfo.outputPath("splash.png") });
    pending.release({ status: 401, json: { code: "AUTH_REQUIRED" } });
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
  await expect(page.locator("[data-sync-status]")).toHaveText("Salvo na nuvem");
  expect(cloud.data.sessions[CARD_DATE].workouts[0].sets[CARD_ID][0].kg).toBe(
    15.5,
  );
  cloud.fail = true;
  await kg.fill("16");
  await kg.blur();
  await expect(page.locator("[data-sync-status]")).toContainText(
    "sincronização pendente",
  );
  expect(await kg.evaluate((el, old) => el === old, handle)).toBe(true);
  cloud.fail = false;
  await page.reload();
  const reopened = page.locator(`[data-exercise="${CARD_ID}"]`);
  await reopened.locator(":scope > summary").click();
  await expect(reopened.locator('[data-field="kg"]').first()).toHaveValue("16");
  await expect(page.locator("[data-sync-status]")).toHaveText("Salvo na nuvem");
  expect(cloud.data.sessions[CARD_DATE].workouts[0].sets[CARD_ID][0].kg).toBe(
    16,
  );
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
  await expect(page.locator("#auth-splash")).toBeHidden();
});

test("background session checks keep the diary interactive without a splash", async ({
  page,
}) => {
  await mockCloud(page);
  await page.goto("/");
  await expectDiaryReady(page);
  const pending = await holdResponse(page, "**/api/me");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await pending.requested;
  await expectDiaryReady(page);
  await page.getByRole("link", { name: "Histórico", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Sua evolução/ }),
  ).toBeVisible();
  pending.release({ status: 503, json: { message: technicalMessage } });
  await expect(page.locator("[data-sync-status]")).toContainText("Sem conexão");
  await expectDiaryReady(page);
});

test("BFCache return revalidates once and ignores an earlier opening response", async ({
  page,
}) => {
  await mockCloud(page);
  const pending = await holdResponse(page, "**/api/me");
  await page.goto("/");
  await pending.requested;
  await page.unroute("**/api/me");
  let checks = 0;
  await page.route("**/api/me", (route) => {
    checks++;
    return route.fulfill({ status: 401, json: { code: "AUTH_REQUIRED" } });
  });
  await restoreFromHistory(page);
  await expect(page.locator("#google-login")).toBeEnabled();
  pending.release();
  await expect(page.locator("#auth-splash")).toBeHidden();
  await expect(page.locator("#account-gate")).toBeVisible();
  await expect(page.locator("#main")).toBeEmpty();
  expect(checks).toBe(1);
});

test("BFCache invalidation during module loading cannot reveal private content", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const cloud = await mockCloud(page);
  const module = await holdResponse(page, "**/app.js?*");
  await page.goto("/");
  await module.requested;
  cloud.revoked = true;
  await restoreFromHistory(page);
  await expect(page.locator("#google-login")).toBeEnabled();
  const loaded = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/app.js",
  );
  module.release();
  await loaded;
  await expect(page.locator("#account-gate")).toBeVisible();
  await expect(page.locator("#main")).toBeEmpty();
  await expect(page.locator(".shell")).toBeHidden();
  expect(errors).toEqual([]);
  cloud.revoked = false;
  await restoreFromHistory(page);
  await expectDiaryReady(page);
  await expect(page.locator("#main")).not.toBeEmpty();
});

test("BFCache return cancels a pending Google redirect", async ({ page }) => {
  await mockSignedOut(page);
  const pending = await holdResponse(page, "**/api/auth/sign-in/social");
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar com Google" }).click();
  await pending.requested;
  await restoreFromHistory(page);
  await expect(page.locator("#google-login")).toBeEnabled();
  pending.release({
    json: { url: "https://accounts.google.com/o/oauth2/auth" },
  });
  await expect(page).toHaveURL("/");
  await expect(page.locator("#auth-splash")).toBeHidden();
  await expect(page.locator("#account-gate")).toBeVisible();
});

test("failed logout restores the diary and keyboard focus", async ({
  page,
}) => {
  await mockCloud(page);
  await page.goto("/");
  await expectDiaryReady(page);
  const pending = await holdResponse(page, "**/api/auth/sign-out");
  await page.locator(".account-menu > summary").click();
  const logout = page.getByRole("button", {
    name: "Sair da conta",
    exact: true,
  });
  await logout.click();
  await pending.requested;
  await expect(page.locator("#auth-splash")).toBeVisible();
  await expect(page.locator("#auth-splash-status")).toHaveText("Saindo…");
  await expect(page.locator(".shell")).toHaveAttribute("inert", "");
  pending.release({ status: 503, json: { message: technicalMessage } });
  await expectDiaryReady(page);
  await expect(logout).toBeEnabled();
  await expect(logout).toBeFocused();
  await expect(page.locator("#account-action-error")).toHaveText(
    "Não foi possível concluir. Tente novamente.",
  );
  expect(await page.locator("body").innerText()).not.toContain(
    technicalMessage,
  );
});
test("logout with pending changes keeps choices and export outside the splash", async ({
  page,
}) => {
  const card = await openExerciseCard(page),
    cloud = page.cloudFixture,
    input = card.locator('[data-field="kg"]').first();
  cloud.fail = true;
  await input.fill("18");
  await input.blur();
  await expect(page.locator("[data-sync-status]")).toContainText(
    "sincronização pendente",
  );
  await page.locator(".account-menu > summary").click();
  await page
    .getByRole("button", { name: "Sair da conta", exact: true })
    .click();
  await expect(page.locator("#logout-panel")).toBeVisible();
  await expect(page.locator("#auth-splash")).toBeHidden();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar pendências", exact: true })
    .click();
  expect((await downloading).suggestedFilename()).toBe(
    "hibrido-pendencias.json",
  );
  await page
    .getByRole("button", { name: "Continuar no app", exact: true })
    .click();
  await expect(page.locator("#logout-panel")).toBeHidden();
  await expect(input).toHaveValue("18");
  await expectDiaryReady(page);
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
  await expectDiaryReady(page);
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
  await expect(page.locator("[data-sync-status]")).toHaveText("Salvo na nuvem");
  await expect(input).toHaveValue("8");
  await expect(
    page.locator('[data-settings-form="progressao"] [data-settings-status]'),
  ).toHaveText("Alterações pendentes");
  expect(cloud.data.settings.loadProgression).toBe(7);
});
