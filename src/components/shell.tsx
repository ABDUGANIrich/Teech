import Link from "next/link";
import { ArrowUpRight, Sprout } from "lucide-react";
export function Shell({
  children,
  signedIn = false,
}: {
  children: React.ReactNode;
  signedIn?: boolean;
}) {
  return (
    <>
      <a
        href="#main"
        className="skip-link fixed left-4 -top-20 bg-olive-600 text-white rounded-md z-100 px-5 py-3 dark:bg-olive-400 dark:text-emerald-950 focus:top-4"
      >
        Skip to content
      </a>
      <header className="header h-24.5 max-w-310 flex items-center justify-between border-b border-solid border-b-olive-300 m-auto px-12 py-0 dark:border-b-olive-700 [&_nav]:flex [&_nav]:items-center [&_nav]:gap-8 [&_nav]:text-[0.8125rem] [&_nav_>_a:hover]:text-emerald-700 dark:[&_nav_>_a:hover]:text-olive-300 max-layout:mx-6 max-layout:my-0 max-layout:px-2 max-layout:py-0 max-mobile:h-19.5 max-mobile:mx-5 max-mobile:my-0 max-mobile:p-0 max-mobile:[&_nav]:gap-4.25 max-mobile:[&_nav]:text-[0.6875rem] max-phone:h-auto max-phone:min-h-19.5 max-phone:gap-3.5 max-phone:flex-wrap max-phone:px-0 max-phone:py-4 max-phone:[&_nav]:w-full max-phone:[&_nav]:flex-wrap max-phone:[&_nav]:justify-between max-phone:[&_nav]:gap-3 max-phone:[&_nav_>_a]:whitespace-nowrap">
        <Link
          href="/"
          className="logo inline-flex items-center font-[750] text-[1.875rem] tracking-[-0.09375rem] leading-none max-mobile:text-[1.6875rem]"
          aria-label="Teech home"
        >
          <span className="brand-icon w-8.5 h-8.5 bg-olive-200 rounded-[0.625rem] grid place-items-center mr-2.25 text-olive-600 dark:bg-olive-800 dark:text-olive-400 max-mobile:w-7.5 max-mobile:h-7.5">
            <Sprout className="size-5.5" />
          </span>
          teech
          <span className="logo-dot text-olive-600 dark:text-olive-400">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/teacher-sample">Sage sample</Link>
          <Link href="/sample">Pip sample</Link>
          <Link
            href={signedIn ? "/library" : "/signin"}
            className="nav-account flex items-center gap-4 border-solid rounded-[0.4375rem] px-4.25 py-2.25 border border-stone-300 dark:border-olive-700 max-mobile:gap-1.75 max-mobile:px-2.75 max-mobile:py-1.75"
          >
            {signedIn ? "My library" : "Sign in"}
            <ArrowUpRight className="size-3.75" />
          </Link>
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer className="footer max-w-286 mt-12.5 mb-0 pt-6.5 pb-7.5 border-t border-solid border-t-olive-300 text-[0.6875rem] text-neutral-500 flex justify-between gap-4 mx-auto px-0 dark:border-t-olive-700 dark:text-olive-400 [&_span:last-child]:flex [&_span:last-child]:items-center [&_span:last-child]:gap-2 max-layout:mx-8 max-mobile:mt-8.75 max-mobile:mb-0 max-mobile:text-[0.5625rem] max-mobile:flex-col max-mobile:gap-1.75 max-mobile:mx-6 max-mobile:px-0 max-mobile:py-5.5">
        <span>A little explaining. A little understanding.</span>
        <span>
          Made for curious minds <Sprout className="size-3.5" />
        </span>
      </footer>
    </>
  );
}
