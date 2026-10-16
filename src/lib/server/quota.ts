import "server-only";
import { AppError } from "../domain";
import { admin, dbError } from "./db";

type Limits = {
  p_actor: string;
  p_actor_limit: number;
  p_app_limit: number;
  p_minute_limit: number;
  p_slot: string;
};
export function quotaMessage(
  actorDay: number,
  appDay: number,
  limits: Limits,
  retrySeconds: number,
) {
  if (actorDay >= limits.p_actor_limit)
    return "Your daily allowance is used up. It resets at 00:00 UTC. Saved work remains available.";
  if (appDay >= limits.p_app_limit)
    return "Teech’s shared daily allowance is used up. It resets at 00:00 UTC. Saved work remains available.";
  return `The rolling-minute limit was reached. Try again in ${Math.max(1, retrySeconds)} seconds. Saved work remains available.`;
}
// Quota admission stays atomic in Postgres. These reads only explain a denial;
// failure to read diagnostics must never admit a call or hide the original error.
export async function explainUsageError(
  error: { message: string } | null,
  limits: Limits,
) {
  if (!error) return;
  if (error.message.includes("ANONYMOUS_POOL_EXCEEDED"))
    throw new AppError(
      "Today's shared anonymous allowance is used up. Sign in to use your account allowance, or return after 00:00 UTC. Saved work remains available.",
      429,
    );
  if (!error.message.includes("QUOTA_EXCEEDED")) return dbError(error);
  try {
    const now = Date.now();
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    const start = limits.p_slot.startsWith("start:");
    const db = admin();
    const actorQuery = db
      .from("usage_events")
      .select("slot", { count: "exact", head: true })
      .eq("actor", limits.p_actor)
      .gte("created_at", day.toISOString());
    const appQuery = db
      .from("usage_events")
      .select("slot", { count: "exact", head: true })
      .gte("created_at", day.toISOString());
    const minuteQuery = db
      .from("usage_events")
      .select("created_at")
      .gt("created_at", new Date(now - 60000).toISOString())
      .order("created_at", { ascending: true })
      .limit(1);
    if (start) {
      appQuery.like("slot", "start:%");
      minuteQuery.like("slot", "start:%");
    } else {
      appQuery.not("slot", "like", "start:%");
      minuteQuery.not("slot", "like", "start:%").eq("actor", limits.p_actor);
    }
    const [actor, app, minute] = await Promise.all([
      actorQuery,
      appQuery,
      minuteQuery,
    ]);
    if (
      actor.error ||
      app.error ||
      minute.error ||
      actor.count === null ||
      app.count === null
    )
      throw new Error("Quota diagnostics unavailable");
    const retry = minute.data?.[0]
      ? Math.ceil(
          (new Date(minute.data[0].created_at).getTime() + 60000 - now) / 1000,
        )
      : 1;
    throw new AppError(
      quotaMessage(actor.count, app.count, limits, retry),
      429,
    );
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      "An allowance limit was reached. Daily limits reset at 00:00 UTC; rolling-minute limits expire within a minute. Saved work remains available.",
      429,
    );
  }
}
