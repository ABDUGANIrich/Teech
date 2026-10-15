"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import { api, readLocal, writeLocal } from "@/lib/client";
import {
  topicInputSchema,
  validateConcepts,
  type Concept,
  type Topic,
} from "@/lib/domain";
export function TopicEditor({
  edit,
  userId,
}: {
  edit?: string;
  userId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const init = useRef(false);
  const key = `teech:${userId}:topic-draft:${edit || "new"}`;
  useEffect(() => {
    if (init.current) return;
    init.current = true;
    async function load() {
      const local = readLocal<{
        title: string;
        notes: string;
        concepts: Concept[];
      } | null>(key, null);
      if (local) {
        setTitle(local.title);
        setNotes(local.notes);
        setConcepts(local.concepts);
        setNotice("Your topic draft has been restored.");
      } else if (edit) {
        try {
          const d = await fetch("/api/teech").then((r) => r.json());
          if (d.error) throw new Error(d.error);
          const t = d.topics.find((x: Topic) => x.id === edit);
          if (!t) throw new Error("Topic not found in your library.");
          setTitle(t.title);
          setNotes(t.notes);
          setConcepts(t.concepts);
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Could not load this topic.",
          );
        }
      }
      setReady(true);
    }
    void load();
  }, [edit, key]);
  function saveDraft(t: string, n: string, c: Concept[]) {
    if (!writeLocal(key, { title: t, notes: n, concepts: c }))
      setNotice(
        "Browser storage is unavailable. Copy your notes before leaving.",
      );
  }
  function updateConcept(index: number, field: keyof Concept, value: string) {
    const c = concepts.map((x, i) =>
      i === index ? { ...x, [field]: value } : x,
    );
    setConcepts(c);
    saveDraft(title, notes, c);
  }
  async function extract() {
    setError("");
    const result = topicInputSchema.safeParse({ title, notes });
    if (!result.success) {
      setError(
        "Add a title (1–100 characters) and notes (80–18,000 characters).",
      );
      return;
    }
    setBusy(true);
    try {
      const d = await api({ action: "extract", title, notes });
      if (d.error) throw new Error(d.error);
      setConcepts(d.concepts!);
      saveDraft(title, notes, d.concepts!);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection interrupted. Your notes are safe. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setError("");
    try {
      topicInputSchema.parse({ title, notes });
      validateConcepts(notes, concepts);
    } catch {
      setError(
        "Use 4–8 complete concepts. Each supporting passage must be copied exactly from your notes (8–1,200 characters).",
      );
      return;
    }
    setBusy(true);
    try {
      const d = await api({
        action: "save",
        ...(edit ? { id: edit } : {}),
        title,
        notes,
        concepts,
      });
      if (d.error) throw new Error(d.error);
      try {
        localStorage.removeItem(key);
      } catch {}
      router.push("/library");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save your topic. Your draft is safe.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="page editor">
      <Link href="/library" className="back-link">
        <ArrowLeft size={15} />
        My library
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">START WITH SOMETHING YOU’RE LEARNING</p>
          <h1>{edit ? "Shape your checklist." : "What’s on your mind?"}</h1>
          <p>
            {edit
              ? "Edits create a new checklist version. Previous attempts keep their original notes and concepts."
              : "Bring your notes. We’ll find the ideas worth explaining."}
          </p>
        </div>
      </div>
      {!ready ? (
        <p role="status">Opening your draft…</p>
      ) : (
        <>
          <div className="editor-fields">
            <label htmlFor="topic-title">
              Give your topic a name<span>Up to 100 characters</span>
            </label>
            <input
              id="topic-title"
              value={title}
              maxLength={100}
              placeholder="e.g. How the water cycle works"
              onChange={(e) => {
                setTitle(e.target.value);
                saveDraft(e.target.value, notes, concepts);
              }}
            />
            <label htmlFor="topic-notes">
              Your study material<span>80–18,000 characters · plain text</span>
            </label>
            <textarea
              id="topic-notes"
              value={notes}
              maxLength={18000}
              rows={12}
              placeholder="Paste the material you want to understand. A focused set of notes works best."
              onChange={(e) => {
                setNotes(e.target.value);
                saveDraft(title, e.target.value, concepts);
              }}
            />
            <p className="micro right">
              {notes.length.toLocaleString()} / 18,000 characters
            </p>
            <p className="privacy-inline">
              Your notes and explanations are sent to OpenRouter and its AI
              provider. Avoid including private or sensitive information.
            </p>
            {concepts.length === 0 && (
              <Button onClick={() => void extract()} disabled={busy}>
                {busy ? (
                  <>
                    <LoaderCircle className="spin" size={16} />
                    Finding the key ideas…
                  </>
                ) : (
                  <>
                    Find key concepts
                    <ArrowRight size={16} />
                  </>
                )}
              </Button>
            )}
          </div>
          {concepts.length > 0 && (
            <section className="checklist-editor">
              <div className="section-row">
                <div>
                  <p className="eyebrow">MAKE THIS YOURS</p>
                  <h2>Your concept checklist</h2>
                </div>
                <span className="quiet-badge">
                  {concepts.length} / 8 CONCEPTS
                </span>
              </div>
              <p>
                Keep 4–8 concepts. Edit what a good explanation should cover and
                check each supporting passage.
              </p>
              {concepts.map((c, i) => (
                <fieldset key={c.id} className="concept-edit">
                  <legend>Concept {i + 1}</legend>
                  <div className="section-row">
                    <label htmlFor={`c-${i}`}>Concept title</label>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={concepts.length <= 4 || busy}
                      aria-label={`Remove concept ${i + 1}`}
                      onClick={() => {
                        const next = concepts.filter((_, idx) => idx !== i);
                        setConcepts(next);
                        saveDraft(title, notes, next);
                      }}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                  <input
                    id={`c-${i}`}
                    value={c.title}
                    maxLength={100}
                    onChange={(e) => updateConcept(i, "title", e.target.value)}
                  />
                  <label htmlFor={`d-${i}`}>
                    A good explanation should cover
                  </label>
                  <textarea
                    id={`d-${i}`}
                    value={c.description}
                    maxLength={500}
                    rows={2}
                    onChange={(e) =>
                      updateConcept(i, "description", e.target.value)
                    }
                  />
                  <label htmlFor={`e-${i}`}>
                    Exact supporting passage from your notes
                  </label>
                  <textarea
                    id={`e-${i}`}
                    value={c.excerpt}
                    maxLength={1200}
                    rows={2}
                    onChange={(e) =>
                      updateConcept(i, "excerpt", e.target.value)
                    }
                  />
                  {(!c.excerpt || !notes.includes(c.excerpt)) && (
                    <p className="field-error">
                      Copy an exact passage from the notes above.
                    </p>
                  )}
                </fieldset>
              ))}
              <div className="section-row">
                <Button
                  variant="outline"
                  disabled={concepts.length >= 8 || busy}
                  onClick={() => {
                    const c = [
                      ...concepts,
                      {
                        id: crypto.randomUUID(),
                        title: "",
                        description: "",
                        excerpt: "",
                      },
                    ];
                    setConcepts(c);
                    saveDraft(title, notes, c);
                  }}
                >
                  <Plus size={16} />
                  Add concept
                </Button>
                <Button onClick={() => void save()} disabled={busy}>
                  {busy ? <LoaderCircle className="spin" size={16} /> : null}
                  Save {edit ? "new version" : "topic"}
                  <ArrowRight size={16} />
                </Button>
              </div>
            </section>
          )}
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
        </>
      )}
    </div>
  );
}
