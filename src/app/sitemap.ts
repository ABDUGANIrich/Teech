import type { MetadataRoute } from "next";
import { publicPages, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return Object.values(publicPages).map(({ path }) => ({
    url: path === "/" ? siteUrl : `${siteUrl}${path}`,
  }));
}
