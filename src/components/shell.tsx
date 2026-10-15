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
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="header">
        <Link href="/" className="logo" aria-label="Teech home">
          <span className="brand-icon">
            <Sprout size={22} />
          </span>
          teech<span className="logo-dot">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/sample">Try a sample</Link>
          <Link
            href={signedIn ? "/library" : "/signin"}
            className="nav-account"
          >
            {signedIn ? "My library" : "Sign in"}
            <ArrowUpRight size={15} />
          </Link>
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer className="footer">
        <span>A little explaining. A little understanding.</span>
        <span>
          Made for curious minds <Sprout size={14} />
        </span>
      </footer>
    </>
  );
}
