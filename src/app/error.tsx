"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page narrow max-w-187.5 pt-11 pb-3 min-h-[65vh] mx-auto my-0 px-6 max-mobile:pt-[1.5625rem] max-mobile:pb-2.5 max-mobile:px-4.5">
      <h1>A small pause.</h1>
      <p>
        Something couldn’t load. Your locally saved writing is still on this
        device.
      </p>
      <button
        className="button button-primary inline-flex items-center justify-center gap-[0.6875rem] whitespace-normal min-h-11.5 rounded-[0.4375rem] border-solid text-[0.8125rem] font-medium transition-[background,transform] duration-180 ease-[ease] bg-olive-600 text-white px-[1.3125rem] py-[0.6875rem] border-[0.0625rem] border-transparent dark:bg-olive-400 dark:text-emerald-950 [&:active:not(:disabled)]:[transform:translateY(0.0625rem)] [&:hover:not(:disabled)]:bg-emerald-900 dark:[&:hover:not(:disabled)]:bg-olive-300"
        onClick={reset}
      >
        Try again
      </button>
    </div>
  );
}
