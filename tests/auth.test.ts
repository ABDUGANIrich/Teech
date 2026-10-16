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
  it("requests reset and resend links without requiring or forwarding passwords", async () => {
    const reset = await authAction(
      { mode: "recover", email: "person@example.com" },
      "https://teech.example",
    );
    expect(reset.message).toContain("If that address");
    expect(m.reset).toHaveBeenCalledWith("person@example.com", {
      redirectTo: "https://teech.example/auth/confirm?next=/reset-password",
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
      options: { emailRedirectTo: "https://teech.example/auth/confirm" },
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
