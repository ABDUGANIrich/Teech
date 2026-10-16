import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/domain";
import {
  newTeacherSample,
  samplePlan,
  sampleUnit,
} from "../src/lib/teacher-sample";
import { studied } from "../src/lib/learning";
const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../src/lib/server/db", () => ({
  admin: () => ({ rpc: m.rpc }),
  dbError: (e: { message: string } | null) => {
    if (e) throw new AppError(e.message, 429);
  },
}));
import {
  teacherPlan,
  teacherUnit,
  teacherGrade,
} from "../src/lib/server/teacher-ai";
import { extractLessonConcepts } from "../src/lib/server/ai";
const ctx = {
  quota: "user:test",
  slot: "teacher:test",
  teacherId: "99999999-9999-4999-8999-999999999999",
  operationKey: "11111111-1111-4111-8111-111111111111",
};
function catalog() {
  return Response.json({
    data: [
      {
        id: "nvidia/nemotron-3-super-120b-a12b:free",
        pricing: { prompt: "0", completion: "0" },
        supported_parameters: ["structured_outputs"],
      },
    ],
  });
}
function output(value: unknown) {
  // Fixture adapter follows the provider's named-field wire format.
  const wire = structuredClone(value) as Record<string, unknown>;
  if (wire.status === "ready") wire.reason = null;
  if (wire.status === "insufficient") wire.plan = null;
  if (wire.unit && typeof wire.unit === "object" && "questions" in wire.unit) {
    const u = wire.unit as typeof sampleUnit.unit;
    const { questions, ...content } = u;
    wire.unit = {
      ...content,
      conceptCheck: questions[0],
      applicationProblem: questions[1],
    };
  }
  return Response.json({
    choices: [{ message: { content: JSON.stringify(wire) } }],
  });
}
beforeEach(() => {
  m.rpc.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("OPENROUTER_API_KEY", "fixture-key");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("teacher tasks on shared provider transport", () => {
  it("uses a separate teacher prompt and deliberately bounded unit output budget", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(catalog())
      .mockResolvedValueOnce(output(sampleUnit));
    vi.stubGlobal("fetch", f);
    const r = await teacherUnit(newTeacherSample(), "halves", ctx);
    expect(r.keys).toHaveLength(2);
    const body = JSON.parse(f.mock.calls[1][1].body);
    expect(body.max_tokens).toBe(6500);
    expect(
      JSON.stringify(body.response_format.json_schema.schema),
    ).not.toContain("prefixItems");
    expect(body.messages[0].content).toContain("Teacher");
    expect(body.messages[0].content).not.toContain("curious student helping");
    expect(body.messages[1].content).toContain("untrusted_data");
    expect(m.rpc).toHaveBeenCalledWith(
      "reserve_teacher_usage",
      expect.objectContaining({
        p_actor: ctx.quota,
        p_id: ctx.teacherId,
        p_key: ctx.operationKey,
        p_slot: `${ctx.slot}:0`,
        p_minute_limit: 10,
      }),
    );
  });
  it("makes only one repair and counts each malformed package attempt", async () => {
    const broken = structuredClone(sampleUnit);
    broken.keys[0].correctChoiceId = "missing";
    const f = vi
      .fn()
      .mockResolvedValueOnce(catalog())
      .mockImplementation(async () => output(broken));
    vi.stubGlobal("fetch", f);
    await expect(
      teacherUnit(newTeacherSample(), "halves", ctx),
    ).rejects.toThrow(/invalid response twice/);
    expect(f).toHaveBeenCalledTimes(3);
    expect(m.rpc).toHaveBeenCalledTimes(2);
    expect(m.rpc.mock.calls[1][1].p_slot).toBe(`${ctx.slot}:1`);
  });
  it("rejects fabricated notes excerpts and repairs once without showing them", async () => {
    const s = newTeacherSample();
    s.input.notes = "This is the only supplied source text.";
    s.policy = "notes";
    const f = vi
      .fn()
      .mockResolvedValueOnce(catalog())
      .mockImplementation(async () =>
        output({
          status: "ready",
          plan: { ...samplePlan, sourceExcerpts: ["Fabricated source"] },
        }),
      );
    vi.stubGlobal("fetch", f);
    await expect(teacherPlan(s, ctx)).rejects.toThrow(/invalid response twice/);
    expect(m.rpc).toHaveBeenCalledTimes(2);
  });
  it("reports insufficient notes as a valid bounded result without general-knowledge fallback", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(catalog())
      .mockResolvedValueOnce(
        output({
          status: "insufficient",
          reason:
            "Add material about the search interval before planning this notes-based lesson.",
        }),
      );
    vi.stubGlobal("fetch", f);
    expect((await teacherPlan(newTeacherSample(), ctx)).status).toBe(
      "insufficient",
    );
    expect(m.rpc).toHaveBeenCalledTimes(1);
  });
  it("allows uncertain grading and alternative reasoning, but rejects unknown item IDs", async () => {
    const grade = {
      itemId: "halves_apply",
      status: "Could not assess reliably",
      well: "Your bounds are stated.",
      gap: "The question leaves the rounding convention ambiguous.",
      next: "Review the stated convention or dispute the item.",
    };
    const f = vi
      .fn()
      .mockResolvedValueOnce(catalog())
      .mockResolvedValueOnce(output(grade));
    vi.stubGlobal("fetch", f);
    const result = await teacherGrade(
      newTeacherSample(),
      studied(sampleUnit.unit),
      sampleUnit.keys[1],
      "Alternative trace",
      ctx,
    );
    expect(result.status).toBe("Could not assess reliably");
    expect(JSON.parse(f.mock.calls[1][1].body).messages[0].content).toContain(
      "alternative valid reasoning",
    );
    f.mockReset()
      .mockResolvedValueOnce(catalog())
      .mockImplementation(async () => output({ ...grade, itemId: "unknown" }));
    await expect(
      teacherGrade(
        newTeacherSample(),
        studied(sampleUnit.unit),
        sampleUnit.keys[1],
        "Alternative trace",
        { ...ctx, slot: "new" },
      ),
    ).rejects.toThrow(/invalid response twice/);
  });
  it("does not retry transport timeouts or exhausted session quota", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(catalog())
      .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    vi.stubGlobal("fetch", f);
    await expect(teacherPlan(newTeacherSample(), ctx)).rejects.toThrow(
      /timed out/,
    );
    expect(m.rpc).toHaveBeenCalledTimes(1);
    m.rpc
      .mockClear()
      .mockResolvedValueOnce({ error: { message: "TEACHER_BUDGET_EXCEEDED" } });
    f.mockReset().mockResolvedValueOnce(catalog());
    await expect(teacherPlan(newTeacherSample(), ctx)).rejects.toThrow(
      /BUDGET/,
    );
    expect(f).toHaveBeenCalledOnce();
  });
  it("refuses to manufacture four concepts from a narrow handoff source", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(catalog())
      .mockResolvedValueOnce(
        output({
          concepts: null,
          limitation: "This source only supports two distinct ideas.",
        }),
      );
    vi.stubGlobal("fetch", f);
    await expect(
      extractLessonConcepts("A narrow source", {
        quota: "user:test",
        slot: "handoff",
      }),
    ).rejects.toThrow(/four-concept minimum/);
    expect(m.rpc).toHaveBeenCalledWith("reserve_usage", expect.anything());
    expect(m.rpc).toHaveBeenCalledOnce();
  });
});
