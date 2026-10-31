"use client";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Teacher } from "./teacher";
import { LearningFields } from "./learning-setup";
import { LearningPractice, type LearningAction } from "./learning-practice";
import { LearningSummary } from "./learning-summary";
import { LessonBlocks, RichText } from "./result-content";
import { LessonInstruction } from "./lesson-instruction";
import {
  actionRecovered,
  clearLearningDrafts,
  fetchLearning,
  learningApi,
} from "@/lib/learning-client";
import {
  learningStateSchema,
  provenance,
  SIMPLIFY_LESSON_QUESTION,
  type LearningSession,
} from "@/lib/learning";
import { newTeacherSample, sampleTeacherAction } from "@/lib/teacher-sample";
import { removeLocal, writeLocal } from "@/lib/client";
import { useLocalSnapshot, useBrowserReady } from "@/lib/browser-storage";
import { useDraft } from "@/lib/draft";
import { learningDraftSchema } from "@/lib/learning";
import { z } from "zod";

function UnitPreparation({
  act,
  busy,
  exhausted,
  retryRequired,
}: {
  act: LearningAction;
  busy: boolean;
  exhausted: boolean;
  retryRequired: boolean;
}) {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  async function prepare() {
    setFailed(false);
    setFailed(!(await act("generate")));
  }
  const start = useEffectEvent(prepare);
  useEffect(() => {
    if (started.current || busy || exhausted || retryRequired) return;
    // One automatic attempt per unit, including React's effect replay.
    // Failures require an explicit retry so they cannot burn the allowance.
    started.current = true;
    void start();
  }, [busy, exhausted, retryRequired]);
  return (
    <div className="learning-card min-w-0 bg-white border-solid rounded-xl wrap-anywhere mx-0 my-5 p-6.25 border border-olive-300 dark:bg-neutral-800 dark:border-olive-700 [&_>_label]:block [&_>_label]:mt-4.5 [&_>_label]:mb-1.5 [&_>_label]:font-semibold [&_>_textarea]:w-full [&_>_textarea]:min-w-0 [&_>_textarea]:border-solid [&_>_textarea]:rounded-lg [&_>_textarea]:bg-white [&_>_textarea]:text-olive-800 [&_>_textarea]:px-3.25 [&_>_textarea]:py-2.75 [&_>_textarea]:border [&_>_textarea]:border-olive-300 dark:[&_>_textarea]:bg-neutral-800 dark:[&_>_textarea]:text-olive-200 dark:[&_>_textarea]:border-olive-700 [&_>_select]:w-full [&_>_select]:min-w-0 [&_>_select]:border-solid [&_>_select]:rounded-lg [&_>_select]:bg-white [&_>_select]:text-olive-800 [&_>_select]:whitespace-normal [&_>_select]:mb-3.5 [&_>_select]:px-3.25 [&_>_select]:py-2.75 [&_>_select]:border [&_>_select]:border-olive-300 dark:[&_>_select]:bg-neutral-800 dark:[&_>_select]:text-olive-200 dark:[&_>_select]:border-olive-700 max-lesson:p-4.5 max-mobile:[&_>_textarea]:text-[1rem]">
      <p role="status">
        {exhausted
          ? "Your saved course is available, but this unit needs more AI allowance to prepare."
          : failed || retryRequired
            ? "Your course is saved. Retry when you’re ready to prepare this unit."
            : "Preparing your unit…"}
      </p>
      {(failed || retryRequired) && (
        <Button disabled={busy || exhausted} onClick={() => void prepare()}>
          Retry preparing unit
        </Button>
      )}
    </div>
  );
}
export function LearningRoom({
  id,
  userId,
  sample = false,
}: {
  id?: string;
  userId: string;
  sample?: boolean;
}) {
  const router = useRouter();
  const [savedSession, setSession] = useState<LearningSession | null>(null);
  const sampleKey = "teech:teacher-sample:v1";
  const local = useLocalSnapshot(sampleKey);
  const ready = useBrowserReady();
  const cachedSample = useMemo(() => {
    try {
      const cached = JSON.parse(local);
      const valid = learningStateSchema.safeParse(
        Object.fromEntries(
          Object.entries(cached).filter(
            ([k]) =>
              ![
                "version",
                "providerAttempts",
                "topicId",
                "teachingId",
              ].includes(k),
          ),
        ),
      ).success;
      return valid ? (cached as LearningSession) : newTeacherSample();
    } catch {
      return newTeacherSample();
    }
  }, [local]);
  const session = savedSession || (sample && ready ? cachedSample : null);
  const [busy, setBusy] = useState(false);
  const [pendingLabel, setPendingLabel] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const questionDraft = useDraft(
    `teech:${userId}:learn:${id || "sample"}:help-draft`,
    z.string().max(500),
    "",
  );
  const question = questionDraft.value;
  const [deleting, setDeleting] = useState(false);
  const locked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    if (!sample && id) {
      fetchLearning(id)
        .then((d) => {
          if (active) setSession(d.learning!);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }
    return () => {
      active = false;
    };
  }, [id, sample]);
  const focusedSession = useRef<LearningSession | null>(null);
  useEffect(() => {
    if (!session) return;
    const previous = focusedSession.current;
    focusedSession.current = session;
    if (
      !previous ||
      previous.id !== session.id ||
      previous.phase !== session.phase ||
      previous.active !== session.active
    ) {
      const target =
        session.phase === "practice"
          ? document.getElementById("practice-title")
          : heading.current;
      target?.focus();
      return;
    }
    // In-place updates keep the learner at the affected item. Merely loading
    // the same state should not steal focus from an input or help control.
    if (session.phase !== "practice") return;
    const unit =
      session.active === 3 ? session.targeted : session.units[session.active];
    const oldUnit =
      previous.active === 3
        ? previous.targeted
        : previous.units[previous.active];
    for (const item of unit?.attempts || []) {
      const old = oldUnit?.attempts.find((a) => a.itemId === item.itemId);
      const targetId =
        item.hints.length > (old?.hints.length || 0)
          ? `hint-${item.itemId}-${item.hints.length - 1}`
          : item.solution && !old?.solution
            ? `solution-${item.itemId}`
            : item.dispute !== null && item.dispute !== old?.dispute
              ? `dispute-${item.itemId}`
              : item.feedback &&
                  JSON.stringify(item.feedback) !==
                    JSON.stringify(old?.feedback)
                ? `feedback-${item.itemId}`
                : null;
      if (targetId) {
        document.getElementById(targetId)?.focus();
        break;
      }
    }
  }, [session]);
  function adopt(next: LearningSession) {
    setSession((current) =>
      !current || next.version >= current.version ? next : current,
    );
    if (sample && !writeLocal(sampleKey, next))
      setNotice(
        "Browser storage is unavailable. The fixed sample will reset when you leave.",
      );
  }
  const act: LearningAction = async (action, values = {}) => {
    if (!session || locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setPendingLabel(
      action === "submit" || action === "retry_grade"
        ? "Saving your answer and preparing feedback…"
        : ["generate", "plan", "targeted", "help", "handoff_extract"].includes(
              action,
            )
          ? "Preparing this step…"
          : "Saving this step…",
    );
    let definiteFailure = false;
    try {
      const d = sample
        ? {
            learning: sampleTeacherAction(session, { action, ...values }),
            error: undefined,
            deleted: false,
          }
        : await learningApi(userId, {
            action,
            id: session.id,
            version: session.version,
            ...values,
          });
      if (d.learning) adopt(d.learning);
      if (d.error) {
        definiteFailure = true;
        throw new Error(d.error);
      }
      if (d.deleted) {
        clearLearningDrafts(userId, session.id);
        router.push("/library");
        return true;
      }
      if (action === "handoff" && d.learning?.teachingId)
        router.push(`/teach/${d.learning.teachingId}`);
      if (action === "help" && values.question === question)
        questionDraft.clear(question);
      return true;
    } catch (e) {
      let recovered = false;
      let recoveredSession: LearningSession | undefined;
      if (!sample && id) {
        try {
          const d = await fetchLearning(id);
          if (d.learning) {
            recoveredSession = d.learning;
            adopt(d.learning);
            // A GET alone does not prove the intended action committed.
            recovered =
              !definiteFailure &&
              actionRecovered(session, d.learning, action, values);
          }
        } catch {
          /* Keep local draft; never claim an unpersisted result is saved. */
        }
      }
      if (recovered) {
        setNotice("Connection restored. Your saved result is ready.");
        if (action === "help" && values.question === question)
          questionDraft.clear(question);
        if (action === "handoff" && recoveredSession?.teachingId)
          router.push(`/teach/${recoveredSession.teachingId}`);
        return true;
      }
      setError(e instanceof Error ? e.message : "This step could not finish.");
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  async function reload() {
    if (sample) {
      const fresh = newTeacherSample();
      try {
        for (const key of Object.keys(localStorage))
          if (key.startsWith(`teech:${userId}:learn:${fresh.id}:`))
            removeLocal(key);
      } catch {}
      questionDraft.clear();
      setSession(fresh);
      writeLocal(sampleKey, fresh);
      setError("");
      return;
    }
    setError("");
    try {
      const d = await fetchLearning(id);
      if (d.learning) adopt(d.learning);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reload.");
    }
  }
  if (!session)
    return (
      <div className="page max-w-275 pt-11 pb-3 min-h-[65vh] mx-auto my-0 px-6 max-mobile:pt-6.25 max-mobile:pb-2.5 max-mobile:px-4.5">
        <h1>Learn with Sage.</h1>
        {error ? (
          <div
            className="error-box bg-rose-50 border-solid rounded-lg text-[0.75rem] text-yellow-800 wrap-anywhere mx-0 my-4.5 px-4.5 py-3.75 border border-taupe-300 dark:bg-olive-800 dark:text-red-300 dark:border-olive-600"
            role="alert"
          >
            {error}
            <Button variant="outline" onClick={() => void reload()}>
              Reload saved course
            </Button>
            <Link href="/library">Return to library</Link>
          </div>
        ) : (
          <p role="status">Opening the saved course…</p>
        )}
      </div>
    );
  const s = session;
  const u = s.active === 3 ? s.targeted : s.units[s.active];
  const unitTitle =
    s.active === 3 ? "Focused practice" : s.plan?.units[s.active]?.title;
  return (
    <div className="page learning-page max-w-275 pt-11 pb-3 min-h-[65vh] mx-auto my-0 px-6 [&_blockquote]:border-l-2 [&_blockquote]:border-solid [&_blockquote]:border-l-olive-300 [&_blockquote]:pl-4 [&_blockquote]:whitespace-pre-wrap [&_blockquote]:wrap-anywhere [&_blockquote]:mx-0 [&_blockquote]:my-4 dark:[&_blockquote]:border-l-olive-700 [&_.button]:whitespace-normal [&_.button]:h-auto [&_.button]:min-h-10 max-mobile:pt-6.25 max-mobile:pb-2.5 max-mobile:px-4.5">
      <div className="learning-topbar flex items-center gap-3.5 flex-wrap justify-between mb-7">
        <Link
          href={sample ? "/" : "/library"}
          className="back-link inline-flex items-center gap-2 text-[0.6875rem] text-neutral-500 dark:text-olive-400"
        >
          ← {sample ? "Home" : "Pause and return to library"}
        </Link>
        <span className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
          SAGE · TEACHER
        </span>
      </div>
      {sample && (
        <div className="preview-banner teacher-preview border-solid bg-olive-100 rounded-[0.4375rem] flex gap-2.5 items-center mb-7 justify-between px-4 py-3 border border-olive-300 dark:bg-olive-800 dark:border-olive-700 [&_p]:text-[0.6875rem] [&_p]:leading-[1.65] [&_p]:text-stone-500 [&_p]:m-0 dark:[&_p]:text-olive-400 [&_strong]:font-semibold [&_a]:underline max-mobile:flex-col max-mobile:items-stretch max-mobile:mb-6 max-mobile:px-3 max-mobile:py-2.75 max-mobile:[&_p]:text-[0.625rem]">
          <div className="teacher-preview-copy flex-1 min-w-0">
            <strong>Sage sample · fixed content</strong>
            <p>
              No credentials or AI calls. Open-text feedback is illustrative,
              not an assessment.
            </p>
          </div>
          <div className="teacher-preview-actions flex items-center flex-wrap gap-3 [&_a]:text-[0.75rem] max-mobile:justify-between">
            <Button variant="ghost" size="sm" onClick={() => void reload()}>
              Reset sample
            </Button>
            <Link
              className="text-link text-[0.75rem] inline-flex gap-2 items-center hover:underline"
              href="/sample"
            >
              Try Pip →
            </Link>
          </div>
        </div>
      )}
      <div className="page-heading flex items-center justify-between gap-6 mt-5 mb-9 mx-0 [&_.eyebrow]:text-[0.5625rem] [&_.eyebrow]:mb-3.5 [&_h1]:mb-3.5 [&_p:last-child]:text-[0.8125rem] [&_p:last-child]:mb-0 max-mobile:mt-3.5 max-mobile:items-start max-mobile:flex-col max-mobile:gap-5.5 max-mobile:[&_h1]:text-[2.25rem] max-mobile:[&_.eyebrow]:text-[0.5rem] max-mobile:[&_.eyebrow]:tracking-[0.0625rem] max-mobile:[&_>_p]:text-[0.75rem]">
        <div>
          <p className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
            LEARN → PRACTICE · THEN, OPTIONALLY, TEACH PIP
          </p>
          <h1 ref={heading} tabIndex={-1}>
            {s.plan?.title || s.input.topic}
          </h1>
          <p>{provenance(s)}</p>
        </div>
        <div className="learning-teacher w-25 text-center text-[0.75rem] shrink-0 max-lesson:hidden">
          <Teacher small />
          <span>Sage · Teacher</span>
        </div>
      </div>
      {!sample && (
        <p className="micro text-[0.6875rem] leading-[1.7] text-olive-600 dark:text-olive-400">
          AI feedback can be wrong. Sage and Pip share your account allowance.{" "}
          {s.providerAttempts}/22 course AI attempts used, including failed
          calls and repairs. Daily capacity is not reserved.
        </p>
      )}
      {s.providerAttempts >= 22 && (
        <p
          className="notice rounded-md bg-olive-100 text-olive-600 text-[0.75rem] px-4 py-3 dark:bg-olive-800 dark:text-olive-400"
          role="status"
        >
          This course’s AI allowance is exhausted. Saved content, navigation,
          cached hints, solutions and summary remain accessible.
        </p>
      )}
      {busy && (
        <p
          className="loading-line flex items-center gap-3 text-[0.8125rem] p-7.5"
          role="status"
        >
          {pendingLabel}
        </p>
      )}
      {error && (
        <div
          className="error-box bg-rose-50 border-solid rounded-lg text-[0.75rem] text-yellow-800 wrap-anywhere mx-0 my-4.5 px-4.5 py-3.75 border border-taupe-300 dark:bg-olive-800 dark:text-red-300 dark:border-olive-600"
          role="alert"
        >
          {error}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void reload()}
          >
            Reload saved course
          </Button>
        </div>
      )}
      {(notice || questionDraft.notice) && (
        <p role="status">{notice || questionDraft.notice}</p>
      )}
      {s.phase === "setup" || s.phase === "plan" ? (
        <PlanSetup
          key={`${s.id}:${s.version}`}
          userId={userId}
          session={s}
          busy={busy}
          act={act}
          sample={sample}
        />
      ) : (
        <div className="learning-layout grid grid-cols-[14.6875rem_minmax(0,1fr)] gap-10.5 mt-8.5 items-start max-lesson:grid-cols-[minmax(0,1fr)] max-lesson:gap-6">
          <aside className="learning-outline min-w-0 sticky top-5 border-solid rounded-xl text-[0.8125rem] p-4.5 border border-olive-300 dark:border-olive-700 [&_summary]:font-semibold [&_summary]:cursor-pointer [&_ol]:pl-4.5 [&_li]:mx-0 [&_li]:my-4.5 [&_li[aria-current]]:text-olive-600 [&_li[aria-current]]:font-bold dark:[&_li[aria-current]]:text-olive-400 [&_.button]:mt-1.75 [&_.button]:whitespace-normal [&_.button]:text-left max-lesson:static max-lesson:[&_ol]:flex max-lesson:[&_ol]:flex-wrap max-lesson:[&_ol]:gap-3 max-lesson:[&_ol]:list-none max-lesson:[&_ol]:p-0 max-lesson:[&_li]:flex-[1_1_10rem] max-lesson:[&_li]:m-0">
            <details open>
              <summary>
                Course outline · {s.completed.length}/{s.plan!.units.length}{" "}
                complete
              </summary>
              <ol>
                {s.plan!.units.map((p, i) => (
                  <li
                    key={p.id}
                    aria-current={
                      s.active === i && s.phase !== "summary"
                        ? "step"
                        : undefined
                    }
                  >
                    <span>
                      {s.completed.includes(p.id) ? "✓ " : ""}
                      {p.title}
                    </span>
                    {s.units[i] && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void act("revisit", { unitId: p.id })}
                      >
                        Revisit unit {i + 1}
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void act("summary")}
              >
                View summary / end early
              </Button>
            </details>
          </aside>
          <div className="learning-main min-w-0">
            {s.phase === "summary" ? (
              <LearningSummary
                userId={userId}
                session={s}
                busy={busy}
                act={act}
                sample={sample}
              />
            ) : s.phase === "practice" && u ? (
              <LearningPractice
                key={u.content.id}
                unit={u}
                userId={userId}
                sessionId={s.id}
                busy={busy}
                act={act}
                sample={sample}
              />
            ) : (
              <section>
                <p className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
                  UNIT {s.active + 1} · INSTRUCTION
                </p>
                <h2>{unitTitle}</h2>
                {!u ? (
                  <UnitPreparation
                    key={`${s.id}:${s.plan!.units[s.active]?.id}`}
                    act={act}
                    busy={busy}
                    exhausted={s.providerAttempts >= 22}
                    retryRequired={
                      s.preparingUnit === s.plan!.units[s.active]?.id
                    }
                  />
                ) : (
                  <>
                    <p className="learning-outcome">
                      <strong className="result-label">After this:</strong>{" "}
                      {u.content.outcome}
                    </p>
                    <LessonInstruction
                      key={u.content.id}
                      unit={u}
                      busy={busy}
                      canSimplify={s.helpUsed < 2 && s.providerAttempts < 22}
                      act={act}
                      sample={sample}
                    />
                    {!!u.content.sourceExcerpts.length && (
                      <details>
                        <summary>Supporting passages from your notes</summary>
                        {u.content.sourceExcerpts.map((quote, i) => (
                          <blockquote key={i}>{quote}</blockquote>
                        ))}
                        <p className="micro text-[0.6875rem] leading-[1.7] text-olive-600 dark:text-olive-400">
                          Exact text matching checks provenance, not the
                          correctness of an explanation.
                        </p>
                      </details>
                    )}
                    {u.clarifications
                      .filter((c) => c.question !== SIMPLIFY_LESSON_QUESTION)
                      .map((c, i) => (
                        <section
                          className="learning-card min-w-0 bg-white border-solid rounded-xl wrap-anywhere mx-0 my-5 p-6.25 border border-olive-300 dark:bg-neutral-800 dark:border-olive-700 [&_>_label]:block [&_>_label]:mt-4.5 [&_>_label]:mb-1.5 [&_>_label]:font-semibold [&_>_textarea]:w-full [&_>_textarea]:min-w-0 [&_>_textarea]:border-solid [&_>_textarea]:rounded-lg [&_>_textarea]:bg-white [&_>_textarea]:text-olive-800 [&_>_textarea]:px-3.25 [&_>_textarea]:py-2.75 [&_>_textarea]:border [&_>_textarea]:border-olive-300 dark:[&_>_textarea]:bg-neutral-800 dark:[&_>_textarea]:text-olive-200 dark:[&_>_textarea]:border-olive-700 [&_>_select]:w-full [&_>_select]:min-w-0 [&_>_select]:border-solid [&_>_select]:rounded-lg [&_>_select]:bg-white [&_>_select]:text-olive-800 [&_>_select]:whitespace-normal [&_>_select]:mb-3.5 [&_>_select]:px-3.25 [&_>_select]:py-2.75 [&_>_select]:border [&_>_select]:border-olive-300 dark:[&_>_select]:bg-neutral-800 dark:[&_>_select]:text-olive-200 dark:[&_>_select]:border-olive-700 max-lesson:p-4.5 max-mobile:[&_>_textarea]:text-[1rem]"
                          key={i}
                        >
                          <h3>{c.question}</h3>
                          <LessonBlocks blocks={c.blocks} />
                          {c.sourceExcerpts.map((q, j) => (
                            <blockquote key={j}>{q}</blockquote>
                          ))}
                        </section>
                      ))}
                    <section className="learning-card min-w-0 bg-white border-solid rounded-xl wrap-anywhere mx-0 my-5 p-6.25 border border-olive-300 dark:bg-neutral-800 dark:border-olive-700 [&_>_label]:block [&_>_label]:mt-4.5 [&_>_label]:mb-1.5 [&_>_label]:font-semibold [&_>_textarea]:w-full [&_>_textarea]:min-w-0 [&_>_textarea]:border-solid [&_>_textarea]:rounded-lg [&_>_textarea]:bg-white [&_>_textarea]:text-olive-800 [&_>_textarea]:px-3.25 [&_>_textarea]:py-2.75 [&_>_textarea]:border [&_>_textarea]:border-olive-300 dark:[&_>_textarea]:bg-neutral-800 dark:[&_>_textarea]:text-olive-200 dark:[&_>_textarea]:border-olive-700 [&_>_select]:w-full [&_>_select]:min-w-0 [&_>_select]:border-solid [&_>_select]:rounded-lg [&_>_select]:bg-white [&_>_select]:text-olive-800 [&_>_select]:whitespace-normal [&_>_select]:mb-3.5 [&_>_select]:px-3.25 [&_>_select]:py-2.75 [&_>_select]:border [&_>_select]:border-olive-300 dark:[&_>_select]:bg-neutral-800 dark:[&_>_select]:text-olive-200 dark:[&_>_select]:border-olive-700 max-lesson:p-4.5 max-mobile:[&_>_textarea]:text-[1rem]">
                      <h3>A little help with this step</h3>
                      <p>
                        {2 - s.helpUsed} help requests remain for the whole
                        course. Failed requests also use a help request.
                      </p>
                      <div className="learning-actions flex items-center gap-3.5 flex-wrap max-lesson:items-stretch max-lesson:[&_>_.button]:flex-[1_1_auto]">
                        <Button
                          variant="outline"
                          disabled={
                            busy || s.helpUsed >= 2 || s.providerAttempts >= 22
                          }
                          onClick={() =>
                            void act("help", {
                              question:
                                "Explain this unit another way, without revealing practice answers.",
                            })
                          }
                        >
                          Explain another way
                        </Button>
                      </div>
                      <label htmlFor="step-question">
                        Ask about this step (up to 500 characters)
                      </label>
                      <textarea
                        id="step-question"
                        rows={2}
                        maxLength={500}
                        value={question}
                        disabled={busy || s.helpUsed >= 2}
                        onChange={(e) => questionDraft.change(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        disabled={
                          busy ||
                          s.helpUsed >= 2 ||
                          !question.trim() ||
                          s.providerAttempts >= 22
                        }
                        onClick={() => void act("help", { question })}
                      >
                        Ask about this step
                      </Button>
                    </section>
                    <Button
                      disabled={busy}
                      onClick={() => void act("practice")}
                    >
                      Continue to practice →
                    </Button>
                  </>
                )}
              </section>
            )}
          </div>
        </div>
      )}
      {!sample && (
        <div className="learning-delete mx-0 my-9">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setDeleting(true)}
          >
            Delete course
          </Button>
          {deleting && (
            <div
              className="confirm-box bg-taupe-100 border-solid rounded-[0.5625rem] flex items-center gap-3.5 mt-5 p-5 border border-taupe-300 dark:bg-olive-800 dark:border-olive-600 [&_>_div]:flex-1 [&_h2]:text-[1.1875rem] [&_p]:text-[0.75rem] [&_p]:m-0 max-mobile:flex-wrap max-mobile:[&_>_div]:flex-[1_1_100%]"
              role="alert"
            >
              <p>
                Permanently delete this course, its submitted answers and
                practice records? Topics and teaching attempts created from it
                will remain.
              </p>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void act("delete")}
              >
                Delete course permanently
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setDeleting(false)}
              >
                Keep course
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function PlanSetup({
  session: s,
  busy,
  act,
  sample,
  userId,
}: {
  session: LearningSession;
  busy: boolean;
  act: LearningAction;
  sample: boolean;
  userId: string;
}) {
  const draft = useDraft(
    `teech:${userId}:learn:${s.id}:plan-draft`,
    learningDraftSchema,
    s.input,
  );
  const input = draft.value;
  return (
    <div className="learning-plan max-w-190">
      {s.issue && (
        <p
          className="notice rounded-md bg-olive-100 text-olive-600 text-[0.75rem] px-4 py-3 dark:bg-olive-800 dark:text-olive-400"
          role="status"
        >
          {s.issue}{" "}
          {s.policy === "notes"
            ? "You can add missing material, or explicitly remove the notes below to request a separate topic-based course."
            : "Add material for a specific document, or narrow the goal if the needed information is unavailable."}
        </p>
      )}
      {s.plan && (
        <section className="learning-card course-plan">
          <header>
            <p className="result-label">Your learning path</p>
            <h2>Your course outline</h2>
            <RichText text={s.plan.interpretation} />
            <p className="plan-meta">
              <span>
                About {s.plan.estimatedMinutes} minutes · at your pace
              </span>
              <span>
                {s.plan.units.length}{" "}
                {s.plan.units.length === 1 ? "unit" : "units"}
              </span>
            </p>
          </header>
          <div className="plan-scope">
            <div>
              <p className="result-label">Will cover</p>
              <RichText text={s.plan.covers} />
            </div>
            <div>
              <p className="result-label">For another time</p>
              <RichText text={s.plan.excludes} />
            </div>
          </div>
          <section className="plan-section">
            <h3>Starting points</h3>
            {s.plan.prerequisites.length ? (
              <ul>
                {s.plan.prerequisites.map((p) => (
                  <li key={p}>
                    <RichText text={p} />
                  </li>
                ))}
              </ul>
            ) : (
              <p>No specific prerequisites.</p>
            )}
          </section>
          <section className="plan-section">
            <h3>What you’ll work toward</h3>
            <ul>
              {s.plan.objectives.map((o) => (
                <li key={o.id}>
                  <RichText text={o.text} />
                </li>
              ))}
            </ul>
          </section>
          <section className="plan-section">
            <h3>The route we’ll take</h3>
            <ol className="plan-units">
              {s.plan.units.map((u) => (
                <li key={u.id}>{u.title}</li>
              ))}
            </ol>
          </section>
          {s.plan.sourceExcerpts.map((q, i) => (
            <blockquote key={i}>{q}</blockquote>
          ))}
          <footer>
            <p className="micro text-[0.75rem] leading-[1.7] text-olive-600 dark:text-olive-400">
              Accepting fixes this outline. A different scope later needs a new
              course. Your first unit prepares automatically using AI allowance;
              later units prepare as you reach them. Reopening saved units uses
              no AI allowance.
            </p>
            <Button disabled={busy} onClick={() => void act("accept")}>
              Accept outline & begin
            </Button>
          </footer>
        </section>
      )}
      {!sample && (
        <section className="learning-card min-w-0 bg-white border-solid rounded-xl wrap-anywhere mx-0 my-5 p-6.25 border border-olive-300 dark:bg-neutral-800 dark:border-olive-700 [&_>_label]:block [&_>_label]:mt-4.5 [&_>_label]:mb-1.5 [&_>_label]:font-semibold [&_>_textarea]:w-full [&_>_textarea]:min-w-0 [&_>_textarea]:border-solid [&_>_textarea]:rounded-lg [&_>_textarea]:bg-white [&_>_textarea]:text-olive-800 [&_>_textarea]:px-3.25 [&_>_textarea]:py-2.75 [&_>_textarea]:border [&_>_textarea]:border-olive-300 dark:[&_>_textarea]:bg-neutral-800 dark:[&_>_textarea]:text-olive-200 dark:[&_>_textarea]:border-olive-700 [&_>_select]:w-full [&_>_select]:min-w-0 [&_>_select]:border-solid [&_>_select]:rounded-lg [&_>_select]:bg-white [&_>_select]:text-olive-800 [&_>_select]:whitespace-normal [&_>_select]:mb-3.5 [&_>_select]:px-3.25 [&_>_select]:py-2.75 [&_>_select]:border [&_>_select]:border-olive-300 dark:[&_>_select]:bg-neutral-800 dark:[&_>_select]:text-olive-200 dark:[&_>_select]:border-olive-700 max-lesson:p-4.5 max-mobile:[&_>_textarea]:text-[1rem]">
          <h2>
            {s.plan
              ? "Correct the interpretation or scope"
              : "Shape a short course"}
          </h2>
          <LearningFields
            input={input}
            onChange={draft.change}
            disabled={busy}
          />
          {draft.notice && <p role="status">{draft.notice}</p>}
          <Button
            disabled={busy || !input.topic.trim() || s.providerAttempts >= 22}
            onClick={async () => {
              if (await act("plan", { input })) draft.clear(input);
            }}
          >
            {s.plan
              ? "Revise outline · uses AI allowance"
              : "Create course · uses AI allowance"}
          </Button>
          <p className="micro text-[0.6875rem] leading-[1.7] text-olive-600 dark:text-olive-400">
            Only this button revises the outline. Editing a field uses no AI
            calls.
          </p>
        </section>
      )}
    </div>
  );
}
