import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "../domain";
import { admin } from "./db";

const admission = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
});
export const searchUsage = z.object({
  sku: z.literal("search.pro"),
  amount: z.literal(1),
  credits: z.number().finite().min(0).max(1),
  paid: z.literal(false),
});
const unavailable = () =>
  new AppError(
    "Supporting material is temporarily unavailable. Saved lessons remain available; try again later.",
    503,
  );

export async function reserveSearch() {
  const id = randomUUID();
  const { data, error } = await admin().rpc("reserve_keenable_search", {
    p_request_id: id,
  });
  const result = admission.safeParse(data);
  if (error || !result.success) throw unavailable();
  if (!result.data.allowed) {
    if (["allowance", "exhausted"].includes(result.data.reason || ""))
      throw new AppError(
        "The shared supporting-material allowance is temporarily used up. Saved lessons remain available; try again later.",
        429,
      );
    if (result.data.reason === "rate")
      throw new AppError(
        "Supporting-material requests are busy. Wait a moment and try again. Saved work remains available.",
        429,
      );
    throw unavailable();
  }
  return id;
}

export async function recordSearch(
  id: string,
  outcome: "free" | "failed" | "exhausted" | "rate_limited" | "billing",
  credits: number | null = null,
  retrySeconds = 60,
) {
  const { error } = await admin().rpc("record_keenable_search", {
    p_request_id: id,
    p_outcome: outcome,
    p_credits: credits,
    p_retry_seconds: retrySeconds,
  });
  if (error) throw unavailable();
}

export function searchRetrySeconds(value: string | null, now = Date.now()) {
  if (!value) return 60;
  const seconds = /^\d+(?:\.\d+)?$/.test(value)
    ? Number(value)
    : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds)
    ? Math.min(86400, Math.max(1, Math.ceil(seconds)))
    : 60;
}
