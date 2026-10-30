import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { LearningRoom } from "@/components/learning-room";
import { siteUrl } from "@/lib/site";
const description =
  "Try learning with Sage: a fixed course with explanations, practice and scripted feedback. No account needed.";
export const metadata: Metadata = {
  title: "Sage sample",
  description,
  alternates: { canonical: "/teacher-sample" },
  openGraph: {
    type: "website",
    siteName: "Teech",
    title: "Sage sample · Teech",
    description,
    url: `${siteUrl}/teacher-sample`,
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sage sample · Teech",
    description,
    images: ["/twitter-image"],
  },
};
export default function TeacherSample() {
  return (
    <Shell>
      <LearningRoom sample userId="teacher-sample" />
    </Shell>
  );
}
