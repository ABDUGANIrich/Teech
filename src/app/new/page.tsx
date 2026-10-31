import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { TopicEditor } from "@/components/topic-editor";
import { user } from "@/lib/server/db";
import { signInPath } from "@/lib/auth-navigation";
export default async function NewTopic({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const u = await user();
  const p = await searchParams;
  if (!u)
    redirect(
      signInPath(
        `/new${p.edit ? `?${new URLSearchParams({ edit: p.edit })}` : ""}`,
      ),
    );
  return (
    <Shell signedIn>
      <TopicEditor edit={p.edit} userId={u.id} />
    </Shell>
  );
}
