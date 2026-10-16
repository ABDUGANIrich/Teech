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
import type { LearningAction } from "./learning-practice";

export function LearningSummary({
  session: s,
  busy,
  act,
  sample,
}: {
  session: LearningSession;
  busy: boolean;
  act: LearningAction;
  sample: boolean;
}) {
  const units = allUnits(s);
  const attempts = units.flatMap((u) => u.attempts);
  const objectives = objectiveSummary(s);
  const [target, setTarget] = useState("");
  return (
    <section aria-labelledby="summary-title">
      <h2 id="summary-title">What happened in this session.</h2>
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
      <div className="learning-card">
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
        <p className="micro">
          Disputed and uncertain judgments are excluded from definitive
          conclusions. Correct choices indicate agreement with generated keys.
        </p>
      </div>
      {objectives.map((o) => (
        <div className="learning-card" key={o.id}>
          <h3>{o.text}</h3>
          <p>
            <strong>{o.label}</strong>
          </p>
          <p>
            {o.independent} independent correct · {o.assisted} assisted ·{" "}
            {o.excluded} disputed/uncertain
          </p>
        </div>
      ))}
      {units.map((u, i) => (
        <div className="learning-card" key={u.content.id}>
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
            <div className="summary-result" key={a.itemId}>
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
        <section className="learning-card">
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
        <p className="micro">
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
        <section className="learning-card">
          <p className="eyebrow">NEXT: PIP BECOMES YOUR STUDENT</p>
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
              key={`${s.id}:${s.handoff.concepts ? "checklist" : "source"}`}
              session={s}
              busy={busy}
              act={act}
              sample={sample}
            />
          )}
        </section>
      ) : (
        <p className="notice">
          Complete every lesson unit to prepare a source for Teach Pip.
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
}: {
  session: LearningSession;
  busy: boolean;
  act: LearningAction;
  sample: boolean;
}) {
  const h = s.handoff!;
  const [concepts, setConcepts] = useState<Concept[]>(h.concepts || []);
  const [error, setError] = useState("");
  function change(index: number, field: keyof Concept, value: string) {
    setConcepts((cs) =>
      cs.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    );
  }
  function handoff() {
    try {
      validateConcepts(h.source, concepts);
      setError("");
      void act("handoff", { concepts });
    } catch {
      setError(
        "Keep 4–8 distinct concepts, with exact supporting passages copied from this source. Expand a narrow lesson instead of manufacturing concepts.",
      );
    }
  }
  return (
    <div className="learning-handoff">
      <p>
        <strong>{provenance(s)}</strong>. This study reference is not
        independent proof of its own correctness. That provenance carries into
        the topic and review.
      </p>
      <details open>
        <summary>Immutable source preview</summary>
        <pre className="saved-answer">{h.source}</pre>
      </details>
      {h.done ? (
        <p>
          {s.teachingId ? (
            <Link className="text-link" href={`/teach/${s.teachingId}`}>
              Continue your teaching attempt →
            </Link>
          ) : (
            "The linked teaching material was removed. This lesson remains saved."
          )}
        </p>
      ) : !h.concepts ? (
        <>
          <p>
            A faithful checklist needs at least four distinct concepts. If the
            lesson is too narrow, add material in a new Teach Pip topic.
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
          <fieldset disabled={busy} className="learning-fields">
            {concepts.map((c, i) => (
              <div className="learning-card" key={c.id}>
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
            <p className="notice">
              Sample handoff preview only. A saved lesson creates a topic and
              starts a normal Student attempt with notes hidden.{" "}
              <Link className="text-link" href="/signin">
                Sign in for your own lesson
              </Link>
              , or{" "}
              <Link className="text-link" href="/sample">
                explore the Student sample (a different fixed topic)
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
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
