import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import cases from "./grading-cases.json";
import { newTeacherSample, sampleUnit } from "../../src/lib/teacher-sample";
import { studied } from "../../src/lib/learning";

// Local evaluation reservations replace the application database. These requests
// consume provider allowance, not a real learner's saved app/course quota.
const budget = vi.hoisted(() => ({ attempts: 0 }));
vi.mock("../../src/lib/server/db", () => ({
  dbError: (error: unknown) => {
    if (error) throw new Error("Evaluation reservation failed");
  },
  admin: () => ({
    rpc: async (name: string) => {
      if (name !== "reserve_usage" || ++budget.attempts > 8)
        throw new Error("Evaluation request budget exceeded");
      return { error: null };
    },
  }),
}));
import { teacherGrade, teacherUnit } from "../../src/lib/server/teacher-ai";

const results: { id: string; output: unknown }[] = [];
beforeAll(() => {
  if (
    process.env.TEECH_RUN_LIVE_EVAL !== "1" ||
    !process.env.OPENROUTER_API_KEY
  )
    throw new Error("Use npm run eval:ai -- --live with a provider key.");
  vi.stubEnv("KEENABLE_API_KEY", "");
});
afterAll(async () => {
  await mkdir("artifacts/ai-eval", { recursive: true });
  await writeFile(
    "artifacts/ai-eval/latest.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        model:
          process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-super-vl:free",
        completionAttempts: budget.attempts,
        results,
        humanReviewRequired: [
          "Check factual correctness and the worked trace.",
          "Attempt both questions using only essentials and the worked example.",
          "Check that unfamiliar terms are explained and feedback identifies the actual error.",
        ],
      },
      null,
      2,
    ),
  );
  vi.unstubAllEnvs();
});

describe("opt-in live model evaluation with synthetic examples", () => {
  it.each(cases)("grades $id against its expected verdict", async (item) => {
    const output = await teacherGrade(
      newTeacherSample(),
      studied(sampleUnit.unit),
      sampleUnit.keys[1],
      item.answer,
      {
        quota: "user:offline-evaluation",
        slot: `eval:${item.id}`,
        deadline: Date.now() + 145000,
      },
    );
    results.push({ id: item.id, output });
    expect(item.expectedStatuses).toContain(output.status);
    expect(output.itemId).toBe("halves_apply");
    for (const field of [output.well, output.gap, output.next])
      expect(field.trim()).not.toBe("");
  });
  it("generates bounded essentials and an example for human review", async () => {
    const output = await teacherUnit(newTeacherSample(), "halves", {
      quota: "user:offline-evaluation",
      slot: "eval:lesson",
      deadline: Date.now() + 145000,
    });
    results.push({ id: "short-binary-search-lesson", output });
    const words = (text: string) => text.trim().split(/\s+/).length;
    const essentials = output.unit.essentials!;
    expect(words(essentials.idea)).toBeLessThanOrEqual(35);
    for (const point of essentials.points)
      expect(words(point)).toBeLessThanOrEqual(30);
    expect(
      words([essentials.idea, ...essentials.points].join(" ")),
    ).toBeLessThanOrEqual(185);
    expect(
      words(output.unit.workedExample.map((block) => block.text).join(" ")),
    ).toBeLessThanOrEqual(120);
    expect(output.unit.questions).toHaveLength(2);
  });
});
