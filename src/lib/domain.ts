import { z } from "zod";

export const LIMITS = {
  title: 100,
  notes: 18000,
  explanation: 6000,
  answer: 3000,
  questions: 3,
} as const;
export const conceptSchema = z
  .object({
    id: z.string().min(1).max(60),
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(500),
    excerpt: z.string().min(8).max(1200),
  })
  .strict();
export const conceptsSchema = z
  .array(conceptSchema)
  .min(4)
  .max(8)
  .refine(
    (c) => new Set(c.map((x) => x.id)).size === c.length,
    "Concept IDs must be unique.",
  );
export const topicInputSchema = z
  .object({
    title: z.string().trim().min(1).max(LIMITS.title),
    notes: z.string().trim().min(80).max(LIMITS.notes),
  })
  .strict();
export const extractionSchema = z.object({ concepts: conceptsSchema }).strict();
export const questionSchema = z
  .object({
    question: z.string().min(8).max(400).nullable(),
    conceptId: z.string().max(60).nullable(),
  })
  .strict();
export const statuses = [
  "Explained clearly",
  "Partially explained",
  "Not demonstrated",
  "Needs correction",
] as const;
export const evaluationSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            conceptId: z.string().max(60),
            status: z.enum(statuses),
            reason: z.string().min(1).max(650),
            userExcerpt: z.string().max(1500).nullable(),
            sourceExcerpt: z.string().min(8).max(1200),
            suggestion: z.string().min(1).max(650),
            claimType: z.enum([
              "supported",
              "omitted",
              "unsupported",
              "contradiction",
            ]),
          })
          .strict(),
      )
      .min(4)
      .max(8),
    strengths: z.array(z.string().min(1).max(500)).max(3),
    revisit: z.array(z.string().min(1).max(500)).max(3),
  })
  .strict();
export type Concept = z.infer<typeof conceptSchema>;
export type Evaluation = z.infer<typeof evaluationSchema>;
export type VerifiedEvaluation = Omit<Evaluation, "results"> & {
  results: (Omit<Evaluation["results"][number], "sourceExcerpt"> & {
    sourceExcerpt: string | null;
    evidenceWarning: boolean;
  })[];
};
export type Message = {
  role: "user" | "student";
  text: string;
  unsure?: boolean;
};
export type Topic = {
  provenance?: { label: string; lessonId: string | null };
  lesson_id?: string | null;
  id: string;
  title: string;
  notes: string;
  concepts: Concept[];
  version: number;
  created_at: string;
};
export type Session = {
  provenance?: { label: string; lessonId: string | null };
  id: string;
  topic_id: string | null;
  owner: string;
  title: string;
  notes: string;
  concepts: Concept[];
  checklist_version: number;
  phase: "explain" | "questions" | "review";
  messages: Message[];
  question_calls: number;
  notes_revealed: boolean;
  short_retry: boolean;
  evaluation: VerifiedEvaluation | null;
  created_at: string;
  preview?: boolean;
};

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function exactExcerpt(
  text: string,
  excerpt: string | null | undefined,
): boolean {
  return !!excerpt?.trim() && text.includes(excerpt);
}
export function validateConcepts(notes: string, input: unknown): Concept[] {
  const concepts = conceptsSchema.parse(input);
  if (concepts.some((c) => !exactExcerpt(notes, c.excerpt)))
    throw new AppError(
      "Every supporting passage must be copied exactly from your notes.",
    );
  return concepts;
}
export function verifyEvaluation(
  input: unknown,
  session: Pick<Session, "concepts" | "notes" | "messages">,
): VerifiedEvaluation {
  const e = evaluationSchema.parse(input);
  const ids = new Set(e.results.map((r) => r.conceptId));
  if (
    ids.size !== session.concepts.length ||
    e.results.length !== session.concepts.length ||
    session.concepts.some((c) => !ids.has(c.id))
  )
    throw new AppError(
      "The AI did not review the full checklist. Your writing is safe.",
      502,
    );
  return {
    ...e,
    results: session.concepts.map((c) => {
      const r = e.results.find((x) => x.conceptId === c.id)!;
      const sourceOK = exactExcerpt(session.notes, r.sourceExcerpt);
      const userOK =
        r.userExcerpt !== null &&
        session.messages.some(
          (m) => m.role === "user" && exactExcerpt(m.text, r.userExcerpt),
        );
      if (r.status === "Needs correction" && r.claimType !== "contradiction")
        throw new AppError(
          "The AI confused an unsupported claim with a contradiction. Your writing is safe.",
          502,
        );
      if (r.status === "Not demonstrated" && r.userExcerpt !== null)
        throw new AppError(
          "The AI attached a quotation to an omitted concept.",
          502,
        );
      const validPair =
        (r.claimType === "supported" &&
          (r.status === "Explained clearly" ||
            r.status === "Partially explained")) ||
        (r.claimType === "unsupported" && r.status === "Partially explained") ||
        (r.claimType === "omitted" && r.status === "Not demonstrated") ||
        (r.claimType === "contradiction" && r.status === "Needs correction");
      if (!validPair)
        throw new AppError(
          "The AI returned conflicting review classifications. Your writing is safe.",
          502,
        );
      return {
        ...r,
        sourceExcerpt: sourceOK ? r.sourceExcerpt : null,
        userExcerpt: userOK ? r.userExcerpt : null,
        evidenceWarning: !sourceOK || (r.userExcerpt !== null && !userOK),
      };
    }),
  };
}
export function assertOwner(owner: string, actor: string) {
  if (owner !== actor)
    throw new AppError("This item is not available to this account.", 404);
}
export function acceptExplanation(session: Session, text: string): Session {
  if (session.phase !== "explain" || session.messages.length)
    throw new AppError("This explanation has already been submitted.", 409);
  const clean = z.string().trim().min(20).max(LIMITS.explanation).parse(text);
  return {
    ...session,
    messages: [{ role: "user", text: clean }],
    phase: "questions",
  };
}
export function acceptAnswer(
  session: Session,
  text: string,
  unsure: boolean,
): Session {
  if (
    session.phase !== "questions" ||
    session.messages.at(-1)?.role !== "student"
  )
    throw new AppError("There is no open question to answer.", 409);
  const clean = unsure
    ? "I'm not sure."
    : z.string().trim().min(1).max(LIMITS.answer).parse(text);
  return {
    ...session,
    messages: [...session.messages, { role: "user", text: clean, unsure }],
  };
}
export function canAsk(session: Session) {
  return (
    session.phase === "questions" &&
    !session.short_retry &&
    session.question_calls < LIMITS.questions &&
    session.messages.at(-1)?.role === "user"
  );
}
export function appendQuestion(session: Session, input: unknown): Session {
  if (!canAsk(session))
    throw new AppError("This attempt has reached its question limit.", 409);
  const next = questionSchema.parse(input);
  if (
    next.question &&
    (!session.concepts.some((c) => c.id === next.conceptId) ||
      session.messages.some(
        (m) =>
          m.role === "student" &&
          m.text.toLowerCase().trim() === next.question!.toLowerCase().trim(),
      ))
  )
    throw new AppError(
      "The student returned an invalid or repeated question.",
      502,
    );
  return {
    ...session,
    question_calls: session.question_calls + 1,
    messages: next.question
      ? [...session.messages, { role: "student", text: next.question }]
      : session.messages,
  };
}
