import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { AppError } from "../src/lib/domain";
import {
  newTeacherSample,
  samplePlan,
  sampleUnit,
} from "../src/lib/teacher-sample";
import { type LearningSession } from "../src/lib/learning";
const m = vi.hoisted(() => ({
  user: "11111111-1111-4111-8111-111111111111",
  rpc: vi.fn(),
  query: vi.fn(),
  plan: vi.fn(),
  unit: vi.fn(),
  grade: vi.fn(),
  clarify: vi.fn(),
  extract: vi.fn(),
}));
vi.mock("../src/lib/server/db", () => ({
  actor: async () => ({
    id: `user:${m.user}`,
    userId: m.user,
    quota: `user:${m.user}`,
  }),
  dbError: (e: { message: string } | null) => {
    if (e) throw new AppError(e.message, 503);
  },
  admin: () => ({
    rpc: m.rpc,
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const orders: string[] = [];
      let limit = 50;
      const run = () =>
        m.query(
          `select * from ${table}${filters.length ? " where " + filters.map(([k], i) => `${k}=$${i + 1}`).join(" and ") : ""}${orders.length ? " order by " + orders.join(",") : ""} limit ${limit}`,
          filters.map(([, v]) => v),
        );
      const chain = {
        select: () => chain,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return chain;
        },
        order: (k: string, o: { ascending: boolean }) => {
          orders.push(`${k} ${o.ascending ? "asc" : "desc"}`);
          return chain;
        },
        limit: async (n: number) => {
          limit = n;
          return { data: (await run()).rows, error: null };
        },
        single: async () => {
          const r = await run();
          return { data: r.rows[0] || null, error: null };
        },
      };
      return chain;
    },
  }),
}));
vi.mock("../src/lib/server/teacher-ai", () => ({
  teacherPlan: m.plan,
  teacherUnit: m.unit,
  teacherGrade: m.grade,
  teacherClarify: m.clarify,
}));
vi.mock("../src/lib/server/ai", () => ({ extractLessonConcepts: m.extract }));
import {
  readLearning,
  runTeacherAction,
} from "../src/lib/server/teacher-service";
let db: PGlite;
const user2 = "22222222-2222-4222-8222-222222222222";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${m.user}'),('${user2}');`,
  );
  for (const file of [
    "001_teech",
    "002_anonymous_daily_pool",
    "003_personal_minute_limit",
    "004_teacher_mode",
    "005_student_checkpoints",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}.sql`, "utf8"));
  m.query.mockImplementation((sql: string, args: unknown[]) =>
    db.query(sql, args),
  );
  m.rpc.mockImplementation(
    async (name: string, args: Record<string, unknown>) => {
      try {
        const entries = Object.entries(args);
        const r = await db.query<{ result: unknown }>(
          `select ${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(",")}) as result`,
          entries.map(([, v]) =>
            typeof v === "object" && v !== null ? JSON.stringify(v) : v,
          ),
        );
        return { data: r.rows[0].result, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  );
});
afterAll(async () => {
  await db.close();
});
async function reserve(ctx: {
  teacherId: string;
  operationKey: string;
  quota: string;
  slot: string;
}) {
  await db.query("select reserve_teacher_usage($1,$2,$3,$4,1000,1000,1000)", [
    ctx.teacherId,
    ctx.operationKey,
    ctx.quota,
    `${ctx.slot}:0`,
  ]);
}
beforeEach(async () => {
  m.user = "11111111-1111-4111-8111-111111111111";
  await db.exec(
    "truncate learning_assessments,learning_sessions,topics,checklists,sessions,operations,usage_events cascade",
  );
  m.plan.mockReset().mockImplementation(async (_s, ctx) => {
    await reserve(ctx);
    return { status: "ready", plan: structuredClone(samplePlan) };
  });
  m.unit.mockReset().mockImplementation(async (_s, unitId, ctx, target) => {
    await reserve(ctx);
    const pkg = structuredClone(sampleUnit);
    if (unitId !== "halves") {
      pkg.unit.id = unitId;
      pkg.unit.questions.forEach((q, i) => {
        q.id = `${unitId}_${i}`;
        if (target) q.objectiveId = target;
        pkg.keys[i].itemId = q.id;
      });
    }
    return pkg;
  });
  m.grade.mockReset().mockImplementation(async (_s, _u, key, _answer, ctx) => {
    await reserve(ctx);
    return {
      itemId: key.itemId,
      status: "Correct",
      well: "Your alternative trace uses valid bounds.",
      gap: "No material gap in this trace.",
      next: "Try describing the empty interval stopping condition.",
    };
  });
  m.clarify.mockReset().mockImplementation(async (_s, _u, _q, ctx) => {
    await reserve(ctx);
    return {
      blocks: [{ kind: "paragraph", text: "A fixed clarification." }],
      sourceExcerpts: [],
    };
  });
  m.extract.mockReset().mockImplementation(async (source: string) =>
    sampleUnit.unit.explanation
      .filter((b) => b.kind === "paragraph")
      .map((b, i) => ({
        id: `c${i}`,
        title: `Concept ${i}`,
        description: "Explain this idea",
        excerpt: b.text,
      }))
      .concat([
        {
          id: "c3",
          title: "Exclude middle",
          description: "Explain the update",
          excerpt: sampleUnit.unit.misunderstanding,
        },
      ])
      .map((c) => ({
        ...c,
        excerpt: source.includes(c.excerpt) ? c.excerpt : "INVALID",
      })),
  );
});
type Result = { learning?: LearningSession; error?: string; deleted?: boolean };
async function act(
  s: LearningSession,
  action: string,
  values: Record<string, unknown> = {},
  key = randomUUID(),
) {
  return (await runTeacherAction({
    action,
    id: s.id,
    version: s.version,
    key,
    ...values,
  })) as Result;
}
async function created() {
  const r = (await runTeacherAction({
    action: "create",
    key: randomUUID(),
    input: newTeacherSample().input,
  })) as Result;
  expect(r.error).toBeUndefined();
  expect(r.learning).toBeTruthy();
  return r.learning!;
}
async function active() {
  let s = await created();
  for (const a of ["plan", "accept", "generate", "practice"]) {
    const r = await act(s, a);
    expect(r.error).toBeUndefined();
    s = r.learning!;
  }
  return s;
}
describe("teacher service with actual embedded PostgreSQL and deterministic model fixtures", () => {
  it("checkpoints unit preparation before inference and keeps a durable retry marker after failure", async () => {
    let s = await created();
    for (const action of ["plan", "accept"])
      s = (await act(s, action)).learning!;
    m.unit.mockImplementationOnce(async (state, _unitId, ctx) => {
      const saved = (await readLearning(state.id)).learning!;
      expect(saved.preparingUnit).toBe("halves");
      expect(saved.units).toHaveLength(0);
      await reserve(ctx);
      throw new AppError("Provider interrupted", 504);
    });
    const failed = await act(s, "generate");
    expect(failed.error).toContain("interrupted");
    s = (await readLearning(s.id)).learning!;
    expect(s.preparingUnit).toBe("halves");
    expect(s.providerAttempts).toBe(2);
    s = (await act(s, "generate")).learning!;
    expect(s.preparingUnit).toBeUndefined();
    expect(s.units).toHaveLength(1);
    expect(s.providerAttempts).toBe(3);
  });
  for (const assistance of ["solution", "dispute"] as const) {
    it(`continues an interrupted pending assessment after ${assistance}, including refresh`, async () => {
      let s = await active();
      s.units[0].attempts[1].state = "pending";
      s.units[0].attempts[1].answer = "Saved before a host interruption";
      const state = Object.fromEntries(
        Object.entries(s).filter(
          ([k]) =>
            !["version", "providerAttempts", "topicId", "teachingId"].includes(
              k,
            ),
        ),
      );
      await db.query("update learning_sessions set state=$1 where id=$2", [
        JSON.stringify(state),
        s.id,
      ]);
      s = (
        await act(s, assistance, {
          itemId: "halves_apply",
          ...(assistance === "dispute" ? { reason: "Ambiguous wording" } : {}),
        })
      ).learning!;
      s = (await readLearning(s.id)).learning!;
      expect(s.units[0].attempts[1].answer).toBe(
        "Saved before a host interruption",
      );
      expect(s.units[0].attempts[1].state).toBe("finished");
      const result = await act(s, "next");
      expect(result.error).toBeUndefined();
      expect(result.learning!.phase).toBe("summary");
      expect(m.grade).not.toHaveBeenCalled();
    });
  }
  it("keeps extra practice distinct from a normal unit named targeted", async () => {
    let s = await created();
    m.plan.mockImplementationOnce(async (_s, ctx) => {
      await reserve(ctx);
      return {
        status: "ready",
        plan: {
          ...samplePlan,
          units: [{ ...samplePlan.units[0], id: "targeted" }],
        },
      };
    });
    for (const action of ["plan", "accept", "generate", "practice", "next"])
      s = (await act(s, action)).learning!;
    const result = await act(s, "targeted", { objectiveId: "middle" });
    expect(result.error).toBeUndefined();
    s = result.learning!;
    expect(s.targeted!.content.id).toBe("targeted_1");
    expect(
      (
        await db.query(
          "select unit_id from learning_assessments where session_id=$1",
          [s.id],
        )
      ).rows,
    ).toHaveLength(2);
    s = (
      await act(s, "submit", {
        itemId: s.targeted!.content.questions[1].id,
        answer: "A valid trace",
      })
    ).learning!;
    expect(s.targeted!.attempts[1].feedback!.status).toBe("Correct");
  });
  it("completes notes-free binary search, persists grading, resumes without generation and hands off once", async () => {
    let s = await active();
    expect(s.policy).toBe("general");
    s = (await act(s, "submit", { itemId: "halves_check", answer: "left" }))
      .learning!;
    const original = "  An alternative valid description of the trace.\n";
    s = (await act(s, "submit", { itemId: "halves_apply", answer: original }))
      .learning!;
    expect(s.units[0].attempts[1].answer).toBe(original);
    expect(s.units[0].attempts[1].feedback?.well).toContain("alternative");
    expect(s.providerAttempts).toBe(3);
    expect((await readLearning(s.id)).learning!.units).toEqual(s.units);
    expect(m.unit).toHaveBeenCalledOnce();
    s = (await act(s, "next")).learning!;
    s = (await act(s, "handoff_prepare")).learning!;
    expect(s.handoff!.source).not.toContain(original);
    s = (await act(s, "handoff_extract")).learning!;
    const key = randomUUID();
    const before = s;
    s = (await act(s, "handoff", { concepts: s.handoff!.concepts }, key))
      .learning!;
    expect(s.teachingId).toBeTruthy();
    const replay = await act(
      before,
      "handoff",
      { concepts: before.handoff!.concepts },
      key,
    );
    expect(replay.learning!.teachingId).toBe(s.teachingId);
    const fresh = await act(s, "handoff", { concepts: s.handoff!.concepts });
    expect(fresh.error).toBeUndefined();
    expect((await db.query("select * from topics")).rows).toHaveLength(1);
    const teaching = (
      await db.query<{
        data: { notes_revealed: boolean; provenance: { label: string } };
      }>("select data from sessions")
    ).rows[0].data;
    expect(teaching.notes_revealed).toBe(false);
    expect(teaching.provenance.label).toContain("AI-generated");
  });
  it("freezes response and assistance across new keys, refresh and solution replay", async () => {
    let s = await active();
    s = (await act(s, "hint", { itemId: "halves_check" })).learning!;
    s = (await act(s, "solution", { itemId: "halves_check" })).learning!;
    const r = await act(s, "submit", {
      itemId: "halves_check",
      answer: "left",
    });
    expect(r.error).toContain("frozen");
    s = (await readLearning(s.id)).learning!;
    expect(s.units[0].attempts[0].hints).toHaveLength(1);
    expect(s.units[0].attempts[0].solution).toBeTruthy();
    expect(s.units[0].attempts[0].feedback).toBeNull();
    s = (
      await act(s, "dispute", {
        itemId: "halves_apply",
        reason: "Ambiguous bounds",
      })
    ).learning!;
    s = (await act(s, "next")).learning!;
    expect(s.phase).toBe("summary");
    expect(s.units[0].attempts[1].dispute).toBe("Ambiguous bounds");
    expect(s.providerAttempts).toBe(2);
  });
  it("runs all three units plus optional help and targeted assessment in eleven primary calls", async () => {
    let s = await created();
    m.plan.mockImplementationOnce(async (_s, ctx) => {
      await reserve(ctx);
      return {
        status: "ready",
        plan: {
          ...samplePlan,
          units: ["one", "two", "three"].map((id) => ({
            ...samplePlan.units[0],
            id,
          })),
        },
      };
    });
    s = (await act(s, "plan")).learning!;
    s = (await act(s, "accept")).learning!;
    for (let i = 0; i < 3; i++) {
      s = (await act(s, "generate")).learning!;
      expect(s.units).toHaveLength(i + 1);
      const used = s.providerAttempts;
      s = (await act(s, "generate")).learning!;
      expect(s.providerAttempts).toBe(used);
      if (i < 2)
        s = (
          await act(s, "help", {
            question: "Explain the same step another way",
          })
        ).learning!;
      s = (await act(s, "practice")).learning!;
      for (const q of s.units[i].content.questions)
        s = (
          await act(s, "submit", {
            itemId: q.id,
            answer: q.kind === "mcq" ? "left" : "A valid trace",
          })
        ).learning!;
      s = (await act(s, "next")).learning!;
    }
    expect(s.completed).toHaveLength(3);
    expect(s.phase).toBe("summary");
    expect(s.providerAttempts).toBe(9);
    s = (await act(s, "targeted", { objectiveId: "stop" })).learning!;
    const q = s.targeted!.content.questions[1];
    s = (
      await act(s, "submit", {
        itemId: q.id,
        answer: "Stop when low exceeds high",
      })
    ).learning!;
    expect(s.providerAttempts).toBe(11);
    expect(m.unit).toHaveBeenCalledTimes(4);
    expect(m.grade).toHaveBeenCalledTimes(4);
  });
  it("saves an answer before grading, preserves it on failure and permits only explicit grading retry", async () => {
    let s = await active();
    m.grade.mockImplementationOnce(async (state, _u, _k, answer, ctx) => {
      const saved = (await readLearning(state.id)).learning!;
      expect(saved.units[0].attempts[1].answer).toBe(answer);
      expect(saved.units[0].attempts[1].state).toBe("pending");
      await reserve(ctx);
      throw new AppError("Timed out; saved answer retained.", 504);
    });
    const r = await act(s, "submit", {
      itemId: "halves_apply",
      answer: "My original reasoning",
    });
    expect(r.error).toContain("Timed out");
    s = r.learning!;
    expect(s.units[0].attempts[1].answer).toBe("My original reasoning");
    expect(s.units[0].attempts[1].state).toBe("failed");
    s = (await act(s, "retry_grade", { itemId: "halves_apply" })).learning!;
    expect(s.units[0].attempts[1].feedback?.status).toBe("Correct");
    expect(s.providerAttempts).toBe(4);
  });
  it("rejects stale tabs and replayed submits without duplicate provider calls", async () => {
    const s = await active();
    const key = randomUUID();
    const r = await act(
      s,
      "submit",
      { itemId: "halves_apply", answer: "trace" },
      key,
    );
    expect(r.error).toBeUndefined();
    expect(
      (await act(s, "submit", { itemId: "halves_apply", answer: "trace" }, key))
        .learning!.version,
    ).toBe(r.learning!.version);
    expect(
      (await act(s, "submit", { itemId: "halves_apply", answer: "other" }))
        .error,
    ).toContain("another tab");
    expect(m.grade).toHaveBeenCalledOnce();
  });
  it("serializes in-flight actions and rejects conflicting reuse of a completed key", async () => {
    const s = await active();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((r) => {
      entered = r;
    });
    const wait = new Promise<void>((r) => {
      release = r;
    });
    m.grade.mockImplementationOnce(async (_s, _u, key, _a, ctx) => {
      await reserve(ctx);
      entered();
      await wait;
      return {
        itemId: key.itemId,
        status: "Correct",
        well: "A valid trace.",
        gap: "No gap.",
        next: "Continue.",
      };
    });
    const key = randomUUID();
    const first = act(
      s,
      "submit",
      { itemId: "halves_apply", answer: "Original" },
      key,
    );
    await started;
    await expect(
      act(s, "submit", { itemId: "halves_apply", answer: "Original" }, key),
    ).rejects.toThrow(/BUSY/);
    await expect(act(s, "summary")).rejects.toThrow(/BUSY/);
    release();
    expect((await first).error).toBeUndefined();
    await expect(
      act(s, "submit", { itemId: "halves_apply", answer: "Changed" }, key),
    ).rejects.toThrow(/CONFLICT/);
    expect(m.grade).toHaveBeenCalledOnce();
  });
  it("invalidates the old unaccepted plan when a revised-input generation fails", async () => {
    let s = await created();
    s = (await act(s, "plan")).learning!;
    m.plan.mockRejectedValueOnce(new AppError("Provider unavailable.", 503));
    s = (
      await act(s, "plan", { input: { ...s.input, topic: "Different topic" } })
    ).learning!;
    expect(s.plan).toBeNull();
    expect(s.input.topic).toBe("Different topic");
    expect((await act(s, "accept")).error).toBeTruthy();
    expect(s.planHistory).toHaveLength(1);
  });
  it("resumes an early-ended lesson and retries failed fresh practice without changing its objective", async () => {
    let s = await created();
    s = (await act(s, "plan")).learning!;
    s = (await act(s, "accept")).learning!;
    s = (await act(s, "summary")).learning!;
    expect(s.units).toHaveLength(0);
    s = (await act(s, "resume")).learning!;
    expect(s.phase).toBe("learning");
    s = (await act(s, "generate")).learning!;
    s = (await act(s, "summary")).learning!;
    m.unit.mockRejectedValueOnce(new AppError("Timeout", 504));
    s = (await act(s, "targeted", { objectiveId: "middle" })).learning!;
    expect(s.targeted).toBeNull();
    expect(s.targetedObjective).toBe("middle");
    expect(
      (await act(s, "targeted", { objectiveId: "sorted" })).error,
    ).toContain("already");
    s = (await act(s, "targeted", { objectiveId: "middle" })).learning!;
    expect(
      s.targeted?.content.questions.every((q) => q.objectiveId === "middle"),
    ).toBe(true);
  });
  it("retains a durable pending answer through database interruption and uncertain operation recovery", async () => {
    let s = await active();
    const key = randomUUID();
    m.grade.mockImplementationOnce(async (state, _u, _k, _answer, ctx) => {
      await reserve(ctx);
      // Simulate the host dying after checkpoint: terminalize operation while grading is in flight.
      await db.query(
        "update operations set created_at=now()-interval '5 minutes' where key=$1",
        [key],
      );
      await db.query("select begin_operation($1,$2,$3,'recovery')", [
        `user:${m.user}`,
        randomUUID(),
        `other:${state.id}`,
      ]);
      return {
        itemId: "halves_apply",
        status: "Correct",
        well: "ok",
        gap: "none",
        next: "continue",
      };
    });
    await expect(
      act(
        s,
        "submit",
        { itemId: "halves_apply", answer: "Durable answer" },
        key,
      ),
    ).rejects.toThrow(/ACTIVE/);
    s = (await readLearning(s.id)).learning!;
    expect(s.units[0].attempts[1].state).toBe("pending");
    expect(s.units[0].attempts[1].answer).toBe("Durable answer");
    const replay = await act(
      { ...s, version: s.version - 1 },
      "submit",
      { itemId: "halves_apply", answer: "Durable answer" },
      key,
    );
    expect(replay.error).toMatch(/interrupted/);
    expect(m.grade).toHaveBeenCalledOnce();
  });
  it("enforces two total help requests and one fresh pair while preserving first attempts", async () => {
    let s = await active();
    s = (await act(s, "revisit", { unitId: "halves" })).learning!;
    for (let i = 0; i < 2; i++)
      s = (await act(s, "help", { question: "Explain another way" })).learning!;
    expect((await act(s, "help", { question: "more" })).error).toContain(
      "Both",
    );
    s = (await act(s, "summary")).learning!;
    s = (await act(s, "targeted", { objectiveId: "middle" })).learning!;
    expect(
      s.targeted?.content.questions.every((q) => q.objectiveId === "middle"),
    ).toBe(true);
    expect(s.units[0].attempts[0].answer).toBeNull();
    s = (await act(s, "next")).learning!;
    expect(
      (await act(s, "targeted", { objectiveId: "middle" })).error,
    ).toContain("already");
  });
  it("checkpoints retrieval evidence on failure and clears old sources on a changed plan input", async () => {
    let s = await created();
    m.plan.mockImplementationOnce(async (state, ctx) => {
      await reserve(ctx);
      state.research = {
        calls: 1,
        sources: [
          {
            url: "https://example.com/docs",
            title: "Saved documentation",
            text: "A retrieved source snapshot",
            retrievedAt: new Date().toISOString(),
          },
        ],
      };
      await ctx.checkpoint();
      throw new AppError("Supporting material could not be loaded", 503);
    });
    const failed = await act(s, "plan");
    expect(failed.error).toContain("Supporting material");
    s = (await readLearning(s.id)).learning!;
    expect(s.research?.calls).toBe(1);
    expect(s.research?.sources).toHaveLength(1);
    expect(s.plan).toBeNull();
    m.plan.mockImplementationOnce(async (state, ctx) => {
      expect(state.research).toEqual({ calls: 1, sources: [] });
      await reserve(ctx);
      return { status: "ready", plan: structuredClone(samplePlan) };
    });
    s = (
      await act(s, "plan", { input: { ...s.input, goal: "A revised scope" } })
    ).learning!;
    expect(s.phase).toBe("plan");
    expect(s.research?.calls).toBe(1);
    expect(s.research?.sources).toEqual([]);
  });
  it("keeps insufficient notes recoverable and permits explicit plan revisions before freezing", async () => {
    let s = await created();
    m.plan.mockResolvedValueOnce({
      status: "insufficient",
      reason:
        "The notes only name binary search. Add an explanation and example.",
    });
    s = (
      await act(s, "plan", { input: { ...s.input, notes: "Binary search" } })
    ).learning!;
    expect(s.phase).toBe("setup");
    expect(s.issue).toContain("Add");
    expect(s.policy).toBe("notes");
    s = (
      await act(s, "plan", { input: { ...s.input, topic: "Java", notes: "" } })
    ).learning!;
    expect(s.policy).toBe("general");
    s = (await act(s, "accept")).learning!;
    expect((await act(s, "plan")).error).toBeTruthy();
  });
  it("hides keys from the public DTO, direct owning clients and other accounts", async () => {
    const s = await active();
    const output = JSON.stringify(await readLearning(s.id));
    for (const hidden of [
      "correctChoiceId",
      "expectedAnswer",
      '"rubric"',
      sampleUnit.keys[0].hints[0],
    ])
      expect(output).not.toContain(hidden);
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${m.user}';`,
    );
    expect(
      (await db.query("select * from learning_sessions")).rows,
    ).toHaveLength(1);
    await expect(
      db.query("select * from learning_assessments"),
    ).rejects.toThrow(/permission/);
    await expect(
      db.query("select save_teacher_operation('x',null,null,0)"),
    ).rejects.toThrow(/permission/);
    await expect(db.query("delete from learning_sessions")).rejects.toThrow(
      /permission/,
    );
    await db.exec(`set request.jwt.claim.sub='${user2}';`);
    expect(
      (await db.query("select * from learning_sessions")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select * from learning_assessments"),
    ).rejects.toThrow(/permission/);
    await db.exec("reset role");
    m.user = user2;
    await expect(readLearning(s.id)).rejects.toThrow(/not available/);
    expect((await act(s, "summary")).error).toContain("not available");
  });
  it("atomically caps teacher calls at 22, including failed/repair slots, sharing global quotas", async () => {
    const s = await active();
    const key = randomUUID();
    await db.query("select begin_operation($1,$2,$3,'budget')", [
      `user:${m.user}`,
      key,
      `learn:${s.id}`,
    ]);
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, (_, i) =>
        db.query("select reserve_teacher_usage($1,$2,$3,$4,1000,1000,1000)", [
          s.id,
          key,
          `user:${m.user}`,
          `budget:${i}`,
        ]),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(20);
    expect((await readLearning(s.id)).learning!.providerAttempts).toBe(22);
    expect(
      (
        await db.query(
          "select * from usage_events where slot not like 'start:%'",
        )
      ).rows,
    ).toHaveLength(22);
    await expect(
      db.query("select reserve_usage($1,'student:next',1000,22,1000)", [
        `user:${m.user}`,
      ]),
    ).rejects.toThrow(/QUOTA/);
  });
  it("deletes learning assessments and caches while preserving derived teaching records", async () => {
    let s = await active();
    s = (await act(s, "next")).learning!;
    s = (await act(s, "handoff_prepare")).learning!;
    s = (await act(s, "handoff_extract")).learning!;
    s = (await act(s, "handoff", { concepts: s.handoff!.concepts })).learning!;
    expect((await act(s, "delete")).deleted).toBe(true);
    expect(
      (await db.query("select * from learning_assessments")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from learning_sessions")).rows,
    ).toHaveLength(0);
    const topics = await db.query<{ lesson_id: string | null }>(
      "select * from topics",
    );
    expect(topics.rows).toHaveLength(1);
    expect(topics.rows[0].lesson_id).toBeNull();
    const attempts = await db.query<{
      data: { provenance: { lessonId: string | null } };
    }>("select * from sessions");
    expect(attempts.rows).toHaveLength(1);
    expect(attempts.rows[0].data.provenance.lessonId).toBeNull();
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from operations where result ? 'learning'",
        )
      ).rows[0].n,
    ).toBe(0);
  });
});
