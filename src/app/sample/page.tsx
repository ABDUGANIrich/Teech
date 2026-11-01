import { Shell } from "@/components/shell";
import { publicPageMetadata } from "@/lib/site";
import { TeachingRoom } from "@/components/teaching-room";
import { liveConfigured } from "@/lib/server/config";
import { user } from "@/lib/server/db";
export const metadata = publicPageMetadata("pip");
export default async function Sample() {
  const u = await user();
  return (
    <Shell signedIn={!!u}>
      <TeachingRoom live={liveConfigured()} userId={u?.id} />
    </Shell>
  );
}
