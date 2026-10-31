import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { PasswordForm } from "@/components/password-form";
import { user } from "@/lib/server/db";
import { authDestination, signInPath } from "@/lib/auth-navigation";
export const metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};
export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = authDestination((await searchParams).next);
  if (!(await user())) redirect(`${signInPath(next)}&verification=failed`);
  return (
    <Shell signedIn>
      <PasswordForm next={next} />
    </Shell>
  );
}
