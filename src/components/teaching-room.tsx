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
      <div className="page narrow max-w-187.5 pt-11 pb-3 min-h-[65vh] mx-auto my-0 px-6 max-mobile:pt-6.25 max-mobile:pb-2.5 max-mobile:px-4.5">
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
    <div className="workspace max-w-275 pt-8 pb-3 mx-auto my-0 px-6 max-mobile:pt-6.25 max-mobile:pb-2.5 max-mobile:px-4.5">
      <div className="workspace-top flex items-center justify-between mt-0 mb-6 mx-0 max-mobile:mb-5.25">
        <Link
          href={userId ? "/library" : "/"}
          className="back-link inline-flex items-center gap-2 text-[0.6875rem] text-neutral-500 dark:text-olive-400"
        >
          <ArrowLeft className="size-3.75" />
          {userId ? "My library" : "Back to home"}
        </Link>
        <span className="quiet-badge text-[0.5625rem] tracking-[0.06875rem] text-olive-600 border-solid bg-olive-100 rounded-[0.3125rem] px-2 py-1 border border-olive-300 dark:text-olive-400 dark:bg-olive-800 dark:border-olive-700">
          {session.preview ? "PIP · FIXED PREVIEW" : "PIP · STUDENT"}
        </span>
      </div>
      {session.preview && (
        <div className="preview-banner border-solid bg-olive-100 rounded-[0.4375rem] flex gap-2.5 items-start mb-7 px-4 py-3 border border-olive-300 dark:bg-olive-800 dark:border-olive-700 [&_p]:text-[0.6875rem] [&_p]:leading-[1.65] [&_p]:text-stone-500 [&_p]:m-0 dark:[&_p]:text-olive-400 [&_strong]:font-semibold [&_a]:underline max-mobile:mb-6 max-mobile:px-3 max-mobile:py-2.75 max-mobile:[&_p]:text-[0.625rem]">
          <span className="preview-dot w-1.5 h-1.5 bg-stone-400 rounded-full mt-1.5 shrink-0 dark:bg-olive-400" />
          <p>
            <strong>Pip sample · fixed preview</strong> · Questions and feedback
            are fixed examples, not an AI assessment of your writing. Personal
            saving requires configuration.
          </p>
        </div>
      )}
      <div className="room-title flex items-center justify-between gap-5.5 mb-6 [&_.eyebrow]:text-[0.5625rem] [&_.eyebrow]:mb-2.5 [&_h1]:text-[2.4375rem] [&_h1]:mb-2.5 [&_p:last-child]:mb-0 [&_p:last-child]:text-[0.8125rem] max-mobile:items-start max-mobile:relative max-mobile:mb-4.5 max-mobile:[&_h1]:text-[2rem] max-mobile:[&_h1]:tracking-[-0.0625rem] max-mobile:[&_>_div]:min-w-0 max-mobile:[&_>_div_>_p:last-child]:text-[0.75rem] max-mobile:[&_>_div_>_p:last-child]:max-w-65 max-mobile:[&_>_.button]:text-[0rem] max-mobile:[&_>_.button]:min-w-9 max-mobile:[&_>_.button]:mt-5.75 max-mobile:[&_>_.button]:gap-0 max-mobile:[&_>_.button]:p-2.25 max-mobile:[&_>_.button_svg]:w-4.25 max-mobile:[&_>_.button_svg]:h-4.25 max-mobile:[&_.eyebrow]:text-[0.5rem] max-mobile:[&_.eyebrow]:tracking-[0.0625rem]">
        <div>
          <p className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
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
          {showNotes ? (
            <EyeOff className="size-3.75" />
          ) : (
            <BookOpen className="size-3.75" />
          )}{" "}
          {showNotes ? "Hide notes" : "View notes"}
        </Button>
      </div>
      {session.provenance && (
        <p className="notice rounded-md bg-olive-100 text-olive-600 text-[0.75rem] px-4 py-3 dark:bg-olive-800 dark:text-olive-400">
          {session.provenance.label}. This lesson source is a study reference,
          not independent proof of correctness. Your review is relative to this
          source.{" "}
          {session.provenance.lessonId && (
            <Link
              className="text-link text-[0.75rem] inline-flex gap-2 items-center hover:underline"
              href={`/learn/${session.provenance.lessonId}`}
            >
              Return to learning session →
            </Link>
          )}
        </p>
      )}
      <ol
        className="steps flex list-none pt-4.5 pb-5.75 border-b border-solid border-b-olive-300 mt-0 mb-7.75 max-w-full text-[0.6875rem] text-neutral-400 gap-4 mx-0 px-0 dark:border-b-olive-700 dark:text-olive-400 [&_li]:flex [&_li]:items-center [&_li]:gap-2.25 [&_li_>_span]:border-solid [&_li_>_span]:rounded-full [&_li_>_span]:w-5.75 [&_li_>_span]:h-5.75 [&_li_>_span]:grid [&_li_>_span]:place-items-center [&_li_>_span]:text-[0.625rem] [&_li_>_span]:border [&_li_>_span]:border-olive-300 dark:[&_li_>_span]:border-olive-700 [&_.active]:text-olive-600 [&_.active]:font-semibold dark:[&_.active]:text-olive-400 [&_.active_>_span]:bg-olive-600 [&_.active_>_span]:text-white [&_.active_>_span]:border-olive-600 dark:[&_.active_>_span]:bg-olive-400 dark:[&_.active_>_span]:text-emerald-950 dark:[&_.active_>_span]:border-olive-400 [&_.complete_>_span]:bg-olive-200 [&_.complete_>_span]:text-emerald-700 dark:[&_.complete_>_span]:bg-olive-800 dark:[&_.complete_>_span]:text-olive-400 max-mobile:gap-2.75 max-mobile:pb-5 max-mobile:mb-5.5 max-mobile:text-[0.625rem] max-mobile:[&_li]:gap-1.5"
        aria-label="Session progress"
      >
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
                <Check className="size-3.25" />
              ) : (
                i + 1
              )}
            </span>
            {s}
            {i < 2 && (
              <div className="step-line h-px w-14.5 bg-olive-300 ml-3 dark:bg-olive-700 max-mobile:w-7.25 max-mobile:ml-1" />
            )}
          </li>
        ))}
      </ol>
      {showNotes && (
        <aside
          id="source-notes"
          className="notes-panel border-solid rounded-[0.5625rem] bg-olive-100 mt-0 mb-6 mx-0 p-6.25 border border-olive-300 dark:bg-olive-800 dark:border-olive-700 [&_>_p]:text-[0.8125rem] [&_>_p]:max-h-105 [&_>_p]:overflow-y-auto [&_ul]:text-[0.75rem] [&_ul]:leading-[1.9] [&_ul]:pl-5 max-mobile:p-4.5 max-mobile:[&_.section-row]:items-start max-mobile:[&_.section-row]:flex-col max-mobile:[&_.section-row]:gap-1.5 max-mobile:[&_h2]:text-[1.25rem]"
        >
          <div className="section-row flex items-center justify-between gap-4 mb-4 [&_h2]:m-0 [&_.eyebrow]:mb-2.25 max-mobile:items-start max-mobile:flex-wrap max-mobile:[&_h2]:text-[1.3125rem]">
            <h2>Your source material</h2>
            <span className="micro text-[0.6875rem] leading-[1.7] text-olive-600 dark:text-olive-400">
              {session.concepts.length} concepts · checklist v
              {session.checklist_version}
            </span>
          </div>
          <p className="prewrap whitespace-pre-wrap wrap-anywhere">
            {session.notes}
          </p>
          <details>
            <summary>
              Concept checklist <ChevronDown className="size-3.75" />
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
        <div
          className="error-box bg-rose-50 border-solid rounded-lg text-[0.75rem] text-yellow-800 wrap-anywhere mx-0 my-4.5 px-4.5 py-3.75 border border-taupe-300 dark:bg-olive-800 dark:text-red-300 dark:border-olive-600"
          role="alert"
        >
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
        <p
          className="notice rounded-md bg-olive-100 text-olive-600 text-[0.75rem] px-4 py-3 dark:bg-olive-800 dark:text-olive-400"
          role="status"
        >
          {notice}
        </p>
      )}
      {unsentAnswer && (
        <section
          className="notice rounded-md bg-olive-100 text-olive-600 text-[0.75rem] px-4 py-3 dark:bg-olive-800 dark:text-olive-400"
          aria-label="Retained unsent answer"
        >
          <h2>Your unsent answer to the earlier question</h2>
          <p>{unsentAnswer.question}</p>
          <p className="prewrap whitespace-pre-wrap wrap-anywhere">
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
          <section className="review-summary flex gap-6.5 items-center bg-olive-100 border-solid rounded-xl mb-7 px-7.5 py-5.5 border border-olive-200 dark:bg-olive-800 dark:border-olive-700 [&_h2]:font-serif [&_h2]:text-[1.8125rem] [&_h2]:mb-2.5 [&_p]:text-[0.75rem] [&_p]:mb-3.5 [&_.eyebrow]:text-[0.5625rem] [&_.eyebrow]:mb-2.5 max-mobile:gap-3 max-mobile:items-start max-mobile:p-5 max-mobile:[&_>_.student]:w-15 max-mobile:[&_h2]:text-[1.5625rem] max-mobile:[&_p]:text-[0.6875rem] max-mobile:[&_.eyebrow]:text-[0.5rem] max-mobile:[&_.eyebrow]:tracking-[0.04375rem]">
            <Student small state="happy" />
            <div>
              <p className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
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
              <div className="review-tags flex gap-1.75 flex-wrap [&_>_span]:text-[0.5625rem] [&_>_span]:border-solid [&_>_span]:rounded-sm [&_>_span]:text-olive-600 [&_>_span]:px-2 [&_>_span]:py-0.75 [&_>_span]:border [&_>_span]:border-olive-300 dark:[&_>_span]:text-olive-400 dark:[&_>_span]:border-olive-700 max-mobile:[&_span]:text-[0.5rem]">
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
          <div className="review-insights grid grid-cols-[1fr_1fr] gap-10 mt-8.75 mb-10 mx-0 px-1.25 py-0 [&_p]:text-[0.8125rem] [&_p]:flex [&_p]:items-start [&_p]:gap-3 [&_.eyebrow]:text-[0.5625rem] [&_.eyebrow]:mb-4.25 max-mobile:grid-cols-[1fr] max-mobile:gap-5.5 max-mobile:mx-0 max-mobile:my-6.5 max-mobile:[&_p]:text-[0.75rem] max-mobile:[&_p]:mb-2.25">
            <div>
              <p className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
                WHAT CAME THROUGH
              </p>
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
              <p className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
                A LITTLE MORE ATTENTION
              </p>
              {session.evaluation.revisit.map((s, i) => (
                <p key={i}>
                  <span className="small-number text-[0.625rem] text-olive-600 mt-0.5 dark:text-olive-400">
                    0{i + 1}
                  </span>
                  {s}
                </p>
              ))}
            </div>
          </div>
          <div className="section-row flex items-center justify-between gap-4 mb-4 [&_h2]:m-0 [&_.eyebrow]:mb-2.25 max-mobile:items-start max-mobile:flex-wrap max-mobile:[&_h2]:text-[1.3125rem]">
            <h2>Concept by concept</h2>
            {previousOptions.length > 0 && (
              <label className="compare-label text-[0.625rem] text-olive-600 flex gap-2 items-center dark:text-olive-400 [&_select]:text-[0.6875rem] [&_select]:max-w-52.5 max-mobile:flex-wrap">
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
              <article
                key={r.conceptId}
                className="result border-t border-solid border-t-olive-300 px-0 py-6.25 dark:border-t-olive-700 [&_>_p]:text-[0.8125rem] max-mobile:[&_>_p]:text-[0.75rem]"
              >
                <div className="result-heading flex justify-between gap-3.75 items-center mb-4 [&_h3]:m-0 max-mobile:items-start max-mobile:flex-col max-mobile:gap-2.5 max-mobile:[&_h3]:text-[1.1875rem]">
                  <h3>
                    {session.concepts.find((c) => c.id === r.conceptId)?.title}
                  </h3>
                  <span
                    className={`status text-[0.625rem] pt-1 pr-2.25 pb-1 pl-2.25 rounded-[0.3125rem] whitespace-nowrap bg-olive-200 dark:bg-olive-800 text-taupe-500 dark:text-orange-300 [&.status-explained-clearly]:bg-olive-200 dark:[&.status-explained-clearly]:bg-olive-800 [&.status-explained-clearly]:text-olive-600 dark:[&.status-explained-clearly]:text-olive-400 [&.status-not-demonstrated]:bg-olive-200 dark:[&.status-not-demonstrated]:bg-olive-800 [&.status-not-demonstrated]:text-stone-500 dark:[&.status-not-demonstrated]:text-olive-400 [&.status-needs-correction]:bg-olive-200 dark:[&.status-needs-correction]:bg-olive-800 [&.status-needs-correction]:text-taupe-500 dark:[&.status-needs-correction]:text-red-300 status-${r.status.toLowerCase().replaceAll(" ", "-")}`}
                  >
                    {r.status}
                  </span>
                </div>
                {previous && (
                  <p className="comparison flex items-center gap-2 text-[0.6875rem]! text-olive-600 dark:text-olive-400 max-mobile:flex-wrap">
                    Previously:{" "}
                    {previous.evaluation?.results.find(
                      (x) => x.conceptId === r.conceptId,
                    )?.status || "Not in this checklist"}{" "}
                    <ArrowRight className="size-3.25" /> Now: {r.status}
                  </p>
                )}
                <p>{r.reason}</p>
                {r.claimType === "unsupported" && (
                  <p className="micro text-[0.6875rem] leading-[1.7] text-olive-600 dark:text-olive-400">
                    Not supported by these notes; this does not establish that
                    the claim is false.
                  </p>
                )}
                <div className="evidence-grid grid grid-cols-[1fr_1fr] gap-6.25 mt-5 [&_>_div]:bg-olive-100 [&_>_div]:rounded-md [&_>_div]:px-4.5 [&_>_div]:py-3.75 dark:[&_>_div]:bg-olive-800 [&_blockquote]:font-serif [&_blockquote]:text-[0.875rem] [&_blockquote]:leading-[1.7] [&_blockquote]:text-stone-500 [&_blockquote]:mt-2.25 [&_blockquote]:mb-0 [&_blockquote]:wrap-anywhere [&_blockquote]:whitespace-pre-wrap [&_blockquote]:mx-0 dark:[&_blockquote]:text-olive-400 [&_blockquote:before]:content-['“'] [&_blockquote:after]:content-['”'] [&_p]:mt-2.25 [&_p]:mb-0 [&_p]:mx-0 max-mobile:grid-cols-[1fr] max-mobile:gap-3 max-mobile:[&_blockquote]:text-[0.8125rem]">
                  <div>
                    <span className="evidence-label text-[0.5rem] tracking-[0.075rem] text-olive-600 dark:text-olive-400">
                      IN YOUR WORDS
                    </span>
                    {r.userExcerpt ? (
                      <blockquote>{r.userExcerpt}</blockquote>
                    ) : (
                      <p className="micro text-[0.6875rem] leading-[1.7] text-olive-600 dark:text-olive-400">
                        {session.preview
                          ? "This fixture does not quote or assess your writing."
                          : r.status === "Not demonstrated"
                            ? "The explanation did not cover this concept."
                            : "No verified user quotation is available."}
                      </p>
                    )}
                  </div>
                  <div>
                    <span className="evidence-label text-[0.5rem] tracking-[0.075rem] text-olive-600 dark:text-olive-400">
                      IN YOUR NOTES
                    </span>
                    {r.sourceExcerpt ? (
                      <blockquote>{r.sourceExcerpt}</blockquote>
                    ) : (
                      <p className="micro text-[0.6875rem] leading-[1.7] text-olive-600 dark:text-olive-400">
                        Supporting evidence could not be verified.
                      </p>
                    )}
                  </div>
                </div>
                {r.evidenceWarning && (
                  <p className="evidence-warning text-taupe-500 mt-3.25 dark:text-orange-300">
                    Supporting evidence could not be verified. Unverified
                    quotations have been omitted; treat this feedback
                    cautiously.
                  </p>
                )}
                <p className="suggestion flex gap-2.25 items-start mt-4.25 mb-0 text-olive-600 mx-0 dark:text-olive-400 [&_svg]:mt-0.75">
                  <ArrowRight className="size-3.75" />
                  {r.suggestion}
                </p>
              </article>
            ))}
          </div>
          <div className="review-bottom border-solid rounded-[0.625rem] flex items-center justify-between gap-5 bg-olive-100 mt-6 p-6.5 border border-olive-300 dark:bg-olive-800 dark:border-olive-700 [&_h2]:font-serif [&_h2]:text-[1.75rem] [&_h2]:mb-2 [&_p]:text-[0.75rem] [&_p]:m-0 max-mobile:flex-col max-mobile:items-start max-mobile:p-5.75 max-mobile:[&_.button]:w-full">
            <div>
              <h2>Give it another go?</h2>
              <p>
                Same concepts. A fresh explanation. Retries go straight to
                review.
              </p>
            </div>
            <Button onClick={retry} disabled={busy}>
              <RotateCcw className="size-4" />
              Try again
            </Button>
          </div>
          <details className="transcript border-t border-solid border-t-olive-300 mt-7 pt-2 dark:border-t-olive-700 [&_>_div]:border-l-2 [&_>_div]:border-solid [&_>_div]:border-l-olive-300 [&_>_div]:mb-3.75 [&_>_div]:px-4.5 [&_>_div]:py-3.75 dark:[&_>_div]:border-l-olive-700 [&_strong]:text-[0.6875rem] [&_p]:text-[0.8125rem] [&_p]:mb-0">
            <summary>
              Your full conversation{" "}
              <ChevronDown className="size-3.75" />
            </summary>
            {session.messages.map((m, i) => (
              <div key={i}>
                <strong>{m.role === "user" ? "You" : "Pip"}</strong>
                <p className="prewrap whitespace-pre-wrap wrap-anywhere">
                  {m.text}
                </p>
              </div>
            ))}
          </details>
        </>
      ) : (
        <div className="teaching-grid grid grid-cols-[minmax(0,1fr)_16.125rem] gap-6.5 max-layout:grid-cols-[minmax(0,1fr)_14.0625rem] max-layout:gap-4.5 max-mobile:flex max-mobile:flex-col-reverse max-mobile:gap-4">
          <section className="writing-card bg-white border-solid rounded-xl shadow-[0_0.1875rem_0.5625rem] shadow-olive-800/1 px-6.75 py-6 border border-olive-300 dark:bg-neutral-800 dark:shadow-black/14 dark:border-olive-700 [&_h2]:font-serif [&_h2]:text-[1.5625rem] [&_h2]:leading-[1.35] [&_h2]:mb-2.25 max-layout:p-5.5 max-mobile:px-4.5 max-mobile:py-5 max-mobile:[&_h2]:text-[1.4375rem]">
            <div className="writing-heading flex justify-between gap-3 mb-6.5 items-center [&_.eyebrow]:text-[0.5625rem] [&_.eyebrow]:tracking-[0.0625rem] [&_.eyebrow]:m-0 max-mobile:mb-5.5 max-mobile:[&_.eyebrow]:text-[0.5rem]">
              <span className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
                {questions
                  ? `QUESTION ${session.messages.filter((m) => m.role === "student").length} OF UP TO 3`
                  : "01 / YOUR EXPLANATION"}
              </span>
              <span className="saved-label text-[0.5625rem] text-olive-600 flex gap-1.25 items-center dark:text-olive-400 [&_.tiny-dot]:w-1 [&_.tiny-dot]:h-1 max-layout:text-[0.5rem] max-mobile:text-[0.5rem] max-mobile:max-w-25 max-mobile:text-right max-mobile:[&_.tiny-dot]:hidden">
                <span className="tiny-dot h-1.5 w-1.5 inline-block rounded-full bg-olive-500 shrink-0 dark:bg-olive-400" />
                Draft stays on this device
              </span>
            </div>
            {questions && session.messages.at(-1)?.role === "student" ? (
              <div className="question-bubble bg-olive-100 border-l-[0.1875rem] border-solid border-l-olive-400 rounded-[0_0.375rem_0.375rem_0] mb-3 px-4.75 py-4.25 dark:bg-olive-800 [&_>_span]:text-[0.5rem] [&_>_span]:tracking-[0.075rem] [&_>_span]:text-olive-600 [&_>_span]:block [&_>_span]:mb-2.25 dark:[&_>_span]:text-olive-400 [&_h2]:text-[1.375rem] max-mobile:p-3.5 max-mobile:[&_h2]:text-[1.3125rem]">
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
                <p className="writing-prompt text-[0.75rem] mb-4.25 max-mobile:text-[0.6875rem]">
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
                  className="explanation w-full resize-y min-h-65 bg-transparent text-[0.875rem] leading-[1.9] text-neutral-700 outline-offset-4 rounded-[0.1875rem] px-0 py-3 border-0 dark:text-olive-200 placeholder:text-stone-400 dark:placeholder:text-olive-400 max-mobile:min-h-55 max-mobile:text-[1rem]"
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
                <div
                  className="writing-limits flex justify-between gap-3.75 text-[0.5625rem] text-olive-600 pt-3 pb-5 px-0 dark:text-olive-400 max-mobile:text-[0.5rem] max-mobile:items-end max-mobile:[&_>_span:first-child]:max-w-40"
                  id="writing-limits"
                >
                  <span>
                    {questions
                      ? "A little reasoning goes a long way."
                      : "Start anywhere. Connect the dots as you go."}
                  </span>
                  <span>
                    {draft.length.toLocaleString()} / {max.toLocaleString()}
                  </span>
                </div>
                <div className="writing-actions border-t border-solid border-t-olive-200 flex items-center justify-between gap-4.5 pt-5 dark:border-t-olive-700 [&_.micro]:text-[0.625rem] [&_.micro]:max-w-46.25 [&_.micro]:leading-[1.6] [&_.button]:text-[0.75rem] [&_.button]:px-4 [&_.button]:py-2.5 max-layout:items-start max-layout:flex-col max-layout:gap-3 max-layout:[&_.micro]:max-w-none max-mobile:gap-3.5 max-mobile:[&_.button]:w-full max-mobile:[&_.micro]:text-[0.5625rem]">
                  <span className="micro text-[0.6875rem] leading-[1.7] text-olive-600 dark:text-olive-400">
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
                        <LoaderCircle className="spin animate-[spin_1.2s_linear_infinite] size-4" />
                        Pip is thinking…
                      </>
                    ) : (
                      <>
                        {questions
                          ? "Share my answer"
                          : session.short_retry
                            ? "Review my explanation"
                            : "Let’s talk about it"}
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
            {questions && (
              <div className="secondary-actions flex gap-2.5 justify-between mt-3 max-mobile:[&_.button]:text-[0.625rem] max-mobile:[&_.button]:p-1.75">
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
                      <LoaderCircle className="spin animate-[spin_1.2s_linear_infinite] size-3.5" />
                      Preparing review…
                    </>
                  ) : (
                    <>
                      Finish and review <ArrowRight className="size-3.5" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </section>
          <aside className="student-panel rounded-xl bg-taupe-100 text-center flex items-center flex-col px-5.25 py-6.25 dark:bg-olive-800 [&_.student]:w-43.25 [&_.student]:mt-3.75 [&_.student]:mb-1.25 [&_.student]:mx-0 [&_h2]:font-serif [&_h2]:text-[1.5625rem] [&_h2]:mb-3 [&_>_p]:text-[0.75rem] [&_>_p]:leading-[1.8] [&_>_p]:max-w-52.5 [&_>_p]:mb-5 [&_>_p]:text-olive-600 dark:[&_>_p]:text-olive-400 max-mobile:pr-4.25 max-mobile:pl-27 max-mobile:text-left max-mobile:block max-mobile:relative max-mobile:min-h-27.75 max-mobile:py-3.25 max-mobile:[&_>_.student]:absolute max-mobile:[&_>_.student]:w-22 max-mobile:[&_>_.student]:left-2.25 max-mobile:[&_>_.student]:top-2 max-mobile:[&_>_.student]:m-0 max-mobile:[&_h2]:text-[1.25rem] max-mobile:[&_h2]:mt-1.75 max-mobile:[&_h2]:mb-1.25 max-mobile:[&_h2]:mx-0 max-mobile:[&_>_p]:text-[0.625rem] max-mobile:[&_>_p]:leading-[1.65] max-mobile:[&_>_p]:max-w-none max-mobile:[&_>_p]:m-0">
            <div className="student-presence flex items-center gap-1.5 text-[0.5rem] tracking-[0.06875rem] text-olive-600 dark:text-olive-400 max-mobile:text-[0.4375rem] max-mobile:tracking-[0.04375rem]">
              <span className="tiny-dot h-1.5 w-1.5 inline-block rounded-full bg-olive-500 shrink-0 dark:bg-olive-400" />
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
            <div className="student-divider w-8 h-px bg-olive-300 mb-3.75 dark:bg-olive-700 max-mobile:hidden" />
            <span className="student-name text-[0.75rem] [&_>_span]:text-olive-600 [&_>_span]:text-[0.625rem] [&_>_span]:ml-1.5 dark:[&_>_span]:text-olive-400 max-mobile:hidden">
              Pip <span>your AI student</span>
            </span>
            <div className="gentle-tip flex gap-2.25 mt-6.75 pt-3.75 pb-0 border-t border-solid border-t-stone-200 text-olive-600 items-start text-left px-0 dark:border-t-olive-700 dark:text-olive-400 [&_p]:text-[0.625rem] [&_p]:leading-[1.7] [&_p]:text-olive-600 [&_p]:m-0 dark:[&_p]:text-olive-400 max-mobile:hidden">
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
        <details className="transcript border-t border-solid border-t-olive-300 mt-7 pt-2 dark:border-t-olive-700 [&_>_div]:border-l-2 [&_>_div]:border-solid [&_>_div]:border-l-olive-300 [&_>_div]:mb-3.75 [&_>_div]:px-4.5 [&_>_div]:py-3.75 dark:[&_>_div]:border-l-olive-700 [&_strong]:text-[0.6875rem] [&_p]:text-[0.8125rem] [&_p]:mb-0">
          <summary>
            What we’ve talked about <ChevronDown className="size-3.75" />
          </summary>
          {session.messages.map((m, i) => (
            <div key={i}>
              <strong>{m.role === "user" ? "You" : "Pip"}</strong>
              <p className="prewrap whitespace-pre-wrap wrap-anywhere">
                {m.text}
              </p>
            </div>
          ))}
        </details>
      )}
      <div className="privacy-note flex justify-center items-start gap-1.75 text-olive-600 mt-6 mb-0 max-w-175 mx-auto dark:text-olive-400 [&_p]:text-[0.625rem] [&_p]:text-center [&_p]:m-0 max-mobile:[&_p]:text-[0.5625rem]">
        <ShieldCheck className="size-3.75" />
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
  return <Eye className="size-4.5" />;
}
