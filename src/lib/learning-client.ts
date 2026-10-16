import type { LearningSession } from "./learning";
import { readLocal, writeLocal } from "./client";
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
    throw new Error(data.error || "Could not load saved lessons.");
  return data;
}
