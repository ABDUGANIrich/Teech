"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Check,
  FileText,
  Globe,
  MessageCircle,
  RotateCcw,
  Sprout,
} from "lucide-react";
import { Student } from "./student";
import { Teacher } from "./teacher";
import { Button } from "./ui/button";

const modes = {
  learn: {
    title: "Learn with Sage",
    action: "Create course",
    href: "/learn/new",
    sample: "/teacher-sample",
    sampleLabel: "Try Sage",
    sampleNote: "Fixed sample · No account needed",
    quote: "“One idea at a time.”",
    howTitle: "Understanding, one small step at a time.",
    steps: [
      {
        icon: FileText,
        title: "Choose your starting point",
        text: "Pick a topic, starting level and goal. Add notes if you have them, then review and accept your course outline.",
      },
      {
        icon: BookOpen,
        title: "Learn, then give it a try",
        text: "Each unit prepares automatically as you reach it. Read an explanation and worked example, then try a concept check and application problem.",
      },
      {
        icon: Sprout,
        title: "Find your next step",
        text: "Work through feedback and hints, or revisit an unresolved idea. Finish with your course review, then choose whether to teach what you learned to Pip.",
      },
    ],
    features: [
      {
        icon: Globe,
        title: "A little research, when needed.",
        text: "For topic-based courses, the AI can look up public web sources when an outline or clarification needs current details. Retrieved material is saved. Notes-based courses stay within your notes.",
      },
      {
        icon: BookOpen,
        title: "Pick up where you left off.",
        text: "Prepared units stay available in your library. Reopen a saved course to revisit an explanation or continue your practice. Saved answers remain available if an AI request needs a retry.",
      },
    ],
    honestNote:
      "AI lessons and feedback can be wrong. Web sources add context, not a guarantee of accuracy. Practice results help you decide what to revisit; they do not establish mastery.",
  },
  teach: {
    title: "Teach Pip",
    action: "Start teaching",
    href: "/new",
    sample: "/sample",
    sampleLabel: "Try Pip",
    sampleNote: "Live AI or fixed preview · No account needed",
    quote: "“I’m all ears.”",
    howTitle: "The gaps get clearer when you explain.",
    steps: [
      {
        icon: FileText,
        title: "Bring what you studied",
        text: "Paste your notes and review the editable concept checklist. Your study source sets the context for Pip’s questions and your review.",
      },
      {
        icon: MessageCircle,
        title: "Explain it in your own words",
        text: "Put the notes away and teach the idea to Pip. Answer up to three follow-up questions about your explanation, with notes available when you need a look.",
      },
      {
        icon: RotateCcw,
        title: "Review, retry, compare",
        text: "See what came through and what to revisit, with evidence from your explanation. Try again and compare your saved attempts against the same source.",
      },
    ],
    features: [
      {
        icon: MessageCircle,
        title: "A conversation with a curious student.",
        text: "Pip asks about what you explained, giving you another chance to connect the ideas. You can reveal your notes when you need them; the review records that support.",
      },
      {
        icon: FileText,
        title: "A review you can look back on.",
        text: "Return to saved explanations, follow-up answers and reviews from your library. Compare attempts to see what changed in your explanation and choose what to work on next.",
      },
    ],
    honestNote:
      "AI questions and feedback can be wrong. Reviews are relative to your study source, which may itself be incomplete. An explanation or score does not establish mastery.",
  },
};

export function Landing() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "teach" ? "teach" : "learn";
  const content = modes[mode];
  return (
    <>
      <section
        aria-labelledby="landing-title"
        className="landing max-w-286 mx-auto px-6 pt-6 pb-10 max-mobile:px-5 max-mobile:pt-5 max-mobile:pb-8"
      >
        <div className="hero-scene max-w-130 mx-auto bg-taupe-100 border border-olive-200 rounded-[16.25rem_16.25rem_1rem_1rem] relative flex items-center flex-col pt-10 pb-6 px-6 dark:bg-olive-800 dark:border-olive-700 [&_>_.student]:w-64 [&_>_.teacher]:w-64 max-phone:pt-8 max-phone:px-4">
          <h1
            id="landing-title"
            className="text-center text-[2.25rem] tracking-[-0.0625rem] mb-0 max-phone:text-[1.75rem]"
          >
            {content.title}
          </h1>
          <div className="speech-bubble bg-white border border-olive-300 rounded-[0.875rem_0.875rem_0.875rem_0.1875rem] py-2 px-5 text-center font-serif text-[1.375rem] leading-[1.35] mt-3 -rotate-3 shadow-[0_0.25rem_0] shadow-olive-200 z-1 dark:bg-neutral-800 dark:shadow-neutral-900 dark:border-olive-700 max-phone:mt-2 max-phone:text-[1.125rem]">
            {content.quote}
          </div>
          {mode === "learn" ? <Teacher /> : <Student state="curious" />}
          <div className="hero-actions flex flex-wrap justify-center items-center gap-x-4 gap-y-3 mt-2">
            <Button asChild>
              <Link href={content.href}>
                {content.action}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
            <Link
              href={content.sample}
              aria-describedby="sample-note"
              className="text-link text-[0.75rem] underline underline-offset-4"
            >
              {content.sampleLabel}
            </Link>
          </div>
          <p
            id="sample-note"
            className="micro text-center text-[0.75rem] leading-[1.7] mt-3 mb-0 text-olive-600 dark:text-olive-400"
          >
            {content.sampleNote}
          </p>
          <span
            aria-hidden="true"
            className="absolute left-[12%] top-[48%] text-stone-400 font-serif text-[2.25rem] rotate-12 dark:text-olive-400"
          >
            ✳
          </span>
          <span
            aria-hidden="true"
            className="absolute right-[12%] top-[57%] text-stone-400 font-serif text-[2.75rem] dark:text-olive-400"
          >
            ✧
          </span>
        </div>
      </section>
      <nav
        aria-label="Other ways to study"
        className="max-w-130 mx-auto px-6 pb-8 text-center text-[0.75rem] text-olive-600 dark:text-olive-400"
      >
        {mode === "learn"
          ? "Already have something to explain? "
          : "Want to learn it first? "}
        <a
          href={`/?mode=${mode === "learn" ? "teach" : "learn"}`}
          className="underline underline-offset-4 inline-flex min-h-11 items-center"
          onClick={(event) => {
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            const url = new URL(window.location.href);
            url.searchParams.set("mode", mode === "learn" ? "teach" : "learn");
            window.history.pushState(
              null,
              "",
              `${url.pathname}${url.search}${url.hash}`,
            );
          }}
        >
          {mode === "learn" ? "Teach Pip directly" : "Learn with Sage"}
        </a>
      </nav>
      <section
        aria-labelledby="how-title"
        className="how-section max-w-286 border-t border-olive-300 pt-8 mx-auto px-4 dark:border-olive-700 max-layout:mx-8 max-layout:px-0 max-mobile:mx-6.25"
      >
        <p className="eyebrow text-[0.5625rem] tracking-[0.10625rem] font-semibold text-stone-500 mb-3 dark:text-olive-400">
          {mode === "learn"
            ? "A COURSE THAT STARTS WITH YOU"
            : "LESS REREADING. MORE CONNECTING."}
        </p>
        <h2
          id="how-title"
          className="font-serif text-[1.8125rem] max-mobile:text-[1.625rem]"
        >
          {content.howTitle}
        </h2>
        <div className="how-grid grid grid-cols-3 gap-12 mt-8 max-layout:gap-7 max-mobile:grid-cols-1 max-mobile:gap-6">
          {content.steps.map(({ icon: Icon, title, text }, index) => (
            <div key={title} className="relative max-mobile:pl-11">
              <Icon
                aria-hidden="true"
                className="size-5 text-olive-600 mb-5 dark:text-olive-400 max-mobile:absolute max-mobile:left-0 max-mobile:top-0"
              />
              <span className="absolute right-0 top-0.5 text-[0.6875rem] text-stone-400 dark:text-olive-400">
                0{index + 1}
              </span>
              <h3 className="text-[1rem] mb-2.5 pr-5">{title}</h3>
              <p className="text-[0.75rem] leading-[1.85] mb-0">{text}</p>
            </div>
          ))}
        </div>
        {mode === "learn" && (
          <aside
            aria-labelledby="after-sage-title"
            className="mt-8 flex items-center gap-6 rounded-xl border border-olive-300 bg-taupe-100 p-6 dark:border-olive-700 dark:bg-olive-800 max-mobile:gap-4 max-mobile:p-4"
          >
            <div aria-hidden="true" className="max-phone:hidden">
              <Student small state="curious" />
            </div>
            <div className="min-w-0">
              <p className="text-[0.625rem] tracking-[0.1rem] font-semibold text-olive-600 dark:text-olive-400">
                AFTER SAGE · OPTIONAL
              </p>
              <h3 id="after-sage-title" className="text-[1.125rem]">
                Keep going with Pip, if you like.
              </h3>
              <p className="text-[0.8125rem] leading-[1.8] mb-0 text-olive-800 dark:text-olive-200">
                Once your course is complete, you can teach it back to Pip, your
                curious AI student. Review a source built from what you studied,
                explain it in your own words, and answer follow-up questions. Or
                finish with Sage and return another time.
              </p>
            </div>
          </aside>
        )}
        <div className="mt-9 grid grid-cols-2 gap-7 border-t border-olive-300 pt-6 dark:border-olive-700 max-mobile:grid-cols-1 max-mobile:gap-5">
          {content.features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3">
              <Icon
                aria-hidden="true"
                className="size-5 mt-0.5 text-olive-600 dark:text-olive-400"
              />
              <div>
                <h3 className="text-[0.875rem] mb-2">{title}</h3>
                <p className="text-[0.75rem] leading-[1.85] mb-0">{text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="honest-note mt-7 flex gap-2.5 items-start text-olive-600 dark:text-olive-400">
          <Check aria-hidden="true" className="size-4 mt-0.5" />
          <p className="text-[0.6875rem] leading-[1.7] mb-0">
            {content.honestNote}
          </p>
        </div>
      </section>
    </>
  );
}
