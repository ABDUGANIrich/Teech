// Deployment smoke: creates/deletes one temporary confirmed account (no email).
// Personal lesson APIs are deterministic browser fixtures; no AI/search calls.
// node --env-file=.env.local scripts/verify-followup-production.mjs <origin>
import { chromium, devices, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const origin = new URL(process.argv[2]).origin;
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const report = {
  origin,
  checkedAt: new Date().toISOString(),
  routes: {},
  browsers: {},
  browserErrors: [],
  cleanup: false,
  realProviderCalls: 0,
};
const browser = await chromium.launch({ headless: true });
let userId;
await mkdir("artifacts", { recursive: true });
try {
  for (const path of [
    "/",
    "/sample",
    "/teacher-sample",
    "/signin",
    "/robots.txt",
    "/sitemap.xml",
    "/opengraph-image",
    "/twitter-image",
  ]) {
    const r = await fetch(origin + path);
    assert.equal(r.status, 200, path);
    report.routes[path] = r.status;
    if (path.endsWith("image")) {
      assert(r.headers.get("content-type").includes("image/png"));
      const bytes = Buffer.from(await r.arrayBuffer());
      assert.equal(bytes.readUInt32BE(16), 1200);
      assert.equal(bytes.readUInt32BE(20), 630);
    }
    if (path === "/robots.txt")
      assert((await r.text()).includes(origin + "/sitemap.xml"));
    if (path === "/sitemap.xml") {
      const xml = await r.text();
      assert(xml.includes(origin + "/teacher-sample"));
      assert(!xml.includes("/learn/"));
    }
  }
  for (const path of ["/api/learn", "/api/teech?history=1"]) {
    const r = await fetch(origin + path);
    assert.equal(r.status, 401);
    report.routes[path] = r.status;
  }
  const credentials = {
    email: `teech-followup-${randomUUID()}@example.com`,
    password: randomBytes(24).toString("base64url"),
  };
  const created = await admin.auth.admin.createUser({
    ...credentials,
    email_confirm: true,
  });
  if (created.error)
    throw new Error("Temporary verification account could not be created.");
  userId = created.data.user.id;
  for (const [label, settings] of [
    ["desktop", { viewport: { width: 1440, height: 1000 } }],
    ["mobile", devices["iPhone 13"]],
  ]) {
    const context = await browser.newContext({
      ...settings,
      reducedMotion: "reduce",
    });
    try {
      const page = await context.newPage();
      page.on("pageerror", (e) =>
        report.browserErrors.push({ label, message: e.message }),
      );
      await page.goto(origin);
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute("href"),
        origin,
      );
      for (const selector of [
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
      ]) {
        const url = await page.locator(selector).getAttribute("content");
        assert.equal((await fetch(new URL(url, origin))).status, 200);
      }
      await page.goto(origin + "/teacher-sample");
      await page.getByRole("button", { name: "Accept plan & begin" }).click();
      await page.getByRole("heading", { name: "A worked example" }).waitFor();
      await page.getByRole("button", { name: "Continue to practice" }).click();
      const item = page
        .locator("article")
        .filter({ has: page.locator("#halves_apply-prompt") });
      await item.getByRole("button", { name: "Show hint" }).click();
      await expect(page.locator("#hint-halves_apply-0")).toBeFocused();
      await item.getByRole("button", { name: "Show hint" }).click();
      await expect(page.locator("#hint-halves_apply-1")).toBeFocused();
      const fixture = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("teech:teacher-sample:v1")),
      );
      fixture.id = randomUUID();
      fixture.units[0].attempts.forEach((a) => {
        a.hints = [];
      });
      const login = await context.request.post(origin + "/api/auth", {
        headers: { Origin: origin },
        data: { mode: "signin", ...credentials },
      });
      assert.equal(login.status(), 200);
      assert.equal((await login.json()).ok, true);

      let teacher = structuredClone(fixture);
      let teacherPosts = 0;
      await page.route("**/api/learn**", (route) => {
        if (route.request().method() === "POST") {
          teacherPosts++;
          teacher = structuredClone(teacher);
          teacher.version++;
          teacher.units[0].attempts[1].answer = "The other tab's saved answer";
          teacher.units[0].attempts[1].state = "finished";
          return route.fulfill({
            json: {
              learning: teacher,
              error: "This lesson changed in another tab.",
            },
          });
        }
        return route.fulfill({ json: { learning: teacher } });
      });
      await page.goto(`${origin}/learn/${teacher.id}`);
      await page
        .getByLabel("Your reasoning")
        .fill("My unsent reasoning from the stale tab");
      await page
        .locator("article")
        .filter({ has: page.getByLabel("Your reasoning") })
        .getByRole("button", { name: "Submit answer" })
        .click();
      const retained = page.getByRole("region", {
        name: "Retained unsent answer",
      });
      await expect(retained).toContainText(
        "My unsent reasoning from the stale tab",
      );
      await page.reload();
      await expect(retained).toContainText(
        "My unsent reasoning from the stale tab",
      );
      await retained.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `artifacts/followup-production-retained-${label}.png`,
      });
      assert.equal(teacherPosts, 1);

      await page.unroute("**/api/learn**");
      teacher = { ...structuredClone(fixture), phase: "learning" };
      let helps = 0;
      await page.route("**/api/learn**", (route) => {
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON();
          assert.equal(body.action, "help");
          helps++;
          teacher.version++;
          teacher.helpUsed++;
          teacher.units[0].clarifications.push({
            question: body.question.trim(),
            blocks: [
              { kind: "paragraph", text: "Saved clarification fixture." },
            ],
            sourceExcerpts: [],
          });
          return route.abort("failed");
        }
        return route.fulfill({ json: { learning: teacher } });
      });
      await page.reload();
      await page
        .getByLabel("Ask about this step")
        .fill("  Why halve the interval?  ");
      await page
        .getByRole("button", { name: "Ask about this step", exact: true })
        .click();
      await expect(
        page.getByText("Connection restored. Your saved result is ready."),
      ).toBeVisible();
      await expect(page.getByLabel("Ask about this step")).toHaveValue("");
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
      assert.equal(helps, 1);

      let student = {
        id: randomUUID(),
        owner: `user:${userId}`,
        topic_id: null,
        title: "Water cycle",
        notes:
          "The Sun warms water. Water evaporates, then cools and condenses into droplets.",
        concepts: [],
        checklist_version: 1,
        phase: "questions",
        question_calls: 1,
        notes_revealed: false,
        short_retry: false,
        evaluation: null,
        created_at: new Date().toISOString(),
        messages: [
          { role: "user", text: "The Sun warms water." },
          { role: "student", text: "What causes evaporation?" },
        ],
      };
      let reveals = 0;
      await page.route("**/api/teech**", (route) => {
        if (
          route.request().method() === "POST" &&
          route.request().postDataJSON().action === "reveal"
        ) {
          reveals++;
          student = {
            ...student,
            notes_revealed: true,
            question_calls: 2,
            messages: [
              ...student.messages,
              { role: "user", text: "Other tab answer" },
              { role: "student", text: "What causes condensation?" },
            ],
          };
          return route.abort("failed");
        }
        return route.fulfill({
          json: route.request().url().includes("history")
            ? { sessions: [] }
            : { session: student },
        });
      });
      await page.goto(origin + "/sample");
      await page
        .getByLabel("Your answer", { exact: true })
        .fill("My unsent evaporation answer");
      await page.getByRole("button", { name: "View notes" }).click();
      await expect(
        page.getByRole("heading", { name: "Your source material" }),
      ).toBeVisible();
      await expect(retained).toContainText("My unsent evaporation answer");
      await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
        "",
      );
      await page.reload();
      await expect(retained).toContainText("My unsent evaporation answer");
      assert.equal(reveals, 1);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      report.browsers[label] = {
        consecutiveHintFocus: true,
        teacherConflictRetainedAfterRefresh: true,
        trimmedHelpRecovered: true,
        lostStudentRevealRetainedAfterRefresh: true,
        overflow: false,
      };
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(report.browserErrors, []);
} finally {
  await browser.close();
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error)
      throw new Error("Temporary verification account cleanup failed.");
    report.cleanup = true;
  }
  await writeFile(
    "artifacts/followup-production.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(JSON.stringify(report, null, 2));
