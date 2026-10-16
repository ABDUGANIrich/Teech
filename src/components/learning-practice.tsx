"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { writeLocal } from "@/lib/client";
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
  useEffect(() => {
    if (a.answer !== null || a.solution) {
      try {
        localStorage.removeItem(draftKey);
      } catch {}
    }
  }, [draftKey, a.answer, a.solution]);
  function change(value: string) {
    setAnswer(value);
    if (!writeLocal(draftKey, value))
      setNotice(
        "Browser storage is unavailable. Copy your answer before leaving; submitted answers are saved on the server.",
      );
  }
  const open = a.state === "open" && !a.solution;
  return (
    <article className="learning-card practice-item">
      <p className="eyebrow">
        {q.kind === "mcq" ? "CONCEPT CHECK" : "APPLICATION PROBLEM"} ·{" "}
        {q.objectiveId}
      </p>
      <h3 id={`${q.id}-prompt`}>{q.prompt}</h3>
      <p className="learning-status">{classification(a)}</p>
      {sample && q.kind === "application" && (
        <p className="notice">
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
                <label className="learning-choice" key={c.id}>
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
            <div className="learning-actions">
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
          <p className="micro">Original response (frozen)</p>
          <pre className="saved-answer">
            {a.unsure ? "Marked unsure. " : ""}
            {q.kind === "mcq"
              ? q.choices.find((c) => c.id === a.answer)?.text ||
                a.answer ||
                "Not attempted"
              : a.answer || "Not attempted"}
          </pre>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {a.hints.map((hint, i) => (
        <p className="learning-hint" key={i}>
          <strong>Hint {i + 1}:</strong> {hint}
        </p>
      ))}
      {a.feedback && (
        <div
          id={`feedback-${a.itemId}`}
          tabIndex={-1}
          className="learning-feedback"
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
          <div className="notice" role="status">
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
        <div className="learning-solution">
          <h3>Worked review</h3>
          <p>{a.solution}</p>
          <p className="micro">
            A revealed solution cannot count as independently solved.
          </p>
        </div>
      )}
      <div className="learning-actions">
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
        <p className="notice">
          Question disputed. Excluded from success counts. {a.dispute} You can
          continue.
        </p>
      ) : (
        <details className="learning-dispute">
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
