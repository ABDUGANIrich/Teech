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
    <section className="learning-shelf">
      <h2>Learn with a teacher · your sessions</h2>
      {error && (
        <p className="notice">
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
        <article className="topic-row" key={s.id}>
          <div className="topic-info">
            <p className="eyebrow">TEACHER</p>
            <h3>{s.title}</h3>
            <p>
              {phases[s.phase]} · {s.completed}/{s.units} units completed
            </p>
            <p className="micro">{s.provenance}</p>
          </div>
          <Link className="text-link" href={`/learn/${s.id}`}>
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
