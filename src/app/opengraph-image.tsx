import { ImageResponse } from "next/og";

export const alt =
  "Teech — Learn it. Practice it. Teach it. Learn with a teacher, then teach Pip.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#faf9f5",
        color: "#29342b",
        padding: "54px 64px",
        fontFamily: "sans-serif",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 30,
        }}
      >
        <span style={{ fontWeight: 700 }}>Teech.</span>
        <span style={{ fontSize: 17, color: "#667064", letterSpacing: 2 }}>
          A DIFFERENT WAY TO STUDY
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
        <div style={{ display: "flex", flexDirection: "column", width: 680 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 68,
              lineHeight: 1.08,
              letterSpacing: -3,
              fontWeight: 700,
            }}
          >
            <span>Learn it.</span>
            <span>Practice it.</span>
            <span style={{ color: "#405b43" }}>Teach it.</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 23,
              marginTop: 28,
              color: "#667064",
            }}
          >
            Learn with a teacher. Teach it back to Pip.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 310,
          }}
        >
          <svg width="300" height="300" viewBox="0 0 220 220" fill="none">
            <ellipse
              cx="112"
              cy="199"
              rx="61"
              ry="8"
              fill="#d7d7cb"
              opacity=".5"
            />
            <path
              d="M62 147C50 156 45 171 49 180M157 146C175 150 183 162 182 172M85 176L80 194M139 176L144 194"
              stroke="#323f34"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <path
              d="M55 92C51 65 69 42 94 43C107 24 140 29 149 52C179 54 190 81 175 103L176 155C172 188 63 189 55 156Z"
              fill="#c4d996"
              stroke="#323f34"
              strokeWidth="2.5"
            />
            <path
              d="M73 62C83 54 90 57 97 62"
              stroke="#edf3dc"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <ellipse cx="89" cy="105" rx="5" ry="7" fill="#273c31" />
            <ellipse cx="139" cy="105" rx="5" ry="7" fill="#273c31" />
            <ellipse cx="74" cy="123" rx="10" ry="5" fill="#a2bf78" />
            <ellipse cx="153" cy="123" rx="10" ry="5" fill="#a2bf78" />
            <path
              d="M104 125Q114 137 124 125"
              stroke="#273c31"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M72 155L111 165L153 153L149 184L111 195L74 183Z"
              fill="#f9f7ee"
              stroke="#323f34"
              strokeWidth="2"
            />
            <path
              d="M111 165V194M85 168L99 172M124 173L139 168"
              stroke="#babdad"
              strokeWidth="2"
            />
          </svg>
          <span style={{ fontSize: 22, color: "#405b43" }}>
            Meet Pip. Your curious student.
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          borderTop: "1px solid #dddfd5",
          paddingTop: 22,
          fontSize: 18,
          color: "#667064",
        }}
      >
        Short lessons. Thoughtful practice. A curious student.
      </div>
    </div>,
    size,
  );
}
