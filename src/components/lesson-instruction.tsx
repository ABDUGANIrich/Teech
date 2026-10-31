"use client";

import { useEffect, useRef } from "react";
import {
  Lightbulb,
  ListChecks,
  FlaskConical,
  TriangleAlert,
} from "lucide-react";
import { SIMPLIFY_LESSON_QUESTION, type StudiedUnit } from "@/lib/learning";
import { Definitions, LessonBlocks, RichText } from "./result-content";
import { Button } from "./ui/button";
import type { LearningAction } from "./learning-practice";

export function LessonInstruction({
  unit,
  busy,
  canSimplify,
  act,
  sample,
}: {
  unit: StudiedUnit;
  busy: boolean;
  canSimplify: boolean;
  act: LearningAction;
  sample: boolean;
}) {
  const content = unit.content;
  const simplified = unit.clarifications.findLast(
    (c) => c.question === SIMPLIFY_LESSON_QUESTION,
  );
  const compact = !!content.essentials || !!simplified;
  const shortVersion = useRef<HTMLDivElement>(null);
  const previous = useRef(simplified);
  useEffect(() => {
    if (simplified && simplified !== previous.current)
      shortVersion.current?.focus();
    previous.current = simplified;
  }, [simplified]);
  return (
    <div
      className={`lesson-instruction ${compact ? "lesson-compact" : "lesson-original"}`}
    >
      {content.essentials ? (
        <div className="lesson-essentials">
          <section
            className="lesson-panel lesson-idea"
            aria-labelledby="lesson-idea-title"
          >
            <h3 id="lesson-idea-title">
              <Lightbulb aria-hidden="true" />
              The idea
            </h3>
            <RichText text={content.essentials.idea} />
          </section>
          <section
            className="lesson-panel lesson-points"
            aria-labelledby="lesson-points-title"
          >
            <h3 id="lesson-points-title">
              <ListChecks aria-hidden="true" />
              What to keep in mind
            </h3>
            <ul>
              {content.essentials.points.map((point, i) => (
                <li key={i}>
                  <RichText text={point} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : simplified ? (
        <div
          className="lesson-essentials lesson-simplified"
          ref={shortVersion}
          tabIndex={-1}
        >
          <h3>
            <Lightbulb aria-hidden="true" />
            The essentials
          </h3>
          <LessonBlocks blocks={simplified.blocks} />
          {simplified.sourceExcerpts.length > 0 && (
            <details className="lesson-reference">
              <summary>Supporting passages for this version</summary>
              {simplified.sourceExcerpts.map((quote, i) => (
                <blockquote key={i}>{quote}</blockquote>
              ))}
            </details>
          )}
        </div>
      ) : (
        <>
          <div className="lesson-simplify">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !canSimplify}
              onClick={() =>
                void act("help", { question: SIMPLIFY_LESSON_QUESTION })
              }
            >
              {busy ? "Preparing this step…" : "Make this easier to read"}
            </Button>
            <p>
              {canSimplify
                ? sample
                  ? "Fixed sample · uses one sample help request."
                  : "Uses 1 help request and AI allowance. Your practice stays saved."
                : "No help requests or AI allowance remain. Your saved explanation is below."}
            </p>
          </div>
          <div className="lesson-panel lesson-idea">
            <LessonBlocks blocks={content.explanation} />
          </div>
        </>
      )}
      <section className="learning-card lesson-panel lesson-example">
        <h3>
          <FlaskConical aria-hidden="true" />A worked example
        </h3>
        <LessonBlocks blocks={content.workedExample} />
      </section>
      {content.misunderstanding && (
        <aside className="lesson-panel lesson-watch">
          <p className="result-label">
            <TriangleAlert aria-hidden="true" />
            Watch for this
          </p>
          <RichText text={content.misunderstanding} />
        </aside>
      )}
      {compact && (
        <details className="lesson-reference lesson-deeper">
          <summary>
            {content.essentials
              ? "Go a little deeper"
              : "Read the original explanation"}
          </summary>
          <LessonBlocks blocks={content.explanation} />
        </details>
      )}
      {content.definitions.length > 0 && (
        <details className="lesson-reference lesson-definitions">
          <summary>
            Terms in this lesson <span>{content.definitions.length}</span>
          </summary>
          <Definitions items={content.definitions} />
        </details>
      )}
    </div>
  );
}
