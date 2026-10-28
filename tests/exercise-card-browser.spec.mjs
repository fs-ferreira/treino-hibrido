import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { KEY } from "../lib/core.js";
import {
  CARD_ID,
  CARD_DATE,
  EMPTY_SETS,
  cardFixture,
  openExerciseCard,
} from "./helpers/exercise-card-fixture.mjs";

// Measured from the original card with this same synthetic history fixture.
const baselineHeights = {
  320: 974.84375,
  390: 870.28125,
  768: 769.859375,
  1440: 769.859375,
};
const field = (card, name, index) =>
  card.locator(`[data-field="${name}"][data-index="${index}"]`);
const use = (card, index) =>
  card.locator(`[data-action="use-load"][data-index="${index}"]`);

for (const width of [320, 390, 768, 1440])
  test(`compact layout, accessible controls and height at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1100 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const card = await openExerciseCard(page),
      history = card.locator(".exercise-history");
    await expect(history).not.toHaveAttribute("open");
    await expect(use(card, 0)).toHaveText("Usar 13 kg");
    await expect(use(card, 1)).toHaveText("Usar 17 kg");
    await expect(use(card, 0)).toHaveAccessibleDescription(
      /Referência.*12 kg × 8/,
    );
    await expect(
      card.getByRole("checkbox", { name: "Sem peso adicional", exact: true }),
    ).toHaveAccessibleDescription(/três séries.*cargas digitadas/);
    await expect(card.locator(".previous")).not.toBeVisible();
    await expect(card).not.toContainText("Seu primeiro registro.");
    await expect(card.locator(".exercise-tools")).not.toContainText(
      "Flexão de joelho",
    );
    for (const target of [
      card.locator(".weight-toggle"),
      card.locator(".exercise-guide"),
      history.locator(":scope > summary"),
    ]) {
      const bounds = await target.boundingBox();
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
    }
    fs.writeFileSync(
      testInfo.outputPath(`accessibility-${width}.yml`),
      await card.ariaSnapshot(),
    );
    for (let i = 0; i < 3; i++) {
      await expect(field(card, "kg", i)).toHaveAccessibleName(
        `Carga da série ${i + 1} de Mesa flexora unilateral`,
      );
      await expect(field(card, "reps", i)).toHaveAccessibleName(
        `Repetições da série ${i + 1} de Mesa flexora unilateral`,
      );
      expect(
        await field(card, "kg", i).evaluate(
          (e) => getComputedStyle(e).fontSize,
        ),
      ).toBe("16px");
      for (const target of [
        field(card, "kg", i),
        field(card, "reps", i),
        card.locator(".check-label").nth(i),
        use(card, i),
      ]) {
        const box = await target.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }
    const input = await field(card, "kg", 0).boundingBox(),
      button = await use(card, 0).boundingBox();
    if (width <= 600) {
      expect(button.y + button.height).toBeLessThanOrEqual(input.y);
      await expect(card.locator(".set-header")).not.toBeVisible();
      for (let i = 0; i < 3; i++) {
        const row = card.locator(".set-row").nth(i),
          kg = await field(card, "kg", i).boundingBox(),
          reps = await field(card, "reps", i).boundingBox(),
          done = await row.locator(".check-label").boundingBox();
        expect(Math.abs(kg.y - reps.y)).toBeLessThan(1);
        expect(Math.abs(kg.y - done.y)).toBeLessThan(1);
        expect(reps.x).toBeGreaterThanOrEqual(kg.x + kg.width);
        expect(done.x).toBeGreaterThanOrEqual(reps.x + reps.width);
        for (const target of await row.locator(".weight-step").all()) {
          const bounds = await target.boundingBox();
          expect(bounds.width).toBeGreaterThanOrEqual(44);
          expect(bounds.height).toBeGreaterThanOrEqual(44);
        }
        await expect(row.locator(".load-label")).toBeVisible();
        await expect(row.locator(".reps-label")).toBeVisible();
      }
    } else {
      expect(button.x).toBeGreaterThanOrEqual(input.x + input.width);
      expect(Math.abs(button.y - input.y)).toBeLessThan(5);
    }
    const box = await card.boundingBox(),
      reduction = 1 - box.height / baselineHeights[width];
    expect(reduction).toBeGreaterThanOrEqual(width <= 600 ? 0.2 : 0.35);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await card.screenshot({ path: testInfo.outputPath(`card-${width}.png`) });
    fs.writeFileSync(
      testInfo.outputPath(`layout-${width}.json`),
      JSON.stringify(
        {
          width,
          beforeHeight: baselineHeights[width],
          afterHeight: box.height,
          reduction,
        },
        null,
        2,
      ),
    );
    await history.locator("summary").click();
    await expect(history).toHaveAttribute("open");
    await expect(card).toHaveAttribute("open");
    await expect(history.locator(".previous")).toBeVisible();
    await expect(history.locator(".load-reference li")).toHaveCount(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await card.screenshot({
      path: testInfo.outputPath(`card-history-${width}.png`),
    });
    expect(errors).toEqual([]);
  });

test("apply one suggestion, keep manual values, focus, scroll and completion", async ({
  page,
}) => {
  const current = EMPTY_SETS();
  current[0] = { kg: 10, reps: 6, done: false };
  const card = await openExerciseCard(
    page,
    cardFixture({ currentSets: current }),
  );
  await field(card, "kg", 0).fill("14.5");
  await field(card, "reps", 0).fill("7");
  await field(card, "reps", 0).blur();
  const handle = await field(card, "kg", 1).elementHandle();
  await use(card, 1).scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  await use(card, 1).click();
  await expect(field(card, "kg", 1)).toHaveValue("17");
  await expect(field(card, "kg", 1)).not.toBeFocused();
  await expect(use(card, 1)).toBeFocused();
  await expect(field(card, "kg", 0)).toHaveValue("14.5");
  await expect(field(card, "kg", 2)).toHaveValue("");
  await expect(field(card, "reps", 0)).toHaveValue("7");
  expect(
    await field(card, "kg", 1).evaluate(
      (el, previous) => el === previous,
      handle,
    ),
  ).toBe(true);
  expect(
    Math.abs((await page.evaluate(() => scrollY)) - scroll),
  ).toBeLessThanOrEqual(2);
  await field(card, "done", 1).check();
  await expect(use(card, 1)).toBeDisabled();
  await expect(use(card, 0)).toBeEnabled();
  await expect(card.locator(".exercise-check")).toHaveAttribute(
    "aria-label",
    "1 de 3 séries concluídas",
  );
  await field(card, "done", 1).uncheck();
  await expect(use(card, 1)).toBeEnabled();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    KEY,
  );
  expect(saved.sessions[CARD_DATE].sets[CARD_ID][0]).toEqual({
    kg: 14.5,
    reps: 7,
    done: false,
  });
  expect(saved.sessions[CARD_DATE].sets[CARD_ID][1].kg).toBe(17);
});

test("without additional weight preserves three loads and persists across reload", async ({
  page,
}) => {
  const current = [20, 22, 24].map((kg) => ({ kg, reps: 7, done: false }));
  let card = await openExerciseCard(
    page,
    cardFixture({ currentSets: current }),
  );
  await card
    .getByRole("checkbox", { name: "Sem peso adicional", exact: true })
    .check();
  for (let i = 0; i < 3; i++) {
    await expect(field(card, "kg", i)).toBeDisabled();
    await expect(field(card, "kg", i)).toHaveValue(String(current[i].kg));
    await expect(field(card, "reps", i)).toBeEnabled();
    await expect(field(card, "done", i)).toBeEnabled();
    await expect(use(card, i)).not.toBeVisible();
  }
  await card.locator(".exercise-history > summary").click();
  await expect(card.locator(".load-reference")).not.toBeVisible();
  await expect(card.locator(".weight-help")).toBeVisible();
  await page.reload();
  card = page.locator(`[data-exercise="${CARD_ID}"]`);
  await card.locator(":scope > summary").click();
  await expect(
    card.getByRole("checkbox", { name: "Sem peso adicional", exact: true }),
  ).toBeChecked();
  await card
    .getByRole("checkbox", { name: "Sem peso adicional", exact: true })
    .uncheck();
  for (let i = 0; i < 3; i++) {
    await expect(field(card, "kg", i)).toBeEnabled();
    await expect(field(card, "kg", i)).toHaveValue(String(current[i].kg));
    await expect(use(card, i)).toBeVisible();
  }
});

test("first record, keyboard disclosures, focus indicators and guide", async ({
  page,
}) => {
  const card = await openExerciseCard(page, cardFixture({ history: false })),
    history = card.locator(".exercise-history"),
    summary = history.locator(":scope > summary");
  await expect(card.locator('[data-action="use-load"]')).toHaveCount(0);
  await expect(card.locator(".previous")).not.toBeVisible();
  await page.keyboard.press("Tab");
  await summary.focus();
  await page.keyboard.press("Space");
  await expect(history).toHaveAttribute("open");
  await expect(card).toHaveAttribute("open");
  await expect(card.locator(".previous")).toHaveText(
    "Sem registros anteriores.",
  );
  expect(await summary.evaluate((e) => getComputedStyle(e).outlineWidth)).toBe(
    "2px",
  );
  await page.keyboard.press("Space");
  await expect(history).not.toHaveAttribute("open");
  await expect(card).toHaveAttribute("open");
  const outer = card.locator(":scope > summary");
  await outer.focus();
  await page.keyboard.press("Enter");
  await expect(card).not.toHaveAttribute("open");
  await page.keyboard.press("Enter");
  await expect(card).toHaveAttribute("open");
  const guide = card.getByRole("button", {
    name: "Como fazer Mesa flexora unilateral",
  });
  await guide.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "Flexão de joelho deitado, uma perna por vez",
  );
  await page.getByRole("button", { name: "Fechar guia" }).click();
  await expect(guide).toBeFocused();
});

test("each series keeps its reference date and out-of-range suggestions stay blocked", async ({
  page,
}) => {
  const data = cardFixture({
    previousSets: [
      { kg: 12, reps: 8, done: true },
      { kg: 16, reps: "", done: false },
      { kg: 2000, reps: 8, done: true },
    ],
  });
  data.sessions["2026-10-14"] = {
    type: "lower",
    done: true,
    sets: {
      [CARD_ID]: [10, 14, 20].map((kg) => ({ kg, reps: 8, done: true })),
    },
    run: null,
  };
  const card = await openExerciseCard(page, data);
  await expect(use(card, 1)).toHaveText("Usar 15 kg");
  await expect(use(card, 2)).toBeDisabled();
  await expect(use(card, 2)).toHaveText("Fora do limite");
  await card.locator(".exercise-history > summary").click();
  const refs = card.locator(".load-reference li");
  await expect(refs.nth(0)).toContainText("21 de out.");
  await expect(refs.nth(1)).toContainText("14 de out.");
  await expect(refs.nth(2)).toContainText("acima do limite de 2000 kg");
  await expect(field(card, "kg", 2)).toHaveValue("");
});

test("maintenance after low repetitions and zero progression remains explicit", async ({
  page,
}) => {
  const card = await openExerciseCard(
    page,
    cardFixture({
      percent: 0,
      previousSets: [
        { kg: 12, reps: 7, done: true },
        { kg: 16, reps: 8, done: true },
        { kg: 16, reps: 8, done: true },
      ],
    }),
  );
  await expect(use(card, 0)).toHaveText("Manter 12 kg");
  await expect(use(card, 1)).toHaveText("Manter 16 kg");
  await card.locator(".exercise-history > summary").click();
  await expect(card.locator(".load-reference li").nth(0)).toContainText(
    "abaixo de 8 repetições",
  );
  await expect(card.locator(".load-reference li").nth(1)).toContainText(
    "progressão em 0%",
  );
  await use(card, 0).click();
  await expect(field(card, "kg", 0)).toHaveValue("12");
});

test("completed series cannot receive a load on initial render", async ({
  page,
}) => {
  const current = EMPTY_SETS();
  current[0] = { kg: 12, reps: 8, done: true };
  const card = await openExerciseCard(
    page,
    cardFixture({ currentSets: current }),
  );
  await expect(use(card, 0)).toBeDisabled();
  await expect(use(card, 1)).toBeEnabled();
  await expect(field(card, "kg", 0)).toHaveValue("12");
  await field(card, "done", 0).uncheck();
  await expect(use(card, 0)).toBeEnabled();
});

test("manual weights use half kilograms and persist", async ({ page }) => {
  const card = await openExerciseCard(page);
  for (const [typed, expected] of [
    ["10.1", "10.5"],
    ["10.5", "10.5"],
    ["10", "10"],
    ["0", "0"],
    ["2000", "2000"],
  ]) {
    await field(card, "kg", 0).fill(typed);
    await field(card, "kg", 0).blur();
    await expect(field(card, "kg", 0)).toHaveValue(expected);
  }
  await page.reload();
  await page.locator(`[data-exercise="${CARD_ID}"] > summary`).click();
  await expect(
    field(page.locator(`[data-exercise="${CARD_ID}"]`), "kg", 0),
  ).toHaveValue("2000");
});

test("plus and minus adjust half kilograms, respect bounds and weightless mode", async ({
  page,
}) => {
  const card = await openExerciseCard(page);
  const minus = card
      .locator('[data-action="step-load"][data-direction="-1"]')
      .first(),
    plus = card
      .locator('[data-action="step-load"][data-direction="1"]')
      .first();
  await expect(minus).toBeDisabled();
  await plus.click();
  await expect(field(card, "kg", 0)).toHaveValue("0.5");
  await plus.click();
  await expect(field(card, "kg", 0)).toHaveValue("1");
  await minus.click();
  await expect(field(card, "kg", 0)).toHaveValue("0.5");
  await minus.click();
  await expect(field(card, "kg", 0)).toHaveValue("0");
  await expect(minus).toBeDisabled();
  await field(card, "kg", 0).fill("2000");
  await field(card, "kg", 0).blur();
  await expect(plus).toBeDisabled();
  await minus.click();
  await expect(field(card, "kg", 0)).toHaveValue("1999.5");
  await card
    .getByRole("checkbox", { name: "Sem peso adicional", exact: true })
    .check();
  await expect(plus).toBeDisabled();
  await expect(minus).toBeDisabled();
  await card
    .getByRole("checkbox", { name: "Sem peso adicional", exact: true })
    .uncheck();
  await expect(plus).toBeEnabled();
  await page.reload();
  await page.locator(`[data-exercise="${CARD_ID}"] > summary`).click();
  await expect(
    field(page.locator(`[data-exercise="${CARD_ID}"]`), "kg", 0),
  ).toHaveValue("1999.5");
});

test("touch applies suggested weight without focusing a numeric input", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    baseURL: "http://127.0.0.1:4173",
  });
  try {
    const page = await context.newPage(),
      card = await openExerciseCard(page);
    await use(card, 0).tap();
    await expect(field(card, "kg", 0)).toHaveValue("13");
    await expect(field(card, "kg", 0)).not.toBeFocused();
    expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe(
      "INPUT",
    );
  } finally {
    await context.close();
  }
});

for (const width of [320, 600])
  test(`mobile series stay aligned without suggestions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1100 });
    const current = EMPTY_SETS();
    current[0] = { kg: 125.5, reps: 8, done: true };
    const card = await openExerciseCard(
      page,
      cardFixture({ history: false, currentSets: current }),
    );
    const assertLayout = async () => {
      const bounds = await card.boundingBox();
      for (const row of await card.locator(".set-row").all()) {
        const controls = await Promise.all([
          row.locator(".weight-stepper").boundingBox(),
          row.locator('[data-field="reps"]').boundingBox(),
          row.locator(".check-label").boundingBox(),
        ]);
        for (const box of controls) {
          expect(Math.abs(box.y - controls[0].y)).toBeLessThan(1);
          expect(box.x).toBeGreaterThanOrEqual(bounds.x);
          expect(box.x + box.width).toBeLessThanOrEqual(
            bounds.x + bounds.width,
          );
        }
        await expect(row.locator(".load-suggestion")).not.toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    };
    await assertLayout();
    await card
      .getByRole("checkbox", { name: "Sem peso adicional", exact: true })
      .check();
    await assertLayout();
    await expect(field(card, "kg", 0)).toHaveValue("125.5");
    await expect(field(card, "kg", 0)).toBeDisabled();
    await card
      .getByRole("checkbox", { name: "Sem peso adicional", exact: true })
      .uncheck();
    await expect(field(card, "kg", 0)).toBeEnabled();
    await expect(field(card, "kg", 0)).toHaveValue("125.5");
  });
