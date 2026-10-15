"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page narrow">
      <h1>A small pause.</h1>
      <p>
        Something couldn’t load. Your locally saved writing is still on this
        device.
      </p>
      <button className="button button-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
