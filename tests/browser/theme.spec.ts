import { expect, test, type Locator } from "@playwright/test";

async function expectColor(target: Locator, property: string, color: string) {
  const expected = await target.evaluate(
    (_element, { property, color }) => {
      const probe = document.createElement("span");
      probe.style.setProperty(property, `var(--color-${color})`);
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      return resolved;
    },
    { property, color },
  );
  await expect(target).toHaveCSS(property, expected);
}

for (const theme of ["light", "dark"] as const) {
  test(`uses the ${theme} system theme across pages and reloads`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(theme);
    await expect(page.locator("html")).toHaveCSS("color-scheme", theme);
    await expectColor(
      page.locator("body"),
      "background-color",
      theme === "dark" ? "mist-900" : "stone-50",
    );
    await expectColor(
      page.locator(".hero-scene"),
      "background-color",
      theme === "dark" ? "olive-800" : "taupe-100",
    );
    await expect(
      page.getByRole("button", { name: /theme|dark mode|light mode/i }),
    ).toHaveCount(0);

    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Pip sample", exact: true })
      .click();
    await expect(
      page.getByLabel("Your explanation", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveClass(theme);
    await expectColor(
      page.locator(".writing-card"),
      "background-color",
      theme === "dark" ? "neutral-800" : "white",
    );
    await page.reload();
    await expect(page.locator("html")).toHaveClass(theme);
    expect(errors).toEqual([]);
  });
}

test("tracks system changes without losing the current explanation", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/sample");
  const explanation = page.getByLabel("Your explanation", { exact: true });
  await explanation.fill("The Sun warms water and causes evaporation.");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass("dark");
  await expect(explanation).toHaveValue(
    "The Sun warms water and causes evaporation.",
  );
  await explanation.focus();
  await expectColor(explanation, "outline-color", "olive-300");

  await page.goto("/teacher-sample");
  await page.getByRole("button", { name: "Accept outline & begin" }).click();
  await expectColor(
    page.locator(".learning-outcome"),
    "background-color",
    "olive-800",
  );
  await page.getByRole("button", { name: "Continue to practice" }).click();
  await expectColor(
    page.getByLabel("Your reasoning"),
    "background-color",
    "neutral-800",
  );
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass("light");
  await expectColor(
    page.getByLabel("Your reasoning"),
    "background-color",
    "white",
  );
});
