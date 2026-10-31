import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({
  reset: vi.fn(),
  resend: vi.fn(),
  update: vi.fn(),
  user: vi.fn(),
  verify: vi.fn(),
  exchange: vi.fn(),
}));
vi.mock("../src/lib/server/db", () => ({
  authClient: async () => ({
    auth: {
      resetPasswordForEmail: m.reset,
      resend: m.resend,
      updateUser: m.update,
      getUser: m.user,
      verifyOtp: m.verify,
      exchangeCodeForSession: m.exchange,
    },
  }),
}));
import { authAction } from "../src/lib/server/auth-actions";
import { GET } from "../src/app/auth/confirm/route";
import { authDestination } from "../src/lib/auth-navigation";
beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [m.reset, m.resend, m.update, m.verify, m.exchange])
    fn.mockResolvedValue({ data: {}, error: null });
  m.user.mockResolvedValue({ data: { user: null }, error: null });
  vi.stubEnv("APP_URL", "https://teech.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "private");
});
afterEach(() => vi.unstubAllEnvs());
describe("account recovery", () => {
  it("accepts encoded callback destinations in compatible email templates and rejects foreign callbacks", async () => {
    for (const recovery of [false, true]) {
      const callback = new URL("https://teech.example/auth/confirm");
      callback.searchParams.set(
        "next",
        recovery ? "/reset-password" : "/learn/new",
      );
      if (recovery) callback.searchParams.set("returnTo", "/learn/new");
      const email = new URL("https://teech.example/auth/confirm");
      email.searchParams.set("token_hash", "fixture-token");
      email.searchParams.set("type", recovery ? "recovery" : "email");
      email.searchParams.set("redirect_to", callback.href);
      const result = new URL(
        (await GET(new NextRequest(email))).headers.get("location")!,
      );
      expect(result.pathname).toBe(recovery ? "/reset-password" : "/learn/new");
      if (recovery) expect(result.searchParams.get("next")).toBe("/learn/new");
      email.searchParams.set(
        "redirect_to",
        "https://foreign.example/auth/confirm?next=/new",
      );
      const rejected = new URL(
        (await GET(new NextRequest(email))).headers.get("location")!,
      );
      expect(rejected.pathname).toBe(recovery ? "/reset-password" : "/library");
      expect(rejected.searchParams.has("next")).toBe(false);
    }
  });
  it("preserves allowed destinations through confirmation and recovery", async () => {
    const next = "/learn/new?topic=11111111-1111-4111-8111-111111111111";
    await authAction(
      { mode: "resend", email: "person@example.com", next },
      "https://teech.example",
    );
    const confirm = new URL(m.resend.mock.calls[0][0].options.emailRedirectTo);
    expect(confirm.searchParams.get("next")).toBe(next);
    confirm.searchParams.set("code", "test");
    expect((await GET(new NextRequest(confirm))).headers.get("location")).toBe(
      `https://teech.example${next}`,
    );
    await authAction(
      { mode: "recover", email: "person@example.com", next },
      "https://teech.example",
    );
    const recovery = new URL(m.reset.mock.calls[0][1].redirectTo);
    recovery.searchParams.set("code", "test");
    const reset = new URL(
      (await GET(new NextRequest(recovery))).headers.get("location")!,
    );
    expect(reset.pathname).toBe("/reset-password");
    expect(reset.searchParams.get("next")).toBe(next);
  });
  it.each([
    "https://untrusted.example",
    "//untrusted.example",
    "/\\untrusted.example",
    "/signin",
    "/api/auth",
    "/%2f%2funtrusted.example",
  ])("rejects unsafe auth destination %s", (value) => {
    expect(authDestination(value)).toBe("/library");
  });
  it("requests reset and resend links without requiring or forwarding passwords", async () => {
    const reset = await authAction(
      { mode: "recover", email: "person@example.com" },
      "https://teech.example",
    );
    expect(reset.message).toContain("If that address");
    expect(m.reset).toHaveBeenCalledWith("person@example.com", {
      redirectTo: "https://teech.example/auth/confirm?next=%2Freset-password",
    });
    expect(
      (
        await authAction(
          { mode: "resend", email: "person@example.com" },
          "https://teech.example",
        )
      ).message,
    ).toContain("If that address");
    expect(m.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "person@example.com",
      options: {
        emailRedirectTo: "https://teech.example/auth/confirm?next=%2Flibrary",
      },
    });
  });
  it("requires a verified session and enforces password bounds before updates", async () => {
    await expect(
      authAction(
        { mode: "update-password", password: "a-new-password" },
        "https://teech.example",
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(m.update).not.toHaveBeenCalled();
    m.user.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
    await expect(
      authAction(
        { mode: "update-password", password: "short" },
        "https://teech.example",
      ),
    ).rejects.toThrow();
    expect(
      await authAction(
        { mode: "update-password", password: "a-new-password" },
        "https://teech.example",
      ),
    ).toEqual({ ok: true });
    expect(m.update).toHaveBeenCalledExactlyOnceWith({
      password: "a-new-password",
    });
  });
  it("verifies recovery tokens with the proper type and permits only a fixed redirect", async () => {
    let response = await GET(
      new NextRequest(
        "https://teech.example/auth/confirm?token_hash=test&type=recovery",
      ),
    );
    expect(m.verify).toHaveBeenCalledWith({
      token_hash: "test",
      type: "recovery",
    });
    expect(response.headers.get("location")).toBe(
      "https://teech.example/reset-password",
    );
    response = await GET(
      new NextRequest(
        "https://teech.example/auth/confirm?code=test&next=https://untrusted.example",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://teech.example/library",
    );
    m.verify.mockResolvedValueOnce({ error: { message: "expired" } });
    response = await GET(
      new NextRequest(
        "https://teech.example/auth/confirm?token_hash=expired&type=recovery",
      ),
    );
    expect(response.headers.get("location")).toContain("verification=failed");
  });
});
