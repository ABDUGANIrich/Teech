import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { Library } from "@/components/library";
import { user } from "@/lib/server/db";
export default async function LibraryPage() {
  if (!(await user())) redirect("/signin");
  return (
    <Shell signedIn>
      <Library />
    </Shell>
  );
}
