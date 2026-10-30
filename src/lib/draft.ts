"use client";
import { useState } from "react";
import { z } from "zod";
import { readLocal, removeLocal, writeLocal } from "./client";
import { useLocalSnapshot } from "./browser-storage";

// Draft schemas deliberately allow incomplete fields while bounding stored data.
export function useDraft<T>(key: string, schema: z.ZodType<T>, fallback: T) {
  const raw = useLocalSnapshot(key);
  const [edited, setEdited] = useState<T | null>(null);
  const [storageError, setStorageError] = useState(false);
  let restored: T | undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) restored = parsed.data;
  } catch {}
  const value = edited ?? restored ?? fallback;
  function change(next: T) {
    setEdited(next);
    setStorageError(!writeLocal(key, next));
  }
  function clear(submitted: T = value) {
    // Another tab may have written a newer draft while this request was running.
    if (JSON.stringify(readLocal(key, null)) === JSON.stringify(submitted))
      removeLocal(key);
    setEdited(null);
  }
  return {
    value,
    change,
    clear,
    notice: storageError
      ? "Browser storage is unavailable. Copy your edits before leaving this tab."
      : edited === null && restored !== undefined
        ? "Unsaved edits restored from this device. Review them against the saved course before continuing."
        : "",
  };
}
