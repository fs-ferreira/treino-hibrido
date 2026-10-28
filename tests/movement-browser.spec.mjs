import { test, expect } from "@playwright/test";
import fs from "node:fs";
const kinds = [
  "lateral",
  "incline",
  "bentrow",
  "extension",
  "pulldown",
  "pushdown",
  "calfseated",
  "hinge",
  "split",
  "fly",
  "cablefly",
  "row",
  "curl",
  "preacher",
  "legcurl",
  "adductor",
  "calf",
  "press",
  "overhead",
  "crunch",
  "reverse",
];
test.beforeEach(async ({ page }) => {
  await page.goto("/test-results/movements.html");
  await page.waitForFunction(() => Boolean(window.movementLab));
});
for (const width of [390, 1280])
  test(`21 triptychs and continuous cycles at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install();
    await page.locator("#lab-loop").uncheck();
    for (const kind of kinds) {
      await page.locator("#lab-kind").selectOption(kind);
      await expect(page.locator("#lab-diagnostics")).toHaveAttribute(
        "data-invalid",
        "false",
      );
      const review = page.locator(`[data-review-kind="${kind}"]`);
      await expect(review.locator("svg")).toHaveCount(3);
      await review.screenshot({
        path: testInfo.outputPath(`${kind}-${width}.png`),
      });
      await page.locator("#lab-play").click();
      await page.clock.runFor(6200);
      await expect(page.locator("#lab-status")).toHaveText("Ciclo concluído");
      await expect(page.locator("#lab-diagnostics")).toHaveAttribute(
        "data-invalid",
        "false",
      );
    }
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

test("isolated objects, skeleton, anchors, axes and reduced motion", async ({
  page,
}) => {
  await page.locator("#lab-mode").selectOption("object");
  for (const kind of [
    "dumbbell",
    "bar",
    "bench",
    "platform",
    "lever",
    "cable1",
    "cable2",
    "rope",
  ]) {
    await page.locator("#lab-object").selectOption(kind);
    await page.locator("#lab-phase").fill("73");
    await page.locator("#lab-phase").dispatchEvent("input");
    await expect(page.locator("#lab-diagnostics")).toHaveAttribute(
      "data-invalid",
      "false",
    );
  }
  await page.locator("#lab-mode").selectOption("body");
  await page.locator("#lab-anchors").check();
  await page.locator("#lab-axes").check();
  await expect(page.locator("#lab-stage .scene-debug")).toHaveCount(1);
  await expect(page.locator("#lab-stage [data-object]")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("#lab-play")).toBeDisabled();
  await page.locator("#lab-phase").fill("100");
  await page.locator("#lab-phase").dispatchEvent("input");
  await expect(page.locator("#lab-phase-value")).toHaveText("100%");
});

test("production guide player keeps pause, restart, steps and disposal", async ({
  page,
}) => {
  await page.clock.install();
  await page.evaluate(async () => {
    const [{ illustration }, { exercises }, { createMovementPlayer }] =
      await Promise.all([
        import("/lib/diagrams.js"),
        import("/lib/exercises.js"),
        import("/lib/movement-player.js"),
      ]);
    document.body.innerHTML = illustration(
      Object.values(exercises).find((e) => e.diagram === "pulldown"),
    );
    window.disposePlayer = createMovementPlayer(
      document.querySelector(".movement-guide"),
    );
  });
  await page.locator('[data-motion="open"]').click();
  await page.locator('[data-motion="play"]').click();
  await page.clock.runFor(1600);
  await page.locator('[data-motion="pause"]').click();
  const markup = await page.locator(".motion-stage").innerHTML();
  await page.clock.runFor(1000);
  expect(await page.locator(".motion-stage").innerHTML()).toBe(markup);
  await page.locator('[data-motion="end"]').click();
  await expect(page.locator(".motion-status")).toHaveText("Final");
  await page.locator('[data-motion="reset"]').click();
  await expect(page.locator(".motion-status")).toHaveText("Início");
  await page.locator('[data-motion="play"]').click();
  await page.clock.runFor(6200);
  await expect(page.locator(".motion-status")).toContainText("Ciclo concluído");
  await page.locator('[data-motion="play"]').click();
  await page.evaluate(() => window.disposePlayer());
  const closed = await page.locator(".motion-stage").innerHTML();
  await page.clock.runFor(2000);
  expect(await page.locator(".motion-stage").innerHTML()).toBe(closed);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(async () => {
    const { createMovementPlayer } = await import("/lib/movement-player.js");
    window.disposePlayer = createMovementPlayer(
      document.querySelector(".movement-guide"),
    );
  });
  await page.locator('[data-motion="open"]').click();
  await expect(page.locator(".motion-controls")).toBeHidden();
  await page.locator('[data-motion="middle"]').click();
  await expect(page.locator(".motion-status")).toHaveText("Meio");
});

test("single active scene calculation, SVG and layout stay below 16ms at p95", async ({
  page,
}, testInfo) => {
  const result = await page.evaluate(async (kinds) => {
    const samples = [],
      stage = document.querySelector("#lab-stage");
    for (const kind of kinds) window.movementLab.evaluateMovement(kind, 0.5);
    for (const kind of kinds)
      for (let i = 0; i <= 100; i++) {
        const start = performance.now(),
          frame = window.movementLab.evaluateMovement(kind, i / 100);
        stage.innerHTML = window.movementLab.drawScene(
          frame,
          "perf",
          "Movimento",
        );
        stage.getBoundingClientRect();
        samples.push(performance.now() - start);
      }
    samples.sort((a, b) => a - b);
    return {
      frames: samples.length,
      p50: samples[Math.floor(samples.length * 0.5)],
      p95: samples[Math.floor(samples.length * 0.95)],
      maximum: samples.at(-1),
      userAgent: navigator.userAgent,
    };
  }, kinds);
  fs.writeFileSync(
    testInfo.outputPath("performance.json"),
    JSON.stringify(result, null, 2),
  );
  console.log("Movement performance", JSON.stringify(result));
  expect(result.p95).toBeLessThan(16);
});
