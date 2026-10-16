"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Student } from "./student";
import { LearningFields } from "./learning-setup";
import { LearningPractice, type LearningAction } from "./learning-practice";
import { LearningSummary } from "./learning-summary";
import {
  actionRecovered,
  fetchLearning,
  learningApi,
} from "@/lib/learning-client";
import {
  learningStateSchema,
  provenance,
  type LearningSession,
  type Unit,
} from "@/lib/learning";
import { newTeacherSample, sampleTeacherAction } from "@/lib/teacher-sample";
import { removeLocal, writeLocal } from "@/lib/client";
import { useLocalSnapshot, useBrowserReady } from "@/lib/browser-storage";
import { useDraft } from "@/lib/draft";
import { learningDraftSchema } from "@/lib/learning";
import { z } from "zod";

export function LessonBlocks({ blocks }: { blocks: Unit["explanation"] }) {
  return (
    <div className="lesson-blocks">
      {blocks.map((b, i) =>
        b.kind === "code" ? (
          <figure key={i}>
            <figcaption>Illustrative code · not executed</figcaption>
            <pre>
              <code>{b.text}</code>
            </pre>
          </figure>
        ) : b.kind === "equation" ? (
          <pre
            className="lesson-equation"
            key={i}
            aria-label={`Equation: ${b.text}`}
          >
            {b.text}
          </pre>
        ) : b.kind === "list" ? (
          <ul key={i}>
            {b.text
              .split("\n")
              .filter(Boolean)
              .map((line, n) => (
                <li key={n}>{line}</li>
              ))}
          </ul>
        ) : (
          <p key={i}>{b.text}</p>
        ),
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
  useEffect(() => {
    if (!session) return;
    const latest = session.events.at(-1);
    const feedback =
      session.phase === "practice" &&
      latest &&
      ["submitted", "assessed", "unsure"].includes(latest.type)
        ? document.getElementById(`feedback-${latest.target}`)
        : null;
    const target =
      feedback ||
      (session.phase === "practice"
        ? document.getElementById("practice-title")
        : null) ||
      heading.current;
    target?.focus();
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
        try {
          for (const key of Object.keys(localStorage))
            if (key.startsWith(`teech:${userId}:learn:${session.id}:`))
              localStorage.removeItem(key);
        } catch {}
        router.push("/library");
        return true;
      }
      if (action === "handoff" && d.learning?.teachingId)
        router.push(`/teach/${d.learning.teachingId}`);
      if (action === "help") questionDraft.clear(question);
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
        if (action === "help") questionDraft.clear(question);
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
      <div className="page">
        <h1>Learn with a teacher.</h1>
        {error ? (
          <div className="error-box" role="alert">
            {error}
            <Button variant="outline" onClick={() => void reload()}>
              Reload saved lesson
            </Button>
            <Link href="/library">Return to library</Link>
          </div>
        ) : (
          <p role="status">Opening the saved lesson…</p>
        )}
      </div>
    );
  const s = session;
  const u = s.active === 3 ? s.targeted : s.units[s.active];
  const unitTitle =
    s.active === 3 ? "Focused practice" : s.plan?.units[s.active]?.title;
  return (
    <div className="page learning-page">
      <div className="learning-topbar">
        <Link href={sample ? "/" : "/library"} className="back-link">
          ← {sample ? "Home" : "Pause and return to library"}
        </Link>
        <span className="eyebrow">PIP · TEACHER</span>
      </div>
      {sample && (
        <div className="preview-banner teacher-preview">
          <div className="teacher-preview-copy">
            <strong>Teacher sample · fixed content</strong>
            <p>
              No credentials or AI calls. Open-text feedback is illustrative,
              not an assessment.
            </p>
          </div>
          <div className="teacher-preview-actions">
            <Button variant="ghost" size="sm" onClick={() => void reload()}>
              Reset sample
            </Button>
            <Link className="text-link" href="/sample">
              Try the Student sample →
            </Link>
          </div>
        </div>
      )}
      <div className="page-heading">
        <div>
          <p className="eyebrow">LEARN → PRACTICE → TEACH</p>
          <h1 ref={heading} tabIndex={-1}>
            {s.plan?.title || s.input.topic}
          </h1>
          <p>{provenance(s)}</p>
        </div>
        <div className="learning-pip">
          <Student small roleName="teacher" />
          <span>Teacher</span>
        </div>
      </div>
      {!sample && (
        <p className="micro">
          AI feedback can be wrong. Teacher and Student share your account
          allowance. {s.providerAttempts}/22 lesson AI attempts used, including
          failed calls and repairs. Daily capacity is not reserved.
        </p>
      )}
      {s.providerAttempts >= 22 && (
        <p className="notice" role="status">
          This lesson’s AI budget is exhausted. Saved content, navigation,
          cached hints, solutions and summary remain accessible.
        </p>
      )}
      {busy && (
        <p className="loading-line" role="status">
          {pendingLabel}
        </p>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void reload()}
          >
            Reload saved lesson
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
        <div className="learning-layout">
          <aside className="learning-outline">
            <details open>
              <summary>
                Lesson outline · {s.completed.length}/{s.plan!.units.length}{" "}
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
          <div className="learning-main">
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
                <p className="eyebrow">UNIT {s.active + 1} · INSTRUCTION</p>
                <h2>{unitTitle}</h2>
                {!u ? (
                  <div className="learning-card">
                    <p>
                      Generate this unit when you are ready. Reopening saved
                      units uses no AI allowance.
                    </p>
                    <Button
                      disabled={busy || s.providerAttempts >= 22}
                      onClick={() => void act("generate")}
                    >
                      Prepare this unit
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="learning-outcome">
                      <strong>After this:</strong> {u.content.outcome}
                    </p>
                    <LessonBlocks blocks={u.content.explanation} />
                    {!!u.content.definitions.length && (
                      <section className="learning-card">
                        <h3>Definitions to keep nearby</h3>
                        <ul>
                          {u.content.definitions.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      </section>
                    )}
                    <section className="learning-card">
                      <h3>A worked example</h3>
                      <LessonBlocks blocks={u.content.workedExample} />
                    </section>
                    {u.content.misunderstanding && (
                      <p className="learning-hint">
                        <strong>Watch for this:</strong>{" "}
                        {u.content.misunderstanding}
                      </p>
                    )}
                    {!!u.content.sourceExcerpts.length && (
                      <details>
                        <summary>Supporting passages from your notes</summary>
                        {u.content.sourceExcerpts.map((quote, i) => (
                          <blockquote key={i}>{quote}</blockquote>
                        ))}
                        <p className="micro">
                          Exact text matching checks provenance, not the
                          correctness of an explanation.
                        </p>
                      </details>
                    )}
                    {u.clarifications.map((c, i) => (
                      <section className="learning-card" key={i}>
                        <h3>{c.question}</h3>
                        <LessonBlocks blocks={c.blocks} />
                        {c.sourceExcerpts.map((q, j) => (
                          <blockquote key={j}>{q}</blockquote>
                        ))}
                      </section>
                    ))}
                    <section className="learning-card">
                      <h3>A little help with this step</h3>
                      <p>
                        {2 - s.helpUsed} help requests remain for the whole
                        lesson. Failed requests also use a help request.
                      </p>
                      <div className="learning-actions">
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
        <div className="learning-delete">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setDeleting(true)}
          >
            Delete learning session
          </Button>
          {deleting && (
            <div className="confirm-box" role="alert">
              <p>
                Permanently delete this lesson, submitted answers, private
                assessments and its request history? Derived teaching topics and
                attempts will remain.
              </p>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void act("delete")}
              >
                Delete lesson permanently
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setDeleting(false)}
              >
                Keep lesson
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
    <div className="learning-plan">
      {s.issue && (
        <p className="notice" role="status">
          {s.issue}{" "}
          {s.policy === "notes"
            ? "You can add missing material, or explicitly remove the notes below to request a separate general-knowledge plan."
            : "Provide source material if this requires current facts or a specific document."}
        </p>
      )}
      {s.plan && (
        <section className="learning-card">
          <h2>Your proposed destination</h2>
          <p>
            <strong>Interpretation:</strong> {s.plan.interpretation}
          </p>
          <p>
            <strong>Will cover:</strong> {s.plan.covers}
          </p>
          <p>
            <strong>Will not cover:</strong> {s.plan.excludes}
          </p>
          <p>
            Estimated {s.plan.estimatedMinutes} minutes, depending on your pace.
          </p>
          <h3>Starting points</h3>
          {s.plan.prerequisites.length ? (
            <ul>
              {s.plan.prerequisites.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p>No specific prerequisites.</p>
          )}
          <h3>What you’ll work toward</h3>
          <ul>
            {s.plan.objectives.map((o) => (
              <li key={o.id}>{o.text}</li>
            ))}
          </ul>
          <ol>
            {s.plan.units.map((u) => (
              <li key={u.id}>{u.title}</li>
            ))}
          </ol>
          {s.plan.sourceExcerpts.map((q, i) => (
            <blockquote key={i}>{q}</blockquote>
          ))}
          <p className="micro">
            Accepting freezes this plan. A different scope later needs a new
            lesson.
          </p>
          <Button disabled={busy} onClick={() => void act("accept")}>
            Accept plan & begin
          </Button>
        </section>
      )}
      {!sample && (
        <section className="learning-card">
          <h2>
            {s.plan
              ? "Correct the interpretation or scope"
              : "Shape a short lesson"}
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
              ? "Generate revised plan · uses AI allowance"
              : "Generate lesson plan · uses AI allowance"}
          </Button>
          <p className="micro">
            Only this button regenerates a plan. Editing a field uses no AI
            calls.
          </p>
        </section>
      )}
    </div>
  );
}
