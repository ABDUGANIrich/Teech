import Link from "next/link";
export default function NotFound() {
  return (
    <div className="page narrow max-w-187.5 pt-11 pb-3 min-h-[65vh] mx-auto my-0 px-6 max-mobile:pt-6.25 max-mobile:pb-2.5 max-mobile:px-4.5">
      <h1>This page wandered off.</h1>
      <p>Let’s get you back to a familiar place.</p>
      <Link
        className="button button-primary inline-flex items-center justify-center gap-2.75 whitespace-normal min-h-11.5 rounded-[0.4375rem] border-solid text-[0.8125rem] font-medium transition-[background,transform] duration-180 ease-[ease] bg-olive-600 text-white px-5.25 py-2.75 border border-transparent dark:bg-olive-400 dark:text-emerald-950 [&:active:not(:disabled)]:transform-[translateY(0.0625rem)] [&:hover:not(:disabled)]:bg-emerald-900 dark:[&:hover:not(:disabled)]:bg-olive-300"
        href="/"
      >
        Back to Teech
      </Link>
    </div>
  );
}
