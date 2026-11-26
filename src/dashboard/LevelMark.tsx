// 상태 단계 표시 ([C] 토큰과 모양 규칙).
// 색만으로 구분하지 않도록 단계마다 고유한 모양을 함께 쓴다:
// 정상 작은 점(○/●), 주의 ● 원, 경고 ▲ 삼각형, 위험 ◆ 마름모, 초과 ■ 사각형+바깥 고리, 측정 없음 ◌ 점선 원.
import type { LevelKey } from "../logic/status";
import styles from "./LevelMark.module.css";

/** 단계 표시에 쓰는 종류. gap은 측정값이 없는 상태(측정 없음) */
export type MarkKey = LevelKey | "gap";

export default function LevelMark({ level, size = 14 }: { level: MarkKey; size?: number }) {
  return (
    <svg
      className={styles.mark}
      data-level={level}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      {level === "gap" && (
        <circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="2.6 2.2" />
      )}
      {level === "ok" && <circle cx="8" cy="8" r="4" fill="currentColor" />}
      {level === "caution" && <circle cx="8" cy="8" r="5.6" fill="currentColor" />}
      {level === "warn" && <path d="M8 1.8 15 14H1z" fill="currentColor" />}
      {level === "risk" && <path d="M8 1 15 8 8 15 1 8z" fill="currentColor" />}
      {level === "exceed" && (
        <>
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
          <rect x="4" y="4" width="8" height="8" rx="1.6" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
