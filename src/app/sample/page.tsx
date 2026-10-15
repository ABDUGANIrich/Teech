import { Shell } from "@/components/shell";
import type { Metadata } from "next";
import { siteDescription, siteUrl } from "@/lib/site";
import { TeachingRoom } from "@/components/teaching-room";
import { liveConfigured } from "@/lib/server/config";
import { user } from "@/lib/server/db";
export const metadata: Metadata = {
  title: "Try a teaching sample",
  alternates: { canonical: "/sample" },
  openGraph: {
    type: "website",
    siteName: "Teech",
    title: "Try a teaching sample · Teech",
    description: siteDescription,
    url: `${siteUrl}/sample`,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Teech — Think you understand it? Teach it.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Try a teaching sample · Teech",
    description: siteDescription,
    images: [
      {
        url: "/twitter-image",
        alt: "Teech — Think you understand it? Teach it.",
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
