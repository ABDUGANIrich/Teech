import { test, expect } from "@playwright/test";
import {
  sampleConcepts,
  sampleNotes,
  sampleTopic,
  newPreview,
} from "../../src/lib/sample";
test("sample: recover draft, reveal notes, three questions, review and compare retry", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/sample");
  await expect(page.getByText("Sample preview", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your source material" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `artifacts/teaching-room-${test.info().project.name}.png`,
    fullPage: true,
  });
  const draft =
    "The Sun warms water in the ocean. It evaporates and moves into the air, then cools into clouds and falls as rain.";
  await page.getByLabel("Your explanation", { exact: true }).fill(draft);
  await page.reload();
  await expect(
    page.getByLabel("Your explanation", { exact: true }),
  ).toHaveValue(draft);
  await page.getByRole("button", { name: "View notes" }).click();
  await expect(
    page.getByRole("heading", { name: "Your source material" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hide notes" }).click();
  await page.getByRole("button", { name: "Let’s talk about it" }).click();
  await expect(page.getByText("QUESTION 1 OF UP TO 3")).toBeVisible();
  await page.getByRole("button", { name: "I’m not sure" }).click();
  await expect(page.getByText("QUESTION 2 OF UP TO 3")).toBeVisible();
  await page
    .getByLabel("Your answer")
    .fill("Water vapor cools down and condenses into little drops.");
  await page.getByRole("button", { name: "Share my answer" }).click();
  await expect(page.getByText("QUESTION 3 OF UP TO 3")).toBeVisible();
  await page
    .getByLabel("Your answer")
    .fill("Some soaks into the ground and some flows down rivers.");
  await page.getByRole("button", { name: "Share my answer" }).click();
  await expect(
    page.getByRole("heading", { name: "Look at what came through." }),
  ).toBeVisible();
  await expect(
    page.getByText("Practiced with notes", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("These example statuses don’t evaluate what you wrote."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page
    .getByLabel("Your explanation", { exact: true })
    .fill(draft + " Plants also release water vapor from their leaves.");
  await page.getByRole("button", { name: "Review my explanation" }).click();
  await expect(
    page.getByText("Explanation-only attempt", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Previously:/)).toHaveCount(6);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("keyboard, mobile overflow, reduced motion and unconfigured auth", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/sample");
  await expect(page.getByRole("img", { name: /Pip/ })).toBeVisible();
  expect(
    await page
      .locator(".student-eyes")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page
    .getByLabel("Your explanation", { exact: true })
    .fill("x".repeat(2000));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/signin");
  await expect(page.getByText("Accounts aren’t configured yet.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
});
test("mocked editor: extraction failure preserves input; edit, add, remove and validate passages", async ({
  page,
}) => {
  let calls = 0;
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/teech", async (route) => {
    const data = route.request().postDataJSON();
    if (data.action === "extract") {
      calls++;
      await route.fulfill({
        json:
          calls === 1
            ? { error: "The AI provider is at capacity. Your writing is safe." }
            : { concepts: sampleConcepts },
      });
    } else if (data.action === "save") {
      saved = data;
      await route.fulfill({
        json: { error: "Mock save complete — held here for inspection." },
      });
    }
  });
  await page.goto("http://127.0.0.1:4174/");
  await page.getByLabel("Give your topic a name").fill("Water cycle practice");
  await page.getByLabel("Your study material").fill(sampleNotes);
  await page.getByRole("button", { name: "Find key concepts" }).click();
  await expect(page.getByRole("alert")).toContainText("capacity");
  await expect(page.getByLabel("Your study material")).toHaveValue(sampleNotes);
  await page.reload();
  await expect(page.getByLabel("Your study material")).toHaveValue(sampleNotes);
  await page.getByRole("button", { name: "Find key concepts" }).click();
  await expect(page.getByRole("group")).toHaveCount(6);
  await page
    .getByLabel("Concept title", { exact: true })
    .first()
    .fill("Liquid becomes vapor");
  await page.getByRole("button", { name: "Add concept" }).click();
  await expect(page.getByRole("group")).toHaveCount(7);
  await page.getByRole("button", { name: "Remove concept 7" }).click();
  await page
    .getByLabel("Exact supporting passage from your notes")
    .first()
    .fill("Invented quotation");
  await page.getByRole("button", { name: "Save topic" }).click();
  await expect(page.getByRole("alert")).toContainText("copied exactly");
  await page
    .getByLabel("Exact supporting passage from your notes")
    .first()
    .fill(sampleConcepts[0].excerpt);
  await page.getByRole("button", { name: "Save topic" }).click();
  await expect(page.getByRole("alert")).toContainText("Mock save complete");
  expect(saved?.title).toBe("Water cycle practice");
  expect((saved?.concepts as { title: string }[])[0].title).toBe(
    "Liquid becomes vapor",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("mocked live room: interrupted submission retains writing and idempotency key", async ({
  page,
}) => {
  const s = {
    ...newPreview(),
    id: "11111111-1111-4111-8111-111111111111",
    owner: "user:test-user",
    preview: undefined,
  };
  let attempts = 0;
  const keys: string[] = [];
  await page.route("**/api/teech**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: route.request().url().includes("session=")
          ? { session: s }
          : { sessions: [], topics: [] },
      });
    keys.push(route.request().postDataJSON().key);
    attempts++;
    if (attempts === 1) return route.abort("failed");
    return route.fulfill({
      json: { error: "Deterministic provider timeout. Your writing is safe." },
    });
  });
  await page.goto("http://127.0.0.1:4174/?view=room");
  const text =
    "Here is a sufficiently detailed explanation that should survive a failed request.";
  await page.getByLabel("Your explanation", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Let’s talk about it" }).click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await expect(
    page.getByLabel("Your explanation", { exact: true }),
  ).toHaveValue(text);
  await page.getByRole("button", { name: "Let’s talk about it" }).click();
  await expect(page.getByRole("alert")).toContainText("provider timeout");
  expect(keys[0]).toBe(keys[1]);
  await page.reload();
  await expect(
    page.getByLabel("Your explanation", { exact: true }),
  ).toHaveValue(text);
});
test("mocked library: confirm deletion and retain topic when cancelled", async ({
  page,
}) => {
  let deleted = false;
  await page.route("**/api/teech", async (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { topics: [sampleTopic], sessions: [] } });
    deleted = true;
    return r.fulfill({ json: { deleted: true } });
  });
  await page.goto("http://127.0.0.1:4174/?view=library");
  await page.getByRole("button", { name: "Delete The water cycle" }).click();
  await expect(page.getByRole("alert")).toContainText("permanently");
  await page.getByRole("button", { name: "Keep it" }).click();
  expect(deleted).toBe(false);
  await page.getByRole("button", { name: "Delete The water cycle" }).click();
  await page.getByRole("button", { name: "Delete topic", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "A little room for your next big idea.",
    }),
  ).toBeVisible();
  expect(deleted).toBe(true);
});
