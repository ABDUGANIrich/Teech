import { describe, expect, it } from "vitest";
import {
  learningStateSchema,
  validatePackage,
  validatePlan,
  sourceForHandoff,
  studied,
  objectiveSummary,
  classification,
} from "../src/lib/learning";
import {
  newTeacherSample,
  samplePlan,
  sampleUnit,
} from "../src/lib/teacher-sample";
const state = () => learningStateSchema.strip().parse(newTeacherSample());
describe("learning content and evidence boundaries", () => {
  it("keeps the initial gap separate from successful fresh practice for the same objective", () => {
    const s = state();
    const first = studied(structuredClone(sampleUnit.unit));
    first.attempts[0].feedback = {
      itemId: first.attempts[0].itemId,
      status: "Needs another try",
      well: "Recorded",
      gap: "Choose the other half",
      next: "Revisit",
    };
    s.units.push(first);
    s.targeted = studied(structuredClone(sampleUnit.unit));
    s.targetedObjective = "discard";
    for (const q of s.targeted.content.questions) q.objectiveId = "discard";
    for (const at of s.targeted.attempts)
      at.feedback = {
        itemId: at.itemId,
        status: "Correct",
        well: "Valid",
        gap: "No gap",
        next: "Continue",
      };
    const summary = objectiveSummary(s).find((o) => o.id === "discard")!;
    expect(summary.initial.label).toBe("Needs another attempt");
    expect(summary.initial.independent).toBe(0);
    expect(summary.fresh?.label).toBe("Demonstrated in this session");
    expect(summary.fresh?.independent).toBe(2);
    s.targeted.attempts[0].hints.push("A hint");
    s.targeted.attempts[1].dispute = "Ambiguous";
    const changed = objectiveSummary(s).find((o) => o.id === "discard")!;
    expect(changed.initial).toEqual(summary.initial);
    expect(changed.fresh?.independent).toBe(0);
    expect(changed.fresh?.assisted).toBe(1);
    expect(changed.fresh?.excluded).toBe(1);
  });
  it("leaves room in question IDs for generated unit prefixes", () => {
    expect(() =>
      validatePlan(
        {
          ...samplePlan,
          units: [{ ...samplePlan.units[0], id: "x".repeat(60) }],
        },
        state().input,
      ),
    ).toThrow(/inconsistent/);
  });
  it("supports notes-free setup, scoped plans and strict public state", () => {
    const s = state();
    expect(validatePlan(samplePlan, s.input).interpretation).toContain(
      "introductory slice",
    );
    expect(() =>
      learningStateSchema.parse({ ...s, keys: sampleUnit.keys }),
    ).toThrow();
    expect(() =>
      validatePlan(
        {
          ...samplePlan,
          objectives: [...samplePlan.objectives, samplePlan.objectives[0]],
        },
        s.input,
      ),
    ).toThrow(/inconsistent/);
    expect(() =>
      validatePlan(
        {
          ...samplePlan,
          units: [{ ...samplePlan.units[0], objectiveIds: ["unknown"] }],
        },
        s.input,
      ),
    ).toThrow();
  });
  it("checks exact notes provenance without labeling semantic accuracy verified", () => {
    const s = state();
    s.input.notes = "Only these notes are supplied.";
    s.policy = "notes";
    expect(() => validatePlan(samplePlan, s.input)).toThrow(/exact/);
    expect(() =>
      validatePlan({ ...samplePlan, sourceExcerpts: ["these notes"] }, s.input),
    ).not.toThrow();
    expect(() => validatePackage(sampleUnit, s, "halves")).toThrow(/exact/);
    const pkg = structuredClone(sampleUnit);
    pkg.unit.sourceExcerpts = ["Only these notes"];
    expect(validatePackage(pkg, s, "halves")).toEqual(pkg);
    pkg.unit.sourceExcerpts = ["Invented quotation"];
    expect(() => validatePackage(pkg, s, "halves")).toThrow();
  });
  it("rejects duplicate choices, invalid keys, missing grading coverage and objective drift", () => {
    const s = state();
    expect(validatePackage(sampleUnit, s, "halves")).toEqual(sampleUnit);
    for (const mutate of [
      (p: typeof sampleUnit) => {
        p.unit.questions[0].choices[1].text =
          p.unit.questions[0].choices[0].text;
      },
      (p: typeof sampleUnit) => {
        p.keys[0].correctChoiceId = "missing";
      },
      (p: typeof sampleUnit) => {
        p.keys[1].itemId = p.keys[0].itemId;
      },
      (p: typeof sampleUnit) => {
        p.unit.questions[1].objectiveId = "unknown";
      },
      (p: typeof sampleUnit) => {
        p.unit.questions[0].id = "wrong-prefix";
      },
    ]) {
      const pkg = structuredClone(sampleUnit);
      mutate(pkg);
      expect(() => validatePackage(pkg, s, "halves")).toThrow();
    }
    s.units.push(studied(sampleUnit.unit));
    expect(() => validatePackage(sampleUnit, s, "halves")).toThrow(/IDs/);
  });
  it("keeps assisted, uncertain and disputed results outside independent success", () => {
    const s = state();
    const u = studied(sampleUnit.unit);
    s.units.push(u);
    const a = u.attempts[0];
    a.feedback = {
      itemId: a.itemId,
      status: "Correct",
      well: "yes",
      gap: "none",
      next: "practice",
    };
    expect(classification(a)).toBe("Independent correct");
    a.hints.push("help");
    expect(classification(a)).toBe("Correct with hints");
    a.solution = "revealed";
    expect(classification(a)).toBe("Worked review");
    a.dispute = "";
    expect(classification(a)).toBe("Disputed — excluded");
    expect(
      objectiveSummary(s).find((o) => o.id === "discard")?.independent,
    ).toBe(0);
    a.dispute = null;
    a.solution = null;
    a.feedback.status = "Could not assess reliably";
    expect(classification(a)).toBe("Uncertain — excluded");
  });
  it("builds a bounded immutable handoff from studied instruction, excluding answer material", () => {
    const s = state();
    s.accepted = true;
    s.phase = "summary";
    s.units.push(studied(sampleUnit.unit));
    expect(() => sourceForHandoff(s)).toThrow(/Complete/);
    s.completed = ["halves"];
    s.units[0].attempts[1].answer = "SECRET LEARNER RESPONSE";
    s.units[0].attempts[1].solution = "SECRET SOLUTION";
    const source = sourceForHandoff(s);
    expect(source).toContain("Binary search needs a sorted list");
    expect(source).not.toContain("SECRET");
    expect(source).not.toContain(sampleUnit.unit.questions[1].prompt);
    expect(source).not.toContain(sampleUnit.keys[1].expectedAnswer);
  });
});
