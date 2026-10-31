import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { LearningSetup } from "@/components/learning-setup";
import { user } from "@/lib/server/db";
import { readTopic } from "@/lib/server/service";
import { signInPath } from "@/lib/auth-navigation";
export default async function NewLesson({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const u = await user();
  const { topic } = await searchParams;
  if (!u)
    redirect(
      signInPath(
        `/learn/new${topic ? `?${new URLSearchParams({ topic })}` : ""}`,
      ),
    );
  const selected = topic ? (await readTopic(topic)).topic : undefined;
  return (
    <Shell signedIn>
      <LearningSetup
        key={`${u.id}:${topic || "new"}`}
        userId={u.id}
        sourceId={topic || "new"}
        prefill={
          selected
            ? {
                topic: selected.title,
                notes: selected.notes,
                level: "new",
                goal: "",
              }
            : undefined
        }
      />
    </Shell>
  );
}
