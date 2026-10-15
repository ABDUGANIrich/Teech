import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleConcepts, sampleNotes } from "../src/lib/sample";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("../src/lib/server/db", () => ({
  admin: () => ({ rpc: mocks.rpc }),
  dbError: (e: unknown) => {
    if (e) throw new Error("quota");
  },
}));
import { allowedModel, extractConcepts } from "../src/lib/server/ai";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  mocks.rpc.mockClear();
});
describe("bounded deterministic AI integration", () => {
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
              id: "nvidia/nemotron-3-super-120b-a12b:free",
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
