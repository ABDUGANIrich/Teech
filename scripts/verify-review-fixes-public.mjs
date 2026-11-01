import { chromium, devices } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const origin = process.argv[2];
if (!origin) throw new Error("Pass the deployment origin explicitly.");
const report = { origin, checks: {}, browserErrors: [] };
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({ headless: true });
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
    if (path.endsWith("image")) {
      assert(r.headers.get("content-type").includes("image/png"));
      const bytes = Buffer.from(await r.arrayBuffer());
      assert.equal(bytes.readUInt32BE(16), 1200);
      assert.equal(bytes.readUInt32BE(20), 630);
    }
    if (path === "/sitemap.xml") {
      const xml = await r.text();
      assert(xml.includes(origin + "/teacher-sample"));
      assert(!xml.includes("/learn/"));
      assert(!xml.includes("/reset-password"));
    }
    if (path === "/robots.txt")
      assert((await r.text()).includes(origin + "/sitemap.xml"));
    report.checks[path] = r.status;
  }
  for (const path of ["/api/teech?history=1", "/api/learn"])
    assert.equal((await fetch(origin + path)).status, 401);
  for (const [label, settings] of [
    ["desktop", { viewport: { width: 1440, height: 1000 } }],
    [
      "mobile",
      { ...devices["iPhone 13"], viewport: { width: 360, height: 900 } },
    ],
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
    assert.equal(
      await page.locator('link[rel="canonical"]').getAttribute("href"),
      origin,
    );
    assert(
      (await page.title()).includes("Learn with Sage. Teach Pip if you like."),
    );
    const og = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    assert.equal((await fetch(new URL(og, origin))).status, 200);
    await page.goto(origin + "/signin");
    assert(
      (
        await page.locator('meta[name="robots"]').getAttribute("content")
      ).includes("noindex"),
    );
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page
      .getByRole("button", { name: "Send password-reset link" })
      .waitFor();
    await page
      .getByRole("button", { name: "Resend confirmation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Resend confirmation email" })
      .waitFor();
    await page.goto(origin + "/teacher-sample");
    await page.getByRole("button", { name: "Accept outline & begin" }).click();
    await page.getByRole("heading", { name: "A worked example" }).waitFor();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `artifacts/review-fixes-production-${label}.png`,
    });
    report.checks[label] = {
      fixedTeacher: true,
      authRecoveryControls: true,
      overflow: false,
    };
    await context.close();
  }
  assert.equal(report.browserErrors.length, 0);
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await writeFile(
    "artifacts/review-fixes-public.json",
    JSON.stringify(report, null, 2),
  );
}
