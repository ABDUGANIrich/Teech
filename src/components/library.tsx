"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  LoaderCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Student } from "./student";
import { LearningShelf } from "./learning-shelf";
import { api, olderAttempts } from "@/lib/client";
import type { AttemptListItem, Topic } from "@/lib/domain";
export function Library() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sessions, setSessions] = useState<AttemptListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<Topic | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/teech?summary=1")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setError(d.error);
        else {
          setTopics(d.topics);
          setSessions(d.attempts || d.sessions || []);
          setNextCursor(d.nextCursor || null);
        }
      })
      .catch(() =>
        setError(
          "Could not load your library. Check your connection and reload.",
        ),
      )
      .finally(() => setLoading(false));
    return () => {
      active = false;
    };
  }, []);
  async function loadOlder() {
    if (!nextCursor || busy) return;
    setBusy(true);
    setError("");
    try {
      const d = await olderAttempts(nextCursor, true);
      setSessions((current) => [
        ...current,
        ...(d.attempts || d.sessions || []).filter(
          (s) => !current.some((old) => old.id === s.id),
        ),
      ]);
      setNextCursor(d.nextCursor || null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load older attempts.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function start(t: Topic) {
    setBusy(true);
    setError("");
    try {
      const d = await api({ action: "start", topicId: t.id });
      if (d.error) throw new Error(d.error);
      router.push(`/teach/${d.session!.id}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not start this attempt.",
      );
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      const d = await api({ action: "delete", id: deleting.id });
      if (d.error) throw new Error(d.error);
      try {
        const ids =
          d.deletedSessionIds ||
          sessions.filter((s) => s.topic_id === deleting.id).map((s) => s.id);
        for (const key of Object.keys(localStorage)) {
          if (
            key.startsWith("teech:") &&
            (key.endsWith(`:topic-draft:${deleting.id}`) ||
              ids.some((id) => key.includes(`:${id}:`)))
          )
            localStorage.removeItem(key);
        }
      } catch {
        /* Local storage can be disabled. */
      }
      setTopics(topics.filter((t) => t.id !== deleting.id));
      setSessions(sessions.filter((s) => s.topic_id !== deleting.id));
      setDeleting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this topic.");
    } finally {
      setBusy(false);
    }
  }
  async function signout() {
    setBusy(true);
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "signout" }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      try {
        for (const key of Object.keys(localStorage))
          if (key.startsWith("teech:")) localStorage.removeItem(key);
      } catch {
        /* Storage may be unavailable; auth is still signed out. */
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Could not sign out. Try again.");
      setBusy(false);
    }
  }
  return (
    <div className="page max-w-275 pt-11 pb-3 min-h-[65vh] mx-auto my-0 px-6 max-mobile:pt-6.25 max-mobile:pb-2.5 max-mobile:px-4.5">
      <div className="page-heading flex items-center justify-between gap-6 mt-5 mb-9 mx-0 [&_.eyebrow]:text-[0.5625rem] [&_.eyebrow]:mb-3.5 [&_h1]:mb-3.5 [&_p:last-child]:text-[0.8125rem] [&_p:last-child]:mb-0 max-mobile:mt-3.5 max-mobile:items-start max-mobile:flex-col max-mobile:gap-5.5 max-mobile:[&_h1]:text-[2.25rem] max-mobile:[&_.eyebrow]:text-[0.5rem] max-mobile:[&_.eyebrow]:tracking-[0.0625rem] max-mobile:[&_>_p]:text-[0.75rem]">
        <div>
          <p className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
            A PLACE FOR YOUR IDEAS
          </p>
          <h1>Your study shelf.</h1>
          <p>Learn something new, or explain what you know.</p>
        </div>
        <div className="learning-actions flex items-center gap-3.5 flex-wrap max-lesson:items-stretch max-lesson:[&_>_.button]:flex-[1_1_auto]">
          <Button asChild variant="outline">
            <Link href="/learn/new">Learn with Sage</Link>
          </Button>
          <Button asChild>
            <Link href="/new">
              <Plus className="size-4.25" />
              Teach Pip
            </Link>
          </Button>
        </div>
      </div>
      {error && (
        <div
          className="error-box bg-rose-50 border-solid rounded-lg text-[0.75rem] text-yellow-800 wrap-anywhere mx-0 my-4.5 px-4.5 py-3.75 border border-taupe-300 dark:bg-olive-800 dark:text-red-300 dark:border-olive-600"
          role="alert"
        >
          {error}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.reload()}
          >
            Reload library
          </Button>
        </div>
      )}
      <div className="mode-choices flex items-stretch gap-3.5 flex-wrap mx-0 my-5.5 [&_>_p]:flex-[1_1_12.5rem] [&_>_p]:border-solid [&_>_p]:rounded-xl [&_>_p]:p-4.5 [&_>_p]:border [&_>_p]:border-olive-300 dark:[&_>_p]:border-olive-700">
        <p>
          <strong>Learn with Sage</strong>
          <br />
          Start with a topic. Learn it step by step.
        </p>
        <p>
          <strong>Continue with Pip · optional</strong>
          <br />
          After a Sage course, teach it back from your course review. Or start
          directly with your own notes.
        </p>
      </div>
      <LearningShelf />
      <h2>Teach Pip · your topics & attempts</h2>
      {loading ? (
        <p
          className="loading-line flex items-center gap-3 text-[0.8125rem] p-7.5"
          role="status"
        >
          <LoaderCircle className="spin animate-[spin_1.2s_linear_infinite] size-5" />
          Opening your library…
        </p>
      ) : topics.length === 0 ? (
        <section className="empty-state text-center pt-11.25 pb-16.25 border-dashed rounded-xl bg-olive-100 flex items-center flex-col px-5 border border-olive-300 dark:bg-olive-800 dark:border-olive-700 [&_h2]:font-serif [&_h2]:text-[1.75rem] [&_h2]:mt-3.75 [&_>_p]:text-[0.8125rem] [&_>_p]:mb-6.5 max-mobile:pt-6.25 max-mobile:pb-8.75 max-mobile:px-5 max-mobile:[&_h2]:text-[1.625rem]">
          <Student small />
          <h2>A little room for your next big idea.</h2>
          <p>Start with a page of notes. We’ll turn it into a conversation.</p>
          <Button asChild>
            <Link href="/new">
              Create your first topic
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </section>
      ) : (
        <div className="topic-list">
          {topics.map((t) => (
            <article
              key={t.id}
              className="topic-row flex items-start gap-6 border-t border-solid border-t-olive-300 px-0 py-6.5 dark:border-t-olive-700 max-mobile:gap-3.5 max-mobile:flex-wrap"
            >
              <div className="topic-symbol bg-olive-200 text-olive-600 w-13 h-15 rounded-[0.4375rem] grid place-items-center shrink-0 dark:bg-olive-800 dark:text-olive-400 max-mobile:w-10 max-mobile:h-12">
                <BookOpen className="size-6" />
              </div>
              <div className="topic-info flex-1 min-w-0 [&_h2]:mt-0.75 [&_h2]:mb-2.5 [&_h2]:wrap-anywhere [&_h2]:mx-0 [&_p]:text-[0.6875rem] [&_p]:mb-0.75 max-mobile:[&_h2]:text-[1.375rem]">
                <h2>{t.title}</h2>
                <p>
                  {t.concepts.length} concepts · Checklist v{t.version}
                </p>
                {sessions.filter((s) => s.topic_id === t.id).length > 0 && (
                  <details>
                    <summary>
                      Attempts (
                      {sessions.filter((s) => s.topic_id === t.id).length}{" "}
                      loaded)
                    </summary>
                    {sessions
                      .filter((s) => s.topic_id === t.id)
                      .map((s) => (
                        <Link
                          key={s.id}
                          href={`/teach/${s.id}`}
                          className="attempt-link flex justify-between gap-3.75 text-[0.6875rem] text-olive-600 max-w-110 px-0 py-1.75 dark:text-olive-400 [&_span]:flex [&_span]:items-center [&_span]:gap-1.25"
                        >
                          {new Date(s.created_at).toLocaleString()}
                          <span>
                            {s.phase === "review" ? "View review" : "Continue"}
                            <ArrowRight className="size-3" />
                          </span>
                        </Link>
                      ))}
                  </details>
                )}
              </div>
              <div className="topic-actions flex items-center gap-3.5 [&_.text-link]:text-[0.625rem] max-layout:flex-col max-layout:items-end max-layout:gap-2 max-mobile:flex-row max-mobile:items-center max-mobile:justify-between max-mobile:w-full max-mobile:ml-13.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void start(t)}
                  disabled={busy}
                >
                  Teach Pip
                  <ArrowRight className="size-3.5" />
                </Button>
                <Link
                  href={`/new?edit=${t.id}`}
                  className="text-link text-[0.75rem] inline-flex gap-2 items-center hover:underline"
                >
                  Edit checklist
                </Link>
                <Link
                  href={`/learn/new?topic=${t.id}`}
                  className="text-link text-[0.75rem] inline-flex gap-2 items-center hover:underline"
                >
                  Learn from these notes
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${t.title}`}
                  onClick={() => setDeleting(t)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {sessions.some((s) => s.topic_id === null) && (
        <section
          className="learning-shelf mx-0 my-9"
          aria-labelledby="saved-samples-title"
        >
          <h2 id="saved-samples-title">Teach Pip · saved sample attempts</h2>
          <p>Your live Pip sample attempts are saved to your account.</p>
          {sessions
            .filter((s) => s.topic_id === null)
            .map((s) => (
              <Link
                key={s.id}
                href={`/teach/${s.id}`}
                className="attempt-link flex justify-between gap-3.75 text-[0.6875rem] text-olive-600 max-w-110 px-0 py-1.75 dark:text-olive-400 [&_span]:flex [&_span]:items-center [&_span]:gap-1.25"
              >
                <span>
                  {s.title} · {new Date(s.created_at).toLocaleString()}
                </span>
                <span>
                  {s.phase === "review" ? "View review" : "Continue"}
                  <ArrowRight className="size-3" />
                </span>
              </Link>
            ))}
        </section>
      )}
      {nextCursor && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void loadOlder()}
        >
          Load older attempts
        </Button>
      )}
      {deleting && (
        <div
          className="confirm-box bg-taupe-100 border-solid rounded-[0.5625rem] flex items-center gap-3.5 mt-5 p-5 border border-taupe-300 dark:bg-olive-800 dark:border-olive-600 [&_>_div]:flex-1 [&_h2]:text-[1.1875rem] [&_p]:text-[0.75rem] [&_p]:m-0 max-mobile:flex-wrap max-mobile:[&_>_div]:flex-[1_1_100%]"
          role="alert"
        >
          <div>
            <h2>Delete “{deleting.title}”?</h2>
            <p>
              This removes its notes, checklists, and all attempts permanently.
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={() => void remove()}
            disabled={busy}
          >
            Delete topic
          </Button>
          <Button
            variant="outline"
            onClick={() => setDeleting(null)}
            disabled={busy}
          >
            <X className="size-3.75" />
            Keep it
          </Button>
        </div>
      )}
      <div className="library-footer mt-7 flex items-center justify-between gap-3.75 [&_p]:m-0 max-mobile:items-start max-mobile:flex-col">
        <p className="micro text-[0.6875rem] leading-[1.7] text-olive-600 dark:text-olive-400">
          Your courses, topics and attempts are saved to your account. Drafts
          also stay on this device.
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void signout()}
        >
          Sign out & clear local drafts
        </Button>
      </div>
    </div>
  );
}
