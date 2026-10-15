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
            Think you
            <br />
            understand it?
            <br />
            <em>Teach it.</em>
          </h1>
          <p className="hero-description">
            Meet the student who helps you learn.
            <br />
            Explain an idea in your own words. Follow your curiosity. Find the
            pieces that haven’t clicked yet.
          </p>
          <div className="hero-actions">
            <Button asChild>
              <Link href="/sample">
                Try a sample <ArrowRight size={17} />
              </Link>
            </Button>
            <Link className="text-link" href={u ? "/library" : "/signin"}>
              Bring your own notes <ArrowUp />
            </Link>
          </div>
          <p className="micro">No account needed to explore.</p>
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
              Paste your notes and shape a short checklist of the concepts you
              want to explain.
            </p>
          </div>
          <div>
            <span className="how-icon">
              <MessageCircle size={21} />
            </span>
            <span className="step-number">02</span>
            <h3>Teach a curious student</h3>
            <p>
              Put the notes away. Explain it your way, then work through a few
              thoughtful questions.
            </p>
          </div>
          <div>
            <span className="how-icon">
              <Sprout size={21} />
            </span>
            <span className="step-number">03</span>
            <h3>Find your next step</h3>
            <p>
              See what came through clearly and what to revisit, with evidence
              from your notes.
            </p>
          </div>
        </div>
        <div className="honest-note">
          <Check size={16} />
          <p>
            A practice partner, not a final verdict. AI feedback is relative to
            the material you provide.
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
