import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { LearningRoom } from "@/components/learning-room";
import { user } from "@/lib/server/db";
import { signInPath } from "@/lib/auth-navigation";
export default async function Lesson({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const u = await user();
  const { id } = await params;
  if (!u) redirect(signInPath(`/learn/${id}`));
  // Load only the public DTO through the authenticated API; keys never enter RSC.
  return (
    <Shell signedIn>
      <LearningRoom key={`${u.id}:${id}`} id={id} userId={u.id} />
    </Shell>
  );
}
