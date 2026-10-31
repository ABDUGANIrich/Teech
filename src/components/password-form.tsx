"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { authDestination } from "@/lib/auth-navigation";
export function PasswordForm({ next = "/library" }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="auth-page max-w-115 mt-10 mb-17.5 text-center mx-auto px-6 py-0 [&_>_.student]:mt-0 [&_>_.student]:mb-2.5 [&_>_.student]:mx-auto [&_>_.eyebrow]:justify-center [&_>_.eyebrow]:text-[0.5625rem] [&_>_.eyebrow]:mb-3 [&_h1]:text-[2.4375rem] [&_h1]:mb-3.5 [&_>_p]:text-[0.8125rem] [&_form]:text-left [&_form]:mt-7 [&_form]:mb-3 [&_form]:mx-0 [&_form_input]:mb-5 [&_form_.button]:w-full [&_form_.button]:mt-[0.3125rem] [&_.preview-banner]:text-left [&_.preview-banner]:mt-[1.4375rem] [&_>_.micro]:text-[0.625rem] max-mobile:mt-7 max-mobile:[&_h1]:text-[2.1875rem] max-mobile:[&_input]:text-[1rem]">
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
            router.push(authDestination(next));
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
        <p
          className="error-box bg-rose-50 border-solid rounded-lg text-[0.75rem] text-yellow-800 wrap-anywhere mx-0 my-4.5 px-4.5 py-[0.9375rem] border-[0.0625rem] border-taupe-300 dark:bg-olive-800 dark:text-red-300 dark:border-olive-600"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
