// 지도 시간 타임라인(6단계): 원본 지도의 아날로그 시계를 대신하는 30분 칸 타임라인.
// - 데스크톱·태블릿: ◀, ▶/⏸ 재생(1칸/0.8초), ▶, 슬라이더 핸들, [최신], 키보드 ←→·Home·End, 글자 14px 이상.
// - 과거 시점이면 주황 "과거 시점 HH:MM 보는 중" + "지도·경고 목록 타임라인 기준" 표시.
// - 휴대폰: ◀ ▶ [최신]만 보이고, 길게 누르면 재생 메뉴가 열린다.
// - 탭이 숨겨지면(docHidden) 자동 재생을 멈춘다.
import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "../agent/useMediaQuery";
import { formatSlot } from "../data/model";
import { useTheme } from "../theme/theme";
import styles from "./MapTimeline.module.css";

interface Props {
  times: readonly number[];
  slot: number;
  onSlot: (slot: number) => void;
}

/** 1칸당 0.8초(800ms) 재생 */
const PLAY_INTERVAL_MS = 800;

/** ms → KST "HH:MM" */
export function formatKstClock(ms: number): string {
  const s = formatSlot(ms); // "MM-DD HH:MM"
  const parts = s.split(" ");
  return parts[1] ?? s;
}

export default function MapTimeline({ times, slot, onSlot }: Props) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const { docHidden } = useTheme();
  const [playing, setPlaying] = useState(false);
  const [mobilePlayMenu, setMobilePlayMenu] = useState(false);
  const slotRef = useRef(slot);
  slotRef.current = slot;
  const pressTimer = useRef<number | null>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  const last = Math.max(times.length - 1, 0);
  const isPast = times.length > 0 && slot < last;
  const curMs = times[slot];
  const hhmm = curMs !== undefined ? formatKstClock(curMs) : "--:--";
  const fullLabel = curMs !== undefined ? formatSlot(curMs) : "";

  // 1칸 / 0.8초 자동 재생 (탭이 숨겨지면 잠시 멈춘다)
  useEffect(() => {
    if (!playing || docHidden) return;
    const id = window.setInterval(() => {
      const next = slotRef.current + 1;
      if (next > last) {
        setPlaying(false);
        return;
      }
      slotRef.current = next;
      onSlot(next);
      if (next >= last) setPlaying(false);
    }, PLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing, docHidden, last, onSlot]);

  // 휴대폰 재생 메뉴 바깥 클릭 닫기
  useEffect(() => {
    if (!mobilePlayMenu) return;
    const onDown = (e: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
        setMobilePlayMenu(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [mobilePlayMenu]);

  if (times.length === 0) return null;

  const stepPrev = () => {
    setPlaying(false);
    onSlot(Math.max(0, slot - 1));
  };
  const stepNext = () => {
    setPlaying(false);
    onSlot(Math.min(last, slot + 1));
  };
  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    // 맨 끝(최신)에서 재생을 누르면 처음(0칸)부터 재생
    if (slot >= last) onSlot(0);
    setPlaying(true);
  };
  const goLatest = () => {
    setPlaying(false);
    onSlot(last);
  };

  const onBarKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      stepPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      stepNext();
    } else if (e.key === "Home") {
      e.preventDefault();
      setPlaying(false);
      onSlot(0);
    } else if (e.key === "End") {
      e.preventDefault();
      goLatest();
    }
  };

  // 휴대폰 길게 누르기(450ms)로 재생 메뉴 열기
  const startLongPress = () => {
    if (!isMobile) return;
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      setMobilePlayMenu(true);
      pressTimer.current = null;
    }, 450);
  };
  const cancelLongPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  return (
    <div
      ref={menuWrapRef}
      className={styles.wrap}
      data-past={isPast ? "true" : undefined}
      role="region"
      aria-label="지도 시간 타임라인"
      onKeyDown={onBarKeyDown}
    >
      {isPast && (
        <div className={styles.pastBanner} role="status" aria-live="polite">
          <span className={styles.pastDot} aria-hidden="true" />
          <strong className={styles.pastText}>과거 시점 {hhmm} 보는 중</strong>
          <span className={styles.scopeNote}>지도·경고 목록 타임라인 기준</span>
        </div>
      )}

      <div className={styles.bar}>
        <button
          type="button"
          className={styles.stepBtn}
          aria-label="이전 30분"
          title="이전 30분 (←)"
          disabled={slot <= 0}
          onClick={stepPrev}
        >
          ◀
        </button>

        {!isMobile && (
          <button
            type="button"
            className={styles.playBtn}
            aria-label={playing ? "재생 멈춤" : "타임라인 재생"}
            aria-pressed={playing}
            title={playing ? "멈춤" : "자동 재생 (0.8초/칸)"}
            onClick={togglePlay}
          >
            {playing ? "⏸" : "▶"}
          </button>
        )}

        <button
          type="button"
          className={styles.stepBtn}
          aria-label="다음 30분"
          title="다음 30분 (→)"
          disabled={slot >= last}
          onClick={stepNext}
        >
          ▶
        </button>

        {isMobile ? (
          <button
            type="button"
            className={styles.mobileTimeBtn}
            aria-label={`현재 표시 시각 ${hhmm}. 길게 눌러 재생 메뉴 열기`}
            aria-expanded={mobilePlayMenu}
            onPointerDown={startLongPress}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onPointerCancel={cancelLongPress}
            onContextMenu={(e) => {
              e.preventDefault();
              setMobilePlayMenu((v) => !v);
            }}
            onClick={() => setMobilePlayMenu((v) => !v)}
          >
            <span>{hhmm}</span>
            <span className={styles.mobileHint}>{playing ? "재생 중" : "길게 눌러 재생"}</span>
          </button>
        ) : (
          <>
            <div className={styles.sliderWrap}>
              <input
                type="range"
                className={styles.slider}
                min={0}
                max={last}
                step={1}
                value={slot}
                aria-label="지도 시각"
                aria-valuetext={fullLabel}
                onChange={(e) => {
                  setPlaying(false);
                  onSlot(Number(e.target.value));
                }}
              />
            </div>
            <span className={styles.timeText} aria-live="off">
              <span className={styles.timeFull}>{fullLabel}</span>
              <span className={styles.timeShort}>{hhmm}</span>
            </span>
          </>
        )}

        <button
          type="button"
          className={styles.latestBtn}
          disabled={!isPast}
          onClick={goLatest}
        >
          최신
        </button>
      </div>

      {isMobile && mobilePlayMenu && (
        <div className={styles.mobileMenu} role="menu" aria-label="타임라인 재생 메뉴">
          <button
            type="button"
            role="menuitem"
            className={styles.mobileMenuItem}
            onClick={() => {
              togglePlay();
              setMobilePlayMenu(false);
            }}
          >
            {playing ? "⏸ 재생 멈춤" : "▶ 자동 재생 (0.8초/칸)"}
          </button>
        </div>
      )}
    </div>
  );
}
