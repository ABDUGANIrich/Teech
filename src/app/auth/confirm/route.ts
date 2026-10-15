import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/server/db";
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token_hash");
  const code = req.nextUrl.searchParams.get("code");
  const c = await authClient();
  const result = token
    ? await c.auth.verifyOtp({ token_hash: token, type: "email" })
    : code
      ? await c.auth.exchangeCodeForSession(code)
      : { error: true };
  return NextResponse.redirect(
    new URL(
      result.error ? "/signin?verification=failed" : "/library",
      process.env.APP_URL || req.url,
    ),
  );
}
