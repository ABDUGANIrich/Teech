import { describe, expect, it } from "vitest";
import {
  acceptAnswer,
  acceptExplanation,
  appendQuestion,
  assertOwner,
  canAsk,
  evaluationSchema,
  exactExcerpt,
  topicInputSchema,
  validateConcepts,
  verifyEvaluation,
} from "../src/lib/domain";
import {
  fixtureReview,
  newPreview,
  sampleConcepts,
  sampleNotes,
} from "../src/lib/sample";
describe("inputs and source fidelity", () => {
  it("enforces client/server limits and unique concept IDs", () => {
    expect(
      topicInputSchema.safeParse({ title: "", notes: "tiny" }).success,
    ).toBe(false);
    expect(
      topicInputSchema.safeParse({ title: "Valid", notes: "x".repeat(18001) })
        .success,
    ).toBe(false);
    expect(() =>
      validateConcepts(sampleNotes, [
        ...sampleConcepts.slice(0, 3),
        sampleConcepts[0],
      ]),
    ).toThrow();
  });
  it("requires exact, nonempty contiguous quotations", () => {
    expect(exactExcerpt("Hello, earth.", "Hello, earth.")).toBe(true);
    expect(exactExcerpt("Hello, earth.", "hello, earth.")).toBe(false);
    expect(exactExcerpt("Hello, earth.", "")).toBe(false);
    expect(exactExcerpt("Hello, earth.", "Hello earth")).toBe(false);
  });
  it("validates every original sample passage", () => {
    expect(validateConcepts(sampleNotes, sampleConcepts)).toEqual(
      sampleConcepts,
    );
    expect(() =>
      validateConcepts(
        sampleNotes,
        sampleConcepts.map((c, i) =>
          i === 0 ? { ...c, excerpt: "A fabricated source excerpt" } : c,
        ),
      ),
    ).toThrow(/exactly/);
  });
});
describe("review validation", () => {
  const s = acceptExplanation(
    newPreview(),
    "Water moves from the ocean into the air when it gets warm.",
  );
  function raw() {
    const e = fixtureReview(s);
    return {
      ...e,
      results: e.results.map((r) => ({
        conceptId: r.conceptId,
        status: r.status,
        reason: r.reason,
        userExcerpt: r.userExcerpt,
        sourceExcerpt: r.sourceExcerpt,
        suggestion: r.suggestion,
        claimType: r.claimType,
      })),
    };
  }
  it("omits unverifiable source and user excerpts", () => {
    const r = raw();
    r.results[0].userExcerpt = "The user never wrote this.";
    r.results[0].sourceExcerpt = "The source never said this.";
    const v = verifyEvaluation(r, s).results[0];
    expect(v.sourceExcerpt).toBeNull();
    expect(v.userExcerpt).toBeNull();
    expect(v.evidenceWarning).toBe(true);
  });
  it("does not create quotations across message boundaries", () => {
    const r = raw();
    r.results[0].userExcerpt = "air when it gets warm. A second answer";
    expect(
      verifyEvaluation(r, {
        ...s,
        messages: [...s.messages, { role: "user", text: "A second answer" }],
      }).results[0].userExcerpt,
    ).toBeNull();
  });
  it("rejects omissions with quotes, duplicate concepts, and unsupported corrections", () => {
    const r = raw();
    r.results[5].userExcerpt = "Water";
    expect(() => verifyEvaluation(r, s)).toThrow();
    const b = raw();
    b.results[1].conceptId = b.results[0].conceptId;
    expect(() => verifyEvaluation(b, s)).toThrow();
    const c = raw();
    c.results[0].status = "Needs correction";
    c.results[0].claimType = "unsupported";
    expect(() => verifyEvaluation(c, s)).toThrow(/unsupported/);
  });
  it("rejects malformed AI output", () => {
    expect(
      evaluationSchema.safeParse({
        results: [],
        strengths: "great",
        revisit: [],
      }).success,
    ).toBe(false);
  });
});
describe("server lifecycle", () => {
  it("cannot answer without a question or submit a second explanation", () => {
    const s = newPreview();
    expect(() => acceptAnswer(s, "hello", false)).toThrow();
    const next = acceptExplanation(s, "An explanation long enough to start.");
    expect(() =>
      acceptExplanation(next, "A second explanation long enough."),
    ).toThrow();
  });
  it("stops after three questions and records unsure", () => {
    let s = acceptExplanation(
      newPreview(),
      "An explanation long enough to start.",
    );
    for (let i = 0; i < 3; i++) {
      expect(canAsk(s)).toBe(true);
      s = appendQuestion(s, {
        question: `What about concept number ${i}?`,
        conceptId: sampleConcepts[i].id,
      });
      s = acceptAnswer(s, "", true);
    }
    expect(s.messages.at(-1)?.unsure).toBe(true);
    expect(canAsk(s)).toBe(false);
    expect(() =>
      appendQuestion(s, {
        question: "A fourth question?",
        conceptId: "evaporation",
      }),
    ).toThrow();
  });
  it("rejects repetition, foreign concepts, and questions on short retries", () => {
    let s = acceptExplanation(
      newPreview(),
      "An explanation long enough to start.",
    );
    s = appendQuestion(s, {
      question: "Where does this water go?",
      conceptId: "evaporation",
    });
    s = acceptAnswer(s, "Into the air", false);
    expect(() =>
      appendQuestion(s, {
        question: "Where does this water go?",
        conceptId: "evaporation",
      }),
    ).toThrow();
    expect(() =>
      appendQuestion(s, {
        question: "What is this unrelated thing?",
        conceptId: "foreign",
      }),
    ).toThrow();
    expect(canAsk({ ...s, short_retry: true })).toBe(false);
  });
  it("supports an early end and enforces ownership", () => {
    const s = appendQuestion(
      acceptExplanation(newPreview(), "An explanation long enough to start."),
      { question: null, conceptId: null },
    );
    expect(s.messages).toHaveLength(1);
    expect(() => assertOwner("user:a", "user:b")).toThrow();
    expect(() => assertOwner("anon:a", "user:a")).toThrow();
    expect(() => assertOwner("user:a", "user:a")).not.toThrow();
  });
});
