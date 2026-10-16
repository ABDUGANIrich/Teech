import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { LearningRoom } from "@/components/learning-room";
import { siteUrl } from "@/lib/site";
export const metadata: Metadata = {
  title: "Try a teacher sample",
  description:
    "A fixed demonstration of learning, practice, feedback and teaching it back. No account needed.",
  alternates: { canonical: "/teacher-sample" },
  openGraph: { url: `${siteUrl}/teacher-sample` },
};
export default function TeacherSample() {
  return (
    <Shell>
      <LearningRoom sample userId="teacher-sample" />
    </Shell>
  );
}
