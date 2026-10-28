import { defaults, KEY } from "../../lib/core.js";
export const CARD_ID = "leg-curl";
export const CARD_DATE = "2026-10-28";
export const EMPTY_SETS = () =>
  Array.from({ length: 3 }, () => ({ kg: "", reps: "", done: false }));
export function cardFixture({
  history = true,
  percent = 5,
  previousSets,
  currentSets,
  noWeight = false,
} = {}) {
  const data = defaults();
  data.settings.loadProgression = percent;
  if (history)
    data.sessions["2026-10-21"] = {
      type: "lower",
      done: true,
      sets: {
        [CARD_ID]:
          previousSets ??
          [12, 16, 16].map((kg) => ({ kg, reps: 8, done: true })),
      },
      run: null,
    };
  if (currentSets || noWeight)
    data.sessions[CARD_DATE] = {
      type: "lower",
      done: false,
      sets: { [CARD_ID]: currentSets ?? EMPTY_SETS() },
      withoutWeight: { [CARD_ID]: noWeight },
      run: null,
    };
  return data;
}
export async function openExerciseCard(page, data = cardFixture()) {
  await page.clock.setFixedTime(new Date("2026-10-28T15:00:00-03:00"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(
    ({ key, data }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(data));
    },
    { key: KEY, data },
  );
  await page.goto("/#hoje");
  const card = page.locator(`[data-exercise="${CARD_ID}"]`);
  await card.locator(":scope > summary").click();
  await card.locator(".exercise-body").waitFor({ state: "visible" });
  return card;
}
