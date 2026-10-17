import { z } from "zod";
import { AppError, LIMITS, exactExcerpt, conceptsSchema } from "./domain";

const id = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-zA-Z0-9_-]+$/);
const text = (n: number) => z.string().trim().min(1).max(n);
export const learningInputSchema = z
  .object({
    topic: text(LIMITS.title),
    level: z.enum(["new", "basics", "refreshing"]).default("new"),
    goal: z.string().trim().max(300).default(""),
    notes: z.string().trim().max(LIMITS.notes).default(""),
  })
  .strict();
export const learningDraftSchema = learningInputSchema.extend({
  topic: z.string().max(100),
});
export const planSchema = z
  .object({
    title: text(100),
    interpretation: text(500),
    prerequisites: z.array(text(200)).max(4),
    objectives: z
      .array(z.object({ id, text: text(200) }).strict())
      .min(2)
      .max(6),
    units: z
      .array(
        z
          .object({
            id,
            title: text(100),
            objectiveIds: z.array(id).min(1).max(6),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    covers: text(500),
    excludes: text(500),
    estimatedMinutes: z.number().int().min(5).max(25),
    sourceExcerpts: z.array(text(800)).max(6),
  })
  .strict();
// Provider responses use an object root (rather than a root anyOf).
export const planResponseSchema = z
  .object({
    status: z.enum(["ready", "insufficient"]),
    plan: planSchema.nullable(),
    reason: text(700).nullable(),
    reasonCode: z
      .enum([
        "insufficient_notes",
        "requires_current_sources",
        "missing_document",
      ])
      .nullable(),
  })
  .strict();
export const blockSchema = z
  .object({
    kind: z.enum(["paragraph", "list", "equation", "code"]),
    text: text(1800),
  })
  .strict();
const questionBase = { id, objectiveId: id, prompt: text(1000) };
export const mcqSchema = z
  .object({
    ...questionBase,
    kind: z.literal("mcq"),
    choices: z
      .array(z.object({ id, text: text(400) }).strict())
      .min(3)
      .max(4),
  })
  .strict();
export const applicationSchema = z
  .object({ ...questionBase, kind: z.literal("application") })
  .strict();
export const pairSchema = z.tuple([mcqSchema, applicationSchema]);
export const unitSchema = z
  .object({
    id,
    outcome: text(300),
    explanation: z.array(blockSchema).min(1).max(6),
    definitions: z.array(text(300)).max(5),
    workedExample: z.array(blockSchema).min(1).max(5),
    misunderstanding: z.string().max(500),
    sourceExcerpts: z.array(text(800)).max(6),
    questions: pairSchema,
  })
  .strict();
export const privateKeySchema = z
  .object({
    itemId: id,
    correctChoiceId: id.nullable(),
    expectedAnswer: text(2000),
    rubric: z.array(text(500)).min(1).max(5),
    choiceFeedback: z
      .array(z.object({ choiceId: id, explanation: text(650) }).strict())
      .max(4),
    hints: z.array(text(600)).length(2),
    solution: text(2500),
  })
  .strict();
export const unitPackageSchema = z
  .object({
    unit: unitSchema,
    keys: z.array(privateKeySchema).length(2),
  })
  .strict();
export const resultSchema = z
  .object({
    itemId: id,
    status: z.enum([
      "Correct",
      "Partly correct",
      "Needs another try",
      "Could not assess reliably",
      "Not attempted",
    ]),
    well: text(650),
    gap: text(650),
    next: text(650),
  })
  .strict();
export const clarificationSchema = z
  .object({
    blocks: z.array(blockSchema).min(1).max(4),
    sourceExcerpts: z.array(text(800)).max(4),
  })
  .strict();
const attemptSchema = z
  .object({
    itemId: id,
    answer: z.string().max(LIMITS.answer).nullable(),
    unsure: z.boolean(),
    state: z.enum(["open", "pending", "failed", "finished"]),
    feedback: resultSchema.nullable(),
    hints: z.array(text(600)).max(2),
    solution: z.string().max(2500).nullable(),
    dispute: z.string().max(300).nullable(),
  })
  .strict();
const studiedSchema = z
  .object({
    content: unitSchema,
    attempts: z.array(attemptSchema).length(2),
    clarifications: z
      .array(
        z
          .object({
            question: text(500),
            blocks: z.array(blockSchema).max(4),
            sourceExcerpts: z.array(text(800)).max(4),
          })
          .strict(),
      )
      .max(2),
  })
  .strict();
export const learningStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().uuid(),
    input: learningInputSchema,
    policy: z.enum(["notes", "general"]),
    research: z
      .object({
        calls: z.number().int().min(0).max(8),
        sources: z
          .array(
            z
              .object({
                url: z.url().max(2000),
                title: z.string().max(300),
                text: z.string().min(1).max(5000),
                retrievedAt: z.iso.datetime(),
                publishedAt: z.string().max(80).optional(),
              })
              .strict(),
          )
          .max(12),
      })
      .strict()
      .optional(),
    phase: z.enum(["setup", "plan", "learning", "practice", "summary"]),
    plan: planSchema.nullable(),
    planHistory: z.array(planSchema).max(22),
    issue: z.string().max(700).nullable(),
    accepted: z.boolean(),
    active: z.number().int().min(0).max(3),
    units: z.array(studiedSchema).max(3),
    targeted: studiedSchema.nullable(),
    completed: z.array(id).max(3),
    helpUsed: z.number().int().min(0).max(2),
    targetedUsed: z.boolean(),
    targetedObjective: id.nullable(),
    handoff: z
      .object({
        source: z.string().max(LIMITS.notes),
        concepts: conceptsSchema.nullable(),
        extractionCalls: z.number().int().min(0).max(2),
        done: z.boolean(),
      })
      .strict()
      .nullable(),
    events: z
      .array(
        z
          .object({
            type: text(40),
            target: z.string().max(60),
            at: z.iso.datetime(),
          })
          .strict(),
      )
      .max(180),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type LearningInput = z.infer<typeof learningInputSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Unit = z.infer<typeof unitSchema>;
export type UnitPackage = z.infer<typeof unitPackageSchema>;
export type Key = z.infer<typeof privateKeySchema>;
export type LearningState = z.infer<typeof learningStateSchema>;
export type StudiedUnit = LearningState["units"][number];
export type Attempt = StudiedUnit["attempts"][number];
export type LearningSession = LearningState & {
  version: number;
  providerAttempts: number;
  topicId: string | null;
  teachingId: string | null;
};
export type Feedback = z.infer<typeof resultSchema>;

function unique(values: string[]) {
  return new Set(values).size === values.length;
}
function excerpts(
  policy: LearningState["policy"],
  notes: string,
  quotes: string[],
) {
  if (
    policy === "notes" &&
    (!quotes.length || quotes.some((q) => !exactExcerpt(notes, q)))
  )
    throw new AppError(
      "The lesson did not provide exact supporting passages from your notes. No generated content was saved.",
      502,
    );
  if (policy === "general" && quotes.length)
    throw new AppError(
      "General-knowledge lessons cannot claim source quotations.",
      502,
    );
}
export function validatePlan(plan: Plan, input: LearningInput) {
  if (
    plan.units.some((u) => u.id.length > 40) ||
    !unique(plan.objectives.map((o) => o.id)) ||
    !unique(plan.units.map((u) => u.id)) ||
    plan.units.some(
      (u) =>
        !unique(u.objectiveIds) ||
        u.objectiveIds.some((i) => !plan.objectives.some((o) => o.id === i)),
    ) ||
    plan.objectives.some(
      (o) => !plan.units.some((u) => u.objectiveIds.includes(o.id)),
    )
  )
    throw new AppError("The plan has inconsistent learning objectives.", 502);
  excerpts(input.notes ? "notes" : "general", input.notes, plan.sourceExcerpts);
  return plan;
}
export function validatePackage(
  pkg: UnitPackage,
  s: LearningState,
  unitId: string,
  target?: string,
) {
  const { unit, keys } = pkg;
  const scope = target
    ? [target]
    : s.plan!.units.find((u) => u.id === unitId)?.objectiveIds || [];
  const existing = [...s.units, ...(s.targeted ? [s.targeted] : [])].flatMap(
    (u) => u.content.questions.map((q) => q.id),
  );
  if (
    unit.id !== unitId ||
    !unique(unit.questions.map((q) => q.id)) ||
    unit.questions.some(
      (q) =>
        existing.includes(q.id) ||
        !q.id.startsWith(`${unitId}_`) ||
        !scope.includes(q.objectiveId),
    ) ||
    !unique(keys.map((k) => k.itemId)) ||
    keys.some((k) => !unit.questions.some((q) => q.id === k.itemId))
  )
    throw new AppError(
      "The lesson returned inconsistent question or objective IDs.",
      502,
    );
  for (const q of unit.questions) {
    const k = keys.find((k) => k.itemId === q.id)!;
    if (
      q.kind === "mcq" &&
      (!unique(q.choices.map((c) => c.id)) ||
        !unique(q.choices.map((c) => c.text.trim().toLowerCase())) ||
        !q.choices.some((c) => c.id === k.correctChoiceId))
    )
      throw new AppError(
        "The concept check has an invalid answer key or duplicate choices.",
        502,
      );
    if (q.kind === "application" && k.correctChoiceId !== null)
      throw new AppError(
        "The application problem returned an invalid key.",
        502,
      );
    if (
      q.kind === "mcq" &&
      (k.choiceFeedback.length !== q.choices.length ||
        !unique(k.choiceFeedback.map((c) => c.choiceId)) ||
        k.choiceFeedback.some(
          (c) => !q.choices.some((choice) => choice.id === c.choiceId),
        ))
    )
      throw new AppError(
        "The concept check lacks complete choice feedback.",
        502,
      );
    if (q.kind === "application" && k.choiceFeedback.length)
      throw new AppError("Application feedback cannot refer to choices.", 502);
  }
  excerpts(s.policy, s.input.notes, unit.sourceExcerpts);
  return pkg;
}
export function validateClarification<T extends { sourceExcerpts: string[] }>(
  c: T,
  s: LearningState,
) {
  excerpts(s.policy, s.input.notes, c.sourceExcerpts);
  return c;
}
export function studied(content: Unit): StudiedUnit {
  return {
    content,
    clarifications: [],
    attempts: content.questions.map((q) => ({
      itemId: q.id,
      answer: null,
      unsure: false,
      state: "open",
      feedback: null,
      hints: [],
      solution: null,
      dispute: null,
    })),
  };
}
export function event(s: LearningState, type: string, target = "") {
  if (s.events.at(-1)?.type === type && s.events.at(-1)?.target === target)
    return;
  if (s.events.length >= 180) s.events.shift();
  s.events.push({ type, target, at: new Date().toISOString() });
}
export function allUnits(s: LearningState) {
  return [...s.units, ...(s.targeted ? [s.targeted] : [])];
}
export function eligible(s: LearningState) {
  return (
    s.accepted &&
    !!s.plan &&
    s.phase === "summary" &&
    s.plan.units.every((u) => s.completed.includes(u.id))
  );
}
export function sourceForHandoff(s: LearningState) {
  if (!eligible(s))
    throw new AppError(
      "Complete all lesson units before preparing a teaching source.",
    );
  const source = [
    s.plan!.title,
    provenance(s),
    ...s.units.flatMap(({ content: u, clarifications }) => [
      u.outcome,
      ...u.explanation.map((b) => b.text),
      ...u.definitions,
      ...u.workedExample.map((b) => b.text),
      u.misunderstanding,
      ...clarifications.flatMap((c) => c.blocks.map((b) => b.text)),
    ]),
  ]
    .filter(Boolean)
    .join("\n\n");
  if (source.length > LIMITS.notes)
    throw new AppError(
      "This lesson is too long for a teaching source. Copy a smaller selection into Teach Pip and review its checklist.",
    );
  return source;
}
export function provenance(s: Pick<LearningState, "policy">) {
  return s.policy === "notes"
    ? "Lesson adapted from your notes"
    : "AI-generated lesson — not independently source-verified";
}
export function classification(a: Attempt) {
  if (a.dispute !== null) return "Disputed — excluded";
  if (a.solution) return "Worked review";
  if (a.feedback?.status === "Could not assess reliably")
    return "Uncertain — excluded";
  if (a.feedback?.status === "Correct")
    return a.hints.length ? "Correct with hints" : "Independent correct";
  if (a.state === "pending" || a.state === "failed")
    return "Awaiting assessment";
  return a.feedback?.status || "Not attempted";
}
export function objectiveSummary(s: LearningState) {
  return (
    s.plan?.objectives.map((o) => {
      const items = allUnits(s).flatMap((u) =>
        u.attempts.filter((a) =>
          u.content.questions.some(
            (q) => q.id === a.itemId && q.objectiveId === o.id,
          ),
        ),
      );
      const independent = items.filter(
        (a) => classification(a) === "Independent correct",
      ).length;
      const assisted = items.filter((a) => a.hints.length || a.solution).length;
      const excluded = items.filter(
        (a) =>
          a.dispute !== null ||
          a.feedback?.status === "Could not assess reliably",
      ).length;
      const unresolved = items.some(
        (a) =>
          a.dispute === null &&
          !a.solution &&
          ["Partly correct", "Needs another try"].includes(
            a.feedback?.status || "",
          ),
      );
      return {
        ...o,
        independent,
        assisted,
        excluded,
        label: unresolved
          ? "Needs another attempt"
          : independent
            ? "Demonstrated in this session"
            : "Not yet checked",
      };
    }) || []
  );
}
