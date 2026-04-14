/** Horizontal gradient bar — CodeBurn-inspired */

interface Props {
  /** 0–1 fraction filled */
  value: number;
  /** Bar width in px (default 80) */
  width?: number;
  /** Bar height in px (default 10) */
  height?: number;
}

/** Interpolate blue → amber → orange based on percentage */
function gradientColor(pct: number): string {
  // blue(137,180,250) → amber(249,226,175) → orange(250,179,135)
  if (pct <= 0.5) {
    const t = pct / 0.5;
    const r = Math.round(137 + (249 - 137) * t);
    const g = Math.round(180 + (226 - 180) * t);
    const b = Math.round(250 + (175 - 250) * t);
    return `rgb(${r},${g},${b})`;
  }
  const t = (pct - 0.5) / 0.5;
  const r = Math.round(249 + (250 - 249) * t);
  const g = Math.round(226 + (179 - 226) * t);
  const b = Math.round(175 + (135 - 175) * t);
  return `rgb(${r},${g},${b})`;
}

export function HBar({ value, width = 80, height = 10 }: Props) {
  const clamped = Math.max(0, Math.min(1, value));
  const filledW = Math.round(clamped * width);

  return (
    <div
      style={{
        display: "inline-flex",
        width,
        height,
        borderRadius: 3,
        overflow: "hidden",
        background: "rgba(69,71,90,0.3)",
        flexShrink: 0,
      }}
    >
      {filledW > 0 && (
        <div
          style={{
            width: filledW,
            height: "100%",
            background: `linear-gradient(90deg, ${gradientColor(0)}, ${gradientColor(clamped)})`,
            borderRadius: 3,
          }}
        />
      )}
    </div>
  );
}
