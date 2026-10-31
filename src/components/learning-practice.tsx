"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { readLocal, removeLocal, writeLocal } from "@/lib/client";
import { useLocalSnapshot } from "@/lib/browser-storage";
import { classification, type StudiedUnit } from "@/lib/learning";

export type LearningAction = (
  action: string,
  values?: Record<string, unknown>,
) => Promise<boolean>;
export function LearningPractice({
  unit,
  userId,
  sessionId,
  busy,
  act,
  sample = false,
}: {
  unit: StudiedUnit;
  userId: string;
  sessionId: string;
  busy: boolean;
  act: LearningAction;
  sample?: boolean;
}) {
  return (
    <section aria-labelledby="practice-title">
      <h2 id="practice-title" tabIndex={-1}>
        Try it in your own way.
      </h2>
      <p>
        You can continue with unanswered items. Hints and solutions are recorded
        separately from correctness.
      </p>
      {unit.content.questions.map((q) => (
        <PracticeItem
          key={q.id}
          question={q}
          attempt={unit.attempts.find((a) => a.itemId === q.id)!}
          draftKey={`teech:${userId}:learn:${sessionId}:${q.id}:draft`}
          busy={busy}
          act={act}
          sample={sample}
        />
      ))}
      <Button disabled={busy} onClick={() => void act("next")}>
        Continue from this unit →
      </Button>
    </section>
  );
}
function PracticeItem({
  question: q,
  attempt: a,
  draftKey,
  busy,
  act,
  sample,
}: {
  question: StudiedUnit["content"]["questions"][number];
  attempt: StudiedUnit["attempts"][number];
  draftKey: string;
  busy: boolean;
  act: LearningAction;
  sample: boolean;
}) {
  const [editedAnswer, setAnswer] = useState<string | null>(null);
  const local = useLocalSnapshot(draftKey);
  let restored = "";
  try {
    const v = JSON.parse(local);
    if (typeof v === "string") restored = v;
  } catch {}
  const answer = editedAnswer ?? restored;
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const open = a.state === "open" && !a.solution;
  const retainedAnswer = !open && answer !== a.answer ? answer : "";
  useEffect(() => {
    // A different tab's saved answer is not acknowledgement of this draft.
    // Keep this tab's writing available even if another tab replaced storage.
    if (retainedAnswer) writeLocal(draftKey, retainedAnswer);
    else if (a.answer !== null && readLocal(draftKey, null) === a.answer)
      removeLocal(draftKey);
  }, [draftKey, a.answer, retainedAnswer]);
  function change(value: string) {
    setAnswer(value);
    if (!writeLocal(draftKey, value))
      setNotice(
        "Browser storage is unavailable. Copy your answer before leaving; submitted answers are saved on the server.",
      );
  }
  return (
    <article className="learning-card practice-item min-w-0 bg-white border-solid rounded-xl wrap-anywhere mx-0 my-5 p-6.25 border border-olive-300 dark:bg-neutral-800 dark:border-olive-700 [&_label:not(.learning-choice)]:block [&_label:not(.learning-choice)]:mt-4.5 [&_label:not(.learning-choice)]:mb-1.5 [&_label:not(.learning-choice)]:font-semibold [&_>_label]:block [&_>_label]:mt-4.5 [&_>_label]:mb-1.5 [&_>_label]:font-semibold [&_textarea]:w-full [&_textarea]:min-w-0 [&_textarea]:border-solid [&_textarea]:rounded-lg [&_textarea]:bg-white [&_textarea]:text-olive-800 [&_textarea]:px-3.25 [&_textarea]:py-2.75 [&_textarea]:border [&_textarea]:border-olive-300 dark:[&_textarea]:bg-neutral-800 dark:[&_textarea]:text-olive-200 dark:[&_textarea]:border-olive-700 [&_>_textarea]:w-full [&_>_textarea]:min-w-0 [&_>_textarea]:border-solid [&_>_textarea]:rounded-lg [&_>_textarea]:bg-white [&_>_textarea]:text-olive-800 [&_>_textarea]:px-3.25 [&_>_textarea]:py-2.75 [&_>_textarea]:border [&_>_textarea]:border-olive-300 dark:[&_>_textarea]:bg-neutral-800 dark:[&_>_textarea]:text-olive-200 dark:[&_>_textarea]:border-olive-700 [&_>_select]:w-full [&_>_select]:min-w-0 [&_>_select]:border-solid [&_>_select]:rounded-lg [&_>_select]:bg-white [&_>_select]:text-olive-800 [&_>_select]:whitespace-normal [&_>_select]:mb-3.5 [&_>_select]:px-3.25 [&_>_select]:py-2.75 [&_>_select]:border [&_>_select]:border-olive-300 dark:[&_>_select]:bg-neutral-800 dark:[&_>_select]:text-olive-200 dark:[&_>_select]:border-olive-700 [&_fieldset]:min-w-0 [&_fieldset]:m-0 [&_fieldset]:p-0 [&_fieldset]:border-0 max-lesson:p-4.5 max-mobile:[&_textarea]:text-[1rem] max-mobile:[&_>_textarea]:text-[1rem]">
      <p className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
        {q.kind === "mcq" ? "CONCEPT CHECK" : "APPLICATION PROBLEM"} ·{" "}
        {q.objectiveId}
      </p>
      <h3 id={`${q.id}-prompt`}>{q.prompt}</h3>
      <p className="learning-status text-[0.8125rem] font-semibold text-olive-600 dark:text-olive-400">
        {classification(a)}
      </p>
      {sample && q.kind === "application" && (
        <p className="notice rounded-md bg-olive-100 text-olive-600 text-[0.75rem] px-4 py-3 dark:bg-olive-800 dark:text-olive-400">
          Fixed sample: open-text feedback is illustrative. It does not assess
          what you write.
        </p>
      )}
      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act("submit", { itemId: q.id, answer, unsure: false });
          }}
        >
          <fieldset disabled={busy} aria-labelledby={`${q.id}-prompt`}>
            {q.kind === "mcq" ? (
              q.choices.map((c) => (
                <label
                  className="learning-choice flex items-start gap-3 border-solid rounded-lg cursor-pointer mx-0 my-2.5 p-3.5 border border-olive-300 dark:border-olive-700 [&_input]:w-4.5 [&_input]:h-4.5 [&_input]:mt-1 [&_input]:shrink-0"
                  key={c.id}
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={c.id}
                    checked={answer === c.id}
                    onChange={() => change(c.id)}
                  />
                  {c.text}
                </label>
              ))
            ) : (
              <>
                <label htmlFor={`${q.id}-answer`}>Your reasoning</label>
                <textarea
                  id={`${q.id}-answer`}
                  maxLength={3000}
                  rows={5}
                  value={answer}
                  onChange={(e) => change(e.target.value)}
                />
              </>
            )}
            <div className="learning-actions flex items-center gap-3.5 flex-wrap max-lesson:items-stretch max-lesson:[&_>_.button]:flex-[1_1_auto]">
              <Button type="submit" disabled={!answer.trim()}>
                Submit answer
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void act("submit", { itemId: q.id, answer, unsure: true })
                }
              >
                I’m not sure
              </Button>
            </div>
          </fieldset>
        </form>
      ) : (
        <div>
          <p className="micro text-[0.6875rem] leading-[1.7] text-olive-600 dark:text-olive-400">
            Original response (frozen)
          </p>
          <pre className="saved-answer whitespace-pre-wrap wrap-anywhere rounded-lg bg-taupe-100 text-[0.875rem] leading-[1.7] font-mono max-w-full p-4 dark:bg-olive-800">
            {a.unsure ? "Marked unsure. " : ""}
            {q.kind === "mcq"
              ? q.choices.find((c) => c.id === a.answer)?.text ||
                a.answer ||
                "Not attempted"
              : a.answer || "Not attempted"}
          </pre>
        </div>
      )}
      {retainedAnswer && (
        <section
          className="notice rounded-md bg-olive-100 text-olive-600 text-[0.75rem] px-4 py-3 dark:bg-olive-800 dark:text-olive-400"
          aria-label="Retained unsent answer"
        >
          <h3>Your unsent answer</h3>
          <p>
            This writing was not saved as the answer to this item. Copy it if
            useful; the saved response above remains unchanged.
          </p>
          <pre className="saved-answer whitespace-pre-wrap wrap-anywhere rounded-lg bg-taupe-100 text-[0.875rem] leading-[1.7] font-mono max-w-full p-4 dark:bg-olive-800">
            {q.kind === "mcq"
              ? q.choices.find((c) => c.id === retainedAnswer)?.text ||
                retainedAnswer
              : retainedAnswer}
          </pre>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (readLocal(draftKey, null) === retainedAnswer)
                removeLocal(draftKey);
              setAnswer("");
            }}
          >
            Discard retained answer
          </Button>
        </section>
      )}
      {notice && <p role="status">{notice}</p>}
      {a.hints.map((hint, i) => (
        <p
          className="learning-hint bg-orange-100 rounded-lg text-olive-800 p-4 dark:bg-olive-800 dark:text-olive-200"
          id={`hint-${a.itemId}-${i}`}
          tabIndex={-1}
          key={i}
        >
          <strong>Hint {i + 1}:</strong> {hint}
        </p>
      ))}
      {a.feedback && (
        <div
          id={`feedback-${a.itemId}`}
          tabIndex={-1}
          className="learning-feedback border-l-[0.1875rem] border-solid border-l-olive-600 bg-olive-100 mx-0 my-4.5 p-4.5 dark:border-l-olive-400 dark:bg-olive-800"
          role="status"
        >
          <h3>{a.feedback.status}</h3>
          <p>{a.feedback.well}</p>
          <p>{a.feedback.gap}</p>
          <p>
            <strong>Next step:</strong> {a.feedback.next}
          </p>
        </div>
      )}
      {(a.state === "pending" || a.state === "failed") &&
        !a.solution &&
        a.dispute === null && (
          <div
            className="notice rounded-md bg-olive-100 text-olive-600 text-[0.75rem] px-4 py-3 dark:bg-olive-800 dark:text-olive-400"
            role="status"
          >
            <p>
              Your original answer is saved.{" "}
              {a.state === "pending"
                ? "Assessment is pending or was interrupted."
                : "Assessment could not finish."}{" "}
              Retrying is an explicit AI request.
            </p>
            <Button
              disabled={busy || !!a.solution || a.dispute !== null}
              onClick={() => void act("retry_grade", { itemId: q.id })}
            >
              Retry assessment of saved answer
            </Button>
          </div>
        )}
      {a.solution && (
        <div
          className="learning-solution border-l-[0.1875rem] border-solid border-l-olive-600 bg-olive-100 mx-0 my-4.5 p-4.5 dark:border-l-olive-400 dark:bg-olive-800"
          id={`solution-${a.itemId}`}
          tabIndex={-1}
        >
          <h3>Worked review</h3>
          <p>{a.solution}</p>
          <p className="micro text-[0.6875rem] leading-[1.7] text-olive-600 dark:text-olive-400">
            A revealed solution cannot count as independently solved.
          </p>
        </div>
      )}
      <div className="learning-actions flex items-center gap-3.5 flex-wrap max-lesson:items-stretch max-lesson:[&_>_.button]:flex-[1_1_auto]">
        {open && (
          <Button
            variant="outline"
            disabled={busy || a.hints.length >= 2}
            onClick={() => void act("hint", { itemId: q.id })}
          >
            {a.hints.length === 2
              ? "Both hints used"
              : `Show hint (${2 - a.hints.length} left)`}
          </Button>
        )}
        {!a.solution && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void act("solution", { itemId: q.id })}
          >
            Reveal solution · worked review
          </Button>
        )}
      </div>
      {a.dispute !== null ? (
        <p
          className="notice rounded-md bg-olive-100 text-olive-600 text-[0.75rem] px-4 py-3 dark:bg-olive-800 dark:text-olive-400"
          id={`dispute-${a.itemId}`}
          tabIndex={-1}
        >
          Question disputed. Excluded from success counts. {a.dispute} You can
          continue.
        </p>
      ) : (
        <details className="learning-dispute mt-5 text-[0.8125rem] [&_label]:block [&_label]:mt-4.5 [&_label]:mb-1.5 [&_label]:font-semibold [&_textarea]:w-full [&_textarea]:min-w-0 [&_textarea]:border-solid [&_textarea]:rounded-lg [&_textarea]:bg-white [&_textarea]:text-olive-800 [&_textarea]:px-3.25 [&_textarea]:py-2.75 [&_textarea]:border [&_textarea]:border-olive-300 dark:[&_textarea]:bg-neutral-800 dark:[&_textarea]:text-olive-200 dark:[&_textarea]:border-olive-700 [&_summary]:cursor-pointer">
          <summary>This question seems wrong</summary>
          <label htmlFor={`${q.id}-dispute`}>Reason (optional)</label>
          <textarea
            id={`${q.id}-dispute`}
            maxLength={300}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void act("dispute", { itemId: q.id, reason })}
          >
            Mark disputed and continue
          </Button>
        </details>
      )}
    </article>
  );
}
