// 굴뚝 SVG 로고 + 자연스러운 연기 애니메이션([추가 2], [추가 3], [5]).
// feGaussianBlur로 부드럽게 겹친 연기 덩어리 5개가 0.8초 간격, 4.5초 주기로
// 굴뚝 입구에서 작게 나와 좌우로 살짝 흔들리며 바람 방향으로 커지고 옅어져 사라진다.
// 전국 최신 상태(초과 진홍 / 위험 빨강 / 그 외 회색·하늘색)에 따라 1초에 걸쳐 색이 전환된다.
// 화면 효과가 꺼졌거나 움직임 줄이기·탭 숨김 상태이면 정지된 그림 한 장으로 표시된다.
import { useId } from "react";
import { useTheme } from "../theme/theme";
import type { SmokeTone } from "./freshness";
import styles from "./BrandLogo.module.css";

interface Props {
  tone: SmokeTone;
  size?: number;
}

export default function BrandLogo({ tone, size = 40 }: Props) {
  const { reducedMotion } = useTheme();
  const filterId = `smoke-blur-${useId().replace(/:/g, "")}`;
  return (
    <svg
      className={styles.logo}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      data-tone={tone}
      data-paused={reducedMotion ? "true" : "false"}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.7" />
        </filter>
      </defs>

      {/* 굴뚝 입구에서 부드럽게 겹쳐 피어오르는 연기 덩어리 5개 */}
      <g className={styles.plume} filter={`url(#${filterId})`}>
        <circle cx="17.5" cy="17.5" r="3.4" className={`${styles.puff} ${styles.puffCore} ${styles.p1}`} />
        <circle cx="19.5" cy="15" r="3.8" className={`${styles.puff} ${styles.puffCore} ${styles.p2}`} />
        <circle cx="22.5" cy="12" r="4.2" className={`${styles.puff} ${styles.p3}`} />
        <circle cx="25.5" cy="9" r="4.5" className={`${styles.puff} ${styles.p4}`} />
        <circle cx="28.5" cy="6.5" r="4.1" className={`${styles.puff} ${styles.p5}`} />
      </g>

      {/* 메인 굴뚝 + 보조 굴뚝 */}
      <path d="M13 35 L14.8 18.5 L20.2 18.5 L22 35 Z" className={styles.stackBody} />
      <path d="M15.1 22.8 H19.9" className={styles.stackStripe} />
      <path d="M7.5 35 L8.8 25 L12.5 25 L13.4 35 Z" className={styles.stackBody} />
      <path d="M22.8 35 L23.6 27 L27.2 27 L28.2 35 Z" className={styles.stackBody} />
      <path d="M5 35.2 H32" className={styles.stackBase} />
    </svg>
  );
}
