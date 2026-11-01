import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const pages = [
  {
    path: "/",
    title: /Learn with Sage.*Teach Pip if you like/,
    description: /optionally teach Pip/,
    alt: /Sage.*Pip/,
  },
  {
    path: "/teacher-sample",
    title: /Sage sample/,
    description: /Open answers are not assessed/,
    alt: /fixed sample course/,
  },
  {
    path: "/sample",
    title: /Pip sample/,
    description: /live AI when available.*fixed preview/,
    alt: /Live AI.*fixed preview/,
  },
];

for (const entry of pages) {
  test(
    `public metadata and share images: ${entry.path}`,
    { tag: "@mobile" },
    async ({ page, request, baseURL }, info) => {
      await page.goto(entry.path);
      await expect(page).toHaveTitle(entry.title);
      const canonical = new URL(entry.path, baseURL).href;
      const canonicalTag = page.locator('link[rel="canonical"]');
      await expect(canonicalTag).toHaveCount(1);
      expect(new URL((await canonicalTag.getAttribute("href"))!).href).toBe(
        canonical,
      );
      const description = page.locator('meta[name="description"]');
      await expect(description).toHaveCount(1);
      await expect(description).toHaveAttribute("content", entry.description);
      const text = (await description.getAttribute("content"))!;
      await expect(
        page.locator('meta[property="og:description"]'),
      ).toHaveAttribute("content", text);
      await expect(
        page.locator('meta[name="twitter:description"]'),
      ).toHaveAttribute("content", text);
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        "content",
        entry.title,
      );
      await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute(
        "content",
        entry.title,
      );
      const ogUrl = (await page
        .locator('meta[property="og:url"]')
        .getAttribute("content"))!;
      expect(new URL(ogUrl).href).toBe(canonical);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
        "content",
        "summary_large_image",
      );
      for (const [platform, attribute] of [
        ["og", "property"],
        ["twitter", "name"],
      ]) {
        const tag = page.locator(`meta[${attribute}="${platform}:image"]`);
        await expect(tag).toHaveCount(1);
        const imageUrl = new URL((await tag.getAttribute("content"))!);
        expect(imageUrl.origin).toBe(new URL(baseURL!).origin);
        expect(imageUrl.pathname).toBe(
          `${entry.path === "/" ? "" : entry.path}/${platform === "og" ? "opengraph" : "twitter"}-image`,
        );
        await expect(
          page.locator(`meta[${attribute}="${platform}:image:alt"]`),
        ).toHaveAttribute("content", entry.alt);
        const image = await request.get(imageUrl.href);
        expect(image.status()).toBe(200);
        expect(image.headers()["content-type"]).toContain("image/png");
        const png = await image.body();
        expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
        expect(png.readUInt32BE(16)).toBe(1200);
        expect(png.readUInt32BE(20)).toBe(630);
        expect(png.length).toBeLessThan(5 * 1024 * 1024);
        if (info.project.name === "desktop") {
          await mkdir("artifacts/metadata", { recursive: true });
          await writeFile(
            `artifacts/metadata/${entry.path === "/" ? "home" : entry.path.slice(1)}-${platform}.png`,
            png,
          );
        }
      }
    },
  );
}

test("mode links keep one canonical page and personal routes stay out of search", async ({
  page,
  request,
  baseURL,
}) => {
  await page.goto("/?mode=teach&ref=share");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    baseURL!,
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Teach Pip");
  for (const path of [
    "/signin",
    "/library",
    "/learn/new",
    "/new",
    "/reset-password",
  ]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex.*nofollow/,
    );
  }
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  const urls = Array.from(
    xml.matchAll(/<loc>(.*?)<\/loc>/g),
    (match) => new URL(match[1]).href,
  );
  expect(urls.sort()).toEqual(
    pages.map(({ path }) => new URL(path, baseURL).href).sort(),
  );
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(`Sitemap: ${baseURL}/sitemap.xml`);
});
