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
import { api } from "@/lib/client";
import type { Session, Topic } from "@/lib/domain";
export function Library() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<Topic | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/teech")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setError(d.error);
        else {
          setTopics(d.topics);
          setSessions(d.sessions);
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
        const ids = sessions
          .filter((s) => s.topic_id === deleting.id)
          .map((s) => s.id);
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
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">A PLACE FOR YOUR IDEAS</p>
          <h1>Your study shelf.</h1>
          <p>Pick up a thought. See where teaching takes it.</p>
        </div>
        <Button asChild>
          <Link href="/new">
            <Plus size={17} />
            New topic
          </Link>
        </Button>
      </div>
      {error && (
        <div className="error-box" role="alert">
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
      {loading ? (
        <p className="loading-line" role="status">
          <LoaderCircle className="spin" size={20} />
          Opening your library…
        </p>
      ) : topics.length === 0 ? (
        <section className="empty-state">
          <Student small />
          <h2>A little room for your next big idea.</h2>
          <p>Start with a page of notes. We’ll turn it into a conversation.</p>
          <Button asChild>
            <Link href="/new">
              Create your first topic
              <ArrowRight size={16} />
            </Link>
          </Button>
        </section>
      ) : (
        <div className="topic-list">
          {topics.map((t) => (
            <article key={t.id} className="topic-row">
              <div className="topic-symbol">
                <BookOpen size={24} />
              </div>
              <div className="topic-info">
                <h2>{t.title}</h2>
                <p>
                  {t.concepts.length} concepts · Checklist v{t.version}
                </p>
                {sessions.filter((s) => s.topic_id === t.id).length > 0 && (
                  <details>
                    <summary>Recent attempts</summary>
                    {sessions
                      .filter((s) => s.topic_id === t.id)
                      .slice(0, 5)
                      .map((s) => (
                        <Link
                          key={s.id}
                          href={`/teach/${s.id}`}
                          className="attempt-link"
                        >
                          {new Date(s.created_at).toLocaleString()}
                          <span>
                            {s.phase === "review" ? "View review" : "Continue"}
                            <ArrowRight size={12} />
                          </span>
                        </Link>
                      ))}
                  </details>
                )}
              </div>
              <div className="topic-actions">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void start(t)}
                  disabled={busy}
                >
                  Teach Pip
                  <ArrowRight size={14} />
                </Button>
                <Link href={`/new?edit=${t.id}`} className="text-link">
                  Edit checklist
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${t.title}`}
                  onClick={() => setDeleting(t)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {deleting && (
        <div className="confirm-box" role="alert">
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
            <X size={15} />
            Keep it
          </Button>
        </div>
      )}
      <div className="library-footer">
        <p className="micro">
          Personal topics are saved to your account. Drafts also stay on this
          device.
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
