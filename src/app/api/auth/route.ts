import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authClient } from "@/lib/server/db";
import { configured } from "@/lib/server/config";
export async function POST(req: NextRequest) {
  if (
    req.headers.get("origin") !== new URL(process.env.APP_URL || req.url).origin
  )
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  if (!configured())
    return NextResponse.json(
      {
        error:
          "Accounts need Supabase configuration. See the setup guide; the sample preview is ready to try.",
      },
      { status: 503 },
    );
  try {
    const raw = await req.text();
    if (raw.length > 2000) throw new Error();
    const a = z
      .object({
        mode: z.enum(["signin", "signup", "signout"]),
        email: z.string().email().max(254).optional(),
        password: z.string().min(8).max(128).optional(),
      })
      .parse(JSON.parse(raw));
    const c = await authClient();
    if (a.mode === "signout") {
      const { error } = await c.auth.signOut();
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (!a.email || !a.password) throw new Error();
    const credentials = { email: a.email, password: a.password };
    const { data, error } =
      a.mode === "signup"
        ? await c.auth.signUp({
            ...credentials,
            options: {
              emailRedirectTo: `${process.env.APP_URL || req.nextUrl.origin}/auth/confirm`,
            },
          })
        : await c.auth.signInWithPassword(credentials);
    if (error)
      return NextResponse.json(
        {
          error:
            a.mode === "signin"
              ? "Could not sign in. Check your email, password, and email verification. If requests are limited, wait before trying again."
              : "Could not create an account. Use a strong password, check the email address, or try again later.",
        },
        { status: 400 },
      );
    return NextResponse.json({ ok: true, verify: !data.session });
  } catch {
    return NextResponse.json(
      { error: "Use a valid email and a password of 8–128 characters." },
      { status: 400 },
    );
  }
}
