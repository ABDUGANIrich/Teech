import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/server/db";
import { configured } from "@/lib/server/config";
import { authDestination, signInPath } from "@/lib/auth-navigation";
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token_hash");
  const code = req.nextUrl.searchParams.get("code");
  let callbackParams = req.nextUrl.searchParams;
  const redirectTo = callbackParams.get("redirect_to");
  if (redirectTo) {
    try {
      const callback = new URL(redirectTo);
      if (
        callback.origin === new URL(process.env.APP_URL || req.url).origin &&
        callback.pathname === "/auth/confirm"
      )
        callbackParams = callback.searchParams;
    } catch {
      // Malformed or foreign callback destinations never control navigation.
    }
  }
  const recovery =
    req.nextUrl.searchParams.get("type") === "recovery" ||
    callbackParams.get("next") === "/reset-password";
  const destination = authDestination(
    callbackParams.get(recovery ? "returnTo" : "next"),
  );
  const failurePath =
    destination === "/library"
      ? "/signin?verification=failed"
      : `${signInPath(destination)}&verification=failed`;
  if (!configured())
    return NextResponse.redirect(
      new URL(failurePath, process.env.APP_URL || req.url),
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
        ? failurePath
        : recovery
          ? `/reset-password${destination === "/library" ? "" : `?${new URLSearchParams({ next: destination })}`}`
          : destination,
      process.env.APP_URL || req.url,
    ),
  );
}
