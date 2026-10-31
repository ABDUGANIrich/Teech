// Read-only verification of an already-running local production build.
// Usage: npm run build; npm start -- --port 3107
// Then: node scripts/verify-teacher-production.mjs
import { chromium, devices } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const origin = process.env.TEECH_VERIFY_URL || "http://127.0.0.1:3107";
const browser = await chromium.launch({ headless: true });
const report = {
  environment:
    "local production build; public fixed sample only; no live AI/Auth/database mutations",
  checks: {},
  browserErrors: [],
};
await mkdir("artifacts", { recursive: true });
try {
  for (const path of [
    "/",
    "/teacher-sample",
    "/sample",
    "/signin",
    "/robots.txt",
    "/sitemap.xml",
    "/opengraph-image",
    "/twitter-image",
  ]) {
    const r = await fetch(origin + path);
    assert.equal(r.status, 200, path);
    if (path === "/sitemap.xml") {
      const xml = await r.text();
      assert(xml.includes("/teacher-sample"));
      assert(!xml.includes("/learn/"));
    }
    if (path.endsWith("image")) {
      assert(r.headers.get("content-type").includes("image/png"));
      const bytes = Buffer.from(await r.arrayBuffer());
      assert.equal(bytes.readUInt32BE(16), 1200);
      assert.equal(bytes.readUInt32BE(20), 630);
    }
    report.checks[path] = r.status;
  }
  const api = await fetch(origin + "/api/learn");
  assert.equal(api.status, 401);
  assert(api.headers.get("cache-control").includes("no-store"));
  report.checks.unauthenticatedLearning = api.status;
  for (const [label, settings] of [
    ["desktop", { viewport: { width: 1440, height: 1000 } }],
    ["mobile", devices["iPhone 13"]],
  ]) {
    const context = await browser.newContext({
      ...settings,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) =>
      report.browserErrors.push({ label, message: e.message }),
    );
    await page.goto(origin + "/");
    assert((await page.title()).includes("Learn it. Practice it. Teach it."));
    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    assert(
      canonical?.startsWith("https://") || canonical?.startsWith("http://"),
    );
    report.checks.canonical = canonical;
    await page.goto(origin + "/teacher-sample");
    await page.getByRole("button", { name: "Accept outline & begin" }).click();
    await page.getByRole("heading", { name: "A worked example" }).waitFor();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `artifacts/teacher-instruction-${label}.png`,
    });
    await page.getByRole("button", { name: "Continue to practice" }).click();
    await page
      .locator(".practice-item")
      .first()
      .getByLabel("Only positions before the middle")
      .check();
    await page
      .locator(".practice-item")
      .first()
      .getByRole("button", { name: "Submit answer" })
      .click();
    await page
      .locator(".practice-item")
      .first()
      .getByRole("heading", { name: "Correct", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      "feedback-halves_check",
    );
    await page.reload();
    await page
      .locator(".practice-item")
      .first()
      .getByRole("heading", { name: "Correct", exact: true })
      .waitFor();
    await page.goto(origin + "/learn/new");
    await page.waitForURL("**/signin");
    assert(
      (
        await page.locator('meta[name="robots"]').getAttribute("content")
      ).includes("noindex"),
    );
    report.checks[label] =
      "fixed sample instruction/practice/feedback/refresh, focus, wrapping, reduced motion, private-route redirect and noindex passed";
    await context.close();
  }
  assert.deepEqual(report.browserErrors, []);
  await writeFile(
    "artifacts/teacher-production-local.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
