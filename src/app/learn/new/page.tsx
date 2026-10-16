import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { LearningSetup } from "@/components/learning-setup";
import { user } from "@/lib/server/db";
import { readData } from "@/lib/server/service";
import type { Topic } from "@/lib/domain";
export default async function NewLesson({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const u = await user();
  if (!u) redirect("/signin");
  const { topic } = await searchParams;
  const data = topic ? await readData() : null;
  const selected =
    data && "topics" in data
      ? (data.topics as Topic[]).find((t) => t.id === topic)
      : undefined;
  return (
    <Shell signedIn>
      <LearningSetup
        key={`${u.id}:${topic || "new"}`}
        userId={u.id}
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
