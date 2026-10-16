import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/server/db";
import { configured } from "@/lib/server/config";
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token_hash");
  const code = req.nextUrl.searchParams.get("code");
  const recovery =
    req.nextUrl.searchParams.get("type") === "recovery" ||
    req.nextUrl.searchParams.get("next") === "/reset-password";
  if (!configured())
    return NextResponse.redirect(
      new URL("/signin?verification=failed", process.env.APP_URL || req.url),
    );
  let failed = true;
  try {
    const c = await authClient();
    const result = token
      ? await c.auth.verifyOtp({
          token_hash: token,
          type: recovery ? "recovery" : "email",
        })
      : code
        ? await c.auth.exchangeCodeForSession(code)
        : { error: true };
    failed = !!result.error;
  } catch {
    /* Expired links and transport failures return to a recoverable form. */
  }
  return NextResponse.redirect(
    new URL(
      failed
        ? "/signin?verification=failed"
        : recovery
          ? "/reset-password"
          : "/library",
      process.env.APP_URL || req.url,
    ),
  );
}
