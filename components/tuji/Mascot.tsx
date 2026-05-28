// Tuji black-cat mascot. The public API is intentionally unchanged so every
// page can keep choosing a pose/size while the artwork comes from shared PNGs.

export type MascotPose = "face" | "peek" | "wave" | "cheer" | "sleep" | "think";

const POSE_SRC: Record<MascotPose, string> = {
  face: "/mascot/tuji-face.png",
  peek: "/mascot/tuji-peek.png",
  wave: "/mascot/tuji-wave.png",
  cheer: "/mascot/tuji-cheer.png",
  sleep: "/mascot/tuji-sleep.png",
  think: "/mascot/tuji-think.png",
};

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
  void color;
  void eye;

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "block",
        width: size,
        height: size,
        lineHeight: 0,
        flexShrink: 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={POSE_SRC[pose]}
        alt=""
        draggable={false}
        width={size}
        height={size}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: "contain",
          userSelect: "none",
        }}
      />
    </span>
  );
}
