import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// Never run these destructive setup/cleanup operations against a hosted or
// ordinary development database. A fresh child database is owned by this run.
const input = process.env.TEST_DATABASE_URL;
if (!input)
  throw new Error(
    "Set TEST_DATABASE_URL to a local teech_test database, then run npm run test:postgres.",
  );
const target = new URL(input);
if (
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  target.search !== "" ||
  target.hash !== "" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  !/^\/teech_test(?:_[a-z0-9_]+)?$/.test(target.pathname)
)
  throw new Error(
    "Concurrency tests require a plain PostgreSQL URL with a loopback host and a teech_test database name; query overrides are not allowed.",
  );
const name = `teech_test_${randomUUID().replaceAll("-", "")}`;
const admin = new Client({ connectionString: target.href });
const child = new URL(target);
child.pathname = `/${name}`;
let pool: Pool;
let created = false;
const user = "11111111-1111-4111-8111-111111111111";

beforeAll(async () => {
  await admin.connect();
  await admin.query(`create database "${name}"`);
  created = true;
  pool = new Pool({
    connectionString: child.href,
    max: 28,
    connectionTimeoutMillis: 10000,
    statement_timeout: 20000,
  });
  await pool.query(
    "do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$",
  );
  await pool.query(
    "create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;",
  );
  await pool.query("insert into auth.users values($1)", [user]);
  for (const migration of [
    "001_teech",
    "002_anonymous_daily_pool",
    "003_personal_minute_limit",
    "004_teacher_mode",
    "005_student_checkpoints",
  ])
    await pool.query(
      await readFile(`supabase/migrations/${migration}.sql`, "utf8"),
    );
});
afterAll(async () => {
  await pool?.end();
  if (created) await admin.query(`drop database "${name}"`);
  await admin.end();
});
beforeEach(async () => {
  await pool.query(
    "truncate learning_assessments,learning_sessions,topics,checklists,sessions,operations,usage_events cascade",
  );
});

type Request = { text: string; values: unknown[] };
async function race(gateSql: string, requests: Request[]) {
  const gate = await pool.connect();
  await gate.query("begin");
  await gate.query(gateSql);
  const clients = await Promise.all(requests.map(() => pool.connect()));
  const pids = await Promise.all(
    clients.map(
      async (client) =>
        (await client.query<{ pid: number }>("select pg_backend_pid() as pid"))
          .rows[0].pid,
    ),
  );
  expect(new Set(pids).size).toBe(requests.length);
  const completions = Promise.all(
    clients.map(async (client, i) => {
      try {
        return { ok: true as const, result: await client.query(requests[i]) };
      } catch (error) {
        return { ok: false as const, message: (error as Error).message };
      } finally {
        client.release();
      }
    }),
  );
  try {
    // Hold the production lock until at least two independent sessions are
    // actually blocked on it. Promise.all on a single connection cannot do this.
    await expect
      .poll(
        async () =>
          (
            await gate.query<{ n: number }>(
              "select count(*)::int as n from pg_stat_activity where pid=any($1::int[]) and wait_event_type='Lock'",
              [pids],
            )
          ).rows[0].n,
        { timeout: 10000 },
      )
      .toBeGreaterThanOrEqual(2);
  } finally {
    await gate.query("rollback");
    gate.release();
    await completions;
  }
  return completions;
}
function admitted(results: Awaited<ReturnType<typeof race>>) {
  return results.filter((result) => result.ok);
}
function rejected(results: Awaited<ReturnType<typeof race>>) {
  return results.filter((result) => !result.ok).map((result) => result.message);
}
const usageGate =
  "select pg_advisory_xact_lock(hashtextextended('teech-usage',0))";

describe("quota contention across independent PostgreSQL connections", () => {
  it("admits only the shared application cap under a simultaneous burst", async () => {
    const results = await race(
      usageGate,
      Array.from({ length: 12 }, (_, i) => ({
        text: "select reserve_usage($1,$2,100,5,100)",
        values: [`user:${i}`, `burst:${i}`],
      })),
    );
    expect(admitted(results)).toHaveLength(5);
    expect(rejected(results)).toHaveLength(7);
    for (const message of rejected(results)) expect(message).toContain("QUOTA");
    expect(
      (await pool.query("select count(*)::int as n from usage_events")).rows[0]
        .n,
    ).toBe(5);
  });
  it("keeps each actor's minute allowance independent during contention", async () => {
    const actors = ["user:one", "user:two", "anon:one"];
    const results = await race(
      usageGate,
      actors.flatMap((actor) =>
        Array.from({ length: 6 }, (_, i) => ({
          text: "select reserve_usage($1,$2,100,100,3)",
          values: [actor, `${actor}:${i}`],
        })),
      ),
    );
    expect(admitted(results)).toHaveLength(9);
    const rows = await pool.query(
      "select actor,count(*)::int as n from usage_events group by actor order by actor",
    );
    expect(rows.rows).toEqual(
      [...actors].sort().map((actor) => ({ actor, n: 3 })),
    );
    for (const message of rejected(results)) expect(message).toContain("QUOTA");
  });
  it("atomically enforces the course limit while reserving the shared usage ledger", async () => {
    const session = randomUUID(),
      key = randomUUID(),
      actor = `user:${user}`;
    await pool.query(
      "insert into learning_sessions(id,user_id,state) values($1,$2,$3)",
      [session, user, JSON.stringify({ id: session, schemaVersion: 1 })],
    );
    await pool.query("select begin_operation($1,$2,$3,'concurrency')", [
      actor,
      key,
      `learn:${session}`,
    ]);
    const results = await race(
      `select id from learning_sessions where id='${session}' for update`,
      Array.from({ length: 25 }, (_, i) => ({
        text: "select reserve_teacher_usage($1,$2,$3,$4,1000,1000,1000)",
        values: [session, key, actor, `teacher:${i}`],
      })),
    );
    expect(admitted(results)).toHaveLength(22);
    expect(rejected(results)).toHaveLength(3);
    for (const message of rejected(results))
      expect(message).toContain("TEACHER_BUDGET_EXCEEDED");
    expect(
      (
        await pool.query(
          "select provider_attempts from learning_sessions where id=$1",
          [session],
        )
      ).rows[0].provider_attempts,
    ).toBe(22);
    expect(
      (await pool.query("select count(*)::int as n from usage_events")).rows[0]
        .n,
    ).toBe(22);
  });
});
