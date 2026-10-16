"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
export function PasswordForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="auth-page">
      <h1>Choose a new password.</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setError("");
          if (form.get("password") !== form.get("confirmation")) {
            setError("The passwords do not match.");
            return;
          }
          setBusy(true);
          try {
            const response = await fetch("/api/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: "update-password",
                password: form.get("password"),
              }),
            });
            const d = await response.json();
            if (!response.ok || d.error)
              throw new Error(d.error || "Could not update your password.");
            router.push("/library");
            router.refresh();
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Connection interrupted. Please try again.",
            );
            setBusy(false);
          }
        }}
      >
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          name="password"
          type="password"
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          required
          disabled={busy}
        />
        <label htmlFor="confirm-password">Confirm password</label>
        <input
          id="confirm-password"
          name="confirmation"
          type="password"
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          required
          disabled={busy}
        />
        <Button disabled={busy}>
          {busy ? "Updating password…" : "Update password"}
        </Button>
      </form>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
