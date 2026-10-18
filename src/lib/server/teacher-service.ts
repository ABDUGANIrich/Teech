import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AppError,
  conceptsSchema,
  validateConcepts,
  type Topic,
  type Session,
} from "../domain";
import {
  learningInputSchema,
  learningStateSchema,
  privateKeySchema,
  resultSchema,
  studied,
  event,
  allUnits,
  eligible,
  sourceForHandoff,
  provenance,
  objectiveSummary,
  type LearningState,
  type LearningSession,
  type StudiedUnit,
} from "../learning";
import { actor, admin, dbError } from "./db";
import {
  teacherPlan,
  teacherUnit,
  teacherClarify,
  teacherGrade,
} from "./teacher-ai";
import { extractLessonConcepts, type Context } from "./ai";

const uuid = z.string().uuid();
const base = { key: uuid, id: uuid, version: z.number().int().min(0) };
const item = { ...base, itemId: z.string().min(1).max(60) };
export const teacherActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      key: uuid,
      input: learningInputSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("plan"),
      ...base,
      input: learningInputSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.enum([
        "accept",
        "generate",
        "practice",
        "next",
        "summary",
        "resume",
        "handoff_prepare",
        "handoff_extract",
        "delete",
      ]),
      ...base,
    })
    .strict(),
  z
    .object({
      action: z.literal("revisit"),
      ...base,
      unitId: z.string().max(60),
    })
    .strict(),
  z
    .object({
      action: z.literal("help"),
      ...base,
      question: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("submit"),
      ...item,
      answer: z.string().max(3000),
      unsure: z.boolean().default(false),
    })
    .strict(),
  z
    .object({ action: z.enum(["retry_grade", "hint", "solution"]), ...item })
    .strict(),
  z
    .object({
      action: z.literal("dispute"),
      ...item,
      reason: z.string().max(300),
    })
    .strict(),
  z
    .object({
      action: z.literal("targeted"),
      ...base,
      objectiveId: z.string().max(60),
    })
    .strict(),
  z
    .object({ action: z.literal("handoff"), ...base, concepts: conceptsSchema })
    .strict(),
]);
type Row = {
  id: string;
  user_id: string;
  state: unknown;
  version: number;
  provider_attempts: number;
  topic_id: string | null;
  teaching_id: string | null;
  created_at: string;
};
export function publicLearning(row: Row): LearningSession {
  return {
    ...learningStateSchema.parse(row.state),
    version: row.version,
    providerAttempts: row.provider_attempts,
    topicId: row.topic_id,
    teachingId: row.teaching_id,
  };
}
async function owned(id: string, userId: string) {
  const { data, error } = await admin()
    .from("learning_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  dbError(error && error.code !== "PGRST116" ? error : null);
  if (!data)
    throw new AppError("This lesson is not available in your account.", 404);
  return data as Row;
}
export async function readLearning(id?: string, before?: string) {
  const who = await actor(true);
  if (id)
    return {
      learning: publicLearning(await owned(uuid.parse(id), who.userId!)),
    };
  let query = admin()
    .from("learning_sessions")
    .select("*")
    .eq("user_id", who.userId!)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (before) {
    const c = z
      .object({ created_at: z.iso.datetime({ offset: true }), id: uuid })
      .strict()
      .parse(JSON.parse(before));
    query = query.or(
      `created_at.lt.${c.created_at},and(created_at.eq.${c.created_at},id.lt.${c.id})`,
    );
  }
  const { data, error } = await query.limit(50);
  dbError(error);
  const rows = (data || []) as Row[];
  const last = rows.at(-1);
  // The library needs no lesson text or submitted answers.
  return {
    lessons: rows.map((row) => {
      const s = publicLearning(row);
      return {
        id: s.id,
        title: s.plan?.title || s.input.topic,
        phase: s.phase,
        completed: s.completed.length,
        units: s.plan?.units.length || 0,
        version: s.version,
        createdAt: s.createdAt,
        provenance: provenance(s),
      };
    }),
    nextCursor:
      rows.length === 50 && last
        ? JSON.stringify({ created_at: last.created_at, id: last.id })
        : null,
  };
}

export async function runTeacherAction(input: unknown) {
  const a = teacherActionSchema.parse(input);
  const who = await actor(true);
  const db = admin();
  const id = a.action === "create" ? a.key : "id" in a ? a.id : "";
  const { data: begin, error: be } = await db.rpc("begin_operation", {
    p_actor: who.id,
    p_key: a.key,
    p_resource: `learn:${id}`,
    p_hash: createHash("sha256").update(JSON.stringify(a)).digest("hex"),
  });
  dbError(be);
  if (begin.cached) {
    // Never resurrect stale handoff links, answers or assistance from an old cache.
    const current = await owned(id, who.userId!).catch(() => null);
    if (current) return { ...begin.result, learning: publicLearning(current) };
    return begin.result?.deleted
      ? { deleted: true }
      : { error: "This lesson is no longer available." };
  }
  let s: LearningState;
  let version = -1;
  let grading: { unit: StudiedUnit; itemId: string } | undefined;
  const ctx: Context = {
    quota: who.quota,
    slot: `teacher:${id}:${a.key}`,
    deadline: Date.now() + 105000,
    teacherId: id,
    operationKey: a.key,
    checkpoint: async () => {
      await save(false);
    },
  };
  async function save(
    finish = true,
    extra: Record<string, unknown> = {},
    keys?: { unitId: string; keys: unknown },
    teaching?: unknown,
  ) {
    // Whitelist validation is shared with every GET and page response.
    const state = learningStateSchema.parse(s);
    const { data, error } = await db.rpc("save_teacher_operation", {
      p_actor: who.id,
      p_key: a.key,
      p_state: state,
      p_expected_version: version,
      p_private: keys || null,
      p_finish: finish,
      p_result: extra,
      p_teaching: teaching || null,
    });
    dbError(error);
    version = data.learning.version;
    return data as { learning: LearningSession; error?: string };
  }
  function requirePhase(...phases: LearningState["phase"][]) {
    if (!phases.includes(s.phase))
      throw new AppError(
        "That step is not available here. Reload the saved lesson.",
        409,
      );
  }
  function activeUnit() {
    const u = s.active === 3 ? s.targeted : s.units[s.active];
    if (!u)
      throw new AppError(
        "Read the current unit before using this action.",
        409,
      );
    return u;
  }
  try {
    if (a.action === "create") {
      const { error } = await db.rpc("reserve_usage", {
        p_actor: `start:${who.quota}`,
        p_slot: `start:learn:${a.key}`,
        p_actor_limit: 25,
        p_app_limit: 5000,
        p_minute_limit: 120,
      });
      dbError(error);
      s = {
        schemaVersion: 1,
        id,
        input: a.input,
        policy: a.input.notes ? "notes" : "general",
        phase: "setup",
        plan: null,
        planHistory: [],
        issue: null,
        accepted: false,
        active: 0,
        units: [],
        targeted: null,
        completed: [],
        helpUsed: 0,
        targetedUsed: false,
        targetedObjective: null,
        handoff: null,
        events: [],
        createdAt: new Date().toISOString(),
      };
      return await save();
    }
    const row = await owned(id, who.userId!);
    s = learningStateSchema.parse(row.state);
    version = row.version;
    if (!("version" in a) || a.version !== version)
      throw new AppError(
        "This lesson changed in another tab. Reload the saved lesson before continuing.",
        409,
      );
    if (a.action === "delete") {
      const { data, error } = await db.rpc("delete_teacher_operation", {
        p_actor: who.id,
        p_key: a.key,
        p_id: id,
        p_expected_version: version,
      });
      dbError(error);
      return data;
    }
    if (a.action === "plan") {
      requirePhase("setup", "plan");
      if (s.accepted)
        throw new AppError(
          "The accepted plan is frozen. Start a new lesson to change it.",
          409,
        );
      if (a.input) {
        if (JSON.stringify(s.input) !== JSON.stringify(a.input) && s.research)
          s.research.sources = [];
        s.input = a.input;
        s.policy = a.input.notes ? "notes" : "general";
      }
      // A failed revision must never leave an old plan accept-able against new input.
      s.issue = null;
      s.plan = null;
      s.phase = "setup";
      await save(false);
      const p = await teacherPlan(s, ctx);
      if (p.status === "insufficient") {
        s.phase = "setup";
        s.issue = p.reason;
        s.plan = null;
      } else {
        s.plan = p.plan;
        s.planHistory.push(p.plan);
        s.phase = "plan";
      }
      event(s, "plan");
      return await save();
    }
    if (a.action === "accept") {
      requirePhase("plan");
      if (!s.plan) throw new AppError("Generate a plan first.");
      s.accepted = true;
      s.phase = "learning";
      event(s, "accepted");
      return await save();
    }
    if (!s.accepted) throw new AppError("Confirm the lesson plan first.", 409);
    if (a.action === "generate") {
      requirePhase("learning");
      if (s.units[s.active]) return await save();
      const unitId = s.plan!.units[s.active]?.id;
      if (!unitId || s.active !== s.units.length)
        throw new AppError("Open units in lesson order.", 409);
      // Save before any provider attempt so refresh/re-entry requires a retry
      // even if the process dies without reaching the error handler.
      s.preparingUnit = unitId;
      await save(false);
      const pkg = await teacherUnit(s, unitId, ctx);
      s.units.push(studied(pkg.unit));
      delete s.preparingUnit;
      event(s, "viewed", unitId);
      return await save(true, {}, { unitId, keys: pkg.keys });
    }
    if (a.action === "practice") {
      requirePhase("learning");
      activeUnit();
      s.phase = "practice";
      return await save();
    }
    if (a.action === "help") {
      requirePhase("learning");
      const u = activeUnit();
      if (s.helpUsed >= 2)
        throw new AppError(
          "Both help requests have been used. You can revisit the saved explanation.",
        );
      s.helpUsed++;
      event(s, "help-requested", u.content.id);
      await save(false);
      const c = await teacherClarify(s, u, a.question, ctx);
      u.clarifications.push({ question: a.question, ...c });
      return await save();
    }
    if (a.action === "next") {
      requirePhase("practice");
      const u = activeUnit();
      if (
        u.attempts.some(
          (at) => at.state === "pending" && !at.solution && at.dispute === null,
        )
      )
        throw new AppError(
          "The saved answer is awaiting feedback. Retry assessment or end here to review.",
          409,
        );
      if (s.active !== 3 && !s.completed.includes(u.content.id))
        s.completed.push(u.content.id);
      event(s, "completed", u.content.id);
      if (s.active === 3 || s.active + 1 === s.plan!.units.length)
        s.phase = "summary";
      else {
        s.active++;
        s.phase = "learning";
      }
      return await save();
    }
    if (a.action === "resume") {
      requirePhase("summary");
      const next = s.plan!.units.findIndex((u) => !s.completed.includes(u.id));
      s.active = next < 0 ? s.plan!.units.length - 1 : next;
      s.phase = "learning";
      return await save();
    }
    if (a.action === "summary") {
      requirePhase("learning", "practice", "summary");
      s.phase = "summary";
      event(s, "summary");
      return await save();
    }
    if (a.action === "revisit") {
      requirePhase("summary", "learning", "practice");
      const index = s.units.findIndex((u) => u.content.id === a.unitId);
      if (index < 0 && s.targeted?.content.id !== a.unitId)
        throw new AppError("That unit has not been studied yet.");
      s.active = index < 0 ? 3 : index;
      s.phase = "learning";
      return await save();
    }
    if (a.action === "targeted") {
      requirePhase("summary");
      if (
        s.targeted ||
        (s.targetedUsed && s.targetedObjective !== a.objectiveId)
      )
        throw new AppError(
          "This session's extra practice pair has already been requested. Saved practice remains available.",
        );
      if (
        !objectiveSummary(s).some(
          (o) =>
            o.id === a.objectiveId &&
            o.label !== "Demonstrated in this session",
        )
      )
        throw new AppError("Choose an objective that needs another attempt.");
      s.targetedUsed = true;
      s.targetedObjective = a.objectiveId;
      event(s, "targeted-requested", a.objectiveId);
      await save(false);
      // Older lessons may already contain a normal unit called "targeted".
      const unitId = [
        "targeted",
        "targeted_1",
        "targeted_2",
        "targeted_3",
      ].find((candidate) => !s.plan!.units.some((u) => u.id === candidate))!;
      const pkg = await teacherUnit(s, unitId, ctx, a.objectiveId);
      s.targeted = studied(pkg.unit);
      s.active = 3;
      s.phase = "practice";
      return await save(true, {}, { unitId, keys: pkg.keys });
    }
    if (a.action === "handoff_prepare") {
      if (!s.handoff)
        s.handoff = {
          source: sourceForHandoff(s),
          concepts: null,
          extractionCalls: 0,
          done: false,
        };
      return await save();
    }
    if (a.action === "handoff_extract") {
      if (!eligible(s) || !s.handoff || s.handoff.done)
        throw new AppError("Preview the completed lesson source first.");
      if (s.handoff.concepts) return await save();
      if (s.handoff.extractionCalls >= 2)
        throw new AppError(
          "The two checklist attempts have been used. Copy the source into Teach Pip to add material and make a new topic.",
        );
      s.handoff.extractionCalls++;
      await save(false);
      s.handoff.concepts = await extractLessonConcepts(s.handoff.source, {
        quota: who.quota,
        slot: `teacher-handoff:${id}:${a.key}`,
        deadline: ctx.deadline,
      });
      return await save();
    }
    if (a.action === "handoff") {
      if (s.handoff?.done) return await save();
      if (!eligible(s) || !s.handoff?.concepts)
        throw new AppError(
          "Preview the source and extract a faithful 4–8 concept checklist first. Narrow lessons may need additional material.",
        );
      const concepts = validateConcepts(s.handoff.source, a.concepts);
      const origin = { label: provenance(s), lessonId: id };
      const topic: Topic = {
        id: randomUUID(),
        title: s.plan!.title,
        notes: s.handoff.source,
        concepts,
        version: 1,
        created_at: new Date().toISOString(),
        provenance: origin,
      };
      const session: Session = {
        id: randomUUID(),
        owner: who.id,
        topic_id: topic.id,
        title: topic.title,
        notes: topic.notes,
        concepts,
        checklist_version: 1,
        phase: "explain",
        messages: [],
        question_calls: 0,
        notes_revealed: false,
        short_retry: false,
        evaluation: null,
        created_at: topic.created_at,
        provenance: origin,
      };
      s.handoff.done = true;
      event(s, "handed-off");
      return await save(true, {}, undefined, { topic, session });
    }
    if (!("itemId" in a)) throw new AppError("Unknown lesson action.");
    requirePhase("practice");
    const u = activeUnit();
    const q = u.content.questions.find((q) => q.id === a.itemId);
    const at = u.attempts.find((at) => at.itemId === a.itemId);
    if (!q || !at)
      throw new AppError("This is not a question in the active unit.", 409);
    if (a.action === "dispute") {
      if (at.dispute !== null) return await save();
      at.dispute = a.reason;
      at.state = "finished";
      event(s, "disputed", q.id);
      return await save();
    }
    const { data: privateRow, error: pe } = await db
      .from("learning_assessments")
      .select("keys")
      .eq("session_id", id)
      .eq("unit_id", u.content.id)
      .single();
    dbError(pe);
    const key = z
      .array(privateKeySchema)
      .length(2)
      .parse(privateRow?.keys)
      .find((k) => k.itemId === q.id);
    if (!key)
      throw new AppError(
        "The saved question key is unavailable. Your answer is safe.",
        503,
      );
    if (a.action === "hint") {
      if (at.state !== "open" || at.solution || at.hints.length >= 2)
        throw new AppError(
          "No further hints are available for this item.",
          409,
        );
      at.hints.push(key.hints[at.hints.length]);
      event(s, "hint", q.id);
      return await save();
    }
    if (a.action === "solution") {
      if (!at.solution) {
        at.solution = key.solution;
        at.state = "finished";
        event(s, "solution", q.id);
      }
      at.state = "finished";
      return await save();
    }
    if (a.action === "submit") {
      if (at.state !== "open" || at.solution)
        throw new AppError(
          "This response is frozen. Use fresh practice for another assessment.",
          409,
        );
      if (!a.unsure && !a.answer.trim())
        throw new AppError(
          "Enter an answer or choose I’m not sure. You may also continue without answering.",
        );
      if (
        q.kind === "mcq" &&
        !a.unsure &&
        !q.choices.some((c) => c.id === a.answer)
      )
        throw new AppError("Choose one of the listed options.");
      at.answer = a.answer;
      at.unsure = a.unsure;
      if (a.unsure) {
        at.state = "finished";
        at.feedback = {
          itemId: q.id,
          status: "Not attempted",
          well: "You recorded that you were unsure.",
          gap: "This item has not demonstrated an independent answer.",
          next: "Revisit the explanation, or reveal the solution as a worked review.",
        };
        event(s, "unsure", q.id);
        return await save();
      }
      if (q.kind === "mcq") {
        const correct = a.answer === key.correctChoiceId;
        at.state = "finished";
        at.feedback = {
          itemId: q.id,
          status: correct ? "Correct" : "Needs another try",
          well: correct
            ? "Your choice agrees with the generated answer key."
            : "Your choice has been saved.",
          gap: key.choiceFeedback.find((c) => c.choiceId === a.answer)!
            .explanation,
          next: correct
            ? "Try applying the idea in the next problem."
            : "Revisit the explanation and worked example, or reveal the solution as a worked review.",
        };
        event(s, "submitted", q.id);
        return await save();
      }
      at.state = "pending";
      event(s, "submitted", q.id);
      await save(false);
    } else if (a.action === "retry_grade") {
      if (
        q.kind !== "application" ||
        !["pending", "failed"].includes(at.state) ||
        at.answer === null ||
        at.solution ||
        at.dispute !== null
      )
        throw new AppError("This item has no pending answer to assess.", 409);
      at.state = "pending";
      await save(false);
    } else throw new AppError("Unknown question action.");
    grading = { unit: u, itemId: q.id };
    at.feedback = resultSchema.parse(
      await teacherGrade(s, u, key, at.answer!, ctx),
    );
    at.state = "finished";
    event(s, "assessed", q.id);
    const saved = await save();
    grading = undefined;
    return saved;
  } catch (e) {
    const error =
      e instanceof AppError
        ? e.message
        : e instanceof z.ZodError
          ? "Check the input fields. The generated response may not meet the lesson format; saved work is unchanged."
          : "This step could not be saved or assessed. Reload to recover saved work, then explicitly retry if needed.";
    if (grading && s!) {
      const at = allUnits(s)
        .flatMap((u) => u.attempts)
        .find((at) => at.itemId === grading!.itemId)!;
      at.state = "failed";
      at.feedback = null;
      try {
        return await save(true, { error });
      } catch {
        /* A failed database write is never presented as saved. */
      }
    }
    const { error: ce } = await db.rpc("commit_operation", {
      p_actor: who.id,
      p_key: a.key,
      p_result: { error },
      p_mutation: null,
    });
    dbError(ce);
    const current = await owned(id, who.userId!).catch(() => null);
    return { error, ...(current ? { learning: publicLearning(current) } : {}) };
  }
}
