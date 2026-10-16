import type { Session, Topic, Concept, AttemptListItem } from "./domain";
export type ApiResult = {
  error?: string;
  session?: Session;
  topic?: Topic;
  concepts?: Concept[];
  topics?: Topic[];
  sessions?: Session[];
  attempts?: AttemptListItem[];
  nextCursor?: string | null;
  conflict?: boolean;
};
export async function olderAttempts(
  before: string,
  compact = false,
): Promise<ApiResult> {
  const response = await fetch(
    `/api/teech?${new URLSearchParams({ history: "1", before, ...(compact ? { summary: "1" } : {}) })}`,
    { cache: "no-store" },
  );
  const data: ApiResult = await response.json();
  if (!response.ok || data.error)
    throw new Error(
      data.error || "Could not load older attempts. Please try again.",
    );
  return data;
}
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event("teech-storage"));
    return true;
  } catch {
    return false;
  }
}
export function removeLocal(key: string) {
  try {
    localStorage.removeItem(key);
    window.dispatchEvent(new Event("teech-storage"));
  } catch {}
}
const pendingKeys = new Map<string, string>();
export async function api(body: Record<string, unknown>): Promise<ApiResult> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(body)),
  );
  const fingerprint = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const cacheKey = "teech:request:" + fingerprint;
  let key =
    pendingKeys.get(cacheKey) || readLocal<string | null>(cacheKey, null);
  if (!key) {
    key = crypto.randomUUID();
    writeLocal(cacheKey, key);
  }
  pendingKeys.set(cacheKey, key);
  let response: Response;
  let data: ApiResult;
  try {
    response = await fetch("/api/teech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, key }),
    });
    data = await response.json();
  } catch {
    throw new Error(
      "Connection interrupted. Your draft is safe. Try the same action again.",
    );
  }
  // Preserve the key after ambiguous network failures; clear only after a definite response.
  if (response.status !== 409) {
    pendingKeys.delete(cacheKey);
    try {
      localStorage.removeItem(cacheKey);
    } catch {}
  }
  return data;
}
