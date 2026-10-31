import { expect, test } from "@playwright/test";

test(
  "rem sizing follows the user's text size",
  { tag: "@mobile" },
  async ({ page }) => {
    await page.goto("/sample");
    const metrics = () =>
      page.locator(".brand-icon").evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        fontSize: parseFloat(getComputedStyle(document.body).fontSize),
      }));
    const before = await metrics();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "125%";
    });
    const after = await metrics();
    expect(after.width / before.width).toBeCloseTo(1.25);
    expect(after.fontSize / before.fontSize).toBeCloseTo(1.25);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  },
);
