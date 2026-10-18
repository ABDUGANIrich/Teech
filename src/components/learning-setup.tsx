"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "./ui/button";
import { removeLocal, writeLocal } from "@/lib/client";
import { useLocalSnapshot, useBrowserReady } from "@/lib/browser-storage";
import {
  actionRecovered,
  fetchLearning,
  learningApi,
  LearningReadError,
} from "@/lib/learning-client";
import { z } from "zod";
import {
  learningDraftSchema,
  learningInputSchema,
  type LearningInput,
  type LearningSession,
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
  const lessonKey = `${key}:lesson`;
  const checkpoint = useLocalSnapshot(lessonKey);
  const [createdId, setCreatedId] = useState<string | null>(null);
  let savedId = createdId;
  try {
    savedId ||= z.string().uuid().parse(JSON.parse(checkpoint));
  } catch {}
  let saved: LearningInput | undefined;
  try {
    saved = learningDraftSchema.parse(JSON.parse(local));
  } catch {}
  const input = editedInput ||
    saved ||
    prefill || { topic: "", level: "new" as const, goal: "", notes: "" };
  const ready = useBrowserReady();
  const [busy, setBusy] = useState<"saving" | "planning" | null>(null);
  const locked = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [missingId, setMissingId] = useState<string | null>(null);
  const missingCheckpoint = !!savedId && missingId === savedId;
  function change(v: LearningInput) {
    setInput(v);
    if (!writeLocal(key, v))
      setNotice(
        "Browser storage is unavailable. Copy your setup before leaving.",
      );
  }
  function openLesson(id: string) {
    removeLocal(key);
    removeLocal(lessonKey);
    router.push(`/learn/${id}`);
  }
  async function create() {
    if (locked.current || missingCheckpoint) return;
    const parsed = learningInputSchema.safeParse(input);
    if (!parsed.success) {
      setError(
        "Add a topic of 1–100 characters and keep optional fields within their limits.",
      );
      return;
    }
    locked.current = true;
    setBusy("saving");
    setError("");
    // Preserve prefills too, even when the learner submits without editing.
    if (!writeLocal(key, parsed.data))
      setNotice(
        "Browser storage is unavailable. Copy your setup before leaving.",
      );
    let lesson: LearningSession | undefined;
    let beforePlan: LearningSession | undefined;
    let definiteFailure = false;
    try {
      const d = savedId
        ? await fetchLearning(savedId)
        : await learningApi(userId, {
            action: "create",
            input: parsed.data,
          });
      if (d.error || !d.learning)
        throw new Error(d.error || "The lesson was not saved.");
      lesson = d.learning;
      setCreatedId(lesson.id);
      if (!writeLocal(lessonKey, lesson.id))
        setNotice(
          "Browser storage is unavailable. Open the saved lesson before leaving.",
        );
      // A prior submission may have completed while its response was lost.
      if (
        lesson.accepted ||
        (lesson.plan &&
          JSON.stringify(lesson.input) === JSON.stringify(parsed.data))
      ) {
        openLesson(lesson.id);
        return;
      }
      setBusy("planning");
      beforePlan = lesson;
      const planned = await learningApi(userId, {
        action: "plan",
        id: lesson.id,
        version: lesson.version,
        input: parsed.data,
      });
      if (planned.error) {
        definiteFailure = true;
        throw new Error(planned.error);
      }
      if (!planned.learning)
        throw new Error("The lesson plan could not be loaded.");
      openLesson(lesson.id);
    } catch (e) {
      if (
        !beforePlan &&
        savedId &&
        e instanceof LearningReadError &&
        e.status === 404
      )
        setMissingId(savedId);
      if (beforePlan && !definiteFailure) {
        try {
          const recovered = await fetchLearning(beforePlan.id);
          if (
            recovered.learning &&
            actionRecovered(beforePlan, recovered.learning, "plan", {
              input: parsed.data,
            })
          ) {
            openLesson(beforePlan.id);
            return;
          }
        } catch {
          // Keep the setup and saved lesson link available for an explicit retry.
        }
      }
      setError(
        e instanceof Error ? e.message : "Could not create this lesson.",
      );
    } finally {
      locked.current = false;
      setBusy(null);
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
        Choose a topic, review your course outline, then learn and practice one
        step at a time. Each unit prepares automatically as you reach it. About
        15 minutes is an estimate.
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
          disabled={!!busy || !ready}
        />
        <Button disabled={!!busy || !ready || missingCheckpoint} type="submit">
          {busy === "saving"
            ? "Saving your setup…"
            : busy === "planning"
              ? "Creating course…"
              : savedId
                ? "Continue creating course · uses AI allowance"
                : "Create course · uses AI allowance"}
        </Button>
      </form>
      {busy && (
        <p role="status">
          {busy === "planning"
            ? "Your setup is saved. Creating your course outline…"
            : "Saving your setup before creating the course…"}
        </p>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {missingCheckpoint && !busy && (
        <div className="notice">
          <p>
            The saved lesson is no longer available. Keep these inputs and start
            a new course when ready.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              removeLocal(lessonKey);
              setCreatedId(null);
              setMissingId(null);
              setError("");
            }}
          >
            Start a new course
          </Button>
        </div>
      )}
      {savedId && !busy && !missingCheckpoint && (
        <p>
          Your setup is saved. Continue to recover a finished plan or retry
          generation, or{" "}
          <Link href={`/learn/${savedId}`}>open the saved lesson</Link>.
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
