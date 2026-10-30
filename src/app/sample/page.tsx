import { Shell } from "@/components/shell";
import type { Metadata } from "next";
import { siteUrl } from "@/lib/site";
import { TeachingRoom } from "@/components/teaching-room";
import { liveConfigured } from "@/lib/server/config";
import { user } from "@/lib/server/db";
const description =
  "Try teaching Pip without an account. Uses live AI when available, or a labeled fixed preview otherwise.";
export const metadata: Metadata = {
  title: "Pip sample",
  description,
  alternates: { canonical: "/sample" },
  openGraph: {
    type: "website",
    siteName: "Teech",
    title: "Pip sample · Teech",
    description,
    url: `${siteUrl}/sample`,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Teech — Learn it. Practice it. Teach it.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pip sample · Teech",
    description,
    images: [
      {
        url: "/twitter-image",
        alt: "Teech — Learn it. Practice it. Teach it.",
      },
    ],
  },
};
export default async function Sample() {
  const u = await user();
  return (
    <Shell signedIn={!!u}>
      <TeachingRoom live={liveConfigured()} userId={u?.id} />
    </Shell>
  );
}
