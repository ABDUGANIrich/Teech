import "server-only";
import { z } from "zod";
import { AppError } from "../domain";
import { authClient } from "./db";
import { authDestination } from "../auth-navigation";
const email = z.string().trim().email().max(254);
const password = z.string().min(8).max(128);
const next = z.string().max(2048).optional();
const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("signin"), email, password, next }),
  z.object({ mode: z.literal("signup"), email, password, next }),
  z.object({ mode: z.literal("recover"), email, next }),
  z.object({ mode: z.literal("resend"), email, next }),
  z.object({ mode: z.literal("update-password"), password }),
  z.object({ mode: z.literal("signout") }),
]);
export async function authAction(input: unknown, origin: string) {
  const a = schema.parse(input);
  const c = await authClient();
  const destination = authDestination("next" in a ? a.next : undefined);
  const confirmUrl = `${origin}/auth/confirm?${new URLSearchParams({ next: destination })}`;
  if (a.mode === "signout") {
    const { error } = await c.auth.signOut();
    if (error) throw new AppError("Could not sign out. Try again.", 503);
    return { ok: true };
  }
  if (a.mode === "update-password") {
    const { data, error: authError } = await c.auth.getUser();
    if (authError || !data.user)
      throw new AppError(
        "Open a valid password-reset link before setting your password.",
        401,
      );
    const { error } = await c.auth.updateUser({ password: a.password });
    if (error)
      throw new AppError(
        "The password could not be updated. Use a different strong password or request a fresh reset link.",
        400,
      );
    return { ok: true };
  }
  if (a.mode === "recover" || a.mode === "resend") {
    const { error } =
      a.mode === "recover"
        ? await c.auth.resetPasswordForEmail(a.email, {
            redirectTo: `${origin}/auth/confirm?${new URLSearchParams({ next: "/reset-password", ...(destination !== "/library" ? { returnTo: destination } : {}) })}`,
          })
        : await c.auth.resend({
            type: "signup",
            email: a.email,
            options: { emailRedirectTo: confirmUrl },
          });
    if (error)
      throw new AppError(
        "Email could not be requested. Please wait before trying again.",
        error.status === 429 ? 429 : 503,
      );
    return {
      ok: true,
      message:
        a.mode === "recover"
          ? "If that address has an eligible account, a password-reset email is on its way. Check your inbox and spam folder."
          : "If that address needs confirmation, a fresh confirmation email is on its way. Check your inbox and spam folder.",
    };
  }
  const credentials = { email: a.email, password: a.password };
  const { data, error } =
    a.mode === "signup"
      ? await c.auth.signUp({
          ...credentials,
          options: { emailRedirectTo: confirmUrl },
        })
      : await c.auth.signInWithPassword(credentials);
  if (error)
    throw new AppError(
      a.mode === "signin"
        ? "Could not sign in. Check your email, password, and email verification. If requests are limited, wait before trying again."
        : "Could not create an account. Use a strong password, check the email address, or try again later.",
      400,
    );
  return { ok: true, verify: !data.session };
}
