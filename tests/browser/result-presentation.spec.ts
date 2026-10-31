import { expectReadableText } from "./helpers/readability";
import { expect, test } from "@playwright/test";
import {
  newTeacherSample,
  sampleTeacherAction,
  sampleUnit,
} from "../../src/lib/teacher-sample";
import {
  SIMPLIFY_LESSON_QUESTION,
  type LearningSession,
} from "../../src/lib/learning";
import { newPreview, fixtureReview } from "../../src/lib/sample";

function instruction(): LearningSession {
  const s = structuredClone(
    sampleTeacherAction(
      sampleTeacherAction(newTeacherSample(), { action: "accept" }),
      { action: "generate" },
    ),
  );
  delete s.units[0].content.essentials;
  return s;
}
async function mockCourse(
  page: import("@playwright/test").Page,
  session: LearningSession,
) {
  await page.route("**/api/learn**", (route) =>
    route.fulfill({ json: { learning: session } }),
  );
  await page.goto("http://127.0.0.1:4174/?view=learning-room");
}

test(
  "course outline has visible lists, separated scope and an actionable route",
  { tag: "@mobile" },
  async ({ page }, info) => {
    await mockCourse(page, newTeacherSample());
    const plan = page.locator(".course-plan");
    await expect(
      plan.getByRole("heading", { name: "Your course outline" }),
    ).toBeVisible();
    await expect(plan.locator("ul").first()).toHaveCSS(
      "list-style-type",
      "disc",
    );
    await expect(plan.locator(".plan-units li")).toHaveCount(1);
    await expect(plan.getByText("Will cover", { exact: true })).toBeVisible();
    await expect(
      plan.getByText("For another time", { exact: true }),
    ).toBeVisible();
    await expect(
      plan.getByRole("button", { name: "Accept outline & begin" }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath("course-outline.png"),
      fullPage: true,
    });
  },
);

test(
  "saved plain lessons keep paragraph rhythm, definitions and readable code in both themes",
  { tag: "@mobile" },
  async ({ page }, info) => {
    const session = instruction();
    const code =
      "  const example = '" +
      "long_identifier_".repeat(30) +
      "';\n  return example;";
    session.units[0].content.explanation.push({ kind: "code", text: code });
    await mockCourse(page, session);
    const lesson = page.locator(".lesson-blocks").first();
    await expect(lesson.locator(":scope > p")).toHaveCount(3);
    const spacing = await lesson
      .locator(":scope > p")
      .nth(1)
      .evaluate((p) => parseFloat(getComputedStyle(p).marginTop));
    expect(spacing).toBeGreaterThanOrEqual(16);
    await page.getByText("Terms in this lesson", { exact: false }).click();
    await expect(page.locator(".result-definitions dt").first()).toHaveText(
      "Sorted",
    );
    await expect(page.locator(".result-definitions dd").first()).toContainText(
      "increasing order",
    );
    await expect(
      page.getByLabel("Equation: middle = floor((low + high) / 2)", {
        exact: true,
      }),
    ).toBeVisible();
    const pre = lesson.getByLabel("Code", { exact: true });
    await expect(pre.locator("code")).toHaveText(code);
    await expect(pre).toHaveAttribute("tabindex", "0");
    await expect(pre).toHaveCSS("overflow-x", "auto");
    expect(
      await pre.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(true);
    await pre.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => pre.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) =>
          document.documentElement.classList.toggle("dark", value === "dark"),
        theme,
      );
      await expectReadableText(lesson.locator(":scope > p, .result-code code"));
      await page.evaluate(
        (value) =>
          document.documentElement.classList.toggle("dark", value === "dark"),
        theme,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: info.outputPath(`lesson-${theme}.png`),
        fullPage: true,
      });
    }
  },
);

test(
  "structured results support Markdown, tables, ordered rules and exact code copying safely",
  { tag: "@mobile" },
  async ({ page }, info) => {
    const s = instruction();
    const code =
      "const midpoint = Math.floor((low + high) / 2);\n  return midpoint;";
    s.units[0].content.explanation = [
      {
        kind: "paragraph",
        text: "### Keep one invariant\n\nMaintain a **sorted interval** and compare `middle` before moving a bound.\n\nA second paragraph explains why.",
      },
      {
        kind: "list",
        text: "1. Compare the target.\n2. Discard the checked half.\n3. Repeat.",
      },
      {
        kind: "paragraph",
        text: "| Comparison | Next interval |\n| --- | --- |\n| target < middle | low … middle − 1 |\n| target > middle | middle + 1 … high |",
      },
      {
        kind: "paragraph",
        text: "[Unsafe link](javascript:alert(1))\n\n<img src=x onerror=alert(1)>\n\n![Remote image](https://example.com/tracking.png)\n\n[Reference](https://example.com/guide)",
      },
      { kind: "code", text: code },
      { kind: "paragraph", text: "```js\nconst label = 'A';\n```" },
    ];
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (value: string) => {
            (window as unknown as { copiedText: string }).copiedText = value;
          },
        },
        configurable: true,
      }),
    );
    await mockCourse(page, s);
    const lesson = page.locator(".lesson-blocks").first();
    await expect(lesson.locator("strong")).toHaveText("sorted interval");
    await expect(lesson.locator("ol > li")).toHaveCount(3);
    await expect(lesson.locator("ol")).toHaveCSS("list-style-type", "decimal");
    await expect(lesson.getByRole("table")).toBeVisible();
    await expect(
      lesson.locator("img, script, [onerror], a[href^='javascript:']"),
    ).toHaveCount(0);
    await expect(
      lesson.getByRole("link", { name: "Reference" }),
    ).toHaveAttribute("rel", "noreferrer noopener");
    await expect(lesson.locator(".result-code")).toHaveCount(2);
    await lesson.getByRole("button", { name: "Copy code" }).first().click();
    await expect(lesson.getByText("Copied", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { copiedText: string }).copiedText,
      ),
    ).toBe(code);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath("formatted-lesson.png"),
      fullPage: true,
    });
  },
);

test(
  "new lessons lead with a self-contained idea and example, with depth available on demand",
  { tag: "@mobile" },
  async ({ page }, info) => {
    const s = instruction();
    s.units[0].content.essentials = structuredClone(
      sampleUnit.unit.essentials!,
    );
    let posts = 0;
    page.on("request", (r) => {
      if (r.method() === "POST") posts++;
    });
    await mockCourse(page, s);
    await expect(
      page.getByRole("heading", { name: "The idea", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".lesson-points > ul > li")).toHaveCount(4);
    await expect(page.locator(".lesson-idea .teech-prose")).toHaveText(
      s.units[0].content.essentials!.idea,
    );
    for (const [
      index,
      point,
    ] of s.units[0].content.essentials!.points.entries()) {
      await expect(
        page.locator(".lesson-points > ul > li").nth(index),
      ).toHaveText(point);
    }
    await expect(
      page.getByRole("heading", { name: "A worked example" }),
    ).toBeVisible();
    await expect(page.locator(".lesson-deeper .lesson-blocks")).toBeHidden();
    await expect(page.locator(".result-definitions")).toBeHidden();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) =>
          document.documentElement.classList.toggle("dark", value === "dark"),
        theme,
      );
      await expectReadableText(page.locator(".lesson-panel .teech-prose"));
      const backgrounds = await page
        .locator(".lesson-panel")
        .evaluateAll((cards) =>
          cards.map((card) => getComputedStyle(card).backgroundColor),
        );
      expect(backgrounds).toHaveLength(4);
      expect(new Set(backgrounds).size).toBe(4);
      expect(backgrounds).not.toContain("rgba(0, 0, 0, 0)");
      const markerContrast = await page
        .locator(".lesson-points > ul > li")
        .first()
        .evaluate((item) => {
          const rgb = (color: string) => color.match(/[\d.]+/g)!.map(Number);
          const fg = rgb(getComputedStyle(item, "::before").color);
          const overlay = rgb(getComputedStyle(item).backgroundColor);
          const base = rgb(
            getComputedStyle(item.closest(".lesson-points")!).backgroundColor,
          );
          const alpha = overlay[3] ?? 1;
          const bg = base
            .slice(0, 3)
            .map((v, i) => overlay[i] * alpha + v * (1 - alpha));
          const luminance = (channels: number[]) =>
            channels.slice(0, 3).reduce((sum, value, i) => {
              const c = value / 255;
              return (
                sum +
                (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) *
                  [0.2126, 0.7152, 0.0722][i]
              );
            }, 0);
          const a = luminance(fg),
            b = luminance(bg);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });
      expect(markerContrast).toBeGreaterThanOrEqual(4.5);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: info.outputPath(`lesson-cards-${theme}.png`),
        fullPage: true,
      });
    }
    await page.getByText("Go a little deeper", { exact: true }).click();
    await expect(page.locator(".lesson-deeper .lesson-blocks")).toBeVisible();
    await page.getByText("Terms in this lesson", { exact: false }).click();
    await expect(page.locator(".result-definitions")).toBeVisible();
    expect(posts).toBe(0);
  },
);

test("shortening a saved lesson survives a lost response and reload without changing its practice", async ({
  page,
}) => {
  let s = instruction();
  const questions = structuredClone(s.units[0].content.questions);
  let posts = 0;
  await page.route("**/api/learn**", (route) => {
    if (route.request().method() === "POST") {
      posts++;
      expect(route.request().postDataJSON()).toMatchObject({
        action: "help",
        question: SIMPLIFY_LESSON_QUESTION,
      });
      s = sampleTeacherAction(s, {
        action: "help",
        question: SIMPLIFY_LESSON_QUESTION,
      });
      return route.abort("failed");
    }
    return route.fulfill({ json: { learning: s } });
  });
  await page.goto("http://127.0.0.1:4174/?view=learning-room");
  await page.getByRole("button", { name: "Make this easier to read" }).click();
  await expect(
    page.getByRole("heading", { name: "The essentials", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".lesson-deeper .lesson-blocks")).toBeHidden();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The essentials", exact: true }),
  ).toBeVisible();
  expect(s.helpUsed).toBe(1);
  expect(s.units[0].content.questions).toEqual(questions);
  expect(posts).toBe(1);
});

test(
  "Pip review separates feedback with colored cards while preserving exact evidence",
  { tag: "@mobile" },
  async ({ page }, info) => {
    const session = newPreview();
    session.id = "11111111-1111-4111-8111-111111111111";
    session.phase = "review";
    session.messages = [
      { role: "user", text: "Keep **my original wording** exactly." },
    ];
    session.evaluation = fixtureReview(session);
    session.evaluation.results[0].userExcerpt = session.messages[0].text;
    session.evaluation.results[4].status = "Needs correction";
    session.evaluation.results[4].claimType = "contradiction";
    await page.route("**/api/teech**", (route) =>
      route.fulfill({
        json: route.request().url().includes("session=")
          ? { session }
          : { sessions: [], nextCursor: null },
      }),
    );
    await page.goto("http://127.0.0.1:4174/?view=room");
    await expect(
      page.getByRole("heading", { name: "What came through", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "A little more attention",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".concept-results > article")).toHaveCount(
      session.concepts.length,
    );
    const card = page.locator(".concept-results > article").first();
    await expect(
      card.locator(".evidence-grid > div").first().locator("blockquote"),
    ).toHaveText(session.messages[0].text);
    await expect(
      card.locator(".evidence-grid > div").nth(1).locator("blockquote"),
    ).toHaveText(session.evaluation.results[0].sourceExcerpt!);
    await expect(card.locator("blockquote strong")).toHaveCount(0);
    await expect(card.getByText("Next step", { exact: true })).toBeVisible();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) =>
          document.documentElement.classList.toggle("dark", value === "dark"),
        theme,
      );
      await expectReadableText(
        page.locator(
          ".pip-panel .teech-prose, .concept-results .status, .evidence-grid blockquote",
        ),
      );
      const colors = await page
        .locator(
          ".pip-strengths, .pip-revisit, .concept-results > article:first-child, .concept-results > article:first-child .evidence-grid > div",
        )
        .evaluateAll((cards) =>
          cards.map((c) => getComputedStyle(c).backgroundColor),
        );
      expect(new Set(colors).size).toBe(5);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page
        .locator(".review-insights")
        .screenshot({ path: info.outputPath(`pip-overview-${theme}.png`) });
      await card.screenshot({
        path: info.outputPath(`pip-concept-${theme}.png`),
      });
    }
  },
);
