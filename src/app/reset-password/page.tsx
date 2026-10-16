import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { PasswordForm } from "@/components/password-form";
import { user } from "@/lib/server/db";
export const metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};
export default async function ResetPassword() {
  if (!(await user())) redirect("/signin?verification=failed");
  return (
    <Shell signedIn>
      <PasswordForm />
    </Shell>
  );
}
