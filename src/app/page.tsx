import { publicPageMetadata } from "@/lib/site";
import { Shell } from "@/components/shell";
import { Landing } from "@/components/landing";
import { user } from "@/lib/server/db";

export const metadata = publicPageMetadata("home");

export default async function Home() {
  const u = await user();
  return (
    <Shell signedIn={!!u}>
      <Landing />
    </Shell>
  );
}
