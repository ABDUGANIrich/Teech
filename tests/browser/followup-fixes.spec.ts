import { test, expect } from "@playwright/test";
import { newPreview } from "../../src/lib/sample";
import {
  newTeacherSample,
  sampleTeacherAction,
} from "../../src/lib/teacher-sample";
import type { Session } from "../../src/lib/domain";
const harness = "http://127.0.0.1:4174";

function practice() {
  let s = newTeacherSample();
  for (const action of ["accept", "generate", "practice"])
    s = sampleTeacherAction(s, { action });
  return s;
}

for (const lost of [false, true]) {
  test(`Teacher conflicting writing survives ${lost ? "lost" : "returned"} response and refresh`, async ({
    page,
  }) => {
    let s = practice();
    let posts = 0;
    await page.route("**/api/learn**", (route) => {
      if (route.request().method() === "POST") {
        posts++;
        s = structuredClone(s);
        s.version++;
        s.units[0].attempts[1].answer =
          "An answer submitted from the other tab";
        s.units[0].attempts[1].state = "finished";
        return lost
          ? route.abort("failed")
          : route.fulfill({
              json: {
                learning: s,
                error:
                  "This course changed in another tab. Reload the saved course before continuing.",
              },
            });
      }
      return route.fulfill({ json: { learning: s } });
    });
    await page.goto(`${harness}/?view=learning-room`);
    const draft = "My different original reasoning that was never submitted";
    await page.getByLabel("Your reasoning").fill(draft);
    await page
      .locator("article")
      .filter({ has: page.getByLabel("Your reasoning") })
      .getByRole("button", { name: "Submit answer" })
      .click();
    await expect(
      page.getByText("An answer submitted from the other tab", { exact: true }),
    ).toBeVisible();
    const retained = page.getByRole("region", {
      name: "Retained unsent answer",
    });
    await expect(retained).toContainText(draft);
    await page.reload();
    await expect(retained).toContainText(draft);
    await retained
      .getByRole("button", { name: "Discard retained answer" })
      .click();
    await expect(retained).toHaveCount(0);
    await page.reload();
    await expect(retained).toHaveCount(0);
    expect(posts).toBe(1);
  });

  test(`Student notes preserve stale writing through ${lost ? "lost" : "returned"} reveal and refresh`, async ({
    page,
  }) => {
    let s: Session = {
      ...newPreview(),
      preview: undefined,
      id: "11111111-1111-4111-8111-111111111111",
      phase: "questions",
      question_calls: 1,
      messages: [
        { role: "user", text: "An initial explanation" },
        { role: "student", text: "What causes evaporation?" },
      ],
    };
    let posts = 0;
    await page.route("**/api/teech**", (route) => {
      if (route.request().method() === "POST") {
        posts++;
        expect(route.request().postDataJSON().action).toBe("reveal");
        s = {
          ...s,
          notes_revealed: true,
          question_calls: 2,
          messages: [
            ...s.messages,
            { role: "user", text: "Other tab answer" },
            { role: "student", text: "What causes condensation?" },
          ],
        };
        if (lost) return route.abort("failed");
      }
      return route.fulfill({
        json: route.request().url().includes("history")
          ? { sessions: [] }
          : { session: s },
      });
    });
    await page.goto(`${harness}/?view=room`);
    const draft = "Unsent evaporation answer unique to this tab";
    await page.getByLabel("Your answer", { exact: true }).fill(draft);
    await page.getByRole("button", { name: "View notes" }).click();
    await expect(
      page.getByRole("heading", { name: "What causes condensation?" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your source material" }),
    ).toBeVisible();
    await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
      "",
    );
    const retained = page.getByRole("region", {
      name: "Retained unsent answer",
    });
    await expect(retained).toContainText(draft);
    await expect(retained).toContainText("What causes evaporation?");
    await page.reload();
    await expect(retained).toContainText(draft);
    await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
      "",
    );
    expect(posts).toBe(1);
  });
}

test("Teacher saved answer clears only matching drafts and preserves newer writing from another tab", async ({
  page,
}) => {
  let s = practice();
  const draftKey = `teech:test-user:learn:${s.id}:halves_apply:draft`;
  await page.route("**/api/learn**", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      s = sampleTeacherAction(s, body);
      await page.evaluate(
        (key) =>
          localStorage.setItem(
            key,
            JSON.stringify("Newer unsent writing from another tab"),
          ),
        draftKey,
      );
    }
    return route.fulfill({ json: { learning: s } });
  });
  await page.goto(`${harness}/?view=learning-room`);
  await page.getByLabel("Your reasoning").fill("My submitted answer");
  await page
    .locator("article")
    .filter({ has: page.getByLabel("Your reasoning") })
    .getByRole("button", { name: "Submit answer" })
    .click();
  await expect(
    page.getByText("My submitted answer", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey))
    .toBe(JSON.stringify("Newer unsent writing from another tab"));
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Retained unsent answer" }),
  ).toContainText("Newer unsent writing from another tab");
});

test("matching Teacher answer is acknowledged without a retained-draft warning", async ({
  page,
}) => {
  let s = practice();
  await page.route("**/api/learn**", (route) => {
    if (route.request().method() === "POST")
      s = sampleTeacherAction(s, route.request().postDataJSON());
    return route.fulfill({ json: { learning: s } });
  });
  await page.goto(`${harness}/?view=learning-room`);
  await page.getByLabel("Your reasoning").fill("My submitted answer");
  await page
    .locator("article")
    .filter({ has: page.getByLabel("Your reasoning") })
    .getByRole("button", { name: "Submit answer" })
    .click();
  await expect(
    page.getByText("My submitted answer", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Retained unsent answer" }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(localStorage).filter((key) => key.endsWith(":draft"))
            .length,
      ),
    )
    .toBe(0);
});

test("trimmed Teacher help recovers without an error, stale draft or duplicate request", async ({
  page,
}) => {
  let s = sampleTeacherAction(practice(), {
    action: "revisit",
    unitId: "halves",
  });
  let posts = 0;
  await page.route("**/api/learn**", (route) => {
    if (route.request().method() === "POST") {
      posts++;
      const body = route.request().postDataJSON();
      expect(body.action).toBe("help");
      s = sampleTeacherAction(s, {
        action: "help",
        question: body.question.trim(),
      });
      return route.abort("failed");
    }
    return route.fulfill({ json: { learning: s } });
  });
  await page.goto(`${harness}/?view=learning-room`);
  await page
    .getByLabel("Ask about this step")
    .fill("  Why halve the interval?  ");
  await page
    .getByRole("button", { name: "Ask about this step", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Why halve the interval?", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByText("Connection restored. Your saved result is ready."),
  ).toBeVisible();
  await expect(page.getByLabel("Ask about this step")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Ask about this step", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("Ask about this step")).toHaveValue("");
  expect(s.helpUsed).toBe(1);
  expect(posts).toBe(1);
});

test("Teacher focus follows each hint and solution within the application item", { tag: "@mobile" }, async ({
  page,
}) => {
  let s = practice();
  await page.route("**/api/learn**", (route) => {
    if (route.request().method() === "POST")
      s = sampleTeacherAction(s, route.request().postDataJSON());
    return route.fulfill({ json: { learning: s } });
  });
  await page.goto(`${harness}/?view=learning-room`);
  await expect(page.locator("#practice-title")).toBeFocused();
  const item = page
    .locator("article")
    .filter({ has: page.locator("#halves_apply-prompt") });
  await item.getByRole("button", { name: "Show hint" }).click();
  await expect(page.locator("#hint-halves_apply-0")).toBeFocused();
  await item.getByRole("button", { name: "Show hint" }).click();
  await expect(page.locator("#hint-halves_apply-1")).toBeFocused();
  await item.getByRole("button", { name: "Reveal solution" }).click();
  await expect(page.locator("#solution-halves_apply")).toBeFocused();
});
