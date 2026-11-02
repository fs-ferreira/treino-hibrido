import { test, expect } from "@playwright/test";
import {
  cardFixture,
  openExerciseCard,
} from "./helpers/exercise-card-fixture.mjs";

const mapFor = (page, id) => page.locator(`[data-muscle-map="${id}"]`);
const region = (map, id) => map.locator(`[data-muscle="${id}"]`).first();
const leftPath = (map, id) =>
  region(map, id).locator('[data-side="left"]').first();

for (const width of [320, 390, 768, 1024, 1440])
  test(`anatomy, forms and catalog fit at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1100 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const card = await openExerciseCard(page);
    const map = mapFor(page, "leg-curl");
    if (width < 1024) await card.locator(".muscle-disclosure>summary").click();
    await expect(map).toHaveAccessibleName(
      "Músculos de Mesa flexora unilateral",
    );
    await expect(map).toHaveAccessibleDescription(
      /Principais: Isquiotibiais\. Secundários: nenhum destacado/,
    );
    await expect(map.locator("svg")).toHaveCount(1);
    await expect(map.locator("[data-muscle-view=back]")).toBeVisible();
    const mapBox = await map.boundingBox(),
      entryBox = await card.locator(".exercise-entry").boundingBox();
    if (width < 1024)
      expect(entryBox.y + entryBox.height).toBeLessThanOrEqual(mapBox.y);
    else expect(mapBox.x + mapBox.width).toBeLessThanOrEqual(entryBox.x);
    expect(
      await map
        .locator("svg")
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBe(180);
    expect(
      await region(map, "hamstrings").evaluate(
        (el) => getComputedStyle(el).fill,
      ),
    ).toBe("rgb(255, 107, 107)");
    await card.screenshot({
      path: testInfo.outputPath(`session-back-${width}.png`),
    });
    const compound = page.locator('[data-exercise="bulgarian"]');
    await compound.locator(":scope > summary").click();
    if (width < 1024)
      await compound.locator(".muscle-disclosure>summary").click();
    await expect(mapFor(page, "bulgarian").locator("svg")).toHaveCount(2);
    expect(
      await region(mapFor(page, "bulgarian"), "glutes").evaluate(
        (el) => getComputedStyle(el).fill,
      ),
    ).toBe("rgb(127, 29, 29)");
    await compound.screenshot({
      path: testInfo.outputPath(`session-both-${width}.png`),
    });
    await compound.locator(":scope > summary").click();
    await expect(mapFor(page, "bulgarian")).not.toBeVisible();
    expect((await compound.boundingBox()).height).toBeLessThanOrEqual(115);
    const dataBefore = structuredClone(page.cloudFixture.data);
    const writesBefore = page.cloudFixture.writes;
    await page.goto("/#treinos/hibrido-3x3");
    await expect(page.locator(".plan-exercises .muscle-map")).toHaveCount(23);
    for (const day of [3, 5])
      await page.locator(`[data-plan-day="${day}"] > summary`).click();
    if (width < 1024)
      for (const el of await page
        .locator(".plan-exercises .muscle-disclosure>summary")
        .all())
        await el.click();
    await expect(
      page.locator(".plan-exercises .muscle-map:visible"),
    ).toHaveCount(23);
    const press = mapFor(page, "incline-press");
    await expect(press.locator("svg")).toHaveCount(2);
    await expect(
      mapFor(page, "pec-deck").locator("[data-muscle-view=front]"),
    ).toBeVisible();
    await press.locator("[data-muscle=triceps]").focus();
    await expect(press.getByRole("status")).toHaveText(
      "Tríceps braquial · Secundário",
    );
    await page.keyboard.press("Escape");
    await press
      .locator("..")
      .screenshot({ path: testInfo.outputPath(`catalog-both-${width}.png`) });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(page.cloudFixture.data).toEqual(dataBefore);
    expect(page.cloudFixture.writes).toBe(writesBefore);
    expect(errors).toEqual([]);
  });

test("hover and keyboard identify muscles, dismiss feedback and reset on collapse", async ({
  page,
}) => {
  const card = await openExerciseCard(page);
  const map = mapFor(page, "leg-curl"),
    muscle = region(map, "hamstrings"),
    feedback = map.getByRole("status");
  await leftPath(map, "hamstrings").hover();
  await expect(feedback).toHaveText("Isquiotibiais · Principal");
  await card.locator(":scope > summary").hover();
  await expect(feedback).toBeEmpty();
  // Hover does not transfer keyboard focus into main; Escape must still dismiss.
  await page
    .getByRole("link", { name: "Híbrido — início", exact: true })
    .focus();
  await leftPath(map, "hamstrings").hover();
  await expect(feedback).toHaveText("Isquiotibiais · Principal");
  await page.keyboard.press("Escape");
  await expect(feedback).toBeEmpty();
  await muscle.focus();
  await expect(feedback).toHaveText("Isquiotibiais · Principal");
  await expect(muscle).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(feedback).toBeEmpty();
  await expect(muscle).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Enter");
  await expect(muscle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(feedback).toBeEmpty();
  await page.keyboard.press("Enter");
  await card.locator(":scope > summary").click();
  await card.locator(":scope > summary").click();
  await expect(feedback).toBeEmpty();
  await expect(muscle).toHaveAttribute("aria-pressed", "false");
});

test("touch selection is local, dismissible and preserves form nodes and saved values", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    const card = await openExerciseCard(page, cardFixture({ history: false }));
    const input = card.locator('[data-field="kg"]').first();
    await input.fill("25.5");
    await input.blur();
    await expect(page.locator("[data-sync-status]")).toHaveText(
      "Salvo na nuvem",
    );
    const node = await input.elementHandle(),
      writes = page.cloudFixture.writes;
    const map = mapFor(page, "leg-curl");
    await card.locator(".muscle-disclosure>summary").click();
    await leftPath(map, "hamstrings").tap();
    await expect(map.getByRole("status")).toHaveText(
      "Isquiotibiais · Principal",
    );
    expect(await input.evaluate((el, previous) => el === previous, node)).toBe(
      true,
    );
    await expect(input).toHaveValue("25.5");
    await map.locator(".muscle-map-legend").tap();
    await expect(map.getByRole("status")).toBeEmpty();
    const calfCard = page.locator('[data-exercise="seated-calf"]');
    await calfCard.locator(":scope > summary").tap();
    const calf = mapFor(page, "seated-calf");
    await calfCard.locator(".muscle-disclosure>summary").click();
    await leftPath(calf, "gastrocnemius").tap();
    await expect(calf.getByRole("status")).toHaveText(
      "Gastrocnêmio · Secundário",
    );
    await expect(map.getByRole("status")).toBeEmpty();
    await leftPath(map, "hamstrings").tap();
    await expect(map.getByRole("status")).toHaveText(
      "Isquiotibiais · Principal",
    );
    await expect(calf.getByRole("status")).toBeEmpty();
    expect(page.cloudFixture.writes).toBe(writes);
    await card.locator(":scope > summary").tap();
    await card.locator(":scope > summary").tap();
    await expect(input).toHaveValue("25.5");
    await expect(map.getByRole("status")).toBeEmpty();
    await page.reload();
    await card.locator(":scope > summary").tap();
    await card.locator(".muscle-disclosure>summary").tap();
    await expect(input).toHaveValue("25.5");
    await expect(map.getByRole("status")).toBeEmpty();
  } finally {
    await context.close();
  }
});
