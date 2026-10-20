import { expect, test } from "@playwright/test";

test("rem sizing follows the user's text size", async ({ page }) => {
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
});

test("responsive controls and reduced motion survive the utility migration", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sample");
  await expect(page.locator(".student-eyes")).toHaveCSS(
    "animation-name",
    "none",
  );
  const notes = page.getByRole("button", { name: "View notes" });
  const mobile = (page.viewportSize()?.width ?? 0) < 700;
  const fontSize = await notes.evaluate((element) =>
    parseFloat(getComputedStyle(element).fontSize),
  );
  if (mobile) {
    expect(fontSize).toBe(0);
    expect((await notes.boundingBox())!.width).toBeLessThan(50);
  } else expect(fontSize).toBeGreaterThan(0);
  await notes.click();
  await expect(page.locator("#source-notes")).toBeVisible();
  for (const route of ["/", "/sample", "/teacher-sample", "/signin"]) {
    await page.goto(route);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
