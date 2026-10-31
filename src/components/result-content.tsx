"use client";

import { useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import type { Unit } from "@/lib/learning";

function CodeBlock({ text, language }: { text: string; language?: string }) {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const copied = copiedText === text;
  const [failed, setFailed] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      setFailed(false);
    } catch {
      setCopiedText(null);
      setFailed(true);
    }
  }
  return (
    <figure className="result-code">
      <figcaption>
        <span>{language || "Illustrative code"} · not executed</span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label="Copy code"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span aria-live="polite">
            {failed ? "Select code to copy" : copied ? "Copied" : "Copy"}
          </span>
        </button>
      </figcaption>
      <pre tabIndex={0} aria-label="Code">
        <code>{text}</code>
      </pre>
    </figure>
  );
}

// Keep generated headings below the page/unit headings. Raw HTML and remote
// images are intentionally excluded; Markdown retains its safe URL transform.
const components: Components = {
  h1: ({ children }) => <h3>{children}</h3>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h4>{children}</h4>,
  h4: ({ children }) => <h4>{children}</h4>,
  h5: ({ children }) => <h4>{children}</h4>,
  h6: ({ children }) => <h4>{children}</h4>,
  img: () => null,
  a: ({ href, children }) =>
    href ? (
      <a
        href={href}
        target={href.startsWith("#") ? undefined : "_blank"}
        rel="noreferrer noopener"
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  table: ({ children }) => (
    <div
      className="result-table"
      role="region"
      aria-label="Lesson table"
      tabIndex={0}
    >
      <table>{children}</table>
    </div>
  ),
  pre: ({ node, children }) => {
    const code = node?.children[0];
    if (code?.type !== "element" || code.tagName !== "code")
      return <pre>{children}</pre>;
    const text = code.children
      .map((child) => (child.type === "text" ? child.value : ""))
      .join("");
    const classes = code.properties.className;
    const language = Array.isArray(classes)
      ? classes.find((value) => String(value).startsWith("language-"))
      : undefined;
    return (
      <CodeBlock
        text={text.replace(/\n$/, "")}
        language={language ? String(language).slice(9) : undefined}
      />
    );
  },
  code: ({ children }) => <code>{children}</code>,
};
const plugins = [remarkGfm];

export function RichText({ text }: { text: string }) {
  return (
    <div className="teech-prose">
      <Markdown remarkPlugins={plugins} components={components} skipHtml>
        {text}
      </Markdown>
    </div>
  );
}

export function LessonBlocks({ blocks }: { blocks: Unit["explanation"] }) {
  return (
    <div className="lesson-blocks teech-prose">
      {blocks.map((block, index) => {
        if (block.kind === "code")
          return <CodeBlock key={index} text={block.text} />;
        if (block.kind === "equation")
          return (
            <figure className="result-equation" key={index}>
              <figcaption>In notation</figcaption>
              <pre tabIndex={0} aria-label={`Equation: ${block.text}`}>
                <code>{block.text}</code>
              </pre>
            </figure>
          );
        const text =
          block.kind === "list"
            ? block.text
                .split("\n")
                .filter((line) => line.trim())
                .map((line) =>
                  /^\s*(?:[-*+] |\d+[.)] )/.test(line)
                    ? line
                    : `- ${line.trim()}`,
                )
                .join("\n")
            : block.text;
        return (
          <Markdown
            key={index}
            remarkPlugins={plugins}
            components={components}
            skipHtml
          >
            {text}
          </Markdown>
        );
      })}
    </div>
  );
}

export function Definitions({ items }: { items: string[] }) {
  return (
    <dl className="result-definitions">
      {items.map((item, index) => {
        const match = item.match(/^(.{1,80}?):\s+([\s\S]+)$/);
        return (
          <div key={index}>
            {match ? (
              <>
                <dt>
                  <RichText text={match[1]} />
                </dt>
                <dd>
                  <RichText text={match[2]} />
                </dd>
              </>
            ) : (
              <dd>
                <RichText text={item} />
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}

export function FeedbackPoints({
  well,
  gap,
  next,
}: {
  well: string;
  gap: string;
  next: string;
}) {
  return (
    <div className="feedback-points">
      <FeedbackPoint label="What came through">{well}</FeedbackPoint>
      <FeedbackPoint label="What to revisit">{gap}</FeedbackPoint>
      <FeedbackPoint label="Next step">{next}</FeedbackPoint>
    </div>
  );
}
function FeedbackPoint({
  label,
  children,
}: {
  label: string;
  children: string;
}) {
  return (
    <div className="feedback-point">
      <p className="result-label">{label}</p>
      <RichText text={children} />
    </div>
  );
}
