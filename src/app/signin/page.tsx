import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { AuthForm } from "@/components/auth-form";
import { configured } from "@/lib/server/config";
import { user } from "@/lib/server/db";
import { authDestination } from "@/lib/auth-navigation";
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};
export default async function Signin({
  searchParams,
}: {
  searchParams: Promise<{ verification?: string; next?: string }>;
}) {
  const p = await searchParams;
  const next = authDestination(p.next);
  if (await user()) redirect(next);
  return (
    <Shell>
      <AuthForm
        configured={configured()}
        failed={p.verification === "failed"}
        next={next}
      />
    </Shell>
  );
}
