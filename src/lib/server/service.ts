import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  acceptAnswer,
  acceptExplanation,
  AppError,
  appendQuestion,
  assertOwner,
  canAsk,
  conceptsSchema,
  topicInputSchema,
  validateConcepts,
  type Session,
  type Topic,
  type AttemptListItem,
} from "../domain";
import { sampleTopic } from "../sample";
import { actor, admin, dbError } from "./db";
import { evaluate, extractConcepts, nextQuestion } from "./ai";

const uuid = z.string().uuid();
export const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("extract"),
    key: uuid,
    ...topicInputSchema.shape,
  }),
  z.object({
    action: z.literal("save"),
    key: uuid,
    id: uuid.optional(),
    expectedVersion: z.number().int().min(1).optional(),
    ...topicInputSchema.shape,
    concepts: conceptsSchema,
  }),
  z.object({ action: z.literal("delete"), key: uuid, id: uuid }),
  z.object({
    action: z.literal("start"),
    key: uuid,
    topicId: uuid.optional(),
    retry: z.boolean().default(false),
    previousId: uuid.optional(),
  }),
  z.object({
    action: z.literal("explain"),
    key: uuid,
    id: uuid,
    text: z.string().trim().min(20).max(6000),
  }),
  z.object({
    action: z.literal("answer"),
    key: uuid,
    id: uuid,
    text: z.string().max(3000),
    unsure: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("finish"),
    key: uuid,
    id: uuid,
    text: z.string().max(3000).optional(),
  }),
  z.object({ action: z.literal("reveal"), key: uuid, id: uuid }),
]);
async function getTopic(id: string, userId: string | null): Promise<Topic> {
  if (!userId) throw new AppError("Sign in to open a personal topic.", 401);
  const db = admin();
  const { data, error } = await db
    .from("topics")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error || !data)
    throw new AppError("That topic was not found in your library.", 404);
  const { data: check, error: ce } = await db
    .from("checklists")
    .select("concepts")
    .eq("topic_id", id)
    .eq("version", data.version)
    .single();
  dbError(ce);
  return { ...data, concepts: check!.concepts };
}
export async function readTopic(id: string) {
  const who = await actor(true);
  return { topic: await getTopic(uuid.parse(id), who.userId) };
}
export async function readData(
  id?: string,
  before?: string,
  historyOnly = false,
  compact = false,
) {
  const who = await actor(!id);
  const db = admin();
  if (id) {
    const { data, error } = await db
      .from("sessions")
      .select("data,owner")
      .eq("id", uuid.parse(id))
      .eq("owner", who.id)
      .single();
    if (error || !data)
      throw new AppError(
        "That attempt is unavailable. Open it from the account that created it.",
        404,
      );
    assertOwner(data.owner, who.id);
    return { session: data.data };
  }
  let history = db
    .from("sessions")
    .select(
      (compact
        ? "id,created_at,title:data->>title,topic_id:data->>topic_id,phase:data->>phase,checklist_version:data->checklist_version"
        : "data,id,created_at") as string,
    )
    .eq("owner", who.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (before) {
    const cursor = z
      .object({ created_at: z.iso.datetime({ offset: true }), id: uuid })
      .parse(JSON.parse(before));
    history = history.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  }
  const { data: sessionRows, error: se } = await history.limit(50);
  dbError(se);
  const sessions = sessionRows as unknown as
    (AttemptListItem & { data: Session })[] | null;
  const last = sessions?.at(-1);
  const page = {
    sessions: compact ? [] : (sessions || []).map((s) => s.data),
    ...(compact ? { attempts: sessions || [] } : {}),
    nextCursor:
      sessions?.length === 50 && last
        ? JSON.stringify({ created_at: last.created_at, id: last.id })
        : null,
  };
  if (historyOnly) return page;
  const { data: topicRows, error } = await db
    .from("topics")
    .select(
      (compact ? "id,title,version,created_at,provenance" : "*") as string,
    )
    .eq("user_id", who.userId!)
    .order("created_at", { ascending: false });
  dbError(error);
  const topics = topicRows as unknown as Omit<Topic, "concepts">[] | null;
  const checks: { topic_id: string; version: number; concepts: unknown }[] = [];
  for (let i = 0; i < (topics || []).length; i += 30) {
    const batch = topics!.slice(i, i + 30);
    const { data, error: ce } = await db
      .from("checklists")
      .select("topic_id,version,concepts")
      .or(
        batch
          .map((t) => `and(topic_id.eq.${t.id},version.eq.${t.version})`)
          .join(","),
      );
    dbError(ce);
    checks.push(...(data || []));
  }
  return {
    topics: (topics || []).map((t) => ({
      ...t,
      concepts:
        checks?.find((c) => c.topic_id === t.id && c.version === t.version)
          ?.concepts || [],
    })),
    ...page,
  };
}
export async function runAction(input: unknown) {
  // Shared deadline covers early-ending questions plus evaluation and repairs.
  const deadline = Date.now() + 105000;
  const a = actionSchema.parse(input);
  const personal = ["extract", "save", "delete"].includes(a.action);
  const who = await actor(personal);
  const db = admin();
  const resource =
    "id" in a && a.id
      ? `${a.action === "save" || a.action === "delete" ? "topic" : "session"}:${a.id}`
      : `${who.id}:${a.key}`;
  const { data: begin, error: be } = await db.rpc("begin_operation", {
    p_actor: who.id,
    p_key: a.key,
    p_resource: resource,
    p_hash: createHash("sha256").update(JSON.stringify(a)).digest("hex"),
  });
  dbError(be);
  if (begin.cached) return begin.result;
  let pending: Session | undefined;
  async function commit(result: unknown, mutation: unknown = null) {
    const { error } = await db.rpc("commit_operation", {
      p_actor: who.id,
      p_key: a.key,
      p_result: result,
      p_mutation: mutation,
    });
    dbError(error);
    return result;
  }
  try {
    if (a.action === "extract")
      return await commit({
        concepts: await extractConcepts(a.notes, {
          deadline,
          quota: who.quota,
          slot: `extract:${who.id}:${a.key}`,
        }),
      });
    if (a.action === "save") {
      const prev = a.id ? await getTopic(a.id, who.userId) : null;
      // begin_operation holds the topic resource until commit, so checking
      // inside this lease also protects against concurrent app saves.
      if (prev && a.expectedVersion !== prev.version)
        return await commit({
          error:
            "This topic changed since you opened it. Your draft is retained. Compare it with the latest saved topic before saving again.",
          topic: prev,
          conflict: true,
        });
      const topic: Topic = {
        id: a.id || a.key,
        title: a.title,
        notes: a.notes,
        concepts: validateConcepts(a.notes, a.concepts),
        version: (prev?.version || 0) + 1,
        created_at: prev?.created_at || new Date().toISOString(),
      };
      return await commit({ topic }, { topic });
    }
    if (a.action === "delete") {
      await getTopic(a.id, who.userId);
      return await commit({ deleted: true }, { delete: a.id });
    }
    if (a.action === "start") {
      let topic: Topic = a.topicId
        ? await getTopic(a.topicId, who.userId)
        : sampleTopic;
      if (a.retry) {
        if (!a.previousId)
          throw new AppError("Choose a previous attempt to retry.");
        const { data: previous, error: pe } = await db
          .from("sessions")
          .select("data,owner")
          .eq("id", a.previousId)
          .eq("owner", who.id)
          .single();
        if (pe || !previous)
          throw new AppError("That previous attempt was not found.", 404);
        assertOwner(previous.owner, who.id);
        const snapshot = previous.data as Session;
        if (snapshot.topic_id !== (a.topicId || null))
          throw new AppError("This retry belongs to a different topic.", 400);
        topic = {
          ...topic,
          title: snapshot.title,
          notes: snapshot.notes,
          concepts: snapshot.concepts,
          version: snapshot.checklist_version,
          provenance: snapshot.provenance,
        };
      }
      // Starting attempts is also bounded to avoid database spam, but uses no provider call.
      const { error } = await db.rpc("reserve_usage", {
        p_actor: `start:${who.quota}`,
        p_slot: `start:${a.key}`,
        p_actor_limit: 25,
        p_app_limit: 5000,
        p_minute_limit: 120,
      });
      dbError(error);
      const session: Session = {
        id: a.key,
        owner: who.id,
        topic_id: a.topicId || null,
        title: topic.title,
        notes: topic.notes,
        concepts: topic.concepts,
        checklist_version: topic.version,
        phase: "explain",
        messages: [],
        question_calls: 0,
        notes_revealed: false,
        short_retry: a.retry,
        evaluation: null,
        created_at: new Date().toISOString(),
        provenance: topic.provenance,
      };
      return await commit({ session }, { session });
    }
    const { data, error } = await db
      .from("sessions")
      .select("data,owner")
      .eq("id", a.id)
      .eq("owner", who.id)
      .single();
    if (error || !data) throw new AppError("That attempt was not found.", 404);
    assertOwner(data.owner, who.id);
    let s = data.data as Session;
    if (a.action === "reveal") {
      s = { ...s, notes_revealed: s.notes_revealed || s.phase !== "review" };
      return await commit({ session: s }, { session: s });
    }
    // Finishing is safe to repeat even if the browser lost the first response.
    if (s.phase === "review" && a.action === "finish")
      return await commit({ session: s });
    if (s.phase === "review")
      throw new AppError(
        "This attempt is already reviewed. Start a retry for a new explanation.",
        409,
      );
    if (a.action === "explain") s = acceptExplanation(s, a.text);
    if (a.action === "answer") s = acceptAnswer(s, a.text, a.unsure);
    if (
      a.action === "finish" &&
      a.text?.trim() &&
      s.messages.at(-1)?.role === "student"
    )
      s = acceptAnswer(s, a.text, false);
    if (!s.messages.length)
      throw new AppError("Write an explanation before requesting a review.");
    pending = s;
    if (a.action !== "finish" && canAsk(s)) {
      const slot = `session:${s.id}:question:${s.question_calls}`;
      // Count failed question calls too: errors cannot bypass the hard three-call limit.
      pending = { ...s, question_calls: s.question_calls + 1 };
      s = appendQuestion(
        s,
        await nextQuestion(s, { quota: who.quota, slot, deadline }),
      );
      pending = s;
      if (s.messages.at(-1)?.role === "student")
        return await commit({ session: s }, { session: s });
    }
    const evaluation = await evaluate(s, {
      deadline,
      quota: who.quota,
      // A definite failure can be retried explicitly without discarding the
      // transcript. Replays keep the same operation key; concurrent actions
      // remain serialized by begin_operation and every call consumes quota.
      slot: `session:${s.id}:evaluation:${a.key}`,
    });
    s = { ...s, phase: "review", evaluation };
    return await commit({ session: s }, { session: s });
  } catch (e) {
    const error =
      e instanceof AppError
        ? e.message
        : e instanceof z.ZodError
          ? "Check the input limits and required fields."
          : "This request could not finish. Your draft is safe; please try later.";
    return await commit(
      { error, session: pending },
      pending ? { session: pending } : null,
    );
  }
}
