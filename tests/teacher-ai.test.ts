import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/domain";
import {
  newTeacherSample,
  samplePlan,
  sampleUnit,
} from "../src/lib/teacher-sample";
import { studied, SIMPLIFY_LESSON_QUESTION } from "../src/lib/learning";
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
  teacherClarify,
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
        id: "nvidia/nemotron-3.5-super-vl:free",
        pricing: { prompt: "0", completion: "0" },
        supported_parameters: ["structured_outputs"],
      },
    ],
  });
}
function output(value: unknown) {
  // Fixture adapter follows the provider's named-field wire format.
  const wire = structuredClone(value) as Record<string, unknown>;
  if (wire.status === "ready") {
    wire.reason = null;
    if (!("reasonCode" in wire)) wire.reasonCode = null;
  }
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
  vi.stubEnv("KEENABLE_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("teacher tasks on shared provider transport", () => {
  it("requires essentials for new units and repairs an older-format response within the existing budget", async () => {
    const old = structuredClone(sampleUnit);
    delete old.unit.essentials;
    const f = vi
      .fn()
      .mockResolvedValueOnce(catalog())
      .mockResolvedValueOnce(output(old))
      .mockResolvedValueOnce(output(sampleUnit));
    vi.stubGlobal("fetch", f);
    const result = await teacherUnit(newTeacherSample(), "halves", ctx);
    expect(result.unit.essentials).toEqual(sampleUnit.unit.essentials);
    expect(m.rpc).toHaveBeenCalledTimes(2);
  });
  it("shortens saved instruction using its starting level without sending practice keys", async () => {
    const s = newTeacherSample();
    const f = vi
      .fn()
      .mockResolvedValueOnce(catalog())
      .mockResolvedValueOnce(
        output({
          blocks: [{ kind: "paragraph", text: "A short explanation." }],
          sourceExcerpts: [],
        }),
      );
    vi.stubGlobal("fetch", f);
    await teacherClarify(
      s,
      studied(sampleUnit.unit),
      SIMPLIFY_LESSON_QUESTION,
      ctx,
    );
    const body = JSON.parse(f.mock.calls[1][1].body);
    expect(body.messages[0].content).toContain(
      "short, self-contained explanation",
    );
    const sent = JSON.parse(body.messages[1].content).untrusted_data;
    expect(sent.startingLevel).toBe(s.input.level);
    expect(sent.instruction.essentials).toEqual(sampleUnit.unit.essentials);
    expect(JSON.stringify(sent)).not.toContain("correctChoiceId");
    expect(JSON.stringify(sent)).not.toContain("expectedAnswer");
  });
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
    expect(body.messages[0].content).toContain(
      "You are Sage, Teech's AI teacher",
    );
    expect(body.messages[0].content).not.toContain("You are Pip");
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
    const repair = JSON.parse(f.mock.calls[2][1].body);
    expect(
      JSON.parse(repair.messages.at(-1).content).untrusted_validation_feedback,
    ).toContain("invalid answer key");
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
    const s = newTeacherSample();
    s.input.notes = "Binary search";
    s.policy = "notes";
    const f = vi
      .fn()
      .mockResolvedValueOnce(catalog())
      .mockResolvedValueOnce(
        output({
          status: "insufficient",
          reasonCode: "insufficient_notes",
          reason:
            "Add material about the search interval before planning this notes-based lesson.",
        }),
      );
    vi.stubGlobal("fetch", f);
    expect((await teacherPlan(s, ctx)).status).toBe("insufficient");
    expect(m.rpc).toHaveBeenCalledTimes(1);
  });
  it("plans a topic-only software introduction without notes or source claims", async () => {
    const s = newTeacherSample();
    s.input = { topic: "SEO in Next.js", level: "new", goal: "", notes: "" };
    const plan = {
      title: "SEO in Next.js: the fundamentals",
      interpretation: "Stable introductory concepts for a Next.js website.",
      prerequisites: [],
      objectives: [
        { id: "metadata", text: "Describe the purpose of page metadata." },
        { id: "discovery", text: "Explain how crawlers discover pages." },
      ],
      units: [
        {
          id: "seo",
          title: "Discovery and metadata",
          objectiveIds: ["metadata", "discovery"],
        },
      ],
      covers: "Page titles, descriptions and discoverable links.",
      excludes: "Current or version-specific APIs and ranking guarantees.",
      estimatedMinutes: 15,
      sourceExcerpts: [],
    };
    const f = vi
      .fn()
      .mockResolvedValueOnce(catalog())
      .mockResolvedValueOnce(output({ status: "ready", plan }));
    vi.stubGlobal("fetch", f);
    expect(await teacherPlan(s, ctx)).toEqual({ status: "ready", plan });
    const body = JSON.parse(f.mock.calls[1][1].body);
    expect(body.messages[0].content).toContain(
      "Notes are optional and absent by design",
    );
    expect(body.messages[0].content).not.toContain(
      "If notes lack material for a useful lesson",
    );
    expect(JSON.parse(body.messages[1].content).untrusted_data).toEqual({
      input: s.input,
      policy: "general",
      supportingSources: [],
      currentDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(m.rpc).toHaveBeenCalledOnce();
  });
  it("repairs a missing-notes refusal in general mode using one additional reservation", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(catalog())
      .mockResolvedValueOnce(
        output({
          status: "insufficient",
          reasonCode: "insufficient_notes",
          reason: "No notes provided.",
        }),
      )
      .mockResolvedValueOnce(output({ status: "ready", plan: samplePlan }));
    vi.stubGlobal("fetch", f);
    expect(await teacherPlan(newTeacherSample(), ctx)).toEqual({
      status: "ready",
      plan: samplePlan,
    });
    expect(f).toHaveBeenCalledTimes(3);
    expect(m.rpc).toHaveBeenCalledTimes(2);
    expect(m.rpc.mock.calls.map(([, args]) => args.p_slot)).toEqual([
      `${ctx.slot}:0`,
      `${ctx.slot}:1`,
    ]);
  });
  it.each(["insufficient_notes", null, "unknown_reason"])(
    "does not display an invalid general-mode refusal (%s) after the bounded repair",
    async (reasonCode) => {
      const f = vi
        .fn()
        .mockResolvedValueOnce(catalog())
        .mockImplementation(async () =>
          output({
            status: "insufficient",
            reasonCode,
            reason: "No notes provided.",
          }),
        );
      vi.stubGlobal("fetch", f);
      await expect(teacherPlan(newTeacherSample(), ctx)).rejects.toThrow(
        /invalid response twice/,
      );
      expect(f).toHaveBeenCalledTimes(3);
      expect(m.rpc).toHaveBeenCalledTimes(2);
    },
  );
  it.each([
    [
      "requires_current_sources",
      "The exact changes in the latest Next.js release",
      "Provide current release notes for the requested changes.",
    ],
    [
      "missing_document",
      "Explain chapter three of my private course document",
      "Provide the chapter so its content can be taught.",
    ],
  ])(
    "preserves a legitimate %s refusal without retrying",
    async (reasonCode, topic, reason) => {
      const s = newTeacherSample();
      s.input = { ...s.input, topic, goal: "" };
      const f = vi
        .fn()
        .mockResolvedValueOnce(catalog())
        .mockResolvedValueOnce(
          output({ status: "insufficient", reasonCode, reason }),
        );
      vi.stubGlobal("fetch", f);
      expect(await teacherPlan(s, ctx)).toEqual({
        status: "insufficient",
        reason,
      });
      expect(m.rpc).toHaveBeenCalledOnce();
    },
  );
  it("rejects a ready plan carrying a refusal code", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(catalog())
      .mockImplementation(async () =>
        output({
          status: "ready",
          plan: samplePlan,
          reasonCode: "missing_document",
        }),
      );
    vi.stubGlobal("fetch", f);
    await expect(teacherPlan(newTeacherSample(), ctx)).rejects.toThrow(
      /invalid response twice/,
    );
    expect(m.rpc).toHaveBeenCalledTimes(2);
  });
  it("accepts uncertain grading wire responses and rejects unknown item IDs", async () => {
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
    const submitted = JSON.parse(
      JSON.parse(f.mock.calls[1][1].body).messages[1].content,
    ).untrusted_data;
    expect(submitted.answer).toBe("Alternative trace");
    expect(submitted.key.rubric).toEqual(sampleUnit.keys[1].rubric);
    expect(submitted.question.id).toBe("halves_apply");
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
