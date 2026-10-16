import { test, expect } from "@playwright/test";
import {
  newTeacherSample,
  sampleTeacherAction,
  sampleUnit,
} from "../../src/lib/teacher-sample";
import { studied, type LearningSession } from "../../src/lib/learning";

test("fixed Teacher sample covers instruction, help, practice, feedback, summary and handoff preview", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/teacher-sample");
  await expect(page.getByText("Teacher sample · fixed content")).toBeVisible();
  await page.getByRole("button", { name: "Accept plan & begin" }).click();
  await page.getByRole("button", { name: "Prepare this unit" }).click();
  await expect(
    page.getByRole("heading", { name: "A worked example" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explain another way" }).click();
  await expect(
    page.getByText("Fixed sample explanation:", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("1 help requests remain", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to practice" }).click();
  const items = page.locator(".practice-item");
  await items.nth(0).getByRole("button", { name: "Show hint" }).click();
  await items.nth(0).getByLabel("Only positions before the middle").check();
  await items.nth(0).getByRole("button", { name: "Submit answer" }).click();
  await expect(
    items.nth(0).getByText("Correct with hints", { exact: true }),
  ).toBeVisible();
  await items
    .nth(1)
    .getByLabel("Your reasoning")
    .fill("My visitor text has not been assessed. " + "LongWord".repeat(45));
  await page.reload();
  await expect(items.nth(1).getByLabel("Your reasoning")).toHaveValue(
    /My visitor text/,
  );
  await items.nth(1).getByRole("button", { name: "Submit answer" }).click();
  await expect(
    items.nth(1).getByText("Could not assess reliably", { exact: true }),
  ).toBeVisible();
  await expect(
    items
      .nth(1)
      .getByText("Your text has not been assessed.", { exact: false }),
  ).toBeVisible();
  await items.nth(1).getByRole("button", { name: "Reveal solution" }).click();
  await page.reload();
  await expect(
    items.nth(1).getByRole("heading", { name: "Worked review" }),
  ).toBeVisible();
  await expect(
    items.nth(1).getByRole("button", { name: "Submit answer" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Continue from this unit" }).click();
  await expect(
    page.getByRole("heading", { name: "What happened in this session." }),
  ).toBeVisible();
  await expect(
    page.getByText("0 independent correct · 2 assisted", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview teaching source" }).click();
  await page.getByRole("button", { name: "Extract checklist" }).click();
  await expect(
    page.getByRole("heading", { name: "Review the source checklist" }),
  ).toBeVisible();
  await expect(
    page.getByText("Sample handoff preview only.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/teacher-summary-${info.project.name}.png`,
    fullPage: true,
  });
});

test("saved Teacher room preserves answer through pending feedback, failure, retry and replay", async ({
  page,
}) => {
  let session: LearningSession = {
    ...newTeacherSample(),
    accepted: true,
    phase: "practice",
    units: [studied(sampleUnit.unit)],
  };
  let gradeCalls = 0;
  let release!: () => void;
  const waiting = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/learn**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { learning: session } });
    const a = route.request().postDataJSON();
    if (a.action === "submit") {
      gradeCalls++;
      session.units[0].attempts[1] = {
        ...session.units[0].attempts[1],
        answer: a.answer,
        state: "pending",
      };
      session.version++;
      await waiting;
      session.units[0].attempts[1].state = "failed";
      session.version++;
      return route.fulfill({
        json: {
          learning: session,
          error: "Provider timed out. The original answer is saved.",
        },
      });
    }
    if (a.action === "retry_grade") {
      gradeCalls++;
      session.units[0].attempts[1].state = "finished";
      session.units[0].attempts[1].feedback = {
        itemId: "halves_apply",
        status: "Partly correct",
        well: "You chose the first middle correctly.",
        gap: "The second interval still includes the checked middle.",
        next: "Set high to middle minus one and trace the remaining interval.",
      };
      session.version++;
      return route.fulfill({ json: { learning: session } });
    }
    session = sampleTeacherAction(session, a);
    return route.fulfill({ json: { learning: session } });
  });
  await page.goto("http://127.0.0.1:4174/?view=learning-room");
  const app = page.locator(".practice-item").nth(1);
  await app
    .getByLabel("Your reasoning")
    .fill("First middle = 2. Then I search positions 0 through 2.");
  await app.getByRole("button", { name: "Submit answer" }).click();
  await expect(
    page.getByText("Saving your answer and preparing feedback…"),
  ).toBeVisible();
  await expect(app.getByLabel("Your reasoning")).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText(
    "original answer is saved",
  );
  await page.reload();
  await expect(app.locator(".saved-answer")).toContainText("First middle = 2");
  await app
    .getByRole("button", { name: "Retry assessment of saved answer" })
    .click();
  await expect(
    app.getByRole("heading", { name: "Partly correct" }),
  ).toBeVisible();
  await expect(
    app.getByText("Set high to middle minus one", { exact: false }),
  ).toBeVisible();
  await app.getByText("This question seems wrong", { exact: true }).click();
  await app
    .getByLabel("Reason (optional)")
    .fill("The question could be clearer");
  await app.getByRole("button", { name: "Mark disputed and continue" }).click();
  await expect(
    app.getByText("Disputed — excluded", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue from this unit" }).click();
  await expect(
    page.getByRole("heading", { name: "What happened in this session." }),
  ).toBeVisible();
  await page.reload();
  expect(gradeCalls).toBe(2);
});

test("lost Teacher submission response recovers feedback without resubmission or answer loss", async ({
  page,
}) => {
  let session: LearningSession = {
    ...newTeacherSample(),
    accepted: true,
    phase: "practice",
    units: [studied(sampleUnit.unit)],
  };
  let calls = 0;
  await page.route("**/api/learn**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { learning: session } });
    calls++;
    const a = route.request().postDataJSON();
    session = sampleTeacherAction(session, a);
    return route.abort("failed");
  });
  await page.goto("http://127.0.0.1:4174/?view=learning-room");
  const check = page.locator(".practice-item").nth(0);
  await check.getByLabel("Only positions before the middle").check();
  await check.getByRole("button", { name: "Submit answer" }).click();
  await expect(
    check.getByRole("heading", { name: "Correct", exact: true }),
  ).toBeVisible();
  await expect(
    check.getByRole("button", { name: "Submit answer" }),
  ).toHaveCount(0);
  expect(calls).toBe(1);
});

test("Teacher plan shows editable scope and only regenerates on explicit request", async ({
  page,
}) => {
  let session = newTeacherSample();
  session.input.topic = "Java";
  session.plan = {
    ...session.plan!,
    interpretation:
      "Java the programming language: an introductory slice about variables, not the island or coffee.",
  };
  let calls = 0;
  await page.route("**/api/learn**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { learning: session } });
    calls++;
    const a = route.request().postDataJSON();
    if (a.action === "plan") {
      session.input = a.input;
      session.version++;
    } else session = sampleTeacherAction(session, a);
    return route.fulfill({ json: { learning: session } });
  });
  await page.goto("http://127.0.0.1:4174/?view=learning-room");
  await expect(
    page.getByText("Java the programming language:", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Topic", { exact: true }).fill("Java island geography");
  await page.getByLabel("Starting level").selectOption("refreshing");
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Generate revised plan" }).click();
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(
    "Java island geography",
  );
  expect(calls).toBe(1);
});

test("Teacher setup accepts topic-only input and private routes remain protected", async ({
  page,
}) => {
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/learn", (route) => {
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { learning: newTeacherSample() } });
  });
  await page.goto("http://127.0.0.1:4174/?view=learning-setup");
  await page.getByLabel("Topic", { exact: true }).fill("Binary search");
  await page.getByRole("button", { name: "Create learning session" }).click();
  await expect(page).toHaveURL(/\/learn\//);
  expect(saved?.input).toMatchObject({
    topic: "Binary search",
    notes: "",
    level: "new",
  });
  const response = await page.request.get("http://127.0.0.1:3000/api/learn");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  await page.goto("http://127.0.0.1:3000/learn/new");
  await expect(page).toHaveURL(/\/signin/);
});
