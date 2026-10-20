export function Student({
  state = "listening",
  small = false,
  roleName = "student",
}: {
  state?: "listening" | "thinking" | "curious" | "happy";
  small?: boolean;
  roleName?: "student" | "teacher";
}) {
  return (
    <div
      className={`student w-50 max-w-full shrink-0 [&_svg]:w-full [&_svg]:h-auto [&_svg]:block [&.student-small]:w-[6.5625rem] [&.student-thinking]:animate-[sway_2.5s_ease-in-out_infinite] student-${state} ${small ? "student-small" : ""}`}
      role="img"
      aria-label={`Pip, your AI ${roleName}, is ${state}`}
    >
      <svg viewBox="0 0 220 220" fill="none" aria-hidden="true">
        <ellipse cx="112" cy="199" rx="61" ry="8" fill="#d7d7cb" opacity=".5" />
        <path
          d="M62 147C50 156 45 171 49 180M157 146C175 150 183 162 182 172"
          stroke="#323f34"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M85 176L80 194M139 176L144 194"
          stroke="#323f34"
          strokeWidth="10"
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
        <g className="student-eyes origin-center animate-[blink_8s_infinite]">
          <ellipse cx="89" cy="105" rx="5" ry="7" fill="#273c31" />
          <ellipse cx="139" cy="105" rx="5" ry="7" fill="#273c31" />
        </g>
        <ellipse cx="74" cy="123" rx="10" ry="5" fill="#a2bf78" />
        <ellipse cx="153" cy="123" rx="10" ry="5" fill="#a2bf78" />
        {state === "curious" ? (
          <ellipse
            cx="114"
            cy="127"
            rx="5"
            ry="7"
            stroke="#273c31"
            strokeWidth="2.5"
          />
        ) : (
          <path
            d="M104 125Q114 137 124 125"
            stroke="#273c31"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        )}
        <path
          d="M72 155L111 165L153 153L149 184L111 195L74 183Z"
          fill="#f9f7ee"
          stroke="#323f34"
          strokeWidth="2"
        />
        <path d="M111 165V194" stroke="#323f34" strokeWidth="2" />
        <path
          d="M85 168L99 172M124 173L139 168"
          stroke="#babdad"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {state === "curious" && (
          <text
            x="182"
            y="58"
            fontSize="32"
            fill="#54734f"
            fontFamily="Georgia"
          >
            ?
          </text>
        )}
        {state === "thinking" && (
          <g fill="#54734f">
            <circle cx="178" cy="59" r="3" />
            <circle cx="190" cy="52" r="4" />
            <circle cx="205" cy="47" r="5" />
          </g>
        )}
      </svg>
    </div>
  );
}
