import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: siteUrl }, { url: `${siteUrl}/sample` }, { url: `${siteUrl}/teacher-sample` }];
}
