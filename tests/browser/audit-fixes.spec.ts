import { expectReadableText } from "./helpers/readability";
import { expect, test } from "@playwright/test";
import { sampleTopic } from "../../src/lib/sample";
import { newTeacherSample } from "../../src/lib/teacher-sample";
const harness = "http://127.0.0.1:4174";

test("saving a topic preserves another tab's newer unsaved draft through reload", async ({
  context,
  page,
}) => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  let topic = { ...sampleTopic, id };
  await context.route("**/api/teech**", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      topic = { ...topic, title: body.title, version: 2 };
    }
    return route.fulfill({ json: { topic } });
  });
  const other = await context.newPage();
  for (const tab of [page, other]) {
    await tab.goto(`${harness}/?view=editor-navigation`);
    await tab
      .getByRole("button", { name: "Edit first topic", exact: true })
      .click();
    await expect(tab.getByLabel("Give your topic a name")).toHaveValue(
      topic.title,
    );
  }
  await page.getByLabel("Give your topic a name").fill("Saved in tab A");
  await other
    .getByLabel("Give your topic a name")
    .fill("Important unsaved work in tab B");
  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(page).toHaveURL(`${harness}/library`);
  await other.reload();
  await other
    .getByRole("button", { name: "Edit first topic", exact: true })
    .click();
  await expect(other.getByLabel("Give your topic a name")).toHaveValue(
    "Important unsaved work in tab B",
  );
});

test("accepted setup recovery preserves changed inputs and requires an explicit new course", async ({
  page,
}) => {
  const old = {
    ...newTeacherSample(),
    accepted: true,
    phase: "learning" as const,
  };
  const freshId = "88888888-8888-4888-8888-888888888888";
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/learn**", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { learning: old } });
    const body = route.request().postDataJSON();
    posts.push(body);
    return route.fulfill({
      json: {
        learning: { ...newTeacherSample(), id: freshId, input: body.input },
      },
    });
  });
  await page.goto(`${harness}/?view=learning-setup`);
  await page.evaluate(
    (id) =>
      localStorage.setItem(
        "teech:test-user:learning-setup:lesson",
        JSON.stringify(id),
      ),
    old.id,
  );
  await page.reload();
  await page
    .getByLabel("Topic", { exact: true })
    .fill("A completely different topic");
  await page.getByRole("button", { name: "Continue creating course" }).click();
  await expect(page.getByRole("alert")).toContainText("different inputs");
  expect(posts).toHaveLength(0);
  await page.reload();
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue(
    "A completely different topic",
  );
  await page.getByRole("button", { name: "Continue creating course" }).click();
  await page
    .getByRole("button", { name: "Start a new course", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create course", exact: false })
    .click();
  await expect(page).toHaveURL(`${harness}/learn/${freshId}`);
  expect(posts[0].action).toBe("create");
  expect(posts[0].input).toMatchObject({
    topic: "A completely different topic",
  });
});

test(
  "sign-in preserves the requested creation page and source query",
  { tag: "@mobile" },
  async ({ page }) => {
    const next = "/learn/new?topic=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await page.goto(next);
    await expect(page).toHaveURL(/\/signin\?/);
    expect(new URL(page.url()).pathname).toBe("/signin");
    expect(new URL(page.url()).searchParams.get("next")).toBe(next);
    await page.route("**/api/auth", async (route) => {
      expect(route.request().postDataJSON().next).toBe(next);
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto(
      `${harness}/?${new URLSearchParams({ view: "auth", next })}`,
    );
    await page.getByLabel("Email address").fill("person@example.com");
    await page.getByLabel("Password", { exact: true }).fill("a-valid-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(`${harness}${next}`);
  },
);

test(
  "mode controls and the sample note meet normal-text contrast in light and dark themes",
  { tag: "@mobile" },
  async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/");
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await expect(page.locator("#sample-note")).toHaveCount(1);
      await expect(page.locator('nav[aria-label="Study mode"] a')).toHaveCount(
        2,
      );
      await expectReadableText(
        page.locator(
          '#sample-note, .mode-selector p, nav[aria-label="Study mode"] a',
        ),
      );
    }
  },
);
