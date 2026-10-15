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
  const [signup, setSignup] = useState(false);
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
          mode: signup ? "signup" : "signin",
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (d.verify)
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
    <div className="auth-page">
      <Student small />
      <p className="eyebrow">YOUR IDEAS DESERVE A HOME</p>
      <h1>{signup ? "Make a little space." : "Good to see you."}</h1>
      <p>
        {signup
          ? "Save your topics and come back to your progress."
          : "Sign in to pick up where you left off."}
      </p>
      {!configured && (
        <div className="preview-banner">
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
        <Button disabled={!configured || busy} type="submit">
          {busy ? <LoaderCircle className="spin" size={16} /> : null}
          {signup ? "Create account" : "Sign in"}
          <ArrowRight size={16} />
        </Button>
      </form>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <Button
        variant="ghost"
        onClick={() => {
          setSignup(!signup);
          setError("");
          setMessage("");
        }}
      >
        {signup
          ? "Already have an account? Sign in"
          : "New here? Create an account"}
      </Button>
      <p className="micro">
        Email verification may be required before your first sign-in.
      </p>
    </div>
  );
}
