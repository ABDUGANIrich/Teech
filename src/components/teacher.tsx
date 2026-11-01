export function Teacher({
  small = false,
  svgSize = 220,
}: {
  small?: boolean;
  svgSize?: number;
}) {
  return (
    <div
      className={`teacher max-w-full shrink-0 [&_svg]:w-full [&_svg]:h-auto [&_svg]:block ${small ? "w-26.25" : "w-50"}`}
      style={{ display: "flex" }}
      role="img"
      aria-label="Sage, your AI teacher, a friendly owl with glasses"
    >
      <svg
        width={svgSize}
        height={svgSize}
        viewBox="0 0 220 220"
        fill="none"
        aria-hidden="true"
      >
        <ellipse cx="110" cy="201" rx="64" ry="8" fill="#b8aa91" opacity=".3" />
        <path
          d="M85 182L79 198M134 182L141 198"
          stroke="#66523f"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M57 83L48 37L84 54Q110 42 137 54L173 37L164 84Q182 114 166 160Q153 190 110 192Q67 190 53 161Q39 119 57 83Z"
          fill="#cfa871"
          stroke="#66523f"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path d="M58 51L65 76L82 63M162 51L155 76L138 63" fill="#eed8ad" />
        <path
          d="M63 86Q78 66 110 85Q143 65 158 86Q173 116 151 139Q133 154 110 140Q86 154 67 137Q48 115 63 86Z"
          fill="#f6ead2"
        />
        <path
          d="M75 145Q109 128 146 146L145 172Q110 189 76 172Z"
          fill="#eed8ad"
        />
        <g stroke="#66523f" strokeWidth="3">
          <circle cx="83" cy="106" r="21" />
          <circle cx="139" cy="106" r="21" />
          <path
            d="M104 104Q111 99 118 104M62 101L54 97M160 101L168 97"
            strokeLinecap="round"
          />
        </g>
        <g
          className="teacher-eyes origin-center animate-[blink_8s_infinite]"
          fill="#493e32"
        >
          <ellipse cx="85" cy="106" rx="4.5" ry="6.5" />
          <ellipse cx="137" cy="106" rx="4.5" ry="6.5" />
        </g>
        <path
          d="M103 124Q110 118 118 124L111 136Z"
          fill="#b78043"
          stroke="#66523f"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M61 131Q42 143 48 165Q52 175 65 170M160 130Q183 129 184 145Q185 154 174 158"
          fill="#cfa871"
          stroke="#66523f"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M174 150L199 101"
          stroke="#66523f"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle
          cx="200"
          cy="99"
          r="4"
          fill="#cfa871"
          stroke="#66523f"
          strokeWidth="2"
        />
        <path
          d="M69 158L108 166L151 155L148 184L109 196L72 186Z"
          fill="#7d8b76"
          stroke="#495b46"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M108 167L109 195M79 168L97 173M121 174L140 168"
          stroke="#dce1cb"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M91 59L96 67M109 56L110 65M127 60L123 68"
          stroke="#f6ead2"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
