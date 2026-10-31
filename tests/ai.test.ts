import { afterEach, describe, expect, it, vi } from "vitest";
import { newPreview, sampleConcepts, sampleNotes } from "../src/lib/sample";
import {
  acceptAnswer,
  acceptExplanation,
  appendQuestion,
} from "../src/lib/domain";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("../src/lib/server/db", () => ({
  admin: () => ({ rpc: mocks.rpc }),
  dbError: (e: unknown) => {
    if (e) throw new Error("quota");
  },
}));
import {
  allowedModel,
  extractConcepts,
  nextQuestion,
} from "../src/lib/server/ai";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  mocks.rpc.mockClear();
});
describe("bounded deterministic AI integration", () => {
  for (const invalid of ["unknown concept", "repeated question"]) {
    it(`repairs a Student ${invalid} with one separately reserved inference`, async () => {
      vi.stubEnv("OPENROUTER_API_KEY", "fixture-only");
      const first = {
        question: "Where does the water go next?",
        conceptId: sampleConcepts[0].id,
      };
      const session = acceptAnswer(
        appendQuestion(
          acceptExplanation(
            newPreview(),
            "Water evaporates and condenses in the water cycle.",
          ),
          first,
        ),
        "Into the atmosphere.",
        false,
      );
      const before = structuredClone(session);
      const bad =
        invalid === "unknown concept"
          ? { ...first, conceptId: "nonexistent" }
          : first;
      const good = {
        question: "What causes droplets to form in clouds?",
        conceptId: sampleConcepts[1].id,
      };
      const output = (v: unknown) =>
        Response.json({
          choices: [{ message: { content: JSON.stringify(v) } }],
        });
      const f = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            data: [
              {
                id: allowedModel(),
                pricing: { prompt: "0", completion: "0" },
                supported_parameters: ["structured_outputs"],
              },
            ],
          }),
        )
        .mockResolvedValueOnce(output(bad))
        .mockResolvedValueOnce(output(good));
      vi.stubGlobal("fetch", f);
      const result = await nextQuestion(session, {
        quota: "user:test",
        slot: "question:test",
      });
      expect(result).toEqual(good);
      expect(session).toEqual(before);
      expect(appendQuestion(session, result).question_calls).toBe(2);
      expect(mocks.rpc.mock.calls.map(([, args]) => args.p_slot)).toEqual([
        "question:test:0",
        "question:test:1",
      ]);
      expect(f).toHaveBeenCalledTimes(3);
      const repair = JSON.parse(f.mock.calls[2][1].body);
      expect(
        JSON.parse(repair.messages.at(-1).content)
          .untrusted_validation_feedback,
      ).toContain("invalid or repeated question");
    });
  }
  it("stops after one failed semantic question repair and accepts a null question without repair", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "fixture-only");
    const s = acceptExplanation(
      newPreview(),
      "Water evaporates and condenses in the water cycle.",
    );
    const catalog = () =>
      Response.json({
        data: [
          {
            id: allowedModel(),
            pricing: { prompt: "0", completion: "0" },
            supported_parameters: ["structured_outputs"],
          },
        ],
      });
    const bad = () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                question: "Where does the water go next?",
                conceptId: "nonexistent",
              }),
            },
          },
        ],
      });
    const f = vi
      .fn()
      .mockResolvedValueOnce(catalog())
      .mockImplementation(async () => bad());
    vi.stubGlobal("fetch", f);
    await expect(
      nextQuestion(s, { quota: "user:test", slot: "bad" }),
    ).rejects.toThrow("invalid response twice");
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(f).toHaveBeenCalledTimes(3);
    mocks.rpc.mockClear();
    f.mockReset()
      .mockResolvedValueOnce(catalog())
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({ question: null, conceptId: null }),
              },
            },
          ],
        }),
      );
    expect(await nextQuestion(s, { quota: "user:test", slot: "done" })).toEqual(
      { question: null, conceptId: null },
    );
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
  it("rejects paid or unlisted models", () => {
    vi.stubEnv("OPENROUTER_MODEL", "paid/model");
    vi.stubEnv("OPENROUTER_ALLOWED_MODELS", "paid/model");
    expect(() => allowedModel()).toThrow(/allowlist/);
    vi.stubEnv("OPENROUTER_MODEL", "other/model:free");
    expect(() => allowedModel()).toThrow();
  });
  it("reserves both the initial and the single repair call, without unbounded retry", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "mock-secret");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: "nvidia/nemotron-3.5-super-vl:free",
              pricing: { prompt: "0", completion: "0" },
              supported_parameters: ["structured_outputs"],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: "not JSON" } }] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({ concepts: sampleConcepts }),
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(
      await extractConcepts(sampleNotes, { quota: "user:test", slot: "test" }),
    ).toHaveLength(6);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "reserve_usage",
      expect.objectContaining({ p_actor: "user:test", p_minute_limit: 10 }),
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    const body = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(body.provider.max_price).toEqual({ prompt: 0, completion: 0 });
    expect(body.provider.allow_fallbacks).toBe(false);
    expect(body.response_format.type).toBe("json_schema");
  });
  it("does not retry provider rate limits", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "mock-secret");
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: allowedModel(),
              pricing: { prompt: "0", completion: "0" },
              supported_parameters: ["structured_outputs"],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response("", { status: 429 }));
    vi.stubGlobal("fetch", f);
    await expect(
      extractConcepts(sampleNotes, { quota: "user:test", slot: "test" }),
    ).rejects.toThrow(/capacity/);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not retry a timeout while consuming the provider response body", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "mock-secret");
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: allowedModel(),
              pricing: { prompt: "0", completion: "0" },
              supported_parameters: ["structured_outputs"],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new DOMException("Timed out", "TimeoutError"));
            },
          }),
        ),
      );
    vi.stubGlobal("fetch", f);
    await expect(
      extractConcepts(sampleNotes, { quota: "user:test", slot: "timeout" }),
    ).rejects.toThrow(/timed out/);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledTimes(2);
  });
});
