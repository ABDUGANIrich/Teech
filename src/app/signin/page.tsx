import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { AuthForm } from "@/components/auth-form";
import { configured } from "@/lib/server/config";
import { user } from "@/lib/server/db";
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};
export default async function Signin({
  searchParams,
}: {
  searchParams: Promise<{ verification?: string }>;
}) {
  if (await user()) redirect("/library");
  const p = await searchParams;
  return (
    <Shell>
      <AuthForm
        configured={configured()}
        failed={p.verification === "failed"}
      />
    </Shell>
  );
}
