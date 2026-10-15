import Link from "next/link";
export default function NotFound() {
  return (
    <div className="page narrow">
      <h1>This page wandered off.</h1>
      <p>Let’s get you back to a familiar place.</p>
      <Link className="button button-primary" href="/">
        Back to Teech
      </Link>
    </div>
  );
}
