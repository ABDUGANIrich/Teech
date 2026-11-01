import { ImageResponse } from "next/og";
import { Student } from "@/components/student";
import { Teacher } from "@/components/teacher";
import type { PublicPage } from "@/lib/site";

export const socialImageSize = { width: 1200, height: 630 };

const copy = {
  home: {
    eyebrow: "A DIFFERENT WAY TO STUDY",
    lines: ["Learn with Sage.", "Practice an idea.", "Choose what’s next."],
    note: "Teach Pip if you like, or keep learning with Sage.",
    footer:
      "Start with a topic or your notes. Already studied? Go straight to Pip.",
  },
  sage: {
    eyebrow: "THE SAGE SAMPLE",
    lines: ["One idea.", "A worked example.", "Your turn to try."],
    note: "Explore a fixed course with Sage, your AI teacher.",
    footer:
      "No account needed · Fixed demonstration · Open answers are not assessed",
  },
  pip: {
    eyebrow: "THE PIP SAMPLE",
    lines: ["Explain an idea.", "Answer a question.", "See what to revisit."],
    note: "Teach the water cycle to Pip, your curious student.",
    footer:
      "No account needed · Live AI when available, or a labeled fixed preview",
  },
} as const;

export function socialImage(page: PublicPage) {
  const content = copy[page];
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#faf9f5",
        color: "#29342b",
        padding: "48px 56px",
        fontFamily: "sans-serif",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 32 }}>teech.</span>
        <span style={{ fontSize: 16, color: "#667064", letterSpacing: 2 }}>
          {content.eyebrow}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 710 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 60,
              lineHeight: 1.15,
              letterSpacing: -2,
              fontWeight: 700,
            }}
          >
            {content.lines.map((line, index) => (
              <span
                key={line}
                style={{ color: index === 2 ? "#405b43" : "#29342b" }}
              >
                {line}
              </span>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              marginTop: 28,
              color: "#667064",
            }}
          >
            {content.note}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 290,
          }}
        >
          {page !== "pip" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexDirection: "column",
              }}
            >
              <Teacher svgSize={page === "home" ? 180 : 260} />
              <span style={{ fontSize: 19, color: "#66523f" }}>
                Learn with Sage
              </span>
            </div>
          )}
          {page !== "sage" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexDirection: "column",
              }}
            >
              <Student svgSize={page === "home" ? 180 : 260} />
              <span style={{ fontSize: 19, color: "#405b43" }}>
                {page === "home" ? "Teach Pip if you like" : "Teach Pip"}
              </span>
            </div>
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          borderTop: "1px solid #dddfd5",
          paddingTop: 20,
          fontSize: 18,
          color: "#667064",
        }}
      >
        {content.footer}
      </div>
    </div>,
    socialImageSize,
  );
}
