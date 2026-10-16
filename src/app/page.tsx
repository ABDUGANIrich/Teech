import Link from "next/link";
import type { Metadata } from "next";
import { siteDescription, siteTitle, siteUrl } from "@/lib/site";
import {
  ArrowRight,
  Check,
  FileText,
  MessageCircle,
  Sprout,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { Student } from "@/components/student";
import { Button } from "@/components/ui/button";
import { user } from "@/lib/server/db";
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Teech",
    locale: "en_US",
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
  },
};
export default async function Home() {
  const u = await user();
  return (
    <Shell signedIn={!!u}>
      <section className="landing">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="tiny-dot" />A DIFFERENT WAY TO STUDY
          </p>
          <h1>
            Learn it.
            <br />
            Practice it.
            <br />
            <em>Teach it.</em>
          </h1>
          <p className="hero-description">
            Start with a topic and learn in short steps. Practice applying it,
            then explain what you know to Pip, your curious AI student.
          </p>
          <div className="hero-actions">
            <Button asChild>
              <Link href="/learn/new">
                Learn with a teacher <ArrowRight size={17} />
              </Link>
            </Button>
            <Link className="text-link" href="/new">
              Teach Pip <ArrowUp />
            </Link>
          </div>
          <div className="mode-choices">
            <p>
              <strong>Learn with a teacher</strong>
              <br />
              Start with a topic. Learn it step by step.
              <br />
              <Link className="text-link" href="/teacher-sample">
                Try the fixed Teacher sample →
              </Link>
            </p>
            <p>
              <strong>Teach Pip</strong>
              <br />
              Explain what you know. Find the gaps.
              <br />
              <Link className="text-link" href="/sample">
                Try a sample →
              </Link>
            </p>
          </div>
          <p className="micro">No account needed for either fixed sample.</p>
        </div>
        <div className="hero-scene">
          <div className="scene-label">
            <span className="tiny-dot" /> YOUR NEXT STUDY PARTNER
          </div>
          <div className="speech-bubble">
            “Wait, how would you
            <br />
            explain that to me?”
            <span>ONE GOOD QUESTION CAN GO A LONG WAY.</span>
          </div>
          <Student state="curious" />
          <div className="pip-caption">
            <strong>Meet Pip.</strong>
            <span>Curious student. Excellent listener.</span>
          </div>
          <span className="doodle doodle-one">✳</span>
          <span className="doodle doodle-two">✧</span>
          <div className="scene-note">You teach. You notice. You grow.</div>
        </div>
      </section>
      <section className="how-section" aria-labelledby="how-title">
        <div className="section-heading">
          <p className="eyebrow">LESS REREADING. MORE CONNECTING.</p>
          <h2 id="how-title">Make it make sense. Out loud, on the page.</h2>
        </div>
        <div className="how-grid">
          <div>
            <span className="how-icon">
              <FileText size={21} />
            </span>
            <span className="step-number">01</span>
            <h3>Bring an idea</h3>
            <p>
              Learn from a topic or your notes with a short, scoped plan. Or
              bring notes straight to Teach Pip.
            </p>
          </div>
          <div>
            <span className="how-icon">
              <MessageCircle size={21} />
            </span>
            <span className="step-number">02</span>
            <h3>Learn, then practice</h3>
            <p>
              Read short explanations and worked examples. Apply the ideas and
              review feedback, hints and unresolved questions.
            </p>
          </div>
          <div>
            <span className="how-icon">
              <Sprout size={21} />
            </span>
            <span className="step-number">03</span>
            <h3>Teach it back</h3>
            <p>
              Put the notes away and explain it to Pip. See what came through
              and what to revisit, relative to your study source.
            </p>
          </div>
        </div>
        <div className="honest-note">
          <Check size={16} />
          <p>
            AI instruction and grading can be wrong. Topic-only lessons are not
            independently source-verified. A session does not establish mastery.
          </p>
        </div>
      </section>
    </Shell>
  );
}
function ArrowUp() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d="M4 12L12 4M4 4H12V12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
