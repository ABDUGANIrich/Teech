"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "./ui/button";
import { readLocal, removeLocal, writeLocal } from "@/lib/client";
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
    <fieldset
      disabled={disabled}
      className="learning-fields min-w-0 mt-0 mb-5.5 mx-0 p-0 border-0 [&_label]:block [&_label]:mt-4.5 [&_label]:mb-1.5 [&_label]:font-semibold [&_input]:w-full [&_input]:min-w-0 [&_input]:border-solid [&_input]:rounded-lg [&_input]:bg-white [&_input]:text-olive-800 [&_input]:px-[0.8125rem] [&_input]:py-[0.6875rem] [&_input]:border-[0.0625rem] [&_input]:border-olive-300 dark:[&_input]:bg-neutral-800 dark:[&_input]:text-olive-200 dark:[&_input]:border-olive-700 [&_textarea]:w-full [&_textarea]:min-w-0 [&_textarea]:border-solid [&_textarea]:rounded-lg [&_textarea]:bg-white [&_textarea]:text-olive-800 [&_textarea]:px-[0.8125rem] [&_textarea]:py-[0.6875rem] [&_textarea]:border-[0.0625rem] [&_textarea]:border-olive-300 dark:[&_textarea]:bg-neutral-800 dark:[&_textarea]:text-olive-200 dark:[&_textarea]:border-olive-700 [&_select]:w-full [&_select]:min-w-0 [&_select]:border-solid [&_select]:rounded-lg [&_select]:bg-white [&_select]:text-olive-800 [&_select]:whitespace-normal [&_select]:mb-3.5 [&_select]:px-[0.8125rem] [&_select]:py-[0.6875rem] [&_select]:border-[0.0625rem] [&_select]:border-olive-300 dark:[&_select]:bg-neutral-800 dark:[&_select]:text-olive-200 dark:[&_select]:border-olive-700 [&_.micro]:mt-2.5 max-mobile:[&_input]:text-[1rem] max-mobile:[&_textarea]:text-[1rem] max-mobile:[&_select]:text-[1rem]"
    >
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
      <p className="micro text-[0.6875rem] leading-[1.7] text-olive-600 dark:text-olive-400">
        {input.notes.trim()
          ? "Notes-based learning: your notes set the content boundary. Missing coverage will be flagged."
          : "Topic-based learning: Sage can look up public web sources when needed. Add notes to study a specific document. AI-generated content is not independently verified."}
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
  const [acceptedConflict, setAcceptedConflict] = useState(false);
  const missingCheckpoint = !!savedId && missingId === savedId;
  function change(v: LearningInput) {
    setInput(v);
    if (!writeLocal(key, v))
      setNotice(
        "Browser storage is unavailable. Copy your setup before leaving.",
      );
  }
  function openLesson(id: string, submitted: LearningInput) {
    if (JSON.stringify(readLocal(key, null)) === JSON.stringify(submitted))
      removeLocal(key);
    if (readLocal(lessonKey, null) === id) removeLocal(lessonKey);
    router.push(`/learn/${id}`);
  }
  async function create() {
    if (locked.current || missingCheckpoint || acceptedConflict) return;
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
        throw new Error(d.error || "The course was not saved.");
      lesson = d.learning;
      setCreatedId(lesson.id);
      if (!writeLocal(lessonKey, lesson.id))
        setNotice(
          "Browser storage is unavailable. Open the saved course before leaving.",
        );
      // A prior submission may have completed while its response was lost.
      const sameInput =
        JSON.stringify(lesson.input) === JSON.stringify(parsed.data);
      if (lesson.accepted && !sameInput) {
        setAcceptedConflict(true);
        throw new Error(
          "The saved course already has an accepted outline for different inputs. Your new setup is retained. Start a new course with these inputs, or open the saved course.",
        );
      }
      if (sameInput && (lesson.accepted || lesson.plan)) {
        openLesson(lesson.id, parsed.data);
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
        throw new Error("The course outline could not be loaded.");
      openLesson(lesson.id, parsed.data);
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
            openLesson(beforePlan.id, parsed.data);
            return;
          }
        } catch {
          // Keep the setup and saved lesson link available for an explicit retry.
        }
      }
      setError(
        e instanceof Error ? e.message : "Could not create this course.",
      );
    } finally {
      locked.current = false;
      setBusy(null);
    }
  }
  return (
    <div className="page learning-setup max-w-275 pt-11 pb-3 min-h-[65vh] mx-auto my-0 px-6 [&_.button]:whitespace-normal [&_.button]:h-auto [&_.button]:min-h-10 max-mobile:pt-[1.5625rem] max-mobile:pb-2.5 max-mobile:px-4.5">
      <Link
        href="/library"
        className="back-link inline-flex items-center gap-2 text-[0.6875rem] text-neutral-500 dark:text-olive-400"
      >
        ← Your library
      </Link>
      <p className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
        LEARN WITH SAGE
      </p>
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
        <Button
          disabled={!!busy || !ready || missingCheckpoint || acceptedConflict}
          type="submit"
        >
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
        <p
          className="error-box bg-rose-50 border-solid rounded-lg text-[0.75rem] text-yellow-800 wrap-anywhere mx-0 my-4.5 px-4.5 py-[0.9375rem] border-[0.0625rem] border-taupe-300 dark:bg-olive-800 dark:text-red-300 dark:border-olive-600"
          role="alert"
        >
          {error}
        </p>
      )}
      {(missingCheckpoint || acceptedConflict) && !busy && (
        <div className="notice rounded-md bg-olive-100 text-olive-600 text-[0.75rem] px-4 py-3 dark:bg-olive-800 dark:text-olive-400">
          <p>
            {acceptedConflict
              ? "These inputs differ from the accepted course. Start a separate course to use your new setup."
              : "The saved course is no longer available. Keep these inputs and start a new course when ready."}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              removeLocal(lessonKey);
              setCreatedId(null);
              setMissingId(null);
              setAcceptedConflict(false);
              setError("");
            }}
          >
            Start a new course
          </Button>
        </div>
      )}
      {savedId && !busy && !missingCheckpoint && (
        <p>
          Your setup is saved. Continue to recover a finished outline or retry
          generation, or{" "}
          <Link href={`/learn/${savedId}`}>open the saved course</Link>.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <p className="micro text-[0.6875rem] leading-[1.7] text-olive-600 dark:text-olive-400">
        Learn with Sage and Teach Pip share your AI allowance. Capacity is not
        reserved for a complete course.
      </p>
    </div>
  );
}
