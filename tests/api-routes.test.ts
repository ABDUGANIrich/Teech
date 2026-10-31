import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError } from "../src/lib/domain";

const actions = vi.hoisted(() => ({ student: vi.fn(), teacher: vi.fn() }));
vi.mock("../src/lib/server/service", () => ({
  runAction: actions.student,
  readData: vi.fn(),
  readTopic: vi.fn(),
}));
vi.mock("../src/lib/server/teacher-service", () => ({
  runTeacherAction: actions.teacher,
  readLearning: vi.fn(),
}));
import { POST as studentPost } from "../src/app/api/teech/route";
import { POST as teacherPost } from "../src/app/api/learn/route";

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://teech.example");
  for (const action of Object.values(actions))
    action.mockReset().mockResolvedValue({ saved: true });
});
afterEach(() => vi.unstubAllEnvs());

for (const [route, post, action] of [
  ["teech", studentPost, actions.student],
  ["learn", teacherPost, actions.teacher],
] as const) {
  describe(`POST /api/${route} request boundary`, () => {
    const invalid = [
      {
        name: "foreign origin",
        origin: "https://untrusted.example",
        status: 403,
      },
      { name: "missing origin", origin: null, status: 403 },
      { name: "non-JSON content", type: "text/plain", status: 415 },
      { name: "oversized content-length", length: "120001", status: 413 },
      {
        name: "oversized actual body",
        body: JSON.stringify({ padding: "x".repeat(100001) }),
        status: 413,
      },
      { name: "malformed JSON", body: "{", status: 400 },
    ];
    it.each(invalid)(
      "rejects $name before invoking the service",
      async (input) => {
        const headers = new Headers({
          "content-type": input.type ?? "application/json",
        });
        if (input.origin !== null)
          headers.set("origin", input.origin ?? "https://teech.example");
        if (input.length) headers.set("content-length", input.length);
        const response = await post(
          new NextRequest(`https://teech.example/api/${route}`, {
            method: "POST",
            headers,
            body: input.body ?? "{}",
          }),
        );
        expect(response.status).toBe(input.status);
        expect(await response.json()).toEqual({ error: expect.any(String) });
        expect(action).not.toHaveBeenCalled();
        if (route === "learn")
          expect(response.headers.get("cache-control")).toContain("no-store");
      },
    );
    function request() {
      return new NextRequest(`https://teech.example/api/${route}`, {
        method: "POST",
        headers: {
          origin: "https://teech.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "fixture", key: "test" }),
      });
    }
    it("passes a valid request to the service exactly once and prevents caching", async () => {
      const response = await post(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: true });
      expect(action).toHaveBeenCalledExactlyOnceWith({
        action: "fixture",
        key: "test",
      });
      expect(response.headers.get("cache-control")).toContain("no-store");
      if (route === "learn")
        expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });
    it("preserves an authorization rejection from the service", async () => {
      action.mockRejectedValueOnce(new AppError("Sign in", 401));
      const response = await post(request());
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Sign in" });
      expect(action).toHaveBeenCalledOnce();
    });
    it("does not expose unexpected server error details", async () => {
      action.mockRejectedValueOnce(
        new Error("private database and provider details"),
      );
      const response = await post(request());
      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).not.toContain(
        "private database",
      );
      expect(action).toHaveBeenCalledOnce();
    });
  });
}
