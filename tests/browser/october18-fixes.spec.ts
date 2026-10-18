import { test, expect } from "@playwright/test";
import { newPreview, sampleTopic } from "../../src/lib/sample";
import {
  newTeacherSample,
  sampleTeacherAction,
  sampleUnit,
} from "../../src/lib/teacher-sample";
import { studied, type LearningSession } from "../../src/lib/learning";
import type { Session } from "../../src/lib/domain";
const harness = "http://127.0.0.1:4174";

for (const action of ["answer", "finish"] as const) {
  for (const lost of [false, true]) {
    test(`stale Student ${action} preserves its draft separately, including ${lost ? "lost" : "returned"} conflict responses`, async ({
      page,
    }) => {
      let session: Session = {
        ...newPreview(),
        preview: undefined,
        id: "11111111-1111-4111-8111-111111111111",
        owner: "user:test-user",
        phase: "questions",
        question_calls: 1,
        messages: [
          { role: "user", text: "The Sun warms water." },
          { role: "student", text: "What causes evaporation?" },
        ],
      };
      let posts = 0;
      await page.route("**/api/teech**", (route) => {
        if (route.request().method() === "GET")
          return route.fulfill({
            json: route.request().url().includes("session=")
              ? { session }
              : { sessions: [] },
          });
        const body = route.request().postDataJSON();
        expect(body.expectedMessages).toBe(2);
        posts++;
        session = {
          ...session,
          question_calls: 2,
          messages: [
            ...session.messages,
            { role: "user", text: "An answer from the other tab." },
            { role: "student", text: "What causes condensation?" },
          ],
        };
        return lost
          ? route.abort("failed")
          : route.fulfill({
              json: {
                session,
                conflict: true,
                error: "This attempt changed in another tab.",
              },
            });
      });
      await page.goto(`${harness}/?view=room`);
      const draft = "My unsent answer about evaporation.";
      await page.getByLabel("Your answer", { exact: true }).fill(draft);
      await page
        .getByRole("button", {
          name: action === "answer" ? "Share my answer" : "Finish and review",
        })
        .click();
      await expect(page.getByRole("alert")).toContainText("another tab");
      await expect(
        page.getByRole("heading", { name: "What causes condensation?" }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Retained unsent answer" }),
      ).toContainText(draft);
      await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
        "",
      );
      await page.reload();
      await expect(
        page.getByRole("region", { name: "Retained unsent answer" }),
      ).toContainText(draft);
      await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
        "",
      );
      expect(posts).toBe(1);
    });
  }
}

test("a durable interrupted unit marker prevents automatic preparation after reopening", async ({
  page,
}) => {
  const s = {
    ...sampleTeacherAction(newTeacherSample(), { action: "accept" }),
    preparingUnit: "halves",
    providerAttempts: 2,
  };
  let posts = 0;
  await page.route("**/api/learn**", (route) => {
    if (route.request().method() === "POST") posts++;
    return route.fulfill({ json: { learning: s } });
  });
  await page.goto(`${harness}/?view=learning-room`);
  await expect(
    page.getByRole("button", { name: "Retry preparing unit" }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry preparing unit" }),
  ).toBeEnabled();
  expect(posts).toBe(0);
});

test("an unavailable setup checkpoint can be discarded explicitly without losing input", async ({
  page,
}) => {
  const dead = "77777777-7777-4777-8777-777777777777";
  let s: LearningSession = {
    ...newTeacherSample(),
    phase: "setup",
    plan: null,
  };
  const actions: string[] = [];
  await page.addInitScript((id) => {
    localStorage.setItem(
      "teech:test-user:learning-setup:lesson",
      JSON.stringify(id),
    );
    localStorage.setItem(
      "teech:test-user:learning-setup",
      JSON.stringify({
        topic: "My new topic",
        goal: "Keep this goal",
        notes: "Keep these notes",
        level: "refreshing",
      }),
    );
  }, dead);
  await page.route("**/api/learn**", (route) => {
    if (route.request().method() === "GET")
      return route.request().url().includes(dead)
        ? route.fulfill({
            status: 404,
            json: { error: "This lesson is not available in your account." },
          })
        : route.fulfill({ json: { learning: s } });
    const body = route.request().postDataJSON();
    actions.push(body.action);
    if (body.action === "create") s = { ...s, input: body.input };
    else if (body.action === "plan")
      s = {
        ...s,
        plan: newTeacherSample().plan,
        phase: "plan",
        version: s.version + 1,
      };
    return route.fulfill({ json: { learning: s } });
  });
  await page.goto(`${harness}/?view=learning-setup`);
  await page.getByRole("button", { name: "Continue creating course" }).click();
  await expect(
    page.getByRole("button", { name: "Start a new course", exact: true }),
  ).toBeVisible();
  expect(actions).toEqual([]);
  await page
    .getByRole("button", { name: "Start a new course", exact: true })
    .click();
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(
    "My new topic",
  );
  await expect(page.getByLabel("Learning goal (optional)")).toHaveValue(
    "Keep this goal",
  );
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(
    page.getByRole("button", { name: "Accept plan & begin" }),
  ).toBeVisible();
  expect(actions).toEqual(["create", "plan"]);
});

for (const status of [401, 503])
  test(`setup retains its checkpoint after a ${status} read failure`, async ({
    page,
  }) => {
    const id = newTeacherSample().id;
    await page.addInitScript((id) => {
      localStorage.setItem(
        "teech:test-user:learning-setup:lesson",
        JSON.stringify(id),
      );
      localStorage.setItem(
        "teech:test-user:learning-setup",
        JSON.stringify({
          topic: "Binary search",
          goal: "",
          notes: "",
          level: "new",
        }),
      );
    }, id);
    await page.route("**/api/learn**", (route) =>
      route.fulfill({ status, json: { error: "Please try again later." } }),
    );
    await page.goto(`${harness}/?view=learning-setup`);
    await page
      .getByRole("button", { name: "Continue creating course" })
      .click();
    await expect(page.getByRole("alert")).toContainText("try again");
    await expect(
      page.getByRole("button", { name: "Start a new course", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("teech:test-user:learning-setup:lesson"),
      ),
    ).toContain(id);
  });

test("lesson deletion clears matching setup pointers and preserves other lessons and setup fields", async ({
  page,
}) => {
  const s = newTeacherSample();
  await page.addInitScript((id) => {
    if (sessionStorage.getItem("deletion-seeded")) return;
    sessionStorage.setItem("deletion-seeded", "yes");
    for (const key of [
      "teech:test-user:learning-setup:lesson",
      "teech:test-user:learning-setup:source:lesson",
      "teech:another-user:learning-setup:lesson",
    ])
      localStorage.setItem(key, JSON.stringify(id));
    localStorage.setItem(
      "teech:test-user:learning-setup:other:lesson",
      JSON.stringify("a-different-lesson"),
    );
    localStorage.setItem(
      "teech:test-user:learning-setup",
      JSON.stringify({ topic: "Keep my inputs" }),
    );
  }, s.id);
  await page.route("**/api/learn**", (route) =>
    route.fulfill({
      json:
        route.request().method() === "GET"
          ? { learning: s }
          : { deleted: true },
    }),
  );
  await page.goto(`${harness}/?view=learning-room`);
  await page
    .getByRole("button", { name: "Delete learning session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete lesson permanently", exact: true })
    .click();
  await expect(page).toHaveURL(`${harness}/library`);
  const storage = await page.evaluate(() => ({ ...localStorage }));
  expect(storage["teech:test-user:learning-setup:lesson"]).toBeUndefined();
  expect(
    storage["teech:test-user:learning-setup:source:lesson"],
  ).toBeUndefined();
  expect(storage["teech:another-user:learning-setup:lesson"]).toContain(s.id);
  expect(storage["teech:test-user:learning-setup:other:lesson"]).toContain(
    "a-different-lesson",
  );
  expect(storage["teech:test-user:learning-setup"]).toContain("Keep my inputs");
});

test("the library exposes saved sample attempts across history pages", async ({
  page,
}) => {
  const id = "11111111-1111-4111-8111-111111111111";
  const older = "22222222-2222-4222-8222-222222222222";
  const attempt = {
    id,
    title: "Water cycle",
    topic_id: null,
    phase: "review",
    checklist_version: 1,
    created_at: new Date().toISOString(),
  };
  await page.route("**/api/teech**", (route) =>
    route.fulfill({
      json: route.request().url().includes("before=")
        ? { attempts: [{ ...attempt, id: older }], nextCursor: null }
        : { topics: [], attempts: [attempt], nextCursor: "older-page" },
    }),
  );
  await page.route("**/api/learn**", (route) =>
    route.fulfill({ json: { lessons: [], nextCursor: null } }),
  );
  await page.goto(`${harness}/?view=library`);
  const section = page.getByRole("region", {
    name: "Teach Pip · saved sample attempts",
  });
  await expect(section.locator(`a[href="/teach/${id}"]`)).toBeVisible();
  await page.getByRole("button", { name: "Load older attempts" }).click();
  await expect(section.locator(`a[href="/teach/${older}"]`)).toBeVisible();
  await expect(section.getByRole("link")).toHaveCount(2);
});

test("topic deletion clears older unloaded drafts using the authenticated deletion result", async ({
  page,
}) => {
  const old = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await page.addInitScript((id) => {
    localStorage.setItem(
      `teech:draft:test-user:${id}:2`,
      JSON.stringify("Private old answer"),
    );
    localStorage.setItem(
      `teech:draft:test-user:${id}:conflict`,
      JSON.stringify({ text: "Unsent old answer" }),
    );
    localStorage.setItem(
      "teech:draft:test-user:unrelated-session:2",
      JSON.stringify("Keep this"),
    );
  }, old);
  await page.route("**/api/teech**", (route) =>
    route.fulfill({
      json:
        route.request().method() === "GET"
          ? { topics: [sampleTopic], attempts: [], nextCursor: "older-page" }
          : { deleted: true, deletedSessionIds: [old] },
    }),
  );
  await page.route("**/api/learn**", (route) =>
    route.fulfill({ json: { lessons: [], nextCursor: null } }),
  );
  await page.goto(`${harness}/?view=library`);
  await page
    .getByRole("button", { name: `Delete ${sampleTopic.title}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Delete topic", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "A little room for your next big idea.",
    }),
  ).toBeVisible();
  const storage = await page.evaluate(() => ({ ...localStorage }));
  expect(storage[`teech:draft:test-user:${old}:2`]).toBeUndefined();
  expect(storage[`teech:draft:test-user:${old}:conflict`]).toBeUndefined();
  expect(storage["teech:draft:test-user:unrelated-session:2"]).toContain(
    "Keep this",
  );
});

for (const lost of [false, true])
  test(`Explain another way retains a custom question after a ${lost ? "recovered" : "successful"} response`, async ({
    page,
  }) => {
    let s = newTeacherSample();
    for (const action of ["accept", "generate"])
      s = sampleTeacherAction(s, { action });
    await page.route("**/api/learn**", (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: { learning: s } });
      s = sampleTeacherAction(s, route.request().postDataJSON());
      return lost
        ? route.abort("failed")
        : route.fulfill({ json: { learning: s } });
    });
    await page.goto(`${harness}/?view=learning-room`);
    const question = "Why do inclusive bounds exclude the middle?";
    await page.getByLabel("Ask about this step").fill(question);
    await page.getByRole("button", { name: "Explain another way" }).click();
    await expect(
      page.getByText("1 help requests remain", { exact: false }),
    ).toBeVisible();
    await expect(page.getByLabel("Ask about this step")).toHaveValue(question);
    await page.reload();
    await expect(page.getByLabel("Ask about this step")).toHaveValue(question);
    await page
      .getByRole("button", { name: "Ask about this step", exact: true })
      .click();
    await expect(page.getByLabel("Ask about this step")).toHaveValue("");
  });

test("objective summary separates initial gaps and fresh correct results", async ({
  page,
}) => {
  let s = newTeacherSample();
  for (const action of ["accept", "generate", "practice"])
    s = sampleTeacherAction(s, { action });
  s = sampleTeacherAction(s, {
    action: "submit",
    itemId: "halves_check",
    answer: "right",
  });
  s = sampleTeacherAction(s, { action: "next" });
  s.targetedUsed = true;
  s.targetedObjective = "discard";
  s.targeted = studied(structuredClone(sampleUnit.unit));
  s.targeted.content.id = "targeted";
  for (const q of s.targeted.content.questions) q.objectiveId = "discard";
  for (const at of s.targeted.attempts) {
    at.state = "finished";
    at.feedback = {
      itemId: at.itemId,
      status: "Correct",
      well: "Valid reasoning",
      gap: "No gap",
      next: "Continue",
    };
  }
  await page.route("**/api/learn**", (route) =>
    route.fulfill({ json: { learning: s } }),
  );
  await page.goto(`${harness}/?view=learning-room`);
  const objective = page.locator(".learning-card").filter({
    has: page.getByRole("heading", {
      name: "Choose which half to discard after a comparison.",
      exact: true,
    }),
  });
  await expect(objective).toContainText(
    "Initial practice: Needs another attempt",
  );
  await expect(objective).toContainText(
    "Fresh practice: Demonstrated in this session",
  );
  await expect(objective).toContainText("2 independent correct");
});

test("mobile header gives navigation its own row through intermediate phone widths", async ({
  page,
}, info) => {
  for (const width of [320, 360, 390, 414, 480, 520]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/teacher-sample");
    const logo = (await page
      .getByRole("link", { name: "Teech home" })
      .boundingBox())!;
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const box = (await nav.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(logo.y + logo.height);
    for (const link of await nav.getByRole("link").all()) {
      expect(await link.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe(
        "nowrap",
      );
      const rect = (await link.boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390)
      await page.screenshot({
        path: `test-results/fixed-october18-header-${info.project.name}.png`,
      });
  }
});
