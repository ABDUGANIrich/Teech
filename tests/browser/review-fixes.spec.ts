import { test, expect } from "@playwright/test";
import {
  newTeacherSample,
  sampleTeacherAction,
} from "../../src/lib/teacher-sample";
import { sampleTopic } from "../../src/lib/sample";
const harness = "http://127.0.0.1:4174";
test("resetting the Teacher sample clears practice and handoff drafts", async ({
  page,
}) => {
  await page.goto("/teacher-sample");
  async function practice() {
    await page.getByRole("button", { name: "Accept plan & begin" }).click();
    await page.getByRole("button", { name: "Prepare this unit" }).click();
    await page.getByRole("button", { name: "Continue to practice" }).click();
  }
  await practice();
  await page.getByLabel("Your reasoning").fill("Discard this sample draft");
  await page.getByRole("button", { name: "Reset sample", exact: true }).click();
  await practice();
  await expect(page.getByLabel("Your reasoning")).toHaveValue("");
  await page.getByRole("button", { name: "Continue from this unit" }).click();
  await page.getByRole("button", { name: "Preview teaching source" }).click();
  await page.getByRole("button", { name: "Extract checklist" }).click();
  await page
    .getByLabel("Concept 1", { exact: true })
    .fill("Discard this checklist edit");
  await page.getByRole("button", { name: "Reset sample", exact: true }).click();
  await practice();
  await page.getByRole("button", { name: "Continue from this unit" }).click();
  await page.getByRole("button", { name: "Preview teaching source" }).click();
  await page.getByRole("button", { name: "Extract checklist" }).click();
  await expect(page.getByLabel("Concept 1", { exact: true })).toHaveValue(
    "Sorted order",
  );
});

test("a lost handoff response redirects from the recovered result with a single recovery read", async ({
  page,
}) => {
  let s = newTeacherSample();
  for (const action of [
    "accept",
    "generate",
    "practice",
    "next",
    "handoff_prepare",
    "handoff_extract",
  ])
    s = sampleTeacherAction(s, { action });
  let reads = 0;
  const teachingId = "11111111-1111-4111-8111-111111111111";
  await page.route("**/api/learn**", (route) => {
    if (route.request().method() === "GET") {
      reads++;
      return route.fulfill({ json: { learning: s } });
    }
    s = {
      ...s,
      version: s.version + 1,
      teachingId,
      handoff: { ...s.handoff!, done: true },
    };
    return route.abort("failed");
  });
  await page.goto(`${harness}/?view=learning-room`);
  await page
    .getByRole("button", { name: "Save topic & teach it to Pip" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/teach/${teachingId}`));
  expect(reads).toBe(2);
});

test("plan edits survive reload and a failed revision; successful generation clears the draft", async ({
  page,
}) => {
  const s = newTeacherSample();
  let calls = 0;
  await page.route("**/api/learn**", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { learning: s } });
    const body = route.request().postDataJSON();
    s.version++;
    calls++;
    if (calls === 1)
      return route.fulfill({ json: { learning: s, error: "Capacity busy" } });
    s.input = body.input;
    return route.fulfill({ json: { learning: s } });
  });
  await page.goto(`${harness}/?view=learning-room`);
  await page.getByLabel("Topic", { exact: true }).fill("Revised binary search");
  await page
    .getByLabel("Notes (optional", { exact: false })
    .fill("My important draft notes");
  await page.reload();
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(
    "Revised binary search",
  );
  await page.getByRole("button", { name: "Generate revised plan" }).click();
  await expect(page.getByRole("alert")).toContainText("Capacity busy");
  await expect(
    page.getByLabel("Notes (optional", { exact: false }),
  ).toHaveValue("My important draft notes");
  await page.getByRole("button", { name: "Generate revised plan" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(localStorage).filter((k) => k.endsWith(":plan-draft"))
            .length,
      ),
    )
    .toBe(0);
  await page.reload();
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(
    "Revised binary search",
  );
});

test("incomplete handoff checklist edits survive reload", async ({ page }) => {
  let s = newTeacherSample();
  for (const action of [
    "accept",
    "generate",
    "practice",
    "next",
    "handoff_prepare",
    "handoff_extract",
  ])
    s = sampleTeacherAction(s, { action });
  await page.route("**/api/learn**", (route) =>
    route.fulfill({ json: { learning: s } }),
  );
  await page.goto(`${harness}/?view=learning-room`);
  await page.getByLabel("Concept 1", { exact: true }).fill("");
  await page
    .getByLabel("What to explain", { exact: true })
    .first()
    .fill("My manual coverage description");
  await page.reload();
  await expect(page.getByLabel("Concept 1", { exact: true })).toHaveValue("");
  await expect(
    page.getByLabel("What to explain", { exact: true }).first(),
  ).toHaveValue("My manual coverage description");
});

test("prefilled lesson drafts restore before the source and remain scoped to that source", async ({
  page,
}) => {
  await page.goto(`${harness}/?view=prefilled-setup&source=a`);
  await page.getByLabel("Topic", { exact: true }).fill("My edited source A");
  await page.reload();
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(
    "My edited source A",
  );
  await page.goto(`${harness}/?view=prefilled-setup&source=b`);
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(
    "Original topic",
  );
});

test("stale topic conflict retains edits until an explicit version choice", async ({
  page,
}) => {
  const first = { ...sampleTopic, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  const latest = { ...first, version: 2, title: "Another tab's saved title" };
  const versions: number[] = [];
  await page.route("**/api/teech**", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { topic: first } });
    const body = route.request().postDataJSON();
    versions.push(body.expectedVersion);
    return route.fulfill({
      json:
        versions.length === 1
          ? { error: "Topic changed", conflict: true, topic: latest }
          : { error: "Save held for inspection" },
    });
  });
  await page.goto(`${harness}/?view=editor-navigation`);
  await page
    .getByRole("button", { name: "Edit first topic", exact: true })
    .click();
  await page.getByLabel("Give your topic a name").fill("My retained title");
  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(
    page.getByRole("region", { name: "Topic edit conflict" }),
  ).toBeVisible();
  await expect(page.getByLabel("Give your topic a name")).toHaveValue(
    "My retained title",
  );
  await page
    .getByRole("button", { name: "Keep my edits against this version" })
    .click();
  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(page.getByRole("alert")).toContainText("Save held");
  expect(versions).toEqual([1, 2]);
});

test("Teacher help question draft survives reload", async ({ page }) => {
  let s = newTeacherSample();
  for (const action of ["accept", "generate"])
    s = sampleTeacherAction(s, { action });
  await page.route("**/api/learn**", (route) =>
    route.fulfill({ json: { learning: s } }),
  );
  await page.goto(`${harness}/?view=learning-room`);
  await page
    .getByLabel("Ask about this step (up to 500 characters)")
    .fill("Why does the middle move?");
  await page.reload();
  await expect(
    page.getByLabel("Ask about this step (up to 500 characters)"),
  ).toHaveValue("Why does the middle move?");
});

test("account recovery requests are email-only and password updates validate confirmation", async ({
  page,
}) => {
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/auth", (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({
      json: { ok: true, message: "If eligible, check your inbox." },
    });
  });
  await page.goto(`${harness}/?view=auth`);
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await page.getByLabel("Email address").fill("person@example.com");
  await page.getByRole("button", { name: "Send password-reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If eligible");
  expect(bodies[0]).toEqual({ mode: "recover", email: "person@example.com" });
  await page
    .getByRole("button", { name: "Resend confirmation", exact: true })
    .click();
  await page.getByRole("button", { name: "Resend confirmation email" }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toEqual({ mode: "resend", email: "person@example.com" });
  await page.goto(`${harness}/?view=password`);
  await page
    .getByLabel("New password", { exact: true })
    .fill("new-password-123");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("different-password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("alert")).toContainText("do not match");
  expect(bodies).toHaveLength(2);
});

test("Teacher banner stacks readable text and actions at narrow widths", async ({
  page,
}, info) => {
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/teacher-sample");
    const text = page.locator(".teacher-preview-copy");
    const actions = page.locator(".teacher-preview-actions");
    await expect(text).toBeVisible();
    const textBox = (await text.boundingBox())!;
    const actionsBox = (await actions.boundingBox())!;
    expect(textBox.width).toBeGreaterThan(230);
    expect(actionsBox.y).toBeGreaterThanOrEqual(textBox.y + textBox.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: `artifacts/fixed-teacher-banner-${info.project.name}.png`,
  });
});
