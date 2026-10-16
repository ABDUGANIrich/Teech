"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "./ui/button";
import { writeLocal } from "@/lib/client";
import { useLocalSnapshot, useBrowserReady } from "@/lib/browser-storage";
import { learningApi } from "@/lib/learning-client";
import {
  learningDraftSchema,
  learningInputSchema,
  type LearningInput,
} from "@/lib/learning";

export function LearningFields({
  input,
  onChange,
  disabled = false,
}: {
  input: LearningInput;
  onChange: (v: LearningInput) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="learning-fields">
      <label htmlFor="learn-topic">Topic</label>
      <input
        id="learn-topic"
        required
        maxLength={100}
        value={input.topic}
        onChange={(e) => onChange({ ...input, topic: e.target.value })}
        placeholder="For example, binary search"
      />
      <label htmlFor="learn-level">Starting level</label>
      <select
        id="learn-level"
        value={input.level}
        onChange={(e) =>
          onChange({
            ...input,
            level: e.target.value as LearningInput["level"],
          })
        }
      >
        <option value="new">New to this</option>
        <option value="basics">Know the basics</option>
        <option value="refreshing">Refreshing</option>
      </select>
      <label htmlFor="learn-goal">Learning goal (optional)</label>
      <input
        id="learn-goal"
        maxLength={300}
        value={input.goal}
        onChange={(e) => onChange({ ...input, goal: e.target.value })}
        placeholder="Trace binary search by hand"
      />
      <label htmlFor="learn-notes">
        Notes (optional · up to 18,000 characters)
      </label>
      <textarea
        id="learn-notes"
        rows={6}
        maxLength={18000}
        value={input.notes}
        onChange={(e) => onChange({ ...input, notes: e.target.value })}
      />
      <p className="micro">
        {input.notes.trim()
          ? "Notes-based learning: your notes set the content boundary. Missing coverage will be flagged."
          : "Topic-only learning: AI-generated from model knowledge, without independent source verification. Paste material for current facts or a specific document."}
      </p>
    </fieldset>
  );
}
export function LearningSetup({
  userId,
  prefill,
  sourceId = "new",
}: {
  userId: string;
  prefill?: LearningInput;
  sourceId?: string;
}) {
  const router = useRouter();
  const key = `teech:${userId}:learning-setup${sourceId === "new" ? "" : `:${sourceId}`}`;
  const [editedInput, setInput] = useState<LearningInput | null>(null);
  const local = useLocalSnapshot(key);
  let saved: LearningInput | undefined;
  try {
    saved = learningDraftSchema.parse(JSON.parse(local));
  } catch {}
  const input = editedInput ||
    saved ||
    prefill || { topic: "", level: "new" as const, goal: "", notes: "" };
  const ready = useBrowserReady();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  function change(v: LearningInput) {
    setInput(v);
    if (!writeLocal(key, v))
      setNotice(
        "Browser storage is unavailable. Copy your setup before leaving.",
      );
  }
  async function create() {
    if (busy) return;
    const parsed = learningInputSchema.safeParse(input);
    if (!parsed.success) {
      setError(
        "Add a topic of 1–100 characters and keep optional fields within their limits.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const d = await learningApi(userId, {
        action: "create",
        input: parsed.data,
      });
      if (d.error || !d.learning)
        throw new Error(d.error || "The lesson was not saved.");
      try {
        localStorage.removeItem(key);
      } catch {}
      router.push(`/learn/${d.learning.id}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not create this lesson.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="page learning-setup">
      <Link href="/library" className="back-link">
        ← Your library
      </Link>
      <p className="eyebrow">TEACHER MODE</p>
      <h1>Start with a little curiosity.</h1>
      <p>
        Choose a topic, confirm a short plan, then learn and practice one step
        at a time. About 15 minutes is an estimate.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <LearningFields
          input={input}
          onChange={change}
          disabled={busy || !ready}
        />
        <Button disabled={busy || !ready} type="submit">
          {busy ? "Saving lesson…" : "Create learning session"}
        </Button>
      </form>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <p className="micro">
        Planning and instruction use the same AI allowance as Teach Pip.
        Capacity is not reserved for a complete lesson.
      </p>
    </div>
  );
}
