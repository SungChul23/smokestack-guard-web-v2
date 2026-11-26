// 내 사업장([E-6]): 즐겨찾기한 사업장 목록. 한 줄에 단계·이름·시군·최고물질·비율·6시간 미니추세·방향(↑↓→)·⋯ 메뉴.
import { useEffect, useRef, useState } from "react";
import type { DayData, SiteState } from "../data/model";
import { useSelection } from "../state/selection";
import LevelMark from "./LevelMark";
import MiniSparkline from "./MiniSparkline";
import { pollutantName, recentSparkline, shortRegion, worstDetailAt } from "./siteMetrics";
import { formatPct } from "./TrendChart";
import styles from "./MySitesPanel.module.css";

interface Props {
  states: SiteState[];
  day: DayData;
  slot: number;
}

export default function MySitesPanel({ states, day, slot }: Props) {
  const selectedSiteId = useSelection((s) => s.selectedSiteId);
  const selectSite = useSelection((s) => s.selectSite);
  const toggleFavorite = useSelection((s) => s.toggleFavorite);
  const setHoveredSite = useSelection((s) => s.setHoveredSite);
  const [menuId, setMenuId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!menuId) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuId(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menuId]);

  if (states.length === 0) {
    return <p className={styles.empty}>사업장 상세에서 ☆을 눌러 추가하세요</p>;
  }

  return (
    <ul ref={wrapRef} className={styles.list} aria-label="내 사업장 목록">
      {states.map((st) => {
        const detail = worstDetailAt(st.site, day, slot);
        const spark = recentSparkline(st.site, day, slot, 12);
        const picked = selectedSiteId === st.site.id;
        const pLabel = pollutantName(detail.pollutant);
        const menuOpen = menuId === st.site.id;

        return (
          <li
            key={st.site.id}
            className={styles.item}
            data-selected={picked || undefined}
            onMouseEnter={() => setHoveredSite(st.site.id)}
            onMouseLeave={() => setHoveredSite(null)}
          >
            <button
              type="button"
              className={styles.rowBtn}
              aria-current={picked ? "true" : undefined}
              onClick={() => selectSite(st.site.id, st.worstStack)}
            >
              <LevelMark level={st.level ?? "gap"} size={20} />
              <span className={styles.meta}>
                <span className={styles.name}>{st.site.name}</span>
                <span className={styles.sub}>
                  {shortRegion(st.site)} · {pLabel || "측정 없음"}
                </span>
              </span>
              <span className={styles.right}>
                <span className={styles.sparkWrap}>
                  <MiniSparkline points={spark.points} level={st.level} width={48} height={22} />
                  <span className={styles.arrow} data-dir={spark.direction} aria-hidden="true">
                    {spark.arrow}
                  </span>
                </span>
                <span className={styles.ratio} data-level={st.level ?? "gap"}>
                  {st.ratio !== null ? formatPct(st.ratio) : "—"}
                </span>
              </span>
            </button>

            <div className={styles.moreWrap}>
              <button
                type="button"
                className={styles.moreBtn}
                aria-label={`${st.site.name} 메뉴`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId((cur) => (cur === st.site.id ? null : st.site.id));
                }}
              >
                ⋯
              </button>
              {menuOpen && (
                <div className={styles.menu} role="menu" aria-label={`${st.site.name} 작업`}>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={() => {
                      setMenuId(null);
                      selectSite(st.site.id, st.worstStack);
                    }}
                  >
                    상세 보기
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={`${styles.menuItem} ${styles.menuDanger}`}
                    onClick={() => {
                      setMenuId(null);
                      toggleFavorite(st.site.id);
                    }}
                  >
                    즐겨찾기 해제
                  </button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
