"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "./ui/button";
import {
  allUnits,
  classification,
  eligible,
  objectiveSummary,
  provenance,
  type LearningSession,
} from "@/lib/learning";
import { validateConcepts, type Concept } from "@/lib/domain";
import { useDraft } from "@/lib/draft";
import { z } from "zod";
import type { LearningAction } from "./learning-practice";

export function LearningSummary({
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
  const units = allUnits(s);
  const attempts = units.flatMap((u) => u.attempts);
  const objectives = objectiveSummary(s);
  const [target, setTarget] = useState("");
  return (
    <section aria-labelledby="summary-title">
      <h2 id="summary-title">Your course review.</h2>
      <p>
        This is a record of practice, not a measure of mastery or lasting
        retention. Fresh questions have uncalibrated difficulty; their results
        do not establish improvement.
      </p>
      {s.completed.length < s.plan!.units.length && (
        <Button disabled={busy} onClick={() => void act("resume")}>
          Resume next unfinished unit →
        </Button>
      )}
      <div className="learning-card min-w-0 bg-white border-solid rounded-xl wrap-anywhere mx-0 my-5 p-[1.5625rem] border-[0.0625rem] border-olive-300 dark:bg-neutral-800 dark:border-olive-700 [&_>_label]:block [&_>_label]:mt-4.5 [&_>_label]:mb-1.5 [&_>_label]:font-semibold [&_>_textarea]:w-full [&_>_textarea]:min-w-0 [&_>_textarea]:border-solid [&_>_textarea]:rounded-lg [&_>_textarea]:bg-white [&_>_textarea]:text-olive-800 [&_>_textarea]:px-[0.8125rem] [&_>_textarea]:py-[0.6875rem] [&_>_textarea]:border-[0.0625rem] [&_>_textarea]:border-olive-300 dark:[&_>_textarea]:bg-neutral-800 dark:[&_>_textarea]:text-olive-200 dark:[&_>_textarea]:border-olive-700 [&_>_select]:w-full [&_>_select]:min-w-0 [&_>_select]:border-solid [&_>_select]:rounded-lg [&_>_select]:bg-white [&_>_select]:text-olive-800 [&_>_select]:whitespace-normal [&_>_select]:mb-3.5 [&_>_select]:px-[0.8125rem] [&_>_select]:py-[0.6875rem] [&_>_select]:border-[0.0625rem] [&_>_select]:border-olive-300 dark:[&_>_select]:bg-neutral-800 dark:[&_>_select]:text-olive-200 dark:[&_>_select]:border-olive-700 max-lesson:p-4.5 max-mobile:[&_>_textarea]:text-[1rem]">
        <p>
          {s.units.length} of {s.plan!.units.length} units viewed ·{" "}
          {s.completed.length} completed ·{" "}
          {attempts.filter((a) => a.answer !== null && !a.unsure).length}{" "}
          answers attempted
        </p>
        <p>
          {
            attempts.filter((a) => classification(a) === "Independent correct")
              .length
          }{" "}
          independent correct ·{" "}
          {attempts.filter((a) => a.hints.length || a.solution).length} assisted
          ·{" "}
          {
            attempts.filter(
              (a) =>
                !["Independent correct", "Correct with hints"].includes(
                  classification(a),
                ),
            ).length
          }{" "}
          unresolved or unattempted
        </p>
        <p className="micro text-[0.6875rem] leading-[1.7] text-olive-500 dark:text-olive-400">
          Disputed and uncertain judgments are excluded from definitive
          conclusions. Correct choices indicate agreement with generated keys.
        </p>
      </div>
      {objectives.map((o) => (
        <div
          className="learning-card min-w-0 bg-white border-solid rounded-xl wrap-anywhere mx-0 my-5 p-[1.5625rem] border-[0.0625rem] border-olive-300 dark:bg-neutral-800 dark:border-olive-700 [&_>_label]:block [&_>_label]:mt-4.5 [&_>_label]:mb-1.5 [&_>_label]:font-semibold [&_>_textarea]:w-full [&_>_textarea]:min-w-0 [&_>_textarea]:border-solid [&_>_textarea]:rounded-lg [&_>_textarea]:bg-white [&_>_textarea]:text-olive-800 [&_>_textarea]:px-[0.8125rem] [&_>_textarea]:py-[0.6875rem] [&_>_textarea]:border-[0.0625rem] [&_>_textarea]:border-olive-300 dark:[&_>_textarea]:bg-neutral-800 dark:[&_>_textarea]:text-olive-200 dark:[&_>_textarea]:border-olive-700 [&_>_select]:w-full [&_>_select]:min-w-0 [&_>_select]:border-solid [&_>_select]:rounded-lg [&_>_select]:bg-white [&_>_select]:text-olive-800 [&_>_select]:whitespace-normal [&_>_select]:mb-3.5 [&_>_select]:px-[0.8125rem] [&_>_select]:py-[0.6875rem] [&_>_select]:border-[0.0625rem] [&_>_select]:border-olive-300 dark:[&_>_select]:bg-neutral-800 dark:[&_>_select]:text-olive-200 dark:[&_>_select]:border-olive-700 max-lesson:p-4.5 max-mobile:[&_>_textarea]:text-[1rem]"
          key={o.id}
        >
          <h3>{o.text}</h3>
          <p>
            <strong>Initial practice: {o.initial.label}</strong>
          </p>
          <p>
            {o.initial.independent} independent correct · {o.initial.assisted}{" "}
            assisted · {o.initial.excluded} disputed/uncertain
          </p>
          {o.fresh && (
            <div className="summary-result border-t-[0.0625rem] border-solid border-t-olive-300 mt-4.5 pt-2.5 dark:border-t-olive-700 [&_h4]:font-medium">
              <p>
                <strong>Fresh practice: {o.fresh.label}</strong>
              </p>
              <p>
                {o.fresh.independent} independent correct · {o.fresh.assisted}{" "}
                assisted · {o.fresh.excluded} disputed/uncertain
              </p>
            </div>
          )}
        </div>
      ))}
      {units.map((u, i) => (
        <div
          className="learning-card min-w-0 bg-white border-solid rounded-xl wrap-anywhere mx-0 my-5 p-[1.5625rem] border-[0.0625rem] border-olive-300 dark:bg-neutral-800 dark:border-olive-700 [&_>_label]:block [&_>_label]:mt-4.5 [&_>_label]:mb-1.5 [&_>_label]:font-semibold [&_>_textarea]:w-full [&_>_textarea]:min-w-0 [&_>_textarea]:border-solid [&_>_textarea]:rounded-lg [&_>_textarea]:bg-white [&_>_textarea]:text-olive-800 [&_>_textarea]:px-[0.8125rem] [&_>_textarea]:py-[0.6875rem] [&_>_textarea]:border-[0.0625rem] [&_>_textarea]:border-olive-300 dark:[&_>_textarea]:bg-neutral-800 dark:[&_>_textarea]:text-olive-200 dark:[&_>_textarea]:border-olive-700 [&_>_select]:w-full [&_>_select]:min-w-0 [&_>_select]:border-solid [&_>_select]:rounded-lg [&_>_select]:bg-white [&_>_select]:text-olive-800 [&_>_select]:whitespace-normal [&_>_select]:mb-3.5 [&_>_select]:px-[0.8125rem] [&_>_select]:py-[0.6875rem] [&_>_select]:border-[0.0625rem] [&_>_select]:border-olive-300 dark:[&_>_select]:bg-neutral-800 dark:[&_>_select]:text-olive-200 dark:[&_>_select]:border-olive-700 max-lesson:p-4.5 max-mobile:[&_>_textarea]:text-[1rem]"
          key={u.content.id}
        >
          <h3>
            {i === s.units.length
              ? "Practice again (separate results)"
              : s.plan!.units[i]?.title}
          </h3>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void act("revisit", { unitId: u.content.id })}
          >
            Revisit explanation and worked example
          </Button>
          {u.attempts.map((a) => (
            <div
              className="summary-result border-t-[0.0625rem] border-solid border-t-olive-300 mt-4.5 pt-2.5 dark:border-t-olive-700 [&_h4]:font-medium"
              key={a.itemId}
            >
              <h4>
                {u.content.questions.find((q) => q.id === a.itemId)?.prompt}
              </h4>
              <p>
                {classification(a)}
                {a.hints.length ? ` · ${a.hints.length} hints` : ""}
              </p>
              {a.feedback && (
                <>
                  <p>{a.feedback.well}</p>
                  <p>{a.feedback.gap}</p>
                  <p>{a.feedback.next}</p>
                </>
              )}
              {a.solution && <p>Solution revealed — worked review.</p>}
              {a.dispute !== null && (
                <p>Disputed: {a.dispute || "No reason supplied"}</p>
              )}
            </div>
          ))}
        </div>
      ))}
      {!sample && !s.targetedUsed && (
        <section className="learning-card min-w-0 bg-white border-solid rounded-xl wrap-anywhere mx-0 my-5 p-[1.5625rem] border-[0.0625rem] border-olive-300 dark:bg-neutral-800 dark:border-olive-700 [&_>_label]:block [&_>_label]:mt-4.5 [&_>_label]:mb-1.5 [&_>_label]:font-semibold [&_>_textarea]:w-full [&_>_textarea]:min-w-0 [&_>_textarea]:border-solid [&_>_textarea]:rounded-lg [&_>_textarea]:bg-white [&_>_textarea]:text-olive-800 [&_>_textarea]:px-[0.8125rem] [&_>_textarea]:py-[0.6875rem] [&_>_textarea]:border-[0.0625rem] [&_>_textarea]:border-olive-300 dark:[&_>_textarea]:bg-neutral-800 dark:[&_>_textarea]:text-olive-200 dark:[&_>_textarea]:border-olive-700 [&_>_select]:w-full [&_>_select]:min-w-0 [&_>_select]:border-solid [&_>_select]:rounded-lg [&_>_select]:bg-white [&_>_select]:text-olive-800 [&_>_select]:whitespace-normal [&_>_select]:mb-3.5 [&_>_select]:px-[0.8125rem] [&_>_select]:py-[0.6875rem] [&_>_select]:border-[0.0625rem] [&_>_select]:border-olive-300 dark:[&_>_select]:bg-neutral-800 dark:[&_>_select]:text-olive-200 dark:[&_>_select]:border-olive-700 max-lesson:p-4.5 max-mobile:[&_>_textarea]:text-[1rem]">
          <h3>One focused practice pair</h3>
          <p>
            First revisit the relevant explanation above. Then, if useful,
            request one fresh pair for a gap. Generation and application
            feedback use AI allowance.
          </p>
          <label htmlFor="target-objective">Objective to revisit</label>
          <select
            id="target-objective"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={busy}
          >
            <option value="">Choose an objective</option>
            {objectives
              .filter((o) => o.label !== "Demonstrated in this session")
              .map((o) => (
                <option value={o.id} key={o.id}>
                  {o.text}
                </option>
              ))}
          </select>
          <Button
            disabled={busy || !target}
            onClick={() => void act("targeted", { objectiveId: target })}
          >
            Request fresh practice pair
          </Button>
        </section>
      )}
      {s.targetedUsed && (
        <p className="micro text-[0.6875rem] leading-[1.7] text-olive-500 dark:text-olive-400">
          First-attempt results remain above.{" "}
          {s.targeted
            ? "The extra practice pair is saved separately."
            : "The extra pair could not be generated."}
        </p>
      )}
      {s.targetedUsed && !s.targeted && s.targetedObjective && (
        <Button
          variant="outline"
          disabled={busy || s.providerAttempts >= 22}
          onClick={() =>
            void act("targeted", { objectiveId: s.targetedObjective })
          }
        >
          Retry this focused practice request · uses AI allowance
        </Button>
      )}
      {eligible(s) ? (
        <section className="learning-card min-w-0 bg-white border-solid rounded-xl wrap-anywhere mx-0 my-5 p-[1.5625rem] border-[0.0625rem] border-olive-300 dark:bg-neutral-800 dark:border-olive-700 [&_>_label]:block [&_>_label]:mt-4.5 [&_>_label]:mb-1.5 [&_>_label]:font-semibold [&_>_textarea]:w-full [&_>_textarea]:min-w-0 [&_>_textarea]:border-solid [&_>_textarea]:rounded-lg [&_>_textarea]:bg-white [&_>_textarea]:text-olive-800 [&_>_textarea]:px-[0.8125rem] [&_>_textarea]:py-[0.6875rem] [&_>_textarea]:border-[0.0625rem] [&_>_textarea]:border-olive-300 dark:[&_>_textarea]:bg-neutral-800 dark:[&_>_textarea]:text-olive-200 dark:[&_>_textarea]:border-olive-700 [&_>_select]:w-full [&_>_select]:min-w-0 [&_>_select]:border-solid [&_>_select]:rounded-lg [&_>_select]:bg-white [&_>_select]:text-olive-800 [&_>_select]:whitespace-normal [&_>_select]:mb-3.5 [&_>_select]:px-[0.8125rem] [&_>_select]:py-[0.6875rem] [&_>_select]:border-[0.0625rem] [&_>_select]:border-olive-300 dark:[&_>_select]:bg-neutral-800 dark:[&_>_select]:text-olive-200 dark:[&_>_select]:border-olive-700 max-lesson:p-4.5 max-mobile:[&_>_textarea]:text-[1rem]">
          <p className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
            NEXT: TEACH PIP
          </p>
          <h3>Teach this to Pip.</h3>
          <p>
            Preview a source made from the instruction you studied. Assessment
            answers, rubrics and your responses are excluded.
          </p>
          <Button disabled={busy} onClick={() => void act("handoff_prepare")}>
            Preview teaching source
          </Button>
          {s.handoff && (
            <Handoff
              userId={userId}
              key={`${s.id}:${s.handoff.concepts ? "checklist" : "source"}`}
              session={s}
              busy={busy}
              act={act}
              sample={sample}
            />
          )}
        </section>
      ) : (
        <p className="notice rounded-md bg-olive-100 text-olive-600 text-[0.75rem] px-4 py-3 dark:bg-olive-800 dark:text-olive-400">
          Complete every course unit to prepare a source for Teach Pip.
          Unanswered questions do not block completion.
        </p>
      )}
    </section>
  );
}
function Handoff({
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
  const h = s.handoff!;
  const draft = useDraft(
    `teech:${userId}:learn:${s.id}:handoff-draft`,
    z
      .array(
        z.object({
          id: z.string().max(60),
          title: z.string().max(100),
          description: z.string().max(500),
          excerpt: z.string().max(1200),
        }),
      )
      .max(8),
    h.concepts || [],
  );
  const concepts = draft.value;
  function setConcepts(update: (cs: Concept[]) => Concept[]) {
    draft.change(update(concepts));
  }
  const [error, setError] = useState("");
  function change(index: number, field: keyof Concept, value: string) {
    setConcepts((cs) =>
      cs.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    );
  }
  async function handoff() {
    try {
      validateConcepts(h.source, concepts);
      setError("");
      if (await act("handoff", { concepts })) draft.clear(concepts);
    } catch {
      setError(
        "Keep 4–8 distinct concepts, with exact supporting passages copied from this source. Expand a narrow course instead of manufacturing concepts.",
      );
    }
  }
  return (
    <div className="learning-handoff mt-6">
      {draft.notice && <p role="status">{draft.notice}</p>}
      <p>
        <strong>{provenance(s)}</strong>. This study reference is not
        independent proof of its own correctness. That provenance carries into
        the topic and review.
      </p>
      <details open>
        <summary>Immutable source preview</summary>
        <pre className="saved-answer whitespace-pre-wrap wrap-anywhere break-words rounded-lg bg-taupe-100 text-[0.875rem] leading-[1.7] font-mono max-w-full p-4 dark:bg-olive-800">
          {h.source}
        </pre>
      </details>
      {h.done ? (
        <p>
          {s.teachingId ? (
            <Link
              className="text-link text-[0.75rem] inline-flex gap-2 items-center hover:underline"
              href={`/teach/${s.teachingId}`}
            >
              Continue your teaching attempt →
            </Link>
          ) : (
            "The linked teaching material was removed. This course remains saved."
          )}
        </p>
      ) : !h.concepts ? (
        <>
          <p>
            A faithful checklist needs at least four distinct concepts. If the
            course is too narrow, add material in a new Teach Pip topic.
          </p>
          <Button
            disabled={busy || h.extractionCalls >= 2}
            onClick={() => void act("handoff_extract")}
          >
            Extract checklist{" "}
            {sample ? "(fixed sample)" : "· uses AI allowance"}
          </Button>
        </>
      ) : (
        <>
          <h3>Review the source checklist</h3>
          <p>
            Review and edit before starting. Exact passages establish
            provenance, not factual accuracy.
          </p>
          <fieldset
            disabled={busy}
            className="learning-fields min-w-0 mt-0 mb-5.5 mx-0 p-0 border-0 [&_label]:block [&_label]:mt-4.5 [&_label]:mb-1.5 [&_label]:font-semibold [&_input]:w-full [&_input]:min-w-0 [&_input]:border-solid [&_input]:rounded-lg [&_input]:bg-white [&_input]:text-olive-800 [&_input]:px-[0.8125rem] [&_input]:py-[0.6875rem] [&_input]:border-[0.0625rem] [&_input]:border-olive-300 dark:[&_input]:bg-neutral-800 dark:[&_input]:text-olive-200 dark:[&_input]:border-olive-700 [&_textarea]:w-full [&_textarea]:min-w-0 [&_textarea]:border-solid [&_textarea]:rounded-lg [&_textarea]:bg-white [&_textarea]:text-olive-800 [&_textarea]:px-[0.8125rem] [&_textarea]:py-[0.6875rem] [&_textarea]:border-[0.0625rem] [&_textarea]:border-olive-300 dark:[&_textarea]:bg-neutral-800 dark:[&_textarea]:text-olive-200 dark:[&_textarea]:border-olive-700 [&_select]:w-full [&_select]:min-w-0 [&_select]:border-solid [&_select]:rounded-lg [&_select]:bg-white [&_select]:text-olive-800 [&_select]:whitespace-normal [&_select]:mb-3.5 [&_select]:px-[0.8125rem] [&_select]:py-[0.6875rem] [&_select]:border-[0.0625rem] [&_select]:border-olive-300 dark:[&_select]:bg-neutral-800 dark:[&_select]:text-olive-200 dark:[&_select]:border-olive-700 [&_.micro]:mt-2.5 max-mobile:[&_input]:text-[1rem] max-mobile:[&_textarea]:text-[1rem] max-mobile:[&_select]:text-[1rem]"
          >
            {concepts.map((c, i) => (
              <div
                className="learning-card min-w-0 bg-white border-solid rounded-xl wrap-anywhere mx-0 my-5 p-[1.5625rem] border-[0.0625rem] border-olive-300 dark:bg-neutral-800 dark:border-olive-700 [&_>_label]:block [&_>_label]:mt-4.5 [&_>_label]:mb-1.5 [&_>_label]:font-semibold [&_>_textarea]:w-full [&_>_textarea]:min-w-0 [&_>_textarea]:border-solid [&_>_textarea]:rounded-lg [&_>_textarea]:bg-white [&_>_textarea]:text-olive-800 [&_>_textarea]:px-[0.8125rem] [&_>_textarea]:py-[0.6875rem] [&_>_textarea]:border-[0.0625rem] [&_>_textarea]:border-olive-300 dark:[&_>_textarea]:bg-neutral-800 dark:[&_>_textarea]:text-olive-200 dark:[&_>_textarea]:border-olive-700 [&_>_select]:w-full [&_>_select]:min-w-0 [&_>_select]:border-solid [&_>_select]:rounded-lg [&_>_select]:bg-white [&_>_select]:text-olive-800 [&_>_select]:whitespace-normal [&_>_select]:mb-3.5 [&_>_select]:px-[0.8125rem] [&_>_select]:py-[0.6875rem] [&_>_select]:border-[0.0625rem] [&_>_select]:border-olive-300 dark:[&_>_select]:bg-neutral-800 dark:[&_>_select]:text-olive-200 dark:[&_>_select]:border-olive-700 max-lesson:p-4.5 max-mobile:[&_>_textarea]:text-[1rem]"
                key={c.id}
              >
                <label htmlFor={`handoff-title-${i}`}>Concept {i + 1}</label>
                <input
                  id={`handoff-title-${i}`}
                  maxLength={100}
                  value={c.title}
                  onChange={(e) => change(i, "title", e.target.value)}
                />
                <label htmlFor={`handoff-description-${i}`}>
                  What to explain
                </label>
                <textarea
                  id={`handoff-description-${i}`}
                  maxLength={500}
                  rows={2}
                  value={c.description}
                  onChange={(e) => change(i, "description", e.target.value)}
                />
                <label htmlFor={`handoff-excerpt-${i}`}>
                  Exact supporting passage
                </label>
                <textarea
                  id={`handoff-excerpt-${i}`}
                  rows={3}
                  maxLength={1200}
                  value={c.excerpt}
                  onChange={(e) => change(i, "excerpt", e.target.value)}
                />
                <Button
                  variant="ghost"
                  disabled={concepts.length <= 4}
                  onClick={() =>
                    setConcepts((cs) => cs.filter((_, n) => n !== i))
                  }
                >
                  Remove concept {i + 1}
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              disabled={concepts.length >= 8}
              onClick={() =>
                setConcepts((cs) => [
                  ...cs,
                  {
                    id: crypto.randomUUID(),
                    title: "",
                    description: "",
                    excerpt: "",
                  },
                ])
              }
            >
              Add concept
            </Button>
          </fieldset>
          {sample ? (
            <p className="notice rounded-md bg-olive-100 text-olive-600 text-[0.75rem] px-4 py-3 dark:bg-olive-800 dark:text-olive-400">
              Sample handoff preview only. A saved course creates a topic and
              starts a Teach Pip attempt with notes hidden.{" "}
              <Link
                className="text-link text-[0.75rem] inline-flex gap-2 items-center hover:underline"
                href="/signin"
              >
                Sign in for your own course
              </Link>
              , or{" "}
              <Link
                className="text-link text-[0.75rem] inline-flex gap-2 items-center hover:underline"
                href="/sample"
              >
                try Pip on a different topic
              </Link>
              .
            </p>
          ) : (
            <Button disabled={busy} onClick={handoff}>
              Save topic & teach it to Pip
            </Button>
          )}
        </>
      )}
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
