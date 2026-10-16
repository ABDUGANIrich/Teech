import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { LearningSetup } from "@/components/learning-setup";
import { user } from "@/lib/server/db";
import { readTopic } from "@/lib/server/service";
export default async function NewLesson({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const u = await user();
  if (!u) redirect("/signin");
  const { topic } = await searchParams;
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
