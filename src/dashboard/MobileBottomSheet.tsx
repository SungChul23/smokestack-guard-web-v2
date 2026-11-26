// 휴대폰 아래 시트([D]): 세 높이(접힘 / 반 45% / 전체 90%)를 손잡이 끌기·누르기·키보드로 전환한다.
import { useRef, useState, type ReactNode } from "react";
import styles from "./MobileBottomSheet.module.css";

export type SheetSnap = "collapsed" | "half" | "full";
export type SheetTab = "favorites" | "alerts";

interface Props {
  snap: SheetSnap;
  onSnapChange: (next: SheetSnap) => void;
  tab: SheetTab;
  onTabChange: (next: SheetTab) => void;
  showingDetail: boolean;
  onBackFromDetail: () => void;
  favoritesCount: number;
  favoritesContent: ReactNode;
  alertsContent: ReactNode;
  detailContent?: ReactNode;
}

const NEXT_SNAP: Record<SheetSnap, SheetSnap> = {
  collapsed: "half",
  half: "full",
  full: "collapsed",
};

const SNAP_LABEL: Record<SheetSnap, string> = {
  collapsed: "접힘 · 눌러서 반 높이로 열기",
  half: "반 높이 · 눌러서 전체 높이로 열기",
  full: "전체 높이 · 눌러서 접기",
};

export default function MobileBottomSheet({
  snap,
  onSnapChange,
  tab,
  onTabChange,
  showingDetail,
  onBackFromDetail,
  favoritesCount,
  favoritesContent,
  alertsContent,
  detailContent,
}: Props) {
  const sheetRef = useRef<HTMLElement>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);

  const onHandlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const rect = sheet.getBoundingClientRect();
    dragRef.current = { startY: e.clientY, startH: rect.height, moved: false };
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onHandlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    const parentH = sheetRef.current?.parentElement?.clientHeight ?? window.innerHeight;
    if (!d || parentH <= 0) return;
    const dy = d.startY - e.clientY;
    if (Math.abs(dy) > 6) d.moved = true;
    if (!d.moved) return;
    const minH = 68;
    const maxH = parentH * 0.9;
    setDragHeight(Math.max(minH, Math.min(maxH, d.startH + dy)));
  };

  const finishDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!d || !d.moved) {
      setDragHeight(null);
      return;
    }
    const parentH = sheetRef.current?.parentElement?.clientHeight ?? window.innerHeight;
    const finalH = dragHeight ?? d.startH;
    const ratio = parentH > 0 ? finalH / parentH : 0.45;
    setDragHeight(null);
    if (ratio < 0.25) onSnapChange("collapsed");
    else if (ratio < 0.68) onSnapChange("half");
    else onSnapChange("full");
  };

  const onHandleClick = () => {
    // 끌기 직후가 아니면 높이 순환
    if (dragHeight !== null) return;
    onSnapChange(NEXT_SNAP[snap]);
  };

  return (
    <section
      ref={sheetRef}
      className={styles.sheet}
      data-snap={snap}
      data-dragging={dragHeight !== null ? "true" : undefined}
      style={dragHeight !== null ? { height: `${Math.round(dragHeight)}px` } : undefined}
      aria-label="목록 및 상세 시트"
    >
      <button
        type="button"
        className={styles.handleBtn}
        aria-label={`시트 높이 조절 (${SNAP_LABEL[snap]})`}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onClick={onHandleClick}
      >
        <span className={styles.handleBar} aria-hidden="true" />
      </button>

      <div className={styles.tabHeader}>
        {showingDetail ? (
          <>
            <button type="button" className={styles.backBtn} onClick={onBackFromDetail} aria-label="목록으로 돌아가기">
              ← 목록
            </button>
            <span className={styles.detailTitle}>사업장 상세</span>
          </>
        ) : (
          <div className={styles.tabs} role="tablist" aria-label="시트 보기 전환">
            <button
              type="button"
              role="tab"
              className={styles.tabBtn}
              aria-selected={tab === "favorites"}
              onClick={() => {
                onTabChange("favorites");
                if (snap === "collapsed") onSnapChange("half");
              }}
            >
              ★ 내 사업장 ({favoritesCount})
            </button>
            <button
              type="button"
              role="tab"
              className={styles.tabBtn}
              aria-selected={tab === "alerts"}
              onClick={() => {
                onTabChange("alerts");
                if (snap === "collapsed") onSnapChange("half");
              }}
            >
              경고 목록
            </button>
          </div>
        )}
      </div>

      <div className={styles.body}>
        {showingDetail ? detailContent : tab === "favorites" ? favoritesContent : alertsContent}
      </div>
    </section>
  );
}
