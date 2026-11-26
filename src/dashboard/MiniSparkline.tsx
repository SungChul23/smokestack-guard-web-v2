// 최근 6시간 미니 추세선(SVG). 내 사업장 줄과 상세 서랍 개요 탭에서 재사용한다.
import type { LevelKey } from "../logic/status";

interface Props {
  points: ReadonlyArray<number | null>;
  level?: LevelKey | null;
  width?: number;
  height?: number;
  showThreshold?: boolean;
  className?: string;
}

export default function MiniSparkline({
  points,
  level = null,
  width = 56,
  height = 24,
  showThreshold = false,
  className,
}: Props) {
  const valid = points.filter((v): v is number => v !== null);
  const maxVal = Math.max(115, ...valid, 100);
  const padX = 2;
  const padY = 3;
  const iw = Math.max(1, width - padX * 2);
  const ih = Math.max(1, height - padY * 2);
  const n = Math.max(2, points.length);
  const xOf = (i: number) => padX + (i / (n - 1)) * iw;
  const yOf = (v: number) => padY + ih - (Math.max(0, Math.min(v, maxVal)) / maxVal) * ih;

  // 결측(null)에서 선을 끊는다
  const paths: string[] = [];
  let cur: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const v = points[i];
    if (v === null) {
      if (cur.length > 0) {
        paths.push(cur.join(" "));
        cur = [];
      }
    } else {
      cur.push(`${cur.length === 0 ? "M" : "L"}${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`);
    }
  }
  if (cur.length > 0) paths.push(cur.join(" "));

  const stroke = level && level !== "ok" ? `var(--lv-${level})` : "var(--accent)";
  const y100 = yOf(100);
  const lastIdx = (() => {
    for (let i = points.length - 1; i >= 0; i--) if (points[i] !== null) return i;
    return -1;
  })();

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      {showThreshold && (
        <line
          x1={padX}
          x2={width - padX}
          y1={y100}
          y2={y100}
          stroke="var(--lv-exceed)"
          strokeOpacity="0.45"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      )}
      {paths.map((d, idx) => (
        <path
          key={idx}
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {lastIdx >= 0 && points[lastIdx] !== null && (
        <circle cx={xOf(lastIdx)} cy={yOf(points[lastIdx]!)} r="2.3" fill={stroke} />
      )}
    </svg>
  );
}
