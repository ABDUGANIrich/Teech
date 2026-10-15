import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  token: undefined as string | undefined,
  user: null as { id: string } | null,
  set: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (m.token ? { value: m.token } : undefined),
    getAll: () => [],
    set: m.set,
  }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: m.user } }) },
  }),
}));
import { actor } from "../src/lib/server/db";
beforeEach(() => {
  m.token = undefined;
  m.user = null;
  m.set.mockReset().mockImplementation((_name, value) => {
    m.token = value;
  });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-test-key");
  vi.stubEnv("ANONYMOUS_HASH_SECRET", "a".repeat(64));
});
afterEach(() => vi.unstubAllEnvs());
it("keeps one visitor's quota stable and gives a second visitor a separate quota", async () => {
  const first = await actor();
  expect(first.quota).toBe(first.id);
  expect(await actor()).toEqual(first);
  expect(m.set).toHaveBeenCalledTimes(1);
  m.token = undefined;
  const second = await actor();
  expect(second.quota).not.toBe(first.quota);
  expect(second.quota).toBe(second.id);
});
it("replaces cookies with an altered signature or appended fields", async () => {
  await actor();
  const valid = m.token!;
  for (const token of [
    valid + ".extra",
    valid.slice(0, -1) + (valid.endsWith("0") ? "1" : "0"),
  ]) {
    m.token = token;
    await actor();
    expect(m.token).not.toBe(token);
  }
  expect(m.set).toHaveBeenCalledTimes(3);
});
it("uses account identity for signed-in quotas instead of the visitor cookie", async () => {
  await actor();
  m.user = { id: "account-a" };
  expect(await actor()).toEqual({
    id: "user:account-a",
    userId: "account-a",
    quota: "user:account-a",
  });
  expect(m.set).toHaveBeenCalledTimes(1);
});
