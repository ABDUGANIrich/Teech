// Explicit live smoke: two temporary confirmed accounts, bounded real AI calls,
// no email delivery. Deletes its own accounts/data/caches; keeps usage counted.
// TEECH_VERIFY_URL must point at the app being verified. Load .env.local privately.
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:net";

const origin =
  process.env.TEECH_VERIFY_URL ||
  process.argv.find((arg) => /^https?:\/\//.test(arg));
if (!origin) throw new Error("Set TEECH_VERIFY_URL explicitly.");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const users = [];
const report = {
  date: "2026-10-17",
  origin,
  checks: {},
  providerCalls: 0,
  cleanup: false,
};
await mkdir("artifacts", { recursive: true });
function client() {
  const cookies = new Map();
  return async function request(path, body, allowError = false) {
    const response = await fetch(origin + path, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(150000),
      headers: {
        ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
        Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const index = pair.indexOf("=");
      if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const isJson = response.headers
      .get("content-type")
      ?.includes("application/json");
    const data = isJson ? await response.json() : null;
    if (!allowError && (!response.ok || data?.error))
      throw new Error(
        `${body?.action || body?.mode || path}: ${data?.error || response.status}`,
      );
    return { response, data };
  };
}
let stage = "accounts";
let server;
try {
  if (process.argv.includes("--local")) {
    const address = new URL(origin);
    assert.equal(address.hostname, "127.0.0.1");
    // Never silently test a stale process that already occupies this port.
    await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once("error", reject);
      probe.listen(Number(address.port), "127.0.0.1", () =>
        probe.close(resolve),
      );
    });
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        address.port,
      ],
      { env: { ...process.env, APP_URL: origin }, stdio: "ignore" },
    );
    let ready = false;
    for (let attempt = 0; attempt < 50 && !ready; attempt++) {
      try {
        ready = (await fetch(origin + "/teacher-sample")).ok;
      } catch {}
      if (!ready) await delay(200);
    }
    assert(ready, "Local production server did not start");
  }
  for (let i = 0; i < 2; i++) {
    const credentials = {
      email: `teech-check-${randomUUID()}@example.com`,
      password: randomBytes(24).toString("base64url"),
    };
    const { data, error } = await admin.auth.admin.createUser({
      ...credentials,
      email_confirm: true,
    });
    assert.ifError(error);
    assert(data.user);
    users.push({
      id: data.user.id,
      credentials,
      request: client(),
      db: createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options),
    });
  }
  for (const u of users) {
    await u.request("/api/auth", { mode: "signin", ...u.credentials });
    const { error } = await u.db.auth.signInWithPassword(u.credentials);
    assert.ifError(error);
  }
  const owner = users[0],
    other = users[1];
  stage = "create-plan";
  let s = (
    await owner.request("/api/learn", {
      action: "create",
      key: randomUUID(),
      input: {
        topic: "Binary search",
        level: "new",
        goal: "One short introductory unit on sorted order, midpoint comparisons, interval updates and stopping conditions.",
        notes: "",
      },
    })
  ).data.learning;
  async function act(action, values = {}) {
    const d = (
      await owner.request("/api/learn", {
        action,
        id: s.id,
        version: s.version,
        key: randomUUID(),
        ...values,
      })
    ).data;
    if (action === "delete") {
      assert(d.deleted);
      return d;
    }
    s = d.learning;
    assert(s);
    return s;
  }
  await act("plan");
  assert(s.plan);
  assert.equal(s.policy, "general");
  await act("accept");
  report.checks.plannedUnits = s.plan.units.length;
  stage = "unit-and-assessment";
  await act("generate");
  assert(!JSON.stringify(s).includes('"correctChoiceId"'));
  assert(!JSON.stringify(s).includes('"expectedAnswer"'));
  const read = (await owner.request(`/api/learn?id=${s.id}`)).data.learning;
  assert.equal(read.providerAttempts, s.providerAttempts);
  report.checks.savedReopen = true;
  await act("practice");
  const [mcq, application] = s.units[0].content.questions;
  await act("submit", {
    itemId: mcq.id,
    answer: mcq.choices[0].id,
    unsure: false,
  });
  await act("submit", {
    itemId: application.id,
    answer:
      "I start with a sorted list and inclusive low and high bounds. I compare the target with the middle value. I discard the middle and the half that cannot contain the target, then repeat. If low exceeds high, the target is absent.",
    unsure: false,
  });
  assert(s.units[0].attempts[1].feedback);
  report.checks.applicationFeedback = s.units[0].attempts[1].feedback.status;
  stage = "isolation";
  const denied = await other.request(`/api/learn?id=${s.id}`, undefined, true);
  assert.equal(denied.response.status, 404);
  const mutate = await other.request(
    "/api/learn",
    { action: "summary", id: s.id, version: s.version, key: randomUUID() },
    true,
  );
  assert(mutate.data.error);
  const invisible = await other.db
    .from("learning_sessions")
    .select("id")
    .eq("id", s.id);
  assert.ifError(invisible.error);
  assert.equal(invisible.data.length, 0);
  for (const u of users) {
    const deniedKeys = await u.db
      .from("learning_assessments")
      .select("session_id")
      .limit(1);
    assert(deniedKeys.error);
    assert.equal(deniedKeys.error.code, "42501");
  }
  report.checks.twoAccountIsolation = true;
  report.checks.privateAssessmentsDenied = true;
  stage = "complete-and-handoff";
  await act("next");
  while (s.phase !== "summary") {
    await act("generate");
    await act("practice");
    await act("next");
  }
  const stale = await owner.request(
    "/api/learn",
    { action: "summary", id: s.id, version: 0, key: randomUUID() },
    true,
  );
  assert(stale.data.error);
  report.checks.staleLessonRejected = true;
  await act("handoff_prepare");
  await act("handoff_extract");
  assert(s.handoff.concepts.length >= 4);
  await act("handoff", { concepts: s.handoff.concepts });
  assert(s.teachingId);
  assert(s.topicId);
  const lessonId = s.id,
    topicId = s.topicId,
    teachingId = s.teachingId;
  report.checks.handoff = true;
  const reservations = await admin
    .from("usage_events")
    .select("slot", { count: "exact", head: true })
    .eq("actor", `user:${owner.id}`)
    .like("slot", `teacher:${s.id}:%`);
  assert.ifError(reservations.error);
  assert.equal(reservations.count, s.providerAttempts);
  const allCalls = await admin
    .from("usage_events")
    .select("slot", { count: "exact", head: true })
    .eq("actor", `user:${owner.id}`)
    .not("slot", "like", "start:%");
  assert.ifError(allCalls.error);
  report.providerCalls = allCalls.count;
  report.checks.teacherCounterMatchesReservations = true;
  stage = "topic-concurrency-and-compact-library";
  const topic = (await owner.request(`/api/teech?topic=${topicId}`)).data.topic;
  const save = {
    action: "save",
    id: topic.id,
    title: "Reviewed binary search source",
    notes: topic.notes,
    concepts: topic.concepts,
    expectedVersion: topic.version,
  };
  const saved = (
    await owner.request("/api/teech", { ...save, key: randomUUID() })
  ).data.topic;
  assert.equal(saved.version, topic.version + 1);
  const conflict = await owner.request(
    "/api/teech",
    { ...save, title: "Stale tab title", key: randomUUID() },
    true,
  );
  assert(conflict.data.conflict);
  assert.equal(conflict.data.topic.version, saved.version);
  const library = (await owner.request("/api/teech?summary=1")).data;
  assert(library.attempts.some((a) => a.id === teachingId));
  assert.equal(library.sessions.length, 0);
  assert(!JSON.stringify(library.attempts).includes('"notes"'));
  assert(!JSON.stringify(library.topics).includes('"notes"'));
  report.checks.staleTopicRejected = true;
  report.checks.compactLibrary = true;
  stage = "recovery-link-and-password";
  const recovery = await admin.auth.admin.generateLink({
    type: "recovery",
    email: owner.credentials.email,
  });
  assert.ifError(recovery.error);
  const callback = await owner.request(
    `/auth/confirm?token_hash=${encodeURIComponent(recovery.data.properties.hashed_token)}&type=recovery`,
    undefined,
    true,
  );
  assert.equal(callback.response.status, 307);
  assert.equal(
    new URL(callback.response.headers.get("location")).pathname,
    "/reset-password",
  );
  assert.equal((await owner.request("/reset-password")).response.status, 200);
  const changedPassword = randomBytes(24).toString("base64url");
  await owner.request("/api/auth", {
    mode: "update-password",
    password: changedPassword,
  });
  const checkPassword = await owner.db.auth.signInWithPassword({
    email: owner.credentials.email,
    password: changedPassword,
  });
  assert.ifError(checkPassword.error);
  report.checks.recoveryAndPasswordUpdate = true;
  stage = "deletion";
  await act("delete");
  const surviving = (await owner.request(`/api/teech?session=${teachingId}`))
    .data.session;
  assert.equal(surviving.provenance.lessonId, null);
  await owner.request("/api/teech", {
    action: "delete",
    id: topicId,
    key: randomUUID(),
  });
  const removed = await admin
    .from("learning_assessments")
    .select("unit_id")
    .eq("session_id", lessonId);
  assert.ifError(removed.error);
  assert.equal(removed.data.length, 0);
  report.checks.deletionAndProvenance = true;
  console.log("Live flow passed; cleaning temporary accounts.");
} catch (e) {
  report.failure = { stage, message: e.message };
  process.exitCode = 1;
} finally {
  const errors = [];
  for (const u of users) {
    const cache = await admin
      .from("operations")
      .delete()
      .eq("actor", `user:${u.id}`);
    if (cache.error) errors.push("cache cleanup failed");
    const deleted = await admin.auth.admin.deleteUser(u.id);
    if (deleted.error) errors.push("account cleanup failed");
  }
  report.cleanup = errors.length === 0;
  if (errors.length) {
    report.cleanupErrors = errors;
    process.exitCode = 1;
  }
  await writeFile(
    "artifacts/review-fixes-live.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  if (server) server.kill();
}
