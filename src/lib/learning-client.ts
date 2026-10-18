import { allUnits, type LearningSession } from "./learning";
import { readLocal, removeLocal, writeLocal } from "./client";
export class LearningReadError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function clearLearningDrafts(userId: string, id: string) {
  try {
    const prefix = `teech:${userId}:`;
    for (const key of Object.keys(localStorage)) {
      if (
        key.startsWith(`${prefix}learn:${id}:`) ||
        (key.startsWith(`${prefix}learning-setup`) &&
          key.endsWith(":lesson") &&
          readLocal(key, null) === id)
      )
        removeLocal(key);
    }
  } catch {
    // Storage may be disabled. Saved server state is still authoritative.
  }
}
export type LessonListItem = {
  id: string;
  title: string;
  phase: LearningSession["phase"];
  completed: number;
  units: number;
  version: number;
  createdAt: string;
  provenance: string;
};
export type LearningResponse = {
  error?: string;
  learning?: LearningSession;
  lessons?: LessonListItem[];
  nextCursor?: string | null;
  deleted?: boolean;
};
const pending = new Map<string, string>();
export function actionRecovered(
  before: LearningSession,
  after: LearningSession,
  action: string,
  values: Record<string, unknown>,
) {
  if (after.id !== before.id || after.version <= before.version) return false;
  const previousUnit =
    before.active === 3 ? before.targeted : before.units[before.active];
  const previousItem = previousUnit?.attempts.find(
    (a) => a.itemId === values.itemId,
  );
  const item = allUnits(after)
    .flatMap((u) => u.attempts)
    .find((a) => a.itemId === values.itemId);
  switch (action) {
    case "submit":
      return (
        !!item &&
        item.state === "finished" &&
        (values.unsure
          ? item.unsure
          : item.answer === values.answer && !!item.feedback)
      );
    case "retry_grade":
      return !!item?.feedback && item.state === "finished";
    case "hint":
      return !!item && item.hints.length > (previousItem?.hints.length || 0);
    case "solution":
      return !!item?.solution;
    case "dispute":
      return item?.dispute === values.reason;
    case "plan":
      return (
        !!(after.plan || after.issue) &&
        after.events.at(-1)?.type === "plan" &&
        JSON.stringify(after.input) ===
          JSON.stringify(values.input || before.input)
      );
    case "accept":
      return after.accepted;
    case "generate":
      return after.units.length > before.units.length;
    case "help":
      return allUnits(after).some(
        (u) =>
          u.content.id === previousUnit?.content.id &&
          u.clarifications.length >
            (previousUnit?.clarifications.length || 0) &&
          u.clarifications.at(-1)?.question === values.question,
      );
    case "targeted":
      return !!after.targeted && after.targetedObjective === values.objectiveId;
    case "practice":
      return after.phase === "practice";
    case "next":
      return (
        after.phase !== "practice" &&
        !!previousUnit &&
        (before.active === 3 ||
          after.completed.includes(previousUnit.content.id))
      );
    case "summary":
      return after.phase === "summary";
    case "resume":
      return after.phase === "learning";
    case "revisit":
      return (
        after.phase === "learning" &&
        (after.active === 3 ? after.targeted : after.units[after.active])
          ?.content.id === values.unitId
      );
    case "handoff_prepare":
      return !!after.handoff;
    case "handoff_extract":
      return !!after.handoff?.concepts;
    case "handoff":
      return !!after.handoff?.done && !!after.teachingId;
    default:
      return false;
  }
}
export async function learningApi(
  userId: string,
  body: Record<string, unknown>,
) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(body)),
  );
  const fingerprint = Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const cacheKey = `teech:${userId}:learn:${typeof body.id === "string" ? body.id : "setup"}:request:${fingerprint}`;
  const key =
    pending.get(cacheKey) ||
    readLocal<string | null>(cacheKey, null) ||
    crypto.randomUUID();
  pending.set(cacheKey, key);
  writeLocal(cacheKey, key);
  let response: Response;
  let data: LearningResponse;
  try {
    response = await fetch("/api/learn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, key }),
    });
    data = await response.json();
  } catch {
    throw new Error(
      "Connection interrupted. Reload saved work or retry the same action to recover its result.",
    );
  }
  if (response.status !== 409) {
    pending.delete(cacheKey);
    try {
      localStorage.removeItem(cacheKey);
    } catch {}
  }
  return data;
}
export async function fetchLearning(
  id?: string,
  before?: string,
): Promise<LearningResponse> {
  const params = new URLSearchParams({
    ...(id ? { id } : {}),
    ...(before ? { before } : {}),
  });
  const response = await fetch(`/api/learn?${params}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || data.error)
    throw new LearningReadError(
      data.error || "Could not load saved lessons.",
      response.status,
    );
  return data;
}
