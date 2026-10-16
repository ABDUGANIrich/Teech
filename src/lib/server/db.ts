import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createHmac, randomUUID } from "node:crypto";
import { AppError } from "../domain";
import { configured } from "./config";
export function admin() {
  if (!configured())
    throw new AppError(
      "Personal accounts and saving need Supabase configuration. You can still try the sample preview.",
      503,
    );
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function authClient() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Server components cannot write cookies; route handlers refresh. */
          }
        },
      },
    },
  );
}
export async function user() {
  if (!configured()) return null;
  const c = await authClient();
  const { data } = await c.auth.getUser();
  return data.user;
}
export async function actor(requireUser = false) {
  const u = await user();
  if (u) return { id: `user:${u.id}`, userId: u.id, quota: `user:${u.id}` };
  if (requireUser) throw new AppError("Sign in to save your own topics.", 401);
  const secret = process.env.ANONYMOUS_HASH_SECRET;
  if (!secret || secret.length < 32)
    throw new AppError(
      "Live samples need the anonymous-session secret configured.",
      503,
    );
  const jar = await cookies();
  let token = jar.get("teech-visitor")?.value;
  const sign = (v: string) =>
    createHmac("sha256", secret).update(v).digest("hex");
  if (
    !token ||
    token.length > 200 ||
    token.split(".").length !== 2 ||
    token.split(".")[1] !== sign(token.split(".")[0])
  ) {
    const id = randomUUID();
    token = `${id}.${sign(id)}`;
    jar.set("teech-visitor", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }
  const visitor = `anon:${sign(token)}`;
  return {
    id: visitor,
    userId: null,
    quota: visitor,
  };
}
export function dbError(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "PGRST205" || error.code === "42703")
    throw new AppError(
      "This feature is temporarily unavailable. Please try later; keep this tab open to retain local drafts.",
      503,
    );
  if (error.message.includes("TEACHER_BUDGET_EXCEEDED"))
    throw new AppError(
      "This lesson has used its 22 AI attempts. Saved lessons, feedback, hints and solutions remain available. Start a new lesson for more AI work.",
      429,
    );
  if (error.message.includes("VERSION_CONFLICT"))
    throw new AppError(
      "This lesson changed in another tab. Reload its saved state before continuing.",
      409,
    );
  if (error.message.includes("ANONYMOUS_POOL_EXCEEDED"))
    throw new AppError(
      "Today's shared allowance for anonymous visitors is used up. Sign in to use your account allowance, or return after midnight UTC. Your writing is saved locally.",
      429,
    );
  if (error.message.includes("QUOTA_EXCEEDED"))
    throw new AppError(
      "An allowance limit was reached. Daily limits reset at 00:00 UTC; rolling-minute limits expire within a minute. Saved work remains available.",
      429,
    );
  if (error.message.includes("CALL_ALREADY_RESERVED"))
    throw new AppError(
      "This AI step was already attempted. Finish this attempt or start a new one; your writing is safe.",
      409,
    );
  if (error.message.includes("REQUEST_BUSY"))
    throw new AppError(
      "Another request is still working. Wait a moment, then try the same action again.",
      409,
    );
  if (error.message.includes("IDEMPOTENCY_CONFLICT"))
    throw new AppError(
      "This request already used different content. Refresh to recover the saved attempt.",
      409,
    );
  throw new AppError(
    "The database could not complete this request. Check the Supabase migration and connection. Your local draft is safe.",
    503,
  );
}
