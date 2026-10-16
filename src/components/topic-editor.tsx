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
type EditorProps = { edit?: string; userId: string };

export function TopicEditor(props: EditorProps) {
  return (
    <TopicDraft key={`${props.userId}:${props.edit || "new"}`} {...props} />
  );
}

function TopicDraft({ edit, userId }: EditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [conflict, setConflict] = useState<Topic | null>(null);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [replaceChecklist, setReplaceChecklist] = useState(false);
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
        version?: number;
      } | null>(key, null);
      if (local) {
        setTitle(local.title);
        setNotes(local.notes);
        setConcepts(local.concepts);
        setVersion(local.version || null);
        setNotice("Your topic draft has been restored.");
        if (edit && !local.version) {
          try {
            const d = await fetch(`/api/teech?topic=${edit}`).then((r) =>
              r.json(),
            );
            if (d.topic) setConflict(d.topic);
            else
              setError(
                d.error ||
                  "Could not load the latest topic. Reload to try again; your draft is retained.",
              );
          } catch {
            setError(
              "Could not load the latest topic. Reload to try again; your draft is retained.",
            );
          }
        }
      } else if (edit) {
        try {
          const d = await fetch(`/api/teech?topic=${edit}`).then((r) =>
            r.json(),
          );
          if (d.error) throw new Error(d.error);
          const t = d.topic || d.topics?.find((x: Topic) => x.id === edit);
          if (!t) throw new Error("Topic not found in your library.");
          setTitle(t.title);
          setNotes(t.notes);
          setConcepts(t.concepts);
          setVersion(t.version);
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
    if (!writeLocal(key, { title: t, notes: n, concepts: c, version }))
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
    if (busy) return;
    setError("");
    const result = topicInputSchema.safeParse({ title, notes });
    if (!result.success) {
      setError(
        "Add a title (1–100 characters) and notes (80–18,000 characters).",
      );
      return;
    }
    setBusy(true);
    setExtracting(true);
    setReplaceChecklist(false);
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
      setExtracting(false);
    }
  }
  async function save() {
    if (busy) return;
    setError("");
    if (edit && !version) {
      setError(
        "Review the latest saved topic below before saving this restored draft.",
      );
      return;
    }
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
        ...(edit ? { id: edit, expectedVersion: version } : {}),
        title,
        notes,
        concepts,
      });
      if (d.conflict && d.topic) setConflict(d.topic);
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
      {conflict && (
        <section className="notice" aria-label="Topic edit conflict">
          <h2>Compare with the latest saved topic</h2>
          <p>
            Your edits are retained in the editor. Review version{" "}
            {conflict.version} before choosing what to save.
          </p>
          <details>
            <summary>{conflict.title} · saved notes and checklist</summary>
            <p className="prewrap">{conflict.notes}</p>
            <ul>
              {conflict.concepts.map((c) => (
                <li key={c.id}>
                  <strong>{c.title}</strong> — {c.description}
                  <blockquote>{c.excerpt}</blockquote>
                </li>
              ))}
            </ul>
          </details>
          <div className="learning-actions">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setTitle(conflict.title);
                setNotes(conflict.notes);
                setConcepts(conflict.concepts);
                setVersion(conflict.version);
                writeLocal(key, {
                  title: conflict.title,
                  notes: conflict.notes,
                  concepts: conflict.concepts,
                  version: conflict.version,
                });
                setConflict(null);
                setError("");
              }}
            >
              Use latest saved topic
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setVersion(conflict.version);
                writeLocal(key, {
                  title,
                  notes,
                  concepts,
                  version: conflict.version,
                });
                setConflict(null);
                setError("");
                setNotice(
                  "Your edits are ready to save against the version you reviewed.",
                );
              }}
            >
              Keep my edits against this version
            </Button>
          </div>
        </section>
      )}
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
              disabled={busy}
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
              disabled={busy}
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
            <Button
              onClick={() =>
                concepts.length ? setReplaceChecklist(true) : void extract()
              }
              disabled={busy}
            >
              {extracting ? (
                <>
                  <LoaderCircle className="spin" size={16} />
                  Finding the key ideas…
                </>
              ) : (
                <>
                  {concepts.length
                    ? "Regenerate checklist"
                    : "Find key concepts"}
                  <ArrowRight size={16} />
                </>
              )}
            </Button>
            {replaceChecklist && (
              <div className="notice">
                <p>
                  Replace your current checklist with newly extracted concepts?
                  Your existing checklist stays if generation fails.
                </p>
                <Button disabled={busy} onClick={() => void extract()}>
                  Replace checklist
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setReplaceChecklist(false)}
                >
                  Keep checklist
                </Button>
              </div>
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
                <fieldset key={c.id} className="concept-edit" disabled={busy}>
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
