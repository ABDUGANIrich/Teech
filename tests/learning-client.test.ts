import { describe, expect, it } from "vitest";
import { actionRecovered } from "../src/lib/learning-client";
import {
  newTeacherSample,
  sampleTeacherAction,
  sampleUnit,
} from "../src/lib/teacher-sample";
import { studied } from "../src/lib/learning";
describe("evidence of a recovered Teacher action", () => {
  it("matches help after server trimming without mistaking a different clarification for success", () => {
    let before = newTeacherSample();
    for (const action of ["accept", "generate"])
      before = sampleTeacherAction(before, { action });
    const after = sampleTeacherAction(before, {
      action: "help",
      question: "Why halve the interval?",
    });
    expect(
      actionRecovered(before, after, "help", {
        question: "  Why halve the interval?\n",
      }),
    ).toBe(true);
    expect(
      actionRecovered(before, after, "help", {
        question: "Why change the bound?",
      }),
    ).toBe(false);
    expect(
      actionRecovered(before, before, "help", {
        question: "Why halve the interval?",
      }),
    ).toBe(false);
  });
  it("normalizes plan input for recovery while rejecting a different saved scope", () => {
    const before = newTeacherSample();
    const after = {
      ...before,
      version: before.version + 1,
      events: [{ type: "plan", target: "", at: new Date().toISOString() }],
    };
    const input = {
      ...before.input,
      topic: `  ${before.input.topic}  `,
      notes: ` ${before.input.notes} `,
      goal: ` ${before.input.goal} `,
    };
    expect(actionRecovered(before, after, "plan", { input })).toBe(true);
    expect(
      actionRecovered(before, after, "plan", {
        input: { ...input, topic: "Different scope" },
      }),
    ).toBe(false);
  });
  it("recovers an insufficient-source plan result without treating a checkpoint as completion", () => {
    const before = newTeacherSample();
    const after = {
      ...before,
      version: before.version + 1,
      phase: "setup" as const,
      plan: null,
      issue: "Add more source material",
      events: [{ type: "plan", target: "", at: new Date().toISOString() }],
    };
    expect(
      actionRecovered(before, after, "plan", { input: before.input }),
    ).toBe(true);
    expect(
      actionRecovered(before, { ...after, issue: null }, "plan", {
        input: before.input,
      }),
    ).toBe(false);
  });
  it("distinguishes a saved grading checkpoint from completed feedback", () => {
    const before = {
      ...newTeacherSample(),
      accepted: true,
      phase: "practice" as const,
      units: [studied(sampleUnit.unit)],
    };
    const checkpoint = structuredClone(before);
    checkpoint.version++;
    checkpoint.units[0].attempts[1].answer = "Original answer";
    checkpoint.units[0].attempts[1].state = "pending";
    expect(
      actionRecovered(before, checkpoint, "submit", {
        itemId: "halves_apply",
        answer: "Original answer",
      }),
    ).toBe(false);
    const done = sampleTeacherAction(before, {
      action: "submit",
      itemId: "halves_check",
      answer: "left",
    });
    expect(
      actionRecovered(before, done, "submit", {
        itemId: "halves_check",
        answer: "left",
      }),
    ).toBe(true);
    expect(
      actionRecovered(before, done, "submit", {
        itemId: "halves_check",
        answer: "different",
      }),
    ).toBe(false);
    expect(actionRecovered(before, done, "generate", {})).toBe(false);
  });
});
