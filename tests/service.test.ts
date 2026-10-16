import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { newPreview, sampleConcepts, sampleNotes } from "../src/lib/sample";
import type { Session } from "../src/lib/domain";
const m = vi.hoisted(() => ({
  actor: {
    id: "user:11111111-1111-4111-8111-111111111111",
    userId: "11111111-1111-4111-8111-111111111111",
    quota: "user:test",
  },
  rows: new Map<string, Record<string, unknown>[]>(),
  rpc: vi.fn(),
  question: vi.fn(),
  evaluation: vi.fn(),
  extraction: vi.fn(),
}));
vi.mock("../src/lib/server/db", () => ({
  actor: async () => m.actor,
  dbError: (e: unknown) => {
    if (e) throw new Error("database error");
  },
  admin: () => ({
    rpc: m.rpc,
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return chain;
        },
        single: async () => ({
          data:
            m.rows
              .get(table)
              ?.find((row) =>
                Object.entries(filters).every(([k, v]) => row[k] === v),
              ) || null,
          error: null,
        }),
      };
      return chain;
    },
  }),
}));
vi.mock("../src/lib/server/ai", () => ({
  nextQuestion: m.question,
  evaluate: m.evaluation,
  extractConcepts: m.extraction,
}));
import { runAction } from "../src/lib/server/service";
beforeEach(() => {
  m.rows.clear();
  m.question.mockReset();
  m.extraction.mockReset().mockResolvedValue(sampleConcepts);
  m.evaluation
    .mockReset()
    .mockResolvedValue({ results: [], strengths: [], revisit: [] });
  m.rpc
    .mockReset()
    .mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "begin_operation")
        return { data: { cached: false }, error: null };
      if (name === "commit_operation") {
        const s = (args.p_mutation as { session?: Session } | null)?.session;
        if (s) m.rows.set("sessions", [{ id: s.id, owner: s.owner, data: s }]);
      }
      return { data: null, error: null };
    });
});
function seed(overrides: Partial<Session> = {}) {
  const s = {
    ...newPreview(),
    id: randomUUID(),
    owner: m.actor.id,
    preview: undefined,
    ...overrides,
  };
  m.rows.set("sessions", [{ id: s.id, owner: s.owner, data: s }]);
  return s;
}
const action = (a: Record<string, unknown>) =>
  runAction({ ...a, key: randomUUID() }) as Promise<{
    session?: Session;
    error?: string;
  }>;
describe("server orchestration with deterministic AI and persistence doubles", () => {
  it("allows an explicit extraction retry with a new slot after failure", async () => {
    m.extraction.mockRejectedValueOnce(new Error("provider timeout"));
    const input = {
      action: "extract",
      title: "Water cycle",
      notes: sampleNotes,
    };
    expect((await action(input)).error).toBeTruthy();
    expect((await action(input)).error).toBeUndefined();
    const slots = m.extraction.mock.calls.map(([, ctx]) => ctx.slot);
    expect(slots[0]).not.toBe(slots[1]);
  });
  it("replays a completed extraction without calling the provider again", async () => {
    const key = randomUUID();
    const input = {
      action: "extract",
      title: "Water cycle",
      notes: sampleNotes,
      key,
    };
    const result = await runAction(input);
    m.rpc.mockImplementationOnce(async () => ({
      data: { cached: true, result },
      error: null,
    }));
    expect(await runAction(input)).toEqual(result);
    expect(m.extraction).toHaveBeenCalledOnce();
  });
  it("evaluates immediately when the student ends early", async () => {
    const s = seed();
    m.question.mockResolvedValue({ question: null, conceptId: null });
    const r = await action({
      action: "explain",
      id: s.id,
      text: "The Sun warms liquid water, which turns into vapor.",
    });
    expect(r.session?.phase).toBe("review");
    expect(m.question).toHaveBeenCalledOnce();
    expect(m.evaluation).toHaveBeenCalledOnce();
    expect(m.evaluation.mock.calls[0][0].messages[0].text).toContain("Sun");
  });
  it("counts a failed generation and persists submitted writing", async () => {
    const s = seed();
    m.question.mockRejectedValue(new Error("private provider body"));
    const r = await action({
      action: "explain",
      id: s.id,
      text: "The Sun warms liquid water, which turns into vapor.",
    });
    expect(r.error).not.toContain("private provider");
    expect(r.session?.messages).toHaveLength(1);
    expect(r.session?.question_calls).toBe(1);
    expect(m.evaluation).not.toHaveBeenCalled();
  });
  it("never asks beyond the third slot, and includes a final typed answer", async () => {
    const s = seed({
      phase: "questions",
      question_calls: 3,
      messages: [
        { role: "user", text: "Initial explanation" },
        { role: "student", text: "Where does the water go?" },
      ],
    });
    const r = await action({
      action: "finish",
      id: s.id,
      text: "Some water infiltrates the soil.",
    });
    expect(m.question).not.toHaveBeenCalled();
    expect(m.evaluation.mock.calls[0][0].messages.at(-1).text).toContain(
      "infiltrates",
    );
    expect(r.session?.phase).toBe("review");
  });
  it("cannot access another owner's attempt through a supplied ID", async () => {
    const s = seed({ owner: "user:other" });
    const r = await action({ action: "finish", id: s.id });
    expect(r.error).toMatch(/not found/);
    expect(m.question).not.toHaveBeenCalled();
    expect(m.evaluation).not.toHaveBeenCalled();
  });
  it("retries a failed review on the same transcript with a new quota slot", async () => {
    const s = seed({
      phase: "questions",
      messages: [
        { role: "user", text: "Initial explanation" },
        { role: "student", text: "Where does the water go?" },
      ],
    });
    m.evaluation.mockRejectedValueOnce(new Error("provider timeout"));
    const failed = await action({
      action: "finish",
      id: s.id,
      text: "Some water infiltrates the soil.",
    });
    expect(failed.error).toBeTruthy();
    expect(failed.session?.messages).toHaveLength(3);
    const reviewed = await action({ action: "finish", id: s.id });
    expect(reviewed.error).toBeUndefined();
    expect(reviewed.session?.phase).toBe("review");
    expect(reviewed.session?.messages).toEqual(failed.session?.messages);
    const slots = m.evaluation.mock.calls.map(([, ctx]) => ctx.slot);
    expect(slots[0]).not.toBe(slots[1]);
    expect(
      slots.every((slot) => slot.startsWith(`session:${s.id}:evaluation:`)),
    ).toBe(true);
  });
  it("returns the saved review when finish is repeated with a new key", async () => {
    const s = seed({
      phase: "review",
      evaluation: { results: [], strengths: [], revisit: [] },
    });
    const r = await action({ action: "finish", id: s.id });
    expect(r.error).toBeUndefined();
    expect(r.session).toEqual(s);
    expect(m.evaluation).not.toHaveBeenCalled();
    expect(m.question).not.toHaveBeenCalled();
  });
  it("revealing source after review does not alter practice conditions", async () => {
    const s = seed({ phase: "review", notes_revealed: false });
    const r = await action({ action: "reveal", id: s.id });
    expect(r.session?.notes_revealed).toBe(false);
  });
  it("retry keeps the old source and checklist after the topic was edited", async () => {
    const topicId = randomUUID();
    const s = seed({
      topic_id: topicId,
      checklist_version: 1,
      notes: sampleNotes,
      concepts: sampleConcepts,
    });
    m.rows.set("topics", [
      {
        id: topicId,
        user_id: m.actor.userId,
        title: "Edited title",
        notes: "Changed material",
        version: 2,
      },
    ]);
    m.rows.set("checklists", [
      { topic_id: topicId, version: 2, concepts: sampleConcepts.slice(0, 4) },
    ]);
    const r = await action({
      action: "start",
      topicId,
      retry: true,
      previousId: s.id,
    });
    expect(r.session?.notes).toBe(sampleNotes);
    expect(r.session?.concepts).toHaveLength(6);
    expect(r.session?.checklist_version).toBe(1);
    expect(r.session?.short_retry).toBe(true);
    expect(m.evaluation).not.toHaveBeenCalled();
  });
});
