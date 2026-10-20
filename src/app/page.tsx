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
      <section className="landing max-w-286 grid grid-cols-[1.05fr_1fr] items-center gap-[3.4375rem] pt-19 pb-17 mx-auto my-0 px-4 min-[93.75rem]:pt-22.5 min-[93.75rem]:pb-20 max-layout:gap-[2.1875rem] max-layout:px-8 max-layout:py-[3.4375rem] max-mobile:grid-cols-[1fr] max-mobile:pt-[2.8125rem] max-mobile:pb-9.5 max-mobile:gap-9 max-mobile:px-[1.5625rem]">
        <div className="hero-copy [&_h1]:text-[clamp(3.25rem,5.8vw,4.875rem)] [&_h1]:leading-[1.05] [&_h1]:tracking-[-0.1875rem] [&_h1]:mb-7 [&_h1_em]:text-olive-500 [&_h1_em]:font-normal dark:[&_h1_em]:text-olive-400 max-layout:[&_h1]:text-[3.8125rem] max-mobile:[&_h1]:text-[4rem] max-mobile:[&_h1]:tracking-[-0.1625rem]">
          <p className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
            <span className="tiny-dot h-1.5 w-1.5 inline-block rounded-full bg-olive-500 shrink-0 dark:bg-olive-400" />
            A DIFFERENT WAY TO STUDY
          </p>
          <h1>
            Learn it.
            <br />
            Practice it.
            <br />
            <em>Teach it.</em>
          </h1>
          <p className="hero-description text-[0.9375rem] leading-[1.85] max-w-[22.8125rem] mb-[1.8125rem] max-mobile:text-[0.875rem] max-mobile:max-w-85">
            Start with a topic and learn in short steps. Practice applying it,
            then explain what you know to Pip, your curious AI student.
          </p>
          <div className="hero-actions flex items-center gap-5.5 mb-3.5 max-layout:flex-col max-layout:items-start max-layout:gap-4 max-mobile:flex-row max-mobile:items-center max-mobile:gap-4.5 max-mobile:[&_.button]:px-4.5 max-mobile:[&_.button]:py-[0.6875rem] max-mobile:[&_.text-link]:text-[0.6875rem]">
            <Button asChild>
              <Link href="/learn/new">
                Learn with a teacher <ArrowRight className="size-[1.0625rem]" />
              </Link>
            </Button>
            <Link
              className="text-link text-[0.75rem] inline-flex gap-2 items-center hover:underline"
              href="/new"
            >
              Teach Pip <ArrowUp />
            </Link>
          </div>
          <div className="mode-choices flex items-stretch gap-3.5 flex-wrap mx-0 my-5.5 [&_>_p]:flex-[1_1_12.5rem] [&_>_p]:border-solid [&_>_p]:rounded-xl [&_>_p]:p-4.5 [&_>_p]:border-[0.0625rem] [&_>_p]:border-olive-300 dark:[&_>_p]:border-olive-700">
            <p>
              <strong>Learn with a teacher</strong>
              <br />
              Start with a topic. Learn it step by step.
              <br />
              <Link
                className="text-link text-[0.75rem] inline-flex gap-2 items-center hover:underline"
                href="/teacher-sample"
              >
                Try the fixed Teacher sample →
              </Link>
            </p>
            <p>
              <strong>Teach Pip</strong>
              <br />
              Explain what you know. Find the gaps.
              <br />
              <Link
                className="text-link text-[0.75rem] inline-flex gap-2 items-center hover:underline"
                href="/sample"
              >
                Try a sample →
              </Link>
            </p>
          </div>
          <p className="micro text-[0.6875rem] leading-[1.7] text-olive-500 dark:text-olive-400">
            No account needed to try a sample. The Teacher sample is fixed; the
            Student sample uses live AI when available.
          </p>
        </div>
        <div className="hero-scene min-h-[28.5625rem] bg-taupe-100 border-solid rounded-[50%_50%_1rem_1rem] relative flex items-center flex-col pt-8 pb-5.5 overflow-hidden px-6.5 border-[0.0625rem] border-olive-200 dark:bg-olive-800 dark:border-olive-700 [&_>_.student]:w-51 [&_>_.student]:-mt-0.5 [&_>_.student]:mb-[-0.3125rem] [&_>_.student]:[transform:rotate(3deg)] min-[93.75rem]:min-h-120 max-layout:min-h-110 max-mobile:min-h-105 max-mobile:max-w-107.5 max-mobile:w-full max-mobile:rounded-[45%_45%_0.875rem_0.875rem] max-mobile:m-auto">
          <div className="scene-label text-[0.5625rem] tracking-[0.10625rem] text-olive-500 flex items-center gap-[0.4375rem] dark:text-olive-400 max-mobile:text-[0.5rem]">
            <span className="tiny-dot h-1.5 w-1.5 inline-block rounded-full bg-olive-500 shrink-0 dark:bg-olive-400" />{" "}
            YOUR NEXT STUDY PARTNER
          </div>
          <div className="speech-bubble bg-white border-solid rounded-[0.875rem_0.875rem_0.875rem_0.1875rem] pt-5.5 pb-[1.0625rem] text-center font-serif text-[1.5rem] leading-[1.3] mt-7 [transform:rotate(-3deg)] shadow-[0_0.25rem_0] shadow-olive-200 z-[1] px-[1.5625rem] border-[0.0625rem] border-olive-300 dark:bg-neutral-800 dark:shadow-neutral-900 dark:border-olive-700 [&_span]:block [&_span]:font-sans [&_span]:text-[0.4375rem] [&_span]:tracking-[0.0625rem] [&_span]:text-olive-500 [&_span]:mt-3 dark:[&_span]:text-olive-400 max-layout:text-[1.375rem] max-layout:pt-5.5 max-layout:pb-[1.0625rem] max-layout:px-5 max-mobile:mt-6">
            “Wait, how would you
            <br />
            explain that to me?”
            <span>ONE GOOD QUESTION CAN GO A LONG WAY.</span>
          </div>
          <Student state="curious" />
          <div className="pip-caption text-center text-[0.75rem] [&_strong]:block [&_strong]:text-[0.875rem] [&_strong]:font-medium [&_span]:block [&_span]:text-olive-500 [&_span]:text-[0.625rem] dark:[&_span]:text-olive-400">
            <strong>Meet Pip.</strong>
            <span>Curious student. Excellent listener.</span>
          </div>
          <span className="doodle doodle-one absolute text-stone-400 font-serif text-[2.25rem] left-[2.1875rem] top-57.5 [transform:rotate(14deg)] dark:text-olive-400">
            ✳
          </span>
          <span className="doodle doodle-two absolute text-stone-400 font-serif text-[3.0625rem] right-[2.1875rem] top-67.5 dark:text-olive-400">
            ✧
          </span>
          <div className="scene-note text-[0.5625rem] text-olive-500 mt-5.5 tracking-[0.0375rem] dark:text-olive-400">
            You teach. You notice. You grow.
          </div>
        </div>
      </section>
      <section
        className="how-section max-w-286 border-t-[0.0625rem] border-solid border-t-olive-300 pt-[2.3125rem] pb-0 m-auto px-4 dark:border-t-olive-700 max-layout:mx-8 max-layout:my-0 max-layout:px-0 max-mobile:pt-7.5 max-mobile:mx-[1.5625rem] max-mobile:my-0"
        aria-labelledby="how-title"
      >
        <div className="section-heading [&_.eyebrow]:mb-3 [&_.eyebrow]:text-[0.5625rem] [&_h2]:font-serif [&_h2]:text-[1.8125rem] max-mobile:[&_h2]:text-[1.625rem]">
          <p className="eyebrow text-[0.625rem] tracking-[0.10625rem] font-semibold text-stone-500 mt-0 mb-4.5 flex items-center gap-2 mx-0 dark:text-olive-400">
            LESS REREADING. MORE CONNECTING.
          </p>
          <h2 id="how-title">Make it make sense. Out loud, on the page.</h2>
        </div>
        <div className="how-grid grid grid-cols-[repeat(3,1fr)] gap-12 mt-8 [&_>_div]:relative [&_h3]:text-[1rem] [&_h3]:mb-2.5 [&_p]:text-[0.75rem] [&_p]:leading-[1.85] [&_p]:max-w-72.5 max-layout:gap-7 max-mobile:grid-cols-[1fr] max-mobile:gap-5 max-mobile:mt-[1.5625rem] max-mobile:[&_>_div]:pl-[2.6875rem] max-mobile:[&_p]:max-w-none max-mobile:[&_p]:mb-0 max-mobile:[&_h3]:pr-[1.5625rem]">
          <div>
            <span className="how-icon inline-flex text-olive-500 mb-[1.1875rem] dark:text-olive-400 max-mobile:absolute max-mobile:left-0 max-mobile:top-0">
              <FileText className="size-[1.3125rem]" />
            </span>
            <span className="step-number absolute right-0 top-0.5 text-[0.6875rem] text-stone-400 dark:text-olive-400 max-mobile:top-[0.1875rem]">
              01
            </span>
            <h3>Bring an idea</h3>
            <p>
              Learn from a topic or your notes with a short, scoped plan. Or
              bring notes straight to Teach Pip.
            </p>
          </div>
          <div>
            <span className="how-icon inline-flex text-olive-500 mb-[1.1875rem] dark:text-olive-400 max-mobile:absolute max-mobile:left-0 max-mobile:top-0">
              <MessageCircle className="size-[1.3125rem]" />
            </span>
            <span className="step-number absolute right-0 top-0.5 text-[0.6875rem] text-stone-400 dark:text-olive-400 max-mobile:top-[0.1875rem]">
              02
            </span>
            <h3>Learn, then practice</h3>
            <p>
              Read short explanations and worked examples. Apply the ideas and
              review feedback, hints and unresolved questions.
            </p>
          </div>
          <div>
            <span className="how-icon inline-flex text-olive-500 mb-[1.1875rem] dark:text-olive-400 max-mobile:absolute max-mobile:left-0 max-mobile:top-0">
              <Sprout className="size-[1.3125rem]" />
            </span>
            <span className="step-number absolute right-0 top-0.5 text-[0.6875rem] text-stone-400 dark:text-olive-400 max-mobile:top-[0.1875rem]">
              03
            </span>
            <h3>Teach it back</h3>
            <p>
              Put the notes away and explain it to Pip. See what came through
              and what to revisit, relative to your study source.
            </p>
          </div>
        </div>
        <div className="honest-note mt-7 flex gap-2.5 items-center text-olive-500 dark:text-olive-400 [&_p]:text-[0.6875rem] [&_p]:m-0 max-mobile:items-start max-mobile:mt-6.5 max-mobile:[&_svg]:mt-0.5">
          <Check className="size-4" />
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
