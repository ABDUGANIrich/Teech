"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchLearning, type LessonListItem } from "@/lib/learning-client";
import { Button } from "./ui/button";
export function LearningShelf() {
  const [lessons, setLessons] = useState<LessonListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetchLearning()
      .then((d) => {
        if (active) {
          setLessons(d.lessons || []);
          setCursor(d.nextCursor || null);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const d = await fetchLearning(undefined, cursor || undefined);
      setLessons((current) => [
        ...current,
        ...(d.lessons || []).filter(
          (s) => !current.some((old) => old.id === s.id),
        ),
      ]);
      setCursor(d.nextCursor || null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load learning sessions.",
      );
    } finally {
      setBusy(false);
    }
  }
  const phases = {
    setup: "Ready to plan",
    plan: "Plan ready to confirm",
    learning: "Learning",
    practice: "Practicing",
    summary: "Session review",
  };
  return (
    <section className="learning-shelf mx-0 my-9">
      <h2>Learn with a teacher · your sessions</h2>
      {error && (
        <p className="notice rounded-md bg-olive-100 text-olive-600 text-[0.75rem] px-4 py-3 dark:bg-olive-800 dark:text-olive-400">
          Learning sessions could not load.{" "}
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Retry loading lessons
          </Button>
        </p>
      )}
      {busy && <p role="status">Opening learning sessions…</p>}
      {!lessons.length && !busy && !error && (
        <p>No learning sessions yet. Start with a topic; notes are optional.</p>
      )}
      {lessons.map((s) => (
        <article
          className="topic-row flex items-start gap-6 border-t-[0.0625rem] border-solid border-t-olive-300 px-0 py-6.5 dark:border-t-olive-700 max-mobile:gap-3.5 max-mobile:flex-wrap"
          key={s.id}
        >
          <div className="topic-info flex-[1] min-w-0 [&_h2]:mt-[0.1875rem] [&_h2]:mb-2.5 [&_h2]:wrap-anywhere [&_h2]:mx-0 [&_p]:text-[0.6875rem] [&_p]:mb-[0.1875rem] max-mobile:[&_h2]:text-[1.375rem]">
            <p className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
              TEACHER
            </p>
            <h3>{s.title}</h3>
            <p>
              {phases[s.phase]} · {s.completed}/{s.units} units completed
            </p>
            <p className="micro text-[0.6875rem] leading-[1.7] text-olive-500 dark:text-olive-400">
              {s.provenance}
            </p>
          </div>
          <Link
            className="text-link text-[0.75rem] inline-flex gap-2 items-center hover:underline"
            href={`/learn/${s.id}`}
          >
            Resume lesson →
          </Link>
        </article>
      ))}
      {cursor && (
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          Load older learning sessions
        </Button>
      )}
    </section>
  );
}
