import { test, expect } from "@playwright/test";
import {
  newTeacherSample,
  sampleTeacherAction,
  sampleUnit,
} from "../../src/lib/teacher-sample";
import { event, studied, type LearningSession } from "../../src/lib/learning";

function emptyLesson(): LearningSession {
  return { ...newTeacherSample(), phase: "setup", plan: null, planHistory: [] };
}
function plannedLesson(s: LearningSession): LearningSession {
  const next = {
    ...s,
    version: s.version + 1,
    phase: "plan" as const,
    plan: newTeacherSample().plan,
  };
  event(next, "plan");
  return next;
}

test("unit preparation starts once, stops after failure and retries explicitly", async ({
  page,
}) => {
  let session = sampleTeacherAction(newTeacherSample(), { action: "accept" });
  let generates = 0;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/learn**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { learning: session } });
    expect(route.request().postDataJSON().action).toBe("generate");
    generates++;
    if (generates === 1) {
      await waiting;
      session = {
        ...session,
        version: session.version + 1,
        providerAttempts: 1,
        preparingUnit: "halves",
      };
      return route.fulfill({
        json: {
          learning: session,
          error: "Provider timed out. Your course is saved.",
        },
      });
    }
    session = sampleTeacherAction(session, { action: "generate" });
    delete session.preparingUnit;
    return route.fulfill({ json: { learning: session } });
  });
  await page.goto("http://127.0.0.1:4174/?view=learning-room");
  await expect(
    page.getByText("Preparing your unit…", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Prepare this unit" }),
  ).toHaveCount(0);
  expect(generates).toBe(1);
  release();
  await expect(page.getByRole("alert")).toContainText("Provider timed out");
  await expect(
    page.getByRole("button", { name: "Retry preparing unit" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Reload saved course" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(generates).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry preparing unit" }),
  ).toBeEnabled();
  expect(generates).toBe(1);
  await page.getByRole("button", { name: "Retry preparing unit" }).click();
  await expect(
    page.getByRole("heading", { name: "A worked example" }),
  ).toBeVisible();
  expect(generates).toBe(2);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A worked example" }),
  ).toBeVisible();
  expect(generates).toBe(2);
});

test("lost automatic unit response recovers saved content without regenerating", async ({
  page,
}) => {
  let session = sampleTeacherAction(newTeacherSample(), { action: "accept" });
  let generates = 0;
  await page.route("**/api/learn**", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { learning: session } });
    generates++;
    session = sampleTeacherAction(session, { action: "generate" });
    return route.abort("failed");
  });
  await page.goto("http://127.0.0.1:4174/?view=learning-room");
  await expect(
    page.getByRole("heading", { name: "A worked example" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(generates).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A worked example" }),
  ).toBeVisible();
  expect(generates).toBe(1);
});

test("advancing prepares the next unit automatically while revisits reuse saved content", async ({
  page,
}) => {
  let session = sampleTeacherAction(newTeacherSample(), { action: "accept" });
  session.plan!.units.push({
    ...session.plan!.units[0],
    id: "second",
    title: "A second unit",
  });
  const generated: number[] = [];
  await page.route("**/api/learn**", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { learning: session } });
    const a = route.request().postDataJSON();
    if (a.action === "generate") {
      generated.push(session.active);
      session = {
        ...session,
        version: session.version + 1,
        units: [
          ...session.units,
          studied({
            ...sampleUnit.unit,
            id: session.plan!.units[session.active].id,
          }),
        ],
      };
    } else if (a.action === "next") {
      session = {
        ...session,
        active: 1,
        phase: "learning",
        completed: ["halves"],
        version: session.version + 1,
      };
    } else session = sampleTeacherAction(session, a);
    return route.fulfill({ json: { learning: session } });
  });
  await page.goto("http://127.0.0.1:4174/?view=learning-room");
  await page.getByRole("button", { name: "Continue to practice" }).click();
  await page.getByRole("button", { name: "Continue from this unit" }).click();
  await expect(
    page.getByRole("heading", { name: "A second unit" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A worked example" }),
  ).toBeVisible();
  expect(generated).toEqual([0, 1]);
  await page.getByRole("button", { name: "Revisit unit 1" }).click();
  await expect(
    page.getByRole("heading", { name: "A worked example" }),
  ).toBeVisible();
  expect(generated).toEqual([0, 1]);
});

test("automatic preparation respects the lesson AI cap", async ({ page }) => {
  const session = {
    ...sampleTeacherAction(newTeacherSample(), { action: "accept" }),
    providerAttempts: 22,
  };
  let writes = 0;
  await page.route("**/api/learn**", (route) => {
    if (route.request().method() !== "GET") writes++;
    return route.fulfill({ json: { learning: session } });
  });
  await page.goto("http://127.0.0.1:4174/?view=learning-room");
  await expect(
    page.getByText("this unit needs more AI allowance", { exact: false }),
  ).toBeVisible();
  expect(writes).toBe(0);
  await expect(
    page.getByRole("button", { name: "Retry preparing unit" }),
  ).toHaveCount(0);
});

test("fixed Sage sample covers instruction, help, practice, feedback, summary and handoff preview", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/teacher-sample");
  await expect(page.getByText("Sage sample · fixed content")).toBeVisible();
  await page.getByRole("button", { name: "Accept outline & begin" }).click();
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
    page.getByRole("heading", { name: "Your course review." }),
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
    page.getByRole("heading", { name: "Your course review." }),
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
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByText("Connection restored.", { exact: false }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "Revise outline" }).click();
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(
    "Java island geography",
  );
  expect(calls).toBe(1);
});

test("Teacher setup saves and plans in one submission, leaving acceptance explicit", async ({
  page,
}) => {
  let session = emptyLesson();
  const actions: string[] = [];
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/learn**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { learning: session } });
    const body = route.request().postDataJSON();
    actions.push(body.action);
    if (body.action === "create") session.input = body.input;
    if (body.action === "plan") {
      expect(body.id).toBe(session.id);
      expect(body.version).toBe(session.version);
      expect(body.input).toEqual(session.input);
      await waiting;
      session = plannedLesson(session);
    }
    if (["accept", "generate"].includes(body.action))
      session = sampleTeacherAction(session, body);
    return route.fulfill({ json: { learning: session } });
  });
  await page.goto("http://127.0.0.1:4174/?view=learning-setup");
  await page.getByLabel("Topic", { exact: true }).fill("Binary search");
  await page.getByLabel("Starting level").selectOption("basics");
  await page
    .getByLabel("Learning goal (optional)")
    .fill("Trace an interval by hand");
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page.getByRole("status")).toContainText("Your setup is saved");
  await expect(
    page.getByRole("button", { name: "Creating course…" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Topic", { exact: true })).toBeDisabled();
  await page.locator("form").dispatchEvent("submit");
  expect(actions).toEqual(["create", "plan"]);
  release();
  await expect(page).toHaveURL(/\/learn\//);
  await expect(
    page.getByRole("button", { name: "Accept outline & begin" }),
  ).toBeVisible();
  expect(session.input).toEqual({
    topic: "Binary search",
    notes: "",
    level: "basics",
    goal: "Trace an interval by hand",
  });
  expect(session.accepted).toBe(false);
  expect(actions).toEqual(["create", "plan"]);
  await page.getByRole("button", { name: "Accept outline & begin" }).click();
  await expect(
    page.getByRole("heading", { name: "A worked example" }),
  ).toBeVisible();
  expect(actions).toEqual(["create", "plan", "accept", "generate"]);
  const response = await page.request.get("http://127.0.0.1:3000/api/learn");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  await page.goto("http://127.0.0.1:3000/learn/new");
  await expect(page).toHaveURL(/\/signin/);
});

test("failed initial planning retains every input and retries the same saved lesson after reload", async ({
  page,
}) => {
  let session = emptyLesson();
  let creates = 0;
  let plans = 0;
  await page.route("**/api/learn**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { learning: session } });
    const body = route.request().postDataJSON();
    if (body.action === "create") {
      creates++;
      session.input = body.input;
      session.policy = "notes";
    } else if (body.action === "plan") {
      plans++;
      expect(body.id).toBe(session.id);
      expect(body.version).toBe(session.version);
      session.version++;
      if (plans === 1)
        return route.fulfill({
          json: {
            learning: session,
            error: "AI provider timed out. Your setup is saved.",
          },
        });
      session = plannedLesson(session);
    }
    return route.fulfill({ json: { learning: session } });
  });
  await page.goto("http://127.0.0.1:4174/?view=learning-setup");
  await page.getByLabel("Topic", { exact: true }).fill("Binary search");
  await page.getByLabel("Starting level").selectOption("refreshing");
  await page
    .getByLabel("Learning goal (optional)")
    .fill("Review sorted intervals");
  await page
    .getByLabel("Notes (optional", { exact: false })
    .fill("Search a sorted list by repeatedly choosing a middle position.");
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page.getByRole("alert")).toContainText("AI provider timed out");
  await expect(
    page.getByRole("link", { name: "open the saved course" }),
  ).toHaveAttribute("href", `/learn/${session.id}`);
  expect(creates).toBe(1);
  expect(plans).toBe(1);
  await page.reload();
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(
    "Binary search",
  );
  await expect(page.getByLabel("Starting level")).toHaveValue("refreshing");
  await expect(page.getByLabel("Learning goal (optional)")).toHaveValue(
    "Review sorted intervals",
  );
  await expect(
    page.getByLabel("Notes (optional", { exact: false }),
  ).toHaveValue(session.input.notes);
  expect(plans).toBe(1);
  await page.getByRole("button", { name: "Continue creating course" }).click();
  await expect(
    page.getByRole("button", { name: "Accept outline & begin" }),
  ).toBeVisible();
  expect(creates).toBe(1);
  expect(plans).toBe(2);
});

test("lost initial plan response recovers its saved result without another AI action", async ({
  page,
}) => {
  let session = emptyLesson();
  const actions: string[] = [];
  await page.route("**/api/learn**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { learning: session } });
    const body = route.request().postDataJSON();
    actions.push(body.action);
    if (body.action === "create") session.input = body.input;
    if (body.action === "plan") {
      session = plannedLesson(session);
      return route.abort("failed");
    }
    return route.fulfill({ json: { learning: session } });
  });
  await page.goto("http://127.0.0.1:4174/?view=learning-setup");
  await page.getByLabel("Topic", { exact: true }).fill("Binary search");
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(
    page.getByRole("button", { name: "Accept outline & begin" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(actions).toEqual(["create", "plan"]);
});

test("interrupted initial planning keeps the checkpoint and recovers later completion after reload", async ({
  page,
}) => {
  let session = emptyLesson();
  const actions: string[] = [];
  await page.route("**/api/learn**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { learning: session } });
    const body = route.request().postDataJSON();
    actions.push(body.action);
    if (body.action === "create") session.input = body.input;
    if (body.action === "plan") {
      session.version++;
      return route.abort("failed");
    }
    return route.fulfill({ json: { learning: session } });
  });
  await page.goto("http://127.0.0.1:4174/?view=learning-setup");
  await page.getByLabel("Topic", { exact: true }).fill("Binary search");
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await expect(page).toHaveURL(/view=learning-setup/);
  session = plannedLesson(session);
  await page.reload();
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(
    "Binary search",
  );
  expect(actions).toEqual(["create", "plan"]);
  await page.getByRole("button", { name: "Continue creating course" }).click();
  await expect(
    page.getByRole("button", { name: "Accept outline & begin" }),
  ).toBeVisible();
  expect(actions).toEqual(["create", "plan"]);
});
