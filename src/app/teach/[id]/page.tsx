import { Shell } from "@/components/shell";
import { TeachingRoom } from "@/components/teaching-room";
import { user } from "@/lib/server/db";
export default async function Teach({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const u = await user();
  return (
    <Shell signedIn={!!u}>
      <TeachingRoom key={id} live id={id} userId={u?.id} />
    </Shell>
  );
}
