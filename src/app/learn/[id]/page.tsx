import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { LearningRoom } from "@/components/learning-room";
import { user } from "@/lib/server/db";
export default async function Lesson({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const u = await user();
  if (!u) redirect("/signin");
  const { id } = await params;
  // Load only the public DTO through the authenticated API; keys never enter RSC.
  return (
    <Shell signedIn>
      <LearningRoom key={`${u.id}:${id}`} id={id} userId={u.id} />
    </Shell>
  );
}
