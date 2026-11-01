import { Shell } from "@/components/shell";
import { LearningRoom } from "@/components/learning-room";
import { publicPageMetadata } from "@/lib/site";

export const metadata = publicPageMetadata("sage");
export default function TeacherSample() {
  return (
    <Shell>
      <LearningRoom sample userId="teacher-sample" />
    </Shell>
  );
}
