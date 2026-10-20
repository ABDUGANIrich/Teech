"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Student } from "./student";
export function AuthForm({
  configured,
  failed,
}: {
  configured: boolean;
  failed: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "recover" | "resend">(
    "signin",
  );
  const signup = mode === "signup";
  const emailOnly = mode === "recover" || mode === "resend";
  const [error, setError] = useState(
    failed
      ? "That verification link is invalid or expired. Request a new account email or sign in if you already verified."
      : "",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          email: form.get("email"),
          ...(!emailOnly ? { password: form.get("password") } : {}),
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (d.message) setMessage(d.message);
      else if (d.verify)
        setMessage(
          "Check your email for a confirmation link, then return here to sign in. If no email arrives, check spam and the project’s email delivery configuration.",
        );
      else {
        router.push("/library");
        router.refresh();
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not connect. Your email stays here; try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page max-w-115 mt-10 mb-17.5 text-center mx-auto px-6 py-0 [&_>_.student]:mt-0 [&_>_.student]:mb-2.5 [&_>_.student]:mx-auto [&_>_.eyebrow]:justify-center [&_>_.eyebrow]:text-[0.5625rem] [&_>_.eyebrow]:mb-3 [&_h1]:text-[2.4375rem] [&_h1]:mb-3.5 [&_>_p]:text-[0.8125rem] [&_form]:text-left [&_form]:mt-7 [&_form]:mb-3 [&_form]:mx-0 [&_form_input]:mb-5 [&_form_.button]:w-full [&_form_.button]:mt-[0.3125rem] [&_.preview-banner]:text-left [&_.preview-banner]:mt-[1.4375rem] [&_>_.micro]:text-[0.625rem] max-mobile:mt-7 max-mobile:[&_h1]:text-[2.1875rem] max-mobile:[&_input]:text-[1rem]">
      <Student small />
      <p className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
        YOUR IDEAS DESERVE A HOME
      </p>
      <h1>
        {mode === "recover"
          ? "Reset your password."
          : mode === "resend"
            ? "Confirm your email."
            : signup
              ? "Make a little space."
              : "Good to see you."}
      </h1>
      <p>
        {emailOnly
          ? "Enter your email address to request a fresh link."
          : signup
            ? "Save your topics and come back to your progress."
            : "Sign in to pick up where you left off."}
      </p>
      {!configured && (
        <div className="preview-banner border-solid bg-olive-100 rounded-[0.4375rem] flex gap-2.5 items-start mb-7 px-4 py-3 border-[0.0625rem] border-olive-300 dark:bg-olive-800 dark:border-olive-700 [&_p]:text-[0.6875rem] [&_p]:leading-[1.65] [&_p]:text-stone-500 [&_p]:m-0 dark:[&_p]:text-olive-400 [&_strong]:font-semibold [&_a]:underline max-mobile:mb-6 max-mobile:px-3 max-mobile:py-[0.6875rem] max-mobile:[&_p]:text-[0.625rem]">
          <p>
            <strong>Accounts aren’t configured yet.</strong> Connect Supabase
            and apply the migration in the README to enable sign-in and saving.{" "}
            <Link href="/sample">Try the sample preview</Link> in the meantime.
          </p>
        </div>
      )}
      <form onSubmit={submit}>
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          required
          disabled={!configured || busy}
        />
        {!emailOnly && (
          <>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete={signup ? "new-password" : "current-password"}
              placeholder="At least 8 characters"
              required
              disabled={!configured || busy}
            />
          </>
        )}
        <Button disabled={!configured || busy} type="submit">
          {busy ? (
            <LoaderCircle className="spin animate-[spin_1.2s_linear_infinite] size-4" />
          ) : null}
          {mode === "recover"
            ? "Send password-reset link"
            : mode === "resend"
              ? "Resend confirmation email"
              : signup
                ? "Create account"
                : "Sign in"}
          <ArrowRight className="size-4" />
        </Button>
      </form>
      {error && (
        <div
          className="error-box bg-rose-50 border-solid rounded-lg text-[0.75rem] text-yellow-800 wrap-anywhere mx-0 my-4.5 px-4.5 py-[0.9375rem] border-[0.0625rem] border-taupe-300 dark:bg-olive-800 dark:text-red-300 dark:border-olive-600"
          role="alert"
        >
          {error}
        </div>
      )}
      {message && (
        <p
          className="notice rounded-md bg-olive-100 text-olive-600 text-[0.75rem] px-4 py-3 dark:bg-olive-800 dark:text-olive-400"
          role="status"
        >
          {message}
        </p>
      )}
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setMode(signup ? "signin" : "signup");
          setError("");
          setMessage("");
        }}
      >
        {signup
          ? "Already have an account? Sign in"
          : "New here? Create an account"}
      </Button>
      <div className="learning-actions flex items-center gap-3.5 flex-wrap max-lesson:items-stretch max-lesson:[&_>_.button]:flex-[1_1_auto]">
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setMode(mode === "recover" ? "signin" : "recover");
            setError("");
            setMessage("");
          }}
        >
          {mode === "recover" ? "Back to sign in" : "Forgot password?"}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setMode(mode === "resend" ? "signin" : "resend");
            setError("");
            setMessage("");
          }}
        >
          {mode === "resend" ? "Back to sign in" : "Resend confirmation"}
        </Button>
      </div>
      <p className="micro text-[0.6875rem] leading-[1.7] text-olive-500 dark:text-olive-400">
        Email verification may be required before your first sign-in.
      </p>
    </div>
  );
}
