import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  page: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  or: vi.fn(),
}));
vi.mock("../src/lib/server/db", () => ({
  actor: m.actor,
  dbError: (error: unknown) => {
    if (error) throw error;
  },
  admin: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: (field: string, value: unknown) => {
          m.eq(field, value);
          return chain;
        },
        order: (field: string, options: unknown) => {
          m.order(field, options);
          return chain;
        },
        or: (filter: string) => {
          m.or(filter);
          return chain;
        },
        limit: m.page,
      };
      return chain;
    },
  }),
}));
vi.mock("../src/lib/server/ai", () => ({}));
import { readData } from "../src/lib/server/service";

beforeEach(() => {
  vi.clearAllMocks();
  m.actor.mockResolvedValue({ id: "user:owner", userId: "owner" });
  m.page.mockResolvedValue({ data: [], error: null });
});

describe("attempt history pagination", () => {
  it("keeps every page scoped to the authenticated owner and preserves a precise cursor", async () => {
    const rows = Array.from({ length: 50 }, () => ({
      id: randomUUID(),
      created_at: "2026-10-16T12:34:56.123456+00:00",
      data: { title: "Saved attempt" },
    }));
    m.page.mockResolvedValueOnce({ data: rows, error: null });
    const first = await readData(undefined, undefined, true);
    expect("sessions" in first && first.sessions).toHaveLength(50);
    if (!("nextCursor" in first) || !first.nextCursor)
      throw new Error("Missing cursor");
    expect(JSON.parse(first.nextCursor)).toEqual({
      id: rows[49].id,
      created_at: rows[49].created_at,
    });
    const second = await readData(undefined, first.nextCursor, true);
    expect("nextCursor" in second && second.nextCursor).toBeNull();
    expect(m.actor.mock.calls).toEqual([[true], [true]]);
    expect(m.eq.mock.calls).toEqual([
      ["owner", "user:owner"],
      ["owner", "user:owner"],
    ]);
    expect(m.order.mock.calls.slice(0, 2)).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(m.or).toHaveBeenCalledWith(
      `created_at.lt.${rows[49].created_at},and(created_at.eq.${rows[49].created_at},id.lt.${rows[49].id})`,
    );
  });

  it("rejects malformed cursors before executing a history query", async () => {
    for (const cursor of [
      "not-json",
      JSON.stringify({
        created_at: "2026-10-16T00:00:00Z",
        id: "x),owner.eq.other",
      }),
      JSON.stringify({ created_at: "invalid", id: randomUUID() }),
    ]) {
      await expect(readData(undefined, cursor, true)).rejects.toThrow();
    }
    expect(m.page).not.toHaveBeenCalled();
    expect(m.or).not.toHaveBeenCalled();
  });

  it("does not expose history when authentication fails", async () => {
    m.actor.mockRejectedValueOnce(new Error("Sign in"));
    await expect(readData(undefined, undefined, true)).rejects.toThrow(
      "Sign in",
    );
    expect(m.page).not.toHaveBeenCalled();
  });
});
