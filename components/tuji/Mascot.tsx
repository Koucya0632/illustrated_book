// Tuji black-cat mascot. Ported from the Direction-B prototype: black
// silhouette, yellow eyes. Pure SVG so it works in server or client trees.
//
// poses:
//   'face'  — head only (round avatar)
//   'peek'  — head + paws peeking from below a card
//   'wave'  — front facing, one paw raised
//   'cheer' — both paws up + sparkles
//   'sleep' — curled with zZz (empty states)
//   'think' — paw to chin, "?" (question states)

export type MascotPose = "face" | "peek" | "wave" | "cheer" | "sleep" | "think";

export default function Mascot({
  pose = "peek",
  size = 80,
  color = "#0F1A1A",
  eye = "#FFD24A",
  className,
}: {
  pose?: MascotPose;
  size?: number;
  color?: string;
  eye?: string;
  className?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 100 100",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true as const,
    className,
  };

  if (pose === "face") {
    return (
      <svg {...common}>
        <path d="M22 38 L30 16 L42 30 Z" fill={color} />
        <path d="M78 38 L70 16 L58 30 Z" fill={color} />
        <path d="M28 28 L32 22 L36 28 Z" fill="#3A2A2A" opacity=".7" />
        <path d="M72 28 L68 22 L64 28 Z" fill="#3A2A2A" opacity=".7" />
        <ellipse cx="50" cy="55" rx="32" ry="30" fill={color} />
        <path d="M44 78 Q50 70 56 78 L54 88 Q50 90 46 88 Z" fill="#FFF" />
        <ellipse cx="38" cy="52" rx="6" ry="7" fill={eye} />
        <ellipse cx="62" cy="52" rx="6" ry="7" fill={eye} />
        <ellipse cx="38" cy="53" rx="2" ry="4" fill="#0F0F0F" />
        <ellipse cx="62" cy="53" rx="2" ry="4" fill="#0F0F0F" />
        <circle cx="36" cy="50" r="1.2" fill="#FFF" />
        <circle cx="60" cy="50" r="1.2" fill="#FFF" />
        <path d="M48 62 L52 62 L50 65 Z" fill="#E8A6A6" />
        <path
          d="M50 65 Q47 68 44 67 M50 65 Q53 68 56 67"
          stroke="#0F0F0F"
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M28 60 L18 58 M28 63 L18 64 M72 60 L82 58 M72 63 L82 64"
          stroke="#0F0F0F"
          strokeWidth=".8"
          strokeLinecap="round"
          opacity=".6"
        />
      </svg>
    );
  }

  if (pose === "peek") {
    return (
      <svg {...common}>
        <path d="M20 50 L28 26 L42 42 Z" fill={color} />
        <path d="M80 50 L72 26 L58 42 Z" fill={color} />
        <path d="M27 40 L31 32 L36 40 Z" fill="#3A2A2A" opacity=".7" />
        <path d="M73 40 L69 32 L64 40 Z" fill="#3A2A2A" opacity=".7" />
        <ellipse cx="50" cy="62" rx="34" ry="28" fill={color} />
        <ellipse cx="22" cy="88" rx="9" ry="6" fill={color} />
        <ellipse cx="78" cy="88" rx="9" ry="6" fill={color} />
        <circle cx="18" cy="86" r="1.2" fill="#3A2A2A" />
        <circle cx="22" cy="84" r="1.2" fill="#3A2A2A" />
        <circle cx="26" cy="86" r="1.2" fill="#3A2A2A" />
        <circle cx="74" cy="86" r="1.2" fill="#3A2A2A" />
        <circle cx="78" cy="84" r="1.2" fill="#3A2A2A" />
        <circle cx="82" cy="86" r="1.2" fill="#3A2A2A" />
        <ellipse cx="38" cy="58" rx="6" ry="8" fill={eye} />
        <ellipse cx="62" cy="58" rx="6" ry="8" fill={eye} />
        <ellipse cx="38" cy="60" rx="2" ry="4.5" fill="#0F0F0F" />
        <ellipse cx="62" cy="60" rx="2" ry="4.5" fill="#0F0F0F" />
        <circle cx="36" cy="55" r="1.4" fill="#FFF" />
        <circle cx="60" cy="55" r="1.4" fill="#FFF" />
        <path d="M48 70 L52 70 L50 73 Z" fill="#E8A6A6" />
        <path
          d="M50 73 Q47 76 44 75 M50 73 Q53 76 56 75"
          stroke="#0F0F0F"
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M28 68 L14 64 M28 72 L14 74 M72 68 L86 64 M72 72 L86 74"
          stroke="#0F0F0F"
          strokeWidth=".8"
          strokeLinecap="round"
          opacity=".5"
        />
        <path
          d="M88 18 L96 22 M88 24 L96 28 M88 30 L96 30"
          stroke={eye}
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity=".9"
        />
      </svg>
    );
  }

  if (pose === "cheer") {
    return (
      <svg {...common}>
        <path d="M14 28 l3 0 M15.5 26.5 l0 3" stroke={eye} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M84 30 l3 0 M85.5 28.5 l0 3" stroke={eye} strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="10" cy="48" r="1.4" fill={eye} />
        <circle cx="90" cy="50" r="1.4" fill={eye} />
        <ellipse cx="22" cy="40" rx="7" ry="9" fill={color} transform="rotate(-25 22 40)" />
        <ellipse cx="78" cy="40" rx="7" ry="9" fill={color} transform="rotate(25 78 40)" />
        <ellipse cx="50" cy="75" rx="26" ry="20" fill={color} />
        <path d="M28 48 L34 28 L46 42 Z" fill={color} />
        <path d="M72 48 L66 28 L54 42 Z" fill={color} />
        <ellipse cx="50" cy="58" rx="26" ry="24" fill={color} />
        <path d="M34 56 Q38 50 42 56" stroke="#0F0F0F" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M58 56 Q62 50 66 56" stroke="#0F0F0F" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M48 64 L52 64 L50 67 Z" fill="#E8A6A6" />
        <path d="M44 70 Q50 75 56 70" stroke="#0F0F0F" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    );
  }

  if (pose === "wave") {
    return (
      <svg {...common}>
        <ellipse cx="78" cy="42" rx="7" ry="9" fill={color} transform="rotate(20 78 42)" />
        <ellipse cx="50" cy="76" rx="28" ry="20" fill={color} />
        <path d="M28 48 L34 28 L46 42 Z" fill={color} />
        <path d="M72 48 L66 28 L54 42 Z" fill={color} />
        <ellipse cx="50" cy="58" rx="26" ry="24" fill={color} />
        <ellipse cx="40" cy="56" rx="5" ry="7" fill={eye} />
        <ellipse cx="60" cy="56" rx="5" ry="7" fill={eye} />
        <ellipse cx="40" cy="57" rx="1.8" ry="4" fill="#0F0F0F" />
        <ellipse cx="60" cy="57" rx="1.8" ry="4" fill="#0F0F0F" />
        <circle cx="38" cy="54" r="1.2" fill="#FFF" />
        <circle cx="58" cy="54" r="1.2" fill="#FFF" />
        <path d="M48 64 L52 64 L50 67 Z" fill="#E8A6A6" />
        <path d="M46 70 Q50 73 54 70" stroke="#0F0F0F" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </svg>
    );
  }

  if (pose === "sleep") {
    return (
      <svg {...common}>
        <text x="74" y="28" fontSize="14" fontWeight="700" fill={color} opacity=".5">z</text>
        <text x="82" y="20" fontSize="10" fontWeight="700" fill={color} opacity=".35">z</text>
        <ellipse cx="50" cy="65" rx="34" ry="20" fill={color} />
        <path d="M82 68 Q90 60 78 50" stroke={color} strokeWidth="9" fill="none" strokeLinecap="round" />
        <path d="M28 50 L34 36 L44 46 Z" fill={color} />
        <path d="M52 50 L58 36 L48 46 Z" fill={color} />
        <ellipse cx="40" cy="58" rx="18" ry="14" fill={color} />
        <path d="M30 56 Q33 54 36 56" stroke="#0F0F0F" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M44 56 Q47 54 50 56" stroke="#0F0F0F" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M38 62 L42 62 L40 64 Z" fill="#E8A6A6" />
      </svg>
    );
  }

  if (pose === "think") {
    return (
      <svg {...common}>
        <text x="78" y="28" fontSize="20" fontWeight="800" fill={eye}>?</text>
        <ellipse cx="62" cy="72" rx="6" ry="5" fill={color} transform="rotate(20 62 72)" />
        <ellipse cx="50" cy="78" rx="26" ry="18" fill={color} />
        <path d="M28 48 L34 28 L46 42 Z" fill={color} />
        <path d="M72 46 L62 30 L56 44 Z" fill={color} transform="rotate(-10 68 38)" />
        <ellipse cx="50" cy="58" rx="26" ry="24" fill={color} />
        <path d="M34 56 Q38 51 42 56" stroke="#0F0F0F" strokeWidth="2" fill="none" strokeLinecap="round" />
        <ellipse cx="60" cy="56" rx="5" ry="7" fill={eye} />
        <ellipse cx="60" cy="57" rx="1.8" ry="4" fill="#0F0F0F" />
        <circle cx="58" cy="54" r="1.2" fill="#FFF" />
        <path d="M48 64 L52 64 L50 67 Z" fill="#E8A6A6" />
        <path d="M50 67 Q47 70 44 69" stroke="#0F0F0F" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }

  return null;
}
