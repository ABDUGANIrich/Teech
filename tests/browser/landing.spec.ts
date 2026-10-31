import { expect, test } from "@playwright/test";

test("mode selector changes the whole page and preserves the selection in navigation", { tag: "@mobile" }, async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const selector = page.getByRole("navigation", { name: "Study mode" });
  const learn = selector.getByRole("link", { name: "Learn with Sage" });
  const teach = selector.getByRole("link", { name: "Teach Pip", exact: true });
  await expect(learn).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("img", { name: /Sage, your AI teacher/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Pip, your AI student/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Create course", exact: true }),
  ).toHaveAttribute("href", "/learn/new");
  const header = (await page.locator("header").boundingBox())!;
  const control = (await selector.boundingBox())!;
  const hero = (await page.locator(".landing").boundingBox())!;
  expect(control.y).toBeGreaterThanOrEqual(header.y + header.height);
  expect(control.y + control.height).toBeLessThanOrEqual(hero.y);

  await teach.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?mode=teach$/);
  await expect(teach).toHaveAttribute("aria-current", "page");
  await expect(learn).not.toHaveAttribute("aria-current");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Teach Pip");
  await expect(
    page.getByRole("img", { name: /Pip, your AI student/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Sage, your AI teacher/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Start teaching", exact: true }),
  ).toHaveAttribute("href", "/new");
  await expect(
    page.getByRole("link", { name: "Create course", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "A little research, when needed." }),
  ).toHaveCount(0);
  await page.reload();
  await expect(teach).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(learn).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("img", { name: /Sage, your AI teacher/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("mode switching works offline without navigation requests and preserves history", { tag: "@mobile" }, async ({
  page,
  context,
}) => {
  await page.goto("/?mode=learn&ref=sample#main", { waitUntil: "networkidle" });
  const selector = page.getByRole("navigation", { name: "Study mode" });
  const learn = selector.getByRole("link", { name: "Learn with Sage" });
  const teach = selector.getByRole("link", { name: "Teach Pip", exact: true });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Learn with Sage",
  );
  const navigationRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname === "/" &&
      (request.isNavigationRequest() || request.headers()["rsc"] === "1")
    ) {
      navigationRequests.push(request.url());
    }
  });
  const historyLength = await page.evaluate(() => history.length);
  await context.setOffline(true);
  try {
    await learn.click();
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    await teach.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Teach Pip",
      { timeout: 1000 },
    );
    await expect(teach).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveURL(/mode=teach&ref=sample#main$/);
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Learn with Sage",
    );
    await page.goForward();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Teach Pip",
    );
    for (let i = 0; i < 3; i++) {
      await learn.click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Learn with Sage",
        { timeout: 1000 },
      );
      await teach.click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Teach Pip",
        { timeout: 1000 },
      );
    }
    expect(navigationRequests).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});

test("both modes fit narrow and enlarged layouts with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  for (const width of [320, 520, 700, 887, 1000, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const mode of ["learn", "teach"]) {
      await page.goto(`/?mode=${mode}`);
      await page.getByRole("navigation", { name: "Study mode" }).waitFor();
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "125%";
      });
      const selector = page.getByRole("navigation", { name: "Study mode" });
      for (const link of await selector.getByRole("link").all()) {
        const box = (await link.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        page.locator(
          mode === "learn" ? ".teacher-eyes:visible" : ".student-eyes:visible",
        ),
      ).toHaveCSS("animation-name", "none");
      await expect(page.locator(".hero-scene")).toBeVisible();
      await expect(page.locator(".hero-copy, .compact-character")).toHaveCount(
        0,
      );
      const avatar = (await page
        .getByRole("img", {
          name:
            mode === "learn" ? /Sage, your AI teacher/ : /Pip, your AI student/,
        })
        .boundingBox())!;
      expect(avatar.width).toBeGreaterThanOrEqual(Math.min(200, width * 0.6));
      const action = (await page
        .locator(".hero-actions .button")
        .boundingBox())!;
      expect(action.y + action.height).toBeLessThanOrEqual(1000);
    }
  }
});

test("direct mode URLs and the Teacher room show the appropriate character", async ({
  page,
}) => {
  await page.goto("/?mode=teach");
  await expect(
    page.getByRole("img", { name: /Pip, your AI student/ }),
  ).toBeVisible();
  await page.goto("/?mode=unknown");
  await expect(
    page.getByRole("img", { name: /Sage, your AI teacher/ }),
  ).toBeVisible();
  await page.goto("/teacher-sample");
  await expect(page.getByText("SAGE · TEACHER", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: /Sage, your AI teacher/,
      includeHidden: true,
    }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("img", { name: /Pip, your AI teacher/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Accept outline & begin" }).click();
  await expect(
    page.getByRole("heading", { name: "A worked example" }),
  ).toBeVisible();
});
