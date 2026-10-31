import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { searchRetrySeconds } from "../src/lib/server/search-budget";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261031111719_keenable_free_limits.sql",
      "utf8",
    ),
  );
});
beforeEach(async () => {
  await db.exec(
    "reset role; truncate keenable_usage; update keenable_guard set blocked_until='-infinity',reason='rate'; set role service_role;",
  );
});
afterAll(async () => {
  await db.close();
});
const reserve = async (id = randomUUID()) =>
  (
    await db.query<{ result: { allowed: boolean; reason?: string } }>(
      "select public.reserve_keenable_search($1) as result",
      [id],
    )
  ).rows[0].result;
const record = (id: string, outcome: string, retry = 60) =>
  db.query("select public.record_keenable_search($1,$2,null,$3)", [
    id,
    outcome,
    retry,
  ]);

describe("Keenable free allowance in actual PostgreSQL", () => {
  it("shares a rolling second across all reservations and never replays an ID", async () => {
    const id = randomUUID();
    expect((await reserve(id)).allowed).toBe(true);
    expect(await reserve(id)).toEqual({ allowed: false, reason: "duplicate" });
    const results = await Promise.all(
      Array.from({ length: 15 }, () => reserve()),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(9);
    expect(await reserve()).toEqual({ allowed: false, reason: "rate" });
    await db.exec(
      "update public.keenable_usage set created_at=clock_timestamp()-interval '2 seconds'",
    );
    expect((await reserve()).allowed).toBe(true);
  });
  it("caps 100,000 attempts over 31 days across a calendar-month boundary, including failures", async () => {
    await db.exec(`insert into public.keenable_usage(id,created_at,outcome)
      select md5(n::text)::uuid,
        (date_trunc('month',clock_timestamp() at time zone 'UTC') at time zone 'UTC')-interval '1 second','failed'
      from generate_series(1,99999) n;`);
    expect((await reserve()).allowed).toBe(true);
    expect(await reserve()).toEqual({ allowed: false, reason: "allowance" });
    // Older than 31 days expires even when retained for diagnostics.
    await db.exec(
      "update public.keenable_usage set created_at=clock_timestamp()-interval '31 days 1 hour'",
    );
    expect((await reserve()).allowed).toBe(true);
  });
  it("persists provider exhaustion and Retry-After across independent calls", async () => {
    let id = randomUUID();
    await reserve(id);
    await record(id, "exhausted");
    expect(await reserve()).toEqual({ allowed: false, reason: "exhausted" });
    await db.exec(
      "update public.keenable_guard set blocked_until=clock_timestamp()-interval '1 second'",
    );
    id = randomUUID();
    await reserve(id);
    await record(id, "rate_limited", 125);
    expect(await reserve()).toEqual({ allowed: false, reason: "rate" });
    const remaining = (
      await db.query<{ remaining: number }>(
        "select extract(epoch from blocked_until-clock_timestamp())::int as remaining from public.keenable_guard",
      )
    ).rows[0].remaining;
    expect(remaining).toBeGreaterThan(120);
    expect(remaining).toBeLessThanOrEqual(125);
  });
  it("keeps an unexpected billing pause despite later free or rate-limited completions", async () => {
    const first = randomUUID(),
      second = randomUUID();
    await reserve(first);
    await reserve(second);
    await record(first, "billing");
    await record(second, "rate_limited", 1);
    expect(await reserve()).toEqual({ allowed: false, reason: "billing" });
    await expect(record(first, "free")).rejects.toThrow(
      "SEARCH_RESERVATION_MISSING",
    );
  });
  it("does not refund failed or unfinished attempts, and cleans only expired history", async () => {
    const first = randomUUID();
    await reserve(first);
    await record(first, "failed");
    await reserve();
    await db.exec(
      "insert into public.keenable_usage(id,created_at) values(gen_random_uuid(),clock_timestamp()-interval '33 days')",
    );
    await reserve();
    const count = (
      await db.query<{ count: number }>(
        "select count(*)::int as count from public.keenable_usage",
      )
    ).rows[0].count;
    expect(count).toBe(3);
  });
  it.each(["anon", "authenticated"])(
    "prevents %s from reading, reserving, or changing quotas",
    async (role) => {
      await db.exec(`set role ${role}`);
      await expect(
        db.query("select * from public.keenable_usage"),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query("update public.keenable_guard set blocked_until='-infinity'"),
      ).rejects.toThrow(/permission denied/);
      await expect(reserve()).rejects.toThrow(/permission denied/);
      await expect(record(randomUUID(), "free")).rejects.toThrow(
        /permission denied/,
      );
    },
  );
});

it("interprets Retry-After seconds and HTTP dates with bounded safe fallbacks", () => {
  expect(searchRetrySeconds("125")).toBe(125);
  expect(
    searchRetrySeconds(
      "Sat, 31 Oct 2026 12:01:00 GMT",
      Date.parse("2026-10-31T12:00:00Z"),
    ),
  ).toBe(60);
  expect(searchRetrySeconds("nonsense")).toBe(60);
  expect(searchRetrySeconds(null)).toBe(60);
  expect(searchRetrySeconds("999999999")).toBe(86400);
});
