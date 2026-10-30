import type { Metadata } from "next";
import { siteDescription, siteTitle, siteUrl } from "@/lib/site";
import { Shell } from "@/components/shell";
import { Landing } from "@/components/landing";
import { user } from "@/lib/server/db";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Teech",
    locale: "en_US",
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
  },
};

export default async function Home() {
  const u = await user();
  return (
    <Shell signedIn={!!u}>
      <Landing />
    </Shell>
  );
}
