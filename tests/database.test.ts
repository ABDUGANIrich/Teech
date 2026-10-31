import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
let db: PGlite;
const uid = "11111111-1111-4111-8111-111111111111";
const uid2 = "22222222-2222-4222-8222-222222222222";
beforeEach(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid'; grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${uid}'),('${uid2}');`,
  );
  await db.exec(readFileSync("supabase/migrations/001_teech.sql", "utf8"));
  await db.exec(
    readFileSync("supabase/migrations/002_anonymous_daily_pool.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/003_personal_minute_limit.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/005_student_checkpoints.sql", "utf8"),
  );
});
afterEach(async () => {
  await db.close();
});
const reserve = (actor: string, slot: string, per = 3, app = 5, minute = 5) =>
  db.query("select reserve_usage($1,$2,$3,$4,$5)", [
    actor,
    slot,
    per,
    app,
    minute,
  ]);
describe("real SQL quotas and deduplication (embedded PostgreSQL)", () => {
  it("shares 100 anonymous calls across visitor resets without consuming signed-in allowances", async () => {
    await reserve("user:existing", "signed-in", 100, 900, 1000);
    await reserve("start:anon:existing", "start:anonymous", 25, 5000, 1000);
    await reserve("ip:legacy", "legacy-anonymous", 10, 900, 1000);
    const attempts = await Promise.allSettled(
      Array.from({ length: 110 }, (_, i) =>
        reserve(`anon:visitor-${i}`, `anonymous:${i}`, 10, 900, 1000),
      ),
    );
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(99);
    await expect(
      reserve("anon:cleared-cookies", "fresh-cookie", 10, 900, 1000),
    ).rejects.toThrow(/ANONYMOUS_POOL_EXCEEDED/);
    await reserve("user:existing", "signed-in-after-pool", 100, 900, 1000);
    await reserve("start:anon:new", "start:after-pool", 25, 5000, 1000);
    await db.exec(
      "update usage_events set created_at = date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' - interval '1 second'",
    );
    await reserve("anon:cleared-cookies", "next-day", 10, 900, 1000);
  });
  it("enforces the app cap across serialized SQL reservations", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        reserve(`user:${i}`, `call:${i}`, 10, 5, 10),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from usage_events",
        )
      ).rows[0].count,
    ).toBe(5);
  });
  it("enforces actor limits, sliding minute caps, and repair accounting", async () => {
    await reserve("a", "call:0");
    await reserve("a", "call:repair");
    await reserve("a", "call:2");
    await expect(reserve("a", "call:3")).rejects.toThrow(/QUOTA/);
    await expect(reserve("a", "call:4", 10, 10, 3)).rejects.toThrow(/QUOTA/);
    await reserve("b", "call:5", 10, 10, 3);
  });
  it("isolates personal minute quotas and expires the rolling window", async () => {
    for (const actor of ["user:one", "user:two", "anon:one"]) {
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) =>
          reserve(actor, `${actor}:${i}`, 100, 900, 10),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    }
    await db.exec(
      "update usage_events set created_at=now()-interval '61 seconds'",
    );
    await reserve("user:one", "after-minute", 100, 900, 10);
    await reserve("start:user:one", "start:1", 25, 5000, 1);
    await expect(
      reserve("start:user:two", "start:2", 25, 5000, 1),
    ).rejects.toThrow(/QUOTA/);
  });
  it("rejects duplicate provider slots and keeps start reservations out of AI budget", async () => {
    await reserve("a", "same");
    await expect(reserve("a", "same")).rejects.toThrow(/ALREADY/);
    await reserve("start:a", "start:one", 10, 20, 20);
    await reserve("b", "other", 10, 2, 2);
    await expect(reserve("b", "third", 10, 2, 2)).rejects.toThrow(/QUOTA/);
  });
  it("returns committed cached output and forbids key reuse with changed content", async () => {
    const key = randomUUID();
    await db.query("select begin_operation($1,$2,'session:x','hash')", [
      "a",
      key,
    ]);
    await expect(
      db.query("select begin_operation('b',$1,'session:x','different')", [
        randomUUID(),
      ]),
    ).rejects.toThrow(/BUSY/);
    await db.query("select commit_operation($1,$2,$3,null)", [
      "a",
      key,
      JSON.stringify({ ok: true }),
    ]);
    const cached = await db.query<{
      value: { cached: boolean; result: { ok: boolean } };
    }>("select begin_operation($1,$2,'session:x','hash') as value", ["a", key]);
    expect(cached.rows[0].value).toEqual({
      cached: true,
      result: { ok: true },
    });
    await expect(
      db.query("select begin_operation($1,$2,'session:x','changed')", [
        "a",
        key,
      ]),
    ).rejects.toThrow(/CONFLICT/);
  });
  it("a crashed operation becomes a terminal error instead of reissuing AI", async () => {
    const key = randomUUID();
    await db.query("select begin_operation('a',$1,'session:x','hash')", [key]);
    await db.exec(
      "update operations set created_at=now()-interval '5 minutes'",
    );
    const x = await db.query<{
      value: { cached: boolean; result: { error: string } };
    }>("select begin_operation('a',$1,'session:x','hash') as value", [key]);
    expect(x.rows[0].value.cached).toBe(true);
    expect(x.rows[0].value.result.error).toMatch(/interrupted/);
  });
});
describe("database access boundaries", () => {
  it("retains checkpointed writing after a crashed operation and restricts checkpoint ownership and source", async () => {
    const id = randomUUID();
    const key = randomUUID();
    const owner = `user:${uid}`;
    const original = {
      id,
      owner,
      topic_id: null,
      notes: "Immutable source",
      messages: [],
      phase: "explain",
      question_calls: 0,
    };
    await db.query("insert into sessions(id,owner,data) values($1,$2,$3)", [
      id,
      owner,
      JSON.stringify(original),
    ]);
    await db.query("select begin_operation($1,$2,$3,'checkpoint')", [
      owner,
      key,
      `session:${id}`,
    ]);
    const saved = {
      ...original,
      phase: "questions",
      question_calls: 1,
      messages: [{ role: "user", text: "Saved before inference" }],
    };
    await db.query("select checkpoint_session_operation($1,$2,$3)", [
      owner,
      key,
      JSON.stringify(saved),
    ]);
    await expect(
      db.query("select checkpoint_session_operation($1,$2,$3)", [
        owner,
        key,
        JSON.stringify({ ...saved, notes: "Changed source" }),
      ]),
    ).rejects.toThrow(/INVALID_CHECKPOINT/);
    await expect(
      db.query("select checkpoint_session_operation($1,$2,$3)", [
        owner,
        key,
        JSON.stringify({ ...saved, owner: `user:${uid2}` }),
      ]),
    ).rejects.toThrow(/FORBIDDEN/);
    await db.exec(
      "update operations set created_at=now()-interval '5 minutes'",
    );
    await db.query("select begin_operation($1,$2,$3,'checkpoint')", [
      owner,
      key,
      `session:${id}`,
    ]);
    expect(
      (
        await db.query<{ data: unknown }>(
          "select data from sessions where id=$1",
          [id],
        )
      ).rows[0].data,
    ).toEqual(saved);
    await expect(
      db.query("select checkpoint_session_operation($1,$2,$3)", [
        owner,
        key,
        JSON.stringify(saved),
      ]),
    ).rejects.toThrow(/REQUEST_NOT_ACTIVE/);
    await db.exec("set role authenticated");
    await expect(
      db.query("select checkpoint_session_operation($1,$2,$3)", [
        owner,
        key,
        JSON.stringify(saved),
      ]),
    ).rejects.toThrow(/permission/);
  });
  it("RLS isolates topics, checklists, and sessions; browser writes and RPCs are forbidden", async () => {
    const topic = randomUUID();
    await db.query(
      "insert into topics(id,user_id,title,notes) values($1,$2,'Water',$3)",
      [topic, uid, "x".repeat(80)],
    );
    await db.query("insert into checklists values($1,1,'[{},{},{},{}]')", [
      topic,
    ]);
    await db.query(
      "insert into sessions(id,owner,topic_id,data) values($1,$2,$3,'{}')",
      [randomUUID(), `user:${uid}`, topic],
    );
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${uid2}';`,
    );
    for (const table of ["topics", "checklists", "sessions"])
      expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
    await expect(db.query("select * from usage_events")).rejects.toThrow(
      /permission/,
    );
    await expect(
      db.query("select reserve_usage('x','x',10,10,10)"),
    ).rejects.toThrow(/permission/);
    await expect(db.query("delete from topics")).rejects.toThrow(/permission/);
    await db.exec(`set request.jwt.claim.sub='${uid}';`);
    for (const table of ["topics", "checklists", "sessions"])
      expect((await db.query(`select * from ${table}`)).rows).toHaveLength(1);
    await db.exec("reset role;set role anon;");
    await expect(db.query("select * from topics")).rejects.toThrow(
      /permission/,
    );
  });
  it("mutation commit checks session ownership and rolls back both state and response", async () => {
    const key = randomUUID();
    await db.query("select begin_operation($1,$2,'session:x','hash')", [
      `user:${uid}`,
      key,
    ]);
    await expect(
      db.query("select commit_operation($1,$2,'{}',$3)", [
        `user:${uid}`,
        key,
        JSON.stringify({
          session: { id: key, owner: `user:${uid2}`, topic_id: null },
        }),
      ]),
    ).rejects.toThrow(/FORBIDDEN/);
    expect((await db.query("select * from sessions")).rows).toHaveLength(0);
    expect(
      (await db.query<{ state: string }>("select state from operations"))
        .rows[0].state,
    ).toBe("processing");
  });
});
