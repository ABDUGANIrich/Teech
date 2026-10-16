import { test, expect } from "@playwright/test";
import {
  sampleConcepts,
  sampleNotes,
  sampleTopic,
  newPreview,
  fixtureReview,
} from "../../src/lib/sample";
import type { Session } from "../../src/lib/domain";

for (const action of ["explain", "answer"] as const) {
  test(`lost ${action} response recovers the saved question and correct draft`, async ({
    page,
  }) => {
    let session: Session = {
      ...newPreview(),
      id: "11111111-1111-4111-8111-111111111111",
      owner: "user:test-user",
      preview: undefined,
      ...(action === "answer"
        ? {
            phase: "questions" as const,
            question_calls: 1,
            messages: [
              {
                role: "user" as const,
                text: "The Sun warms water and it evaporates.",
              },
              { role: "student" as const, text: "Where does the water go?" },
            ],
          }
        : {}),
    };
    await page.route("**/api/teech**", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({
          json: route.request().url().includes("session=")
            ? { session }
            : { topics: [], sessions: [] },
        });
      const body = route.request().postDataJSON();
      expect(body.action).toBe(action);
      session = {
        ...session,
        phase: "questions",
        question_calls: session.question_calls + 1,
        messages: [
          ...session.messages,
          { role: "user", text: body.text },
          { role: "student", text: "How does water return to the ground?" },
        ],
      };
      return route.abort("failed");
    });
    await page.goto("http://127.0.0.1:4174/?view=room");
    await page
      .getByLabel(action === "explain" ? "Your explanation" : "Your answer", {
        exact: true,
      })
      .fill("Water evaporates, cools, condenses, and then falls as rain.");
    await page
      .getByRole("button", {
        name: action === "explain" ? "Let’s talk about it" : "Share my answer",
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "How does water return to the ground?",
      }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByLabel("Your answer")).toHaveValue("");
    await page.getByLabel("Your answer").fill("Rain falls from clouds.");
    await page.reload();
    await expect(page.getByLabel("Your answer")).toHaveValue(
      "Rain falls from clouds.",
    );
  });
}

test("extraction locks inputs, preserves checklist on failed regeneration, and replaces on success", async ({
  page,
}) => {
  let calls = 0;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/teech", async (route) => {
    calls++;
    if (calls === 1) await waiting;
    if (calls === 2)
      return route.fulfill({ json: { error: "Provider unavailable" } });
    return route.fulfill({
      json: {
        concepts: sampleConcepts.map((c, i) => ({
          ...c,
          title: i === 0 && calls === 3 ? "Regenerated concept" : c.title,
        })),
      },
    });
  });
  await page.goto("http://127.0.0.1:4174/");
  await page.getByLabel("Give your topic a name").fill("Water cycle");
  await page.getByLabel("Your study material").fill(sampleNotes);
  await page.getByRole("button", { name: "Find key concepts" }).click();
  await expect(page.getByLabel("Give your topic a name")).toBeDisabled();
  await expect(page.getByLabel("Your study material")).toBeDisabled();
  release();
  await expect(page.getByRole("group")).toHaveCount(6);
  await page
    .getByLabel("Concept title", { exact: true })
    .first()
    .fill("My manual concept");
  await page
    .getByLabel("Your study material")
    .fill(sampleNotes + " Additional source notes.");
  await page.getByRole("button", { name: "Regenerate checklist" }).click();
  await page
    .getByRole("button", { name: "Keep checklist", exact: true })
    .click();
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Regenerate checklist" }).click();
  await page
    .getByRole("button", { name: "Replace checklist", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Provider unavailable");
  await expect(
    page.getByLabel("Concept title", { exact: true }).first(),
  ).toHaveValue("My manual concept");
  await page.reload();
  await expect(page.getByLabel("Your study material")).toHaveValue(
    sampleNotes + " Additional source notes.",
  );
  await page.getByRole("button", { name: "Regenerate checklist" }).click();
  await page
    .getByRole("button", { name: "Replace checklist", exact: true })
    .click();
  await expect(
    page.getByLabel("Concept title", { exact: true }).first(),
  ).toHaveValue("Regenerated concept");
});

test("changing editor topic restores the correct draft and save target", async ({
  page,
}) => {
  const first = {
    ...sampleTopic,
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title: "First topic",
  };
  const second = {
    ...sampleTopic,
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    title: "Second topic",
  };
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/teech", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { topics: [first, second], sessions: [] } });
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { error: "Save held for inspection" } });
  });
  await page.goto("http://127.0.0.1:4174/?view=editor-navigation");
  await page.getByLabel("Give your topic a name").fill("New draft");
  await page
    .getByRole("button", { name: "Edit first topic", exact: true })
    .click();
  await expect(page.getByLabel("Give your topic a name")).toHaveValue(
    "First topic",
  );
  await page.getByLabel("Give your topic a name").fill("Edited first topic");
  await page
    .getByRole("button", { name: "Edit second topic", exact: true })
    .click();
  await expect(page.getByLabel("Give your topic a name")).toHaveValue(
    "Second topic",
  );
  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(page.getByRole("alert")).toContainText("Save held");
  expect(saved?.id).toBe(second.id);
  expect(saved?.title).toBe("Second topic");
  await page
    .getByRole("button", { name: "Edit first topic", exact: true })
    .click();
  await expect(page.getByLabel("Give your topic a name")).toHaveValue(
    "Edited first topic",
  );
  await page.getByRole("button", { name: "New topic", exact: true }).click();
  await expect(page.getByLabel("Give your topic a name")).toHaveValue(
    "New draft",
  );
});

test("library exposes more than 100 attempts with retryable pagination", async ({
  page,
}) => {
  const sessions = Array.from({ length: 102 }, (_, i) => ({
    ...newPreview(),
    id: `attempt-${i}`,
    topic_id: sampleTopic.id,
  }));
  let failed = false;
  await page.route("**/api/teech**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has("history"))
      return route.fulfill({
        json: {
          topics: [sampleTopic],
          sessions: sessions.slice(0, 50),
          nextCursor: "page2",
        },
      });
    if (!failed) {
      failed = true;
      return route.fulfill({
        status: 503,
        json: { error: "History temporarily unavailable" },
      });
    }
    const second = url.searchParams.get("before") === "page2";
    return route.fulfill({
      json: {
        sessions: second ? sessions.slice(50, 100) : sessions.slice(100),
        nextCursor: second ? "page3" : null,
      },
    });
  });
  await page.goto("http://127.0.0.1:4174/?view=library");
  await page.getByText("Attempts (50 loaded)").click();
  await expect(page.locator(".attempt-link")).toHaveCount(50);
  await page
    .getByRole("button", { name: "Load older attempts", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "History temporarily unavailable",
  );
  await page
    .getByRole("button", { name: "Load older attempts", exact: true })
    .click();
  await expect(page.locator(".attempt-link")).toHaveCount(100);
  await page
    .getByRole("button", { name: "Load older attempts", exact: true })
    .click();
  await expect(page.locator(".attempt-link")).toHaveCount(102);
  await expect(
    page.getByRole("button", { name: "Load older attempts", exact: true }),
  ).toHaveCount(0);
});

test("older reviews remain available for comparison", async ({ page }) => {
  const session = {
    ...newPreview(),
    id: "11111111-1111-4111-8111-111111111111",
    owner: "user:test-user",
    preview: undefined,
    phase: "review",
    evaluation: fixtureReview(newPreview()),
  };
  const older = { ...session, id: "older-review" };
  await page.route("**/api/teech**", async (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: url.searchParams.has("session")
        ? { session }
        : url.searchParams.has("history")
          ? { sessions: [older], nextCursor: null }
          : { sessions: [session], nextCursor: "older" },
    });
  });
  await page.goto("http://127.0.0.1:4174/?view=room");
  await page
    .getByRole("button", { name: "Load older attempts for comparison" })
    .click();
  await page
    .getByRole("combobox", { name: "Compare with" })
    .selectOption("older-review");
  await expect(page.getByText(/Previously:/)).toHaveCount(6);
});

test("unavailable attempt recovery opens the sample", async ({ page }) => {
  await page.route("**/api/teech**", (route) =>
    route.fulfill({ status: 404, json: { error: "Attempt unavailable" } }),
  );
  await page.goto("/teach/11111111-1111-4111-8111-111111111111");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Attempt unavailable",
  );
  await page.getByRole("button", { name: "Open a fresh sample" }).click();
  await expect(page).toHaveURL(/\/sample$/);
  await expect(
    page.getByLabel("Your explanation", { exact: true }),
  ).toBeVisible();
});

test("a stale sample pointer can be cleared to create a fresh live sample", async ({
  page,
}) => {
  const session = { ...newPreview(), preview: undefined };
  await page.goto("http://127.0.0.1:4174/");
  await page.evaluate(() =>
    localStorage.setItem(
      "teech:test-user:sample:live",
      JSON.stringify("unavailable-attempt"),
    ),
  );
  await page.route("**/api/teech**", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON().action).toBe("start");
      return route.fulfill({ json: { session } });
    }
    return route.fulfill(
      new URL(route.request().url()).searchParams.has("session")
        ? { status: 404, json: { error: "Attempt unavailable" } }
        : { json: { topics: [], sessions: [] } },
    );
  });
  await page.goto("http://127.0.0.1:4174/?view=live-sample");
  await expect(page.getByRole("alert")).toContainText("Attempt unavailable");
  await page.getByRole("button", { name: "Open a fresh sample" }).click();
  await expect(
    page.getByLabel("Your explanation", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const outcome of [
  "success",
  "timeout then retry",
  "lost response",
] as const) {
  test(`finish and review: ${outcome}`, async ({ page }) => {
    let session: Session = {
      ...newPreview(),
      id: "11111111-1111-4111-8111-111111111111",
      owner: "user:test-user",
      preview: undefined,
      phase: "questions",
      question_calls: 1,
      messages: [
        { role: "user", text: "The Sun warms water, turning it into vapor." },
      ],
    };
    let calls = 0;
    const keys: string[] = [];
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/teech**", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({
          json: route.request().url().includes("session=")
            ? { session }
            : { sessions: [], topics: [] },
        });
      const body = route.request().postDataJSON();
      expect(body.action).toBe("finish");
      keys.push(body.key);
      calls++;
      if (calls === 1) await waiting;
      if (outcome === "timeout then retry" && calls === 1)
        return route.fulfill({
          json: {
            session,
            error: "The AI request timed out. Try Finish and review again.",
          },
        });
      session = {
        ...session,
        phase: "review",
        evaluation: fixtureReview(session),
      };
      if (outcome === "lost response") return route.abort("failed");
      return route.fulfill({ json: { session } });
    });
    await page.goto("http://127.0.0.1:4174/?view=room");
    await expect(
      page.getByRole("heading", { name: "Ready to reflect?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Finish and review" }).click();
    await expect(
      page.getByRole("button", { name: "Preparing review…" }),
    ).toBeDisabled();
    release();
    if (outcome === "timeout then retry") {
      await expect(page.getByRole("alert")).toContainText("timed out");
      await page.getByRole("button", { name: "Finish and review" }).click();
      expect(keys[0]).not.toBe(keys[1]);
    }
    await expect(
      page.getByRole("heading", { name: "Look at what came through." }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(calls).toBe(outcome === "timeout then retry" ? 2 : 1);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Look at what came through." }),
    ).toBeVisible();
  });
}
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
