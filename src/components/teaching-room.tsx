"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "./ui/button";
import { Student } from "./student";
import { acceptAnswer, acceptExplanation, type Session } from "@/lib/domain";
import { fixtureReview, newPreview, previewQuestions } from "@/lib/sample";
import { api, olderAttempts, readLocal, writeLocal } from "@/lib/client";
type UnsentAnswer = { text: string; question: string; position: number };

export function TeachingRoom({
  live,
  id,
  userId,
}: {
  live: boolean;
  id?: string;
  userId?: string;
}) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [history, setHistory] = useState<Session[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [compareId, setCompareId] = useState("");
  const [unsentAnswer, setUnsentAnswer] = useState<UnsentAnswer | null>(null);
  const initialized = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const scope = userId || "visitor";
  const currentKey = `teech:${scope}:sample:${live ? "live" : "preview"}`;
  function persist(s: Session) {
    setSession(s);
    if (s.preview) {
      if (!writeLocal(currentKey, s))
        setNotice(
          "Browser storage is unavailable. Keep this tab open to preserve your writing.",
        );
    } else if (!id) writeLocal(currentKey, s.id);
  }
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    async function load() {
      try {
        let s: Session;
        if (!live && !id) {
          s = readLocal<Session | null>(currentKey, null) || newPreview();
          if (!s.preview || !Array.isArray(s.messages)) s = newPreview();
          writeLocal(currentKey, s);
          setHistory(
            readLocal<Session[]>(`teech:${scope}:preview-history`, []),
          );
        } else {
          const stored = id || readLocal<string | null>(currentKey, null);
          const data = stored
            ? await fetch(`/api/teech?session=${stored}`).then((r) => r.json())
            : await api({ action: "start" });
          if (data.error) throw new Error(data.error);
          s = data.session;
          if (!id) writeLocal(currentKey, s.id);
          if (userId) {
            const library = await fetch("/api/teech?history=1").then((r) =>
              r.json(),
            );
            setHistory(library.sessions || []);
            setNextCursor(library.nextCursor || null);
          }
        }
        setSession(s);
        const saved = readLocal<string>(
          `teech:draft:${scope}:${s.id}:${s.messages.length}`,
          "",
        );
        setDraft(saved);
        setUnsentAnswer(
          readLocal<UnsentAnswer | null>(
            `teech:draft:${scope}:${s.id}:conflict`,
            null,
          ),
        );
        if (saved) setNotice("Your draft is back. Pick up where you left off.");
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Could not open the attempt. Please refresh.",
        );
      }
    }
    void load();
  }, [currentKey, id, live, scope, userId]);
  function changeDraft(value: string) {
    setDraft(value);
    if (
      session &&
      !writeLocal(
        `teech:draft:${scope}:${session.id}:${session.messages.length}`,
        value,
      )
    )
      setNotice(
        "Browser storage is unavailable. Copy your writing before leaving this tab.",
      );
  }
  async function act(
    action: "explain" | "answer" | "finish" | "reveal",
    unsure = false,
  ) {
    if (!session || busy) return;
    setBusy(true);
    setFinishing(action === "finish");
    setError("");
    setNotice("");
    function retainUnsent(next: Session) {
      const retained = {
        text: draft,
        question:
          session!.messages.at(-1)?.role === "student"
            ? session!.messages.at(-1)!.text
            : "Your initial explanation",
        position: session!.messages.length,
      };
      setUnsentAnswer(retained);
      if (!writeLocal(`teech:draft:${scope}:${session!.id}:conflict`, retained))
        setNotice(
          "Browser storage is unavailable. Copy the retained answer before leaving.",
        );
      persist(next);
      setDraft(
        readLocal<string>(
          `teech:draft:${scope}:${next.id}:${next.messages.length}`,
          "",
        ),
      );
    }
    function restoreSaved(next: Session) {
      if (
        next.messages.length !== session!.messages.length ||
        next.phase === "review"
      ) {
        const submitted = next.messages[session!.messages.length];
        const acknowledged =
          action !== "reveal" &&
          submitted?.role === "user" &&
          submitted.text === (unsure ? "I'm not sure." : draft.trim());
        if (draft.trim() && !acknowledged) {
          retainUnsent(next);
          setNotice(
            "This attempt changed in another tab. Your unsent answer is retained below.",
          );
          return;
        }
        if (acknowledged) {
          const oldKey = `teech:draft:${scope}:${session!.id}:${session!.messages.length}`;
          try {
            if (readLocal(oldKey, null) === draft)
              localStorage.removeItem(oldKey);
          } catch {}
        }
        setDraft(
          readLocal<string>(
            `teech:draft:${scope}:${next.id}:${next.messages.length}`,
            "",
          ),
        );
      }
      persist(next);
    }
    try {
      let next: Session;
      if (session.preview) {
        next = { ...session };
        if (action === "reveal") {
          if (next.phase !== "review") next.notes_revealed = true;
        } else {
          if (action === "explain") next = acceptExplanation(next, draft);
          if (
            action === "answer" ||
            (action === "finish" &&
              next.messages.at(-1)?.role === "student" &&
              draft.trim())
          )
            next = acceptAnswer(next, draft, unsure);
          if (
            action !== "finish" &&
            !next.short_retry &&
            next.question_calls < 3
          ) {
            next.messages = [
              ...next.messages,
              { role: "student", text: previewQuestions[next.question_calls] },
            ];
            next.question_calls++;
          } else {
            next.phase = "review";
            next.evaluation = fixtureReview(next);
            const h = [next, ...history.filter((s) => s.id !== next.id)].slice(
              0,
              20,
            );
            setHistory(h);
            writeLocal(`teech:${scope}:preview-history`, h);
          }
        }
      } else {
        const data = await api({
          action,
          id: session.id,
          ...(action === "explain" ||
          action === "answer" ||
          (action === "finish" && session.messages.at(-1)?.role === "student")
            ? { text: draft }
            : {}),
          ...(action === "answer" ? { unsure } : {}),
          ...(action === "answer" || action === "finish"
            ? { expectedMessages: session.messages.length }
            : {}),
        });
        if (data.conflict && data.session) {
          retainUnsent(data.session);
          setError(
            data.error ||
              "This attempt changed in another tab. Review the current question before continuing.",
          );
          return;
        }
        if (data.session) restoreSaved(data.session);
        if (data.error) throw new Error(data.error);
        next = data.session!;
      }
      persist(next);
      if (action === "reveal") setShowNotes(true);
      else {
        setDraft("");
        heading.current?.focus();
      }
    } catch (e) {
      // The server may have saved writing or a question before the POST was lost.
      if (!session.preview) {
        try {
          const response = await fetch(`/api/teech?session=${session.id}`, {
            cache: "no-store",
          });
          const saved = await response.json();
          if (response.ok && saved.session) {
            const recovered = saved.session as Session;
            const submittedWriting =
              action === "explain" ||
              action === "answer" ||
              (action === "finish" &&
                draft.trim() &&
                session.messages.at(-1)?.role === "student");
            const submitted = recovered.messages[session.messages.length];
            const ownWritingSaved =
              submitted?.role === "user" &&
              submitted.text === (unsure ? "I'm not sure." : draft.trim());
            if (
              submittedWriting &&
              recovered.messages.length !== session.messages.length &&
              !ownWritingSaved
            ) {
              retainUnsent(recovered);
              setError(
                "This attempt changed in another tab. Your unsent answer is retained separately; review the current question before continuing.",
              );
              return;
            }
            restoreSaved(recovered);
            if (
              action === "reveal" &&
              (recovered.notes_revealed || recovered.phase === "review")
            ) {
              setShowNotes(true);
              return;
            }
            if (
              action !== "reveal" &&
              (recovered.phase === "review" ||
                (recovered.messages.length > session.messages.length &&
                  recovered.messages.at(-1)?.role === "student"))
            ) {
              heading.current?.focus();
              return;
            }
          }
        } catch {
          // Keep the original error and the local draft if recovery fails.
        }
      }
      setError(
        e instanceof Error
          ? e.message
          : "Connection interrupted. Your draft is safe. Try the same action again.",
      );
    } finally {
      setBusy(false);
      setFinishing(false);
    }
  }
  async function loadOlder() {
    if (!nextCursor || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await olderAttempts(nextCursor);
      setHistory((current) => [
        ...current,
        ...(data.sessions || []).filter(
          (s) => !current.some((old) => old.id === s.id),
        ),
      ]);
      setNextCursor(data.nextCursor || null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load older attempts.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    try {
      const previous = session;
      let next: Session;
      if (session.preview) next = newPreview(true);
      else {
        const data = await api({
          action: "start",
          ...(session.topic_id ? { topicId: session.topic_id } : {}),
          retry: true,
          previousId: session.id,
        });
        if (data.error) throw new Error(data.error);
        next = data.session!;
      }
      setHistory((h) => [previous, ...h.filter((s) => s.id !== previous.id)]);
      setCompareId(previous.id);
      setShowNotes(false);
      setDraft("");
      persist(next);
      if (id) router.push(`/teach/${next.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start a retry.");
    } finally {
      setBusy(false);
    }
  }
  if (!session)
    return (
      <div className="page narrow">
        <p role={error ? "alert" : "status"}>
          {error || "Opening your study space…"}
        </p>
        {error && (
          <Button
            onClick={() => {
              try {
                localStorage.removeItem(currentKey);
              } catch {}
              if (id) router.push("/sample");
              else window.location.reload();
            }}
          >
            Open a fresh sample
          </Button>
        )}
      </div>
    );
  const review = session.phase === "review";
  const questions = session.phase === "questions";
  const max = questions ? 3000 : 6000;
  const previousOptions = history.filter(
    (s) =>
      s.id !== session.id &&
      s.evaluation &&
      s.topic_id === session.topic_id &&
      s.checklist_version === session.checklist_version &&
      JSON.stringify(s.concepts) === JSON.stringify(session.concepts),
  );
  const previous = previousOptions.find((s) => s.id === compareId);
  const clearCount =
    session.evaluation?.results.filter((r) => r.status === "Explained clearly")
      .length || 0;
  return (
    <div className="workspace">
      <div className="workspace-top">
        <Link href={userId ? "/library" : "/"} className="back-link">
          <ArrowLeft size={15} />
          {userId ? "My library" : "Back to home"}
        </Link>
        <span className="quiet-badge">
          {session.preview ? "SAMPLE PREVIEW" : "PIP · STUDENT"}
        </span>
      </div>
      {session.preview && (
        <div className="preview-banner">
          <span className="preview-dot" />
          <p>
            <strong>Sample preview</strong> · Questions and feedback are fixed
            examples, not an AI assessment of your writing. Personal saving
            requires configuration.
          </p>
        </div>
      )}
      <div className="room-title">
        <div>
          <p className="eyebrow">
            {review ? "A MOMENT TO REFLECT" : "YOUR QUIET CORNER TO THINK"}
          </p>
          <h1 ref={heading} tabIndex={-1}>
            {review ? "Look at what came through." : session.title}
          </h1>
          <p>
            {review
              ? "A few things that clicked. A few places to go next."
              : "You don’t have to explain it perfectly. Just make it your own."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => (showNotes ? setShowNotes(false) : void act("reveal"))}
          disabled={busy}
          aria-expanded={showNotes}
          aria-controls="source-notes"
        >
          {showNotes ? <EyeOff size={15} /> : <BookOpen size={15} />}{" "}
          {showNotes ? "Hide notes" : "View notes"}
        </Button>
      </div>
      {session.provenance && (
        <p className="notice">
          {session.provenance.label}. This lesson source is a study reference,
          not independent proof of correctness. Your review is relative to this
          source.{" "}
          {session.provenance.lessonId && (
            <Link
              className="text-link"
              href={`/learn/${session.provenance.lessonId}`}
            >
              Return to learning session →
            </Link>
          )}
        </p>
      )}
      <ol className="steps" aria-label="Session progress">
        {["Explain", "Questions", "Review"].map((s, i) => (
          <li
            key={s}
            className={
              (review ? 2 : questions ? 1 : 0) === i
                ? "active"
                : (review ? 2 : questions ? 1 : 0) > i
                  ? "complete"
                  : ""
            }
            aria-current={
              (review ? 2 : questions ? 1 : 0) === i ? "step" : undefined
            }
          >
            <span>
              {(review ? 2 : questions ? 1 : 0) > i ? (
                <Check size={13} />
              ) : (
                i + 1
              )}
            </span>
            {s}
            {i < 2 && <div className="step-line" />}
          </li>
        ))}
      </ol>
      {showNotes && (
        <aside id="source-notes" className="notes-panel">
          <div className="section-row">
            <h2>Your source material</h2>
            <span className="micro">
              {session.concepts.length} concepts · checklist v
              {session.checklist_version}
            </span>
          </div>
          <p className="prewrap">{session.notes}</p>
          <details>
            <summary>
              Concept checklist <ChevronDown size={15} />
            </summary>
            <ul>
              {session.concepts.map((c) => (
                <li key={c.id}>
                  <strong>{c.title}</strong> — {c.description}
                </li>
              ))}
            </ul>
          </details>
        </aside>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}
          {!review && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void retry()}
              >
                Start a fresh attempt
              </Button>
            </div>
          )}
        </div>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {unsentAnswer && (
        <section className="notice" aria-label="Retained unsent answer">
          <h2>Your unsent answer to the earlier question</h2>
          <p>{unsentAnswer.question}</p>
          <p className="prewrap">
            {unsentAnswer.text || "Marked unsure; no written answer."}
          </p>
          <p>
            This text was not attached to the current question. Copy it if
            useful, then answer the current question separately.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const originalKey = `teech:draft:${scope}:${session.id}:${unsentAnswer.position}`;
              try {
                if (readLocal(originalKey, null) === unsentAnswer.text)
                  localStorage.removeItem(originalKey);
                localStorage.removeItem(
                  `teech:draft:${scope}:${session.id}:conflict`,
                );
              } catch {}
              setUnsentAnswer(null);
            }}
          >
            Discard retained answer
          </Button>
        </section>
      )}
      {review && session.evaluation ? (
        <>
          <section className="review-summary">
            <Student small state="happy" />
            <div>
              <p className="eyebrow">
                {session.preview
                  ? "ILLUSTRATIVE FEEDBACK"
                  : "YOUR EXPLANATION, REFLECTED BACK"}
              </p>
              <h2>
                {clearCount} of {session.concepts.length} concepts explained
                clearly.
              </h2>
              <p>
                {session.preview
                  ? "These example statuses don’t evaluate what you wrote."
                  : "An AI assessment relative to your notes, which may be incomplete or incorrect."}
              </p>
              <div className="review-tags">
                <span>
                  {session.notes_revealed
                    ? "Practiced with notes"
                    : "Practiced from memory"}
                </span>
                <span>
                  {session.messages.some((m) => m.role === "student")
                    ? `${session.messages.filter((m) => m.role === "student").length} follow-up questions`
                    : "Explanation-only attempt"}
                </span>
              </div>
            </div>
          </section>
          <div className="review-insights">
            <div>
              <p className="eyebrow">WHAT CAME THROUGH</p>
              {session.evaluation.strengths.length ? (
                session.evaluation.strengths.map((s, i) => <p key={i}>{s}</p>)
              ) : (
                <p>
                  Your explanation is a starting point. Use the concept feedback
                  below for your next step.
                </p>
              )}
            </div>
            <div>
              <p className="eyebrow">A LITTLE MORE ATTENTION</p>
              {session.evaluation.revisit.map((s, i) => (
                <p key={i}>
                  <span className="small-number">0{i + 1}</span>
                  {s}
                </p>
              ))}
            </div>
          </div>
          <div className="section-row">
            <h2>Concept by concept</h2>
            {previousOptions.length > 0 && (
              <label className="compare-label">
                Compare with
                <select
                  value={compareId}
                  onChange={(e) => setCompareId(e.target.value)}
                >
                  <option value="">No comparison</option>
                  {previousOptions.map((s, i) => (
                    <option key={s.id} value={s.id}>
                      Attempt {previousOptions.length - i} ·{" "}
                      {new Date(s.created_at).toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {nextCursor && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void loadOlder()}
            >
              Load older attempts for comparison
            </Button>
          )}
          <div className="concept-results">
            {session.evaluation.results.map((r) => (
              <article key={r.conceptId} className="result">
                <div className="result-heading">
                  <h3>
                    {session.concepts.find((c) => c.id === r.conceptId)?.title}
                  </h3>
                  <span
                    className={`status status-${r.status.toLowerCase().replaceAll(" ", "-")}`}
                  >
                    {r.status}
                  </span>
                </div>
                {previous && (
                  <p className="comparison">
                    Previously:{" "}
                    {previous.evaluation?.results.find(
                      (x) => x.conceptId === r.conceptId,
                    )?.status || "Not in this checklist"}{" "}
                    <ArrowRight size={13} /> Now: {r.status}
                  </p>
                )}
                <p>{r.reason}</p>
                {r.claimType === "unsupported" && (
                  <p className="micro">
                    Not supported by these notes; this does not establish that
                    the claim is false.
                  </p>
                )}
                <div className="evidence-grid">
                  <div>
                    <span className="evidence-label">IN YOUR WORDS</span>
                    {r.userExcerpt ? (
                      <blockquote>{r.userExcerpt}</blockquote>
                    ) : (
                      <p className="micro">
                        {session.preview
                          ? "This fixture does not quote or assess your writing."
                          : r.status === "Not demonstrated"
                            ? "The explanation did not cover this concept."
                            : "No verified user quotation is available."}
                      </p>
                    )}
                  </div>
                  <div>
                    <span className="evidence-label">IN YOUR NOTES</span>
                    {r.sourceExcerpt ? (
                      <blockquote>{r.sourceExcerpt}</blockquote>
                    ) : (
                      <p className="micro">
                        Supporting evidence could not be verified.
                      </p>
                    )}
                  </div>
                </div>
                {r.evidenceWarning && (
                  <p className="evidence-warning">
                    Supporting evidence could not be verified. Unverified
                    quotations have been omitted; treat this feedback
                    cautiously.
                  </p>
                )}
                <p className="suggestion">
                  <ArrowRight size={15} />
                  {r.suggestion}
                </p>
              </article>
            ))}
          </div>
          <div className="review-bottom">
            <div>
              <h2>Give it another go?</h2>
              <p>
                Same concepts. A fresh explanation. Retries go straight to
                review.
              </p>
            </div>
            <Button onClick={retry} disabled={busy}>
              <RotateCcw size={16} />
              Try again
            </Button>
          </div>
          <details className="transcript">
            <summary>
              Your full conversation <ChevronDown size={15} />
            </summary>
            {session.messages.map((m, i) => (
              <div key={i}>
                <strong>{m.role === "user" ? "You" : "Pip"}</strong>
                <p className="prewrap">{m.text}</p>
              </div>
            ))}
          </details>
        </>
      ) : (
        <div className="teaching-grid">
          <section className="writing-card">
            <div className="writing-heading">
              <span className="eyebrow">
                {questions
                  ? `QUESTION ${session.messages.filter((m) => m.role === "student").length} OF UP TO 3`
                  : "01 / YOUR EXPLANATION"}
              </span>
              <span className="saved-label">
                <span className="tiny-dot" />
                Draft stays on this device
              </span>
            </div>
            {questions && session.messages.at(-1)?.role === "student" ? (
              <div className="question-bubble">
                <span>PIP ASKS</span>
                <h2>{session.messages.at(-1)!.text}</h2>
              </div>
            ) : (
              <>
                <h2>
                  {questions
                    ? "Ready to reflect?"
                    : "Imagine I’m hearing this for the first time."}
                </h2>
                <p className="writing-prompt">
                  {questions
                    ? "Your explanation is saved. You can finish and review it now."
                    : "What’s the big idea? How does it work? An example can help."}
                </p>
              </>
            )}
            {(!questions || session.messages.at(-1)?.role === "student") && (
              <>
                <label className="sr-only" htmlFor="explanation">
                  {questions ? "Your answer" : "Your explanation"}
                </label>
                <textarea
                  id="explanation"
                  className="explanation"
                  placeholder={
                    questions
                      ? "Let me think about that…"
                      : "Here’s how I’d explain it…"
                  }
                  value={draft}
                  onChange={(e) => changeDraft(e.target.value)}
                  maxLength={max}
                  disabled={busy}
                  aria-describedby="writing-limits"
                />
                <div className="writing-limits" id="writing-limits">
                  <span>
                    {questions
                      ? "A little reasoning goes a long way."
                      : "Start anywhere. Connect the dots as you go."}
                  </span>
                  <span>
                    {draft.length.toLocaleString()} / {max.toLocaleString()}
                  </span>
                </div>
                <div className="writing-actions">
                  <span className="micro">
                    {questions
                      ? "Unsure is a useful place to start."
                      : "At least 20 characters. There’s no perfect wording."}
                  </span>
                  <Button
                    disabled={
                      busy || draft.trim().length < (questions ? 1 : 20)
                    }
                    onClick={() => void act(questions ? "answer" : "explain")}
                  >
                    {busy ? (
                      <>
                        <LoaderCircle className="spin" size={16} />
                        Pip is thinking…
                      </>
                    ) : (
                      <>
                        {questions
                          ? "Share my answer"
                          : session.short_retry
                            ? "Review my explanation"
                            : "Let’s talk about it"}
                        <ArrowRight size={16} />
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
            {questions && (
              <div className="secondary-actions">
                {session.messages.at(-1)?.role === "student" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void act("answer", true)}
                  >
                    I’m not sure
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void act("finish")}
                  aria-busy={finishing}
                >
                  {finishing ? (
                    <>
                      <LoaderCircle className="spin" size={14} />
                      Preparing review…
                    </>
                  ) : (
                    <>
                      Finish and review <ArrowRight size={14} />
                    </>
                  )}
                </Button>
              </div>
            )}
          </section>
          <aside className="student-panel">
            <div className="student-presence">
              <span className="tiny-dot" />
              {busy
                ? "THINKING IT THROUGH"
                : questions
                  ? "A LITTLE CURIOUS"
                  : "READY WHEN YOU ARE"}
            </div>
            <Student
              state={busy ? "thinking" : questions ? "curious" : "listening"}
            />
            <h2>
              {busy
                ? "Let me think…"
                : questions
                  ? "Help me connect the dots."
                  : "I’m all ears."}
            </h2>
            <p>
              {busy
                ? "I’m checking the ideas against your notes. This may take a moment."
                : questions
                  ? "You can take your time, check your notes, or tell me you’re not sure."
                  : "Teach me in your own words. I’ll ask if something doesn’t quite click."}
            </p>
            <div className="student-divider" />
            <span className="student-name">
              Pip <span>your AI student</span>
            </span>
            <div className="gentle-tip">
              <SproutIcon />
              <p>
                {session.short_retry
                  ? "A fresh try. This time, we’ll go straight to review."
                  : "A useful explanation doesn’t have to sound like a textbook."}
              </p>
            </div>
          </aside>
        </div>
      )}
      {!review && session.messages.length > 0 && (
        <details className="transcript">
          <summary>
            What we’ve talked about <ChevronDown size={15} />
          </summary>
          {session.messages.map((m, i) => (
            <div key={i}>
              <strong>{m.role === "user" ? "You" : "Pip"}</strong>
              <p className="prewrap">{m.text}</p>
            </div>
          ))}
        </details>
      )}
      <div className="privacy-note">
        <ShieldCheck size={15} />
        <p>
          {session.preview
            ? "Preview writing stays in this browser. No AI calls are made."
            : "Your notes and explanation are sent to OpenRouter and its AI provider for feedback. Drafts are also saved on this device."}
        </p>
      </div>
    </div>
  );
}
function SproutIcon() {
  return <Eye size={18} />;
}
