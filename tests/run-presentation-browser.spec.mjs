import { test, expect, chromium } from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaults } from "../lib/core.js";
import { mockCloud } from "./helpers/cloud-api-fixture.mjs";
import { choose, chooseBirthMonth } from "./helpers/field-controls-fixture.mjs";

const date = "2026-11-03";
const diary = () => {
  const data = defaults();
  Object.assign(data.settings, {
    easyPace: "6:00",
    hardPace: "5:00",
    walkPace: "12:00",
    heartRate: { birthMonth: "1996-11", sex: "male" },
  });
  return data;
};
async function open(page, width = 390, data = diary(), hash = `hoje/${date}`) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(new Date("2026-11-05T15:00:00-03:00"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const cloud = await mockCloud(page, data);
  await page.goto(`/#${hash}`);
  await expect(page.locator("#main h1")).toBeVisible();
  return cloud;
}
async function navigate(page, hash) {
  await page.evaluate((hash) => (location.hash = hash), hash);
  await expect(page.locator("#main h1")).toBeVisible();
}
async function fits(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
const capture = async (page, name) => {
  await mkdir("test-results/run-presentation", { recursive: true });
  if (name.startsWith("zoom-")) {
    const cdp = await page.context().newCDPSession(page);
    try {
      // Capture the browser view directly: Playwright's CSS clipping at actual
      // page zoom can crop or blank the image after scrolling.
      const { layoutViewport } = await cdp.send("Page.getLayoutMetrics");
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: true,
        clip: {
          x: layoutViewport.pageX,
          y: layoutViewport.pageY,
          width: layoutViewport.clientWidth,
          height: layoutViewport.clientHeight,
          scale: 1,
        },
      });
      await writeFile(
        `test-results/run-presentation/${name}.png`,
        Buffer.from(data, "base64"),
      );
    } finally {
      await cdp.detach();
    }
    return;
  }
  await page.screenshot({
    path: `test-results/run-presentation/${name}.png`,
    // Full-page capture uses CSS bounds as device bounds at browser zoom,
    // cropping the result. Keep the real viewport for zoom and modal captures.
    fullPage: !name.startsWith("birth-picker") && !name.startsWith("zoom-"),
  });
};

for (const width of [320, 390, 1440]) {
  test(`running plans, settings and month picker reflow at ${width}px`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page, width);
    const session = page.locator("#session");
    await expect(session.locator(".interval-preview .block-pace")).toHaveText([
      "Pace 5:00/km",
      "Pace 6:00/km",
    ]);
    await expect(session.locator(".interval-preview .block-speed")).toHaveText([
      "· 12,0 km/h",
      "· 10,0 km/h",
    ]);
    expect(
      await session
        .locator(".block-pace")
        .first()
        .evaluate((node) => getComputedStyle(node).fontSize),
    ).toBe("16px");
    await expect(
      session.locator(".interval-preview .heart-rate-target"),
    ).toHaveText(["FC 152–171 bpm", "FC 95–133 bpm"]);
    await expect(session.locator(".interval-repeats")).not.toHaveAttribute(
      "open",
      "",
    );
    await expect(session.locator(".run-details")).not.toHaveAttribute(
      "open",
      "",
    );
    await expect(session.locator(".run-blocks")).not.toContainText(
      /% da FC máxima|FC de referência/,
    );
    await fits(page);
    await capture(page, `today-${width}`);
    await session.locator(".interval-repeats > summary").focus();
    await page.keyboard.press("Enter");
    await expect(session.locator(".interval-cycle")).toHaveCount(8);
    await expect(session.locator(".interval-preview")).toBeHidden();
    await expect(session.locator("[data-run-block]")).toHaveCount(18);
    await session.locator(".run-details > summary").click();
    await expect(session.locator(".run-secondary")).toContainText(
      "Z4 · 80–90%",
    );
    expect(await session.getByText(/A FC responde com atraso:/).count()).toBe(
      1,
    );
    await fits(page);
    await capture(page, `today-expanded-${width}`);
    await navigate(page, "treinos/hibrido-3x3");
    await page.locator('[data-plan-day="2"] > summary').click();
    await fits(page);
    await capture(page, `catalog-${width}`);
    for (const section of ["corrida", "progressao", "semana", "dados"]) {
      await navigate(page, `configuracoes/${section}`);
      await expect(page.locator(`#settings-panel-${section}`)).toBeVisible();
      await fits(page);
      await capture(page, `settings-${section}-${width}`);
    }
    await navigate(page, "configuracoes/corrida");
    await page.locator("#setting-heartRateBirthMonth-trigger").click();
    const picker = page.locator(".field-month-calendar");
    await expect(picker).toBeVisible();
    await expect(
      picker.locator("[data-date],.field-weekdays,[data-calendar-today]"),
    ).toHaveCount(0);
    await expect(picker.locator('[data-selected="true"]')).toHaveAccessibleName(
      "novembro de 1996",
    );
    const bounds = await picker.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
    await fits(page);
    await capture(page, `birth-picker-${width}`);
    await page.keyboard.press("Escape");
    await expect(
      page.locator("#setting-heartRateBirthMonth-trigger"),
    ).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test("month-only picker supports distant years, keyboard, bounds, cancellation and draft validation", async ({
  page,
}) => {
  const cloud = await open(page, 390, defaults(), "configuracoes/corrida");
  const birth = page.locator("#setting-heartRateBirthMonth-trigger");
  await birth.focus();
  await page.keyboard.press("Space");
  const picker = page.locator(".field-month-calendar");
  await expect(picker.getByLabel("Ano", { exact: true })).toBeFocused();
  await picker.getByLabel("Ano", { exact: true }).selectOption("1930");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(birth).toHaveText("jun/1930");
  await expect(birth).toBeFocused();
  expect(cloud.writes).toBe(0);
  await birth.click();
  await picker.getByLabel("Ano", { exact: true }).selectOption("2008");
  await expect(picker.locator('[data-birth-month="11"]')).toBeDisabled();
  await expect(picker.locator('[data-birth-month="10"]')).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(birth).toHaveText("jun/1930");
  await birth.click();
  await picker.getByLabel("Ano", { exact: true }).selectOption("1925");
  await expect(picker.locator('[data-birth-month="10"]')).toBeDisabled();
  await expect(picker.locator('[data-birth-month="11"]')).toBeEnabled();
  await page.keyboard.press("Escape");
  await choose(page.locator('[name="heartRateSex"]'), "female");
  await navigate(page, "configuracoes/progressao");
  await navigate(page, "configuracoes/corrida");
  await expect(birth).toHaveText("jun/1930");
  await birth.click();
  await picker.getByRole("button", { name: "Limpar", exact: true }).click();
  await expect(page.locator('[name="heartRateSex"]')).toHaveValue("female");
  await page.locator("#settings-panel-corrida [type=submit]").click();
  await expect(birth).toHaveAttribute("aria-invalid", "true");
  await expect(birth).toBeFocused();
  expect(cloud.writes).toBe(0);
  await chooseBirthMonth(page, "1996-11");
  await page.locator("#settings-panel-corrida [type=submit]").click();
  await expect
    .poll(() => cloud.data.settings.heartRate)
    .toEqual({ birthMonth: "1996-11", sex: "female" });
});

test("fallback month/year selects work without the Popover API and keep manual saving", async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLElement.prototype.showPopover = undefined;
  });
  const cloud = await open(page, 320, defaults(), "configuracoes/corrida");
  await page
    .getByLabel("Ano de nascimento", { exact: true })
    .selectOption("1996");
  await page
    .getByLabel("Mês de nascimento", { exact: true })
    .selectOption("11");
  await page.locator('[name="heartRateSex"]').selectOption("female");
  await expect(page.locator("[data-heart-rate-preview]")).toHaveText(
    "FC máxima estimada: 196 bpm",
  );
  expect(cloud.writes).toBe(0);
  await page.locator("#settings-panel-corrida [type=submit]").click();
  await expect
    .poll(() => cloud.data.settings.heartRate)
    .toEqual({ birthMonth: "1996-11", sex: "female" });
  await page.reload();
  await expect(
    page.getByLabel("Mês de nascimento", { exact: true }),
  ).toHaveValue("11");
  await fits(page);
});

// Set the browser's actual page zoom in an isolated profile. A CSS transform or
// deviceScaleFactor alone would not exercise the same reflow and viewport rules.
test("real browser zoom at 200% preserves running plans, settings and month selection", async ({
  browserName,
  isMobile,
}, testInfo) => {
  test.skip(
    browserName !== "chromium" || isMobile,
    "Browser zoom uses Chromium settings in a desktop-only isolated profile.",
  );
  await mkdir(testInfo.outputDir, { recursive: true });
  const profile = await mkdtemp(path.join(testInfo.outputDir, "zoom-profile-"));
  const context = await chromium.launchPersistentContext(profile, {
    ...testInfo.project.use.launchOptions,
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page = context.pages()[0];
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("chrome://settings/appearance");
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          chrome.settingsPrivate.setDefaultZoom(2, resolve),
        ),
    );
    await page.clock.setFixedTime(new Date("2026-11-05T15:00:00-03:00"));
    await mockCloud(page, diary());
    const overflows = [];
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const hash of [
        `hoje/${date}`,
        "treinos/hibrido-3x3",
        "configuracoes/corrida",
        "configuracoes/progressao",
        "configuracoes/semana",
        "configuracoes/dados",
      ]) {
        await page.goto(`http://127.0.0.1:4173/#${hash}`);
        await expect(page.locator("#main h1")).toBeVisible();
        expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
        expect(await page.evaluate(() => innerWidth)).toBe(width / 2);
        if (width < 600)
          expect(
            await page
              .locator(".sidebar nav")
              .evaluate((node) => getComputedStyle(node).position),
          ).toBe("static");
        if (hash.startsWith("treinos"))
          await page.locator('[data-plan-day="2"] > summary').click();
        if (hash.startsWith("hoje")) {
          await page
            .locator("#session .interval-group")
            .scrollIntoViewIfNeeded();
          await capture(page, `zoom-200-${width}-today-collapsed`);
          await page.locator("#session .interval-repeats > summary").click();
          await page.locator("#session .run-details > summary").click();
          await expect(page.locator("#session .interval-cycle")).toHaveCount(8);
          await page
            .locator("#session .interval-cycle")
            .first()
            .scrollIntoViewIfNeeded();
        }
        const layout = await page.evaluate(() => ({
          viewport: innerWidth,
          scroll: document.documentElement.scrollWidth,
          outside: [...document.querySelectorAll("body *")]
            .filter((node) => {
              const r = node.getBoundingClientRect();
              return (
                node.namespaceURI === "http://www.w3.org/1999/xhtml" &&
                !node.closest(".week-strip,.nav-track,.hero-art") &&
                r.width &&
                (r.right > innerWidth + 1 || r.left < -1)
              );
            })
            .slice(0, 20)
            .map((node) => ({
              tag: node.tagName,
              class: node.className,
              right: node.getBoundingClientRect().right,
              text: node.textContent.slice(0, 70),
            })),
        }));
        if (layout.scroll > layout.viewport)
          overflows.push({ width, hash, ...layout });
        await capture(page, `zoom-200-${width}-${hash.replaceAll("/", "-")}`);
      }
      await navigate(page, "configuracoes/corrida");
      await page.locator("#setting-heartRateBirthMonth-trigger").click();
      const picker = page.locator(".field-month-calendar");
      await expect(picker).toBeVisible();
      await picker.getByLabel("Ano", { exact: true }).selectOption("1990");
      await picker.locator('[data-birth-month="0"]').click();
      await expect(
        page.locator("#setting-heartRateBirthMonth-trigger"),
      ).toHaveText("jan/1990");
    }
    expect(overflows).toEqual([]);
  } finally {
    await context.close();
  }
});

test("touch selects a birth month without saving settings", async ({
  page,
  hasTouch,
}) => {
  test.skip(
    !hasTouch,
    "Touch is exercised by the Android and iOS compatibility projects.",
  );
  const cloud = await open(page, 390, defaults(), "configuracoes/corrida");
  await page.locator("#setting-heartRateBirthMonth-trigger").tap();
  const picker = page.locator(".field-month-calendar");
  await picker.getByLabel("Ano", { exact: true }).selectOption("1996");
  await picker.locator('[data-birth-month="10"]').tap();
  await expect(page.locator("#setting-heartRateBirthMonth-trigger")).toHaveText(
    "nov/1996",
  );
  expect(cloud.writes).toBe(0);
});

test("settings keep pending actions and field errors accessible in short viewports", async ({
  page,
}) => {
  const cloud = await open(page, 320, diary(), "configuracoes/corrida");
  await chooseBirthMonth(page, "1990-01");
  await expect(page.locator("[data-settings-draft-warning]")).toBeVisible();
  await page.setViewportSize({ width: 320, height: 360 });
  await expect(page.locator("#settings-page")).toHaveClass(
    /settings-short-viewport/,
  );
  expect(
    await page
      .locator("#settings-panel-corrida .settings-actions")
      .evaluate((node) => getComputedStyle(node).position),
  ).toBe("static");
  await page.locator("#setting-heartRateBirthMonth-trigger").click();
  const picker = page.locator(".field-month-calendar");
  await picker.getByRole("button", { name: "Limpar", exact: true }).click();
  await page.locator("#settings-panel-corrida [type=submit]").click();
  await expect(page.locator("#error-heartRateBirthMonth")).toBeVisible();
  await expect(
    page.locator("#setting-heartRateBirthMonth-trigger"),
  ).toBeFocused();
  await expect(page.locator("[data-heart-rate-preview]")).toBeHidden();
  await fits(page);
  await capture(page, "settings-error-short-320");
  expect(cloud.writes).toBe(0);
});
