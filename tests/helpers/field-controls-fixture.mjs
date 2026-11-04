import { expect } from "@playwright/test";

export async function choose(locator, value) {
  const field = await locator.evaluate((element, desired) => {
    const native =
      element.tagName === "SELECT"
        ? element
        : document.getElementById(element.dataset.controlFor);
    return {
      id: native.id,
      text: [...native.options].find((option) => option.value === desired)
        ?.textContent,
    };
  }, value);
  const page = locator.page();
  await page.locator(`[data-control-for="${field.id}"]`).click();
  await page.getByRole("option", { name: field.text, exact: true }).click();
}

export async function enterDate(locator, value) {
  const id = await locator.evaluate(
    (element) => element.dataset.controlFor || element.id,
  );
  const display = locator.page().locator(`[data-control-for="${id}"]`);
  await display.fill(
    value.includes("-") ? value.split("-").reverse().join("/") : value,
  );
  await display.press("Enter");
  await expect(display).toHaveValue(
    value.includes("-") ? value.split("-").reverse().join("/") : value,
  );
}
