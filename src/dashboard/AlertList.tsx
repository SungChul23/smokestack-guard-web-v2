// 경고 목록([E-7], 6단계 [2]): 제목 "경고 목록 · 지도 안 N곳" + [전국으로] 토글. ☆ 버튼 제거.
// 내 주변 반경이 켜져 있으면 반경 안 경고를 "내 주변 N곳" 묶음으로 맨 위에 올린다.
// 한 줄 = [기호] 이름 · 시군 | NOx 114% (57.0 / 50 ppm) | ↑ 2시간째.
// 정렬: 단계 → 비율 내림차순. 주소 전체 대신 시·군만. 데스크톱 호버 시 지도 강조, 클릭 시 지도 이동 + 상세 서랍.
import { useMemo, useRef, useState } from "react";
import type { DayData, SiteState } from "../data/model";
import { labelOf, type LevelKey } from "../logic/status";
import { project, rankOf } from "../map/geometry";
import { showKeyOf } from "../map/mapFilter";
import { formatDistanceKm, sitesWithinRadius } from "../map/nearby";
import { useSelection, type MapBounds, type MapShowKey } from "../state/selection";
import styles from "./AlertList.module.css";
import LevelMark from "./LevelMark";
import { formatPpmPair, levelStreakAt, pollutantName, recentSparkline, shortRegion, worstDetailAt } from "./siteMetrics";
import { formatPct } from "./TrendChart";

const ROW = 74;
const OVERSCAN = 4;

export interface ListOptions {
  /** 목록 자체의 단계 필터(비어 있으면 모두) */
  statuses: LevelKey[];
  search: string;
  favorites: string[];
  /** 지도에 지금 보이는 범위(월드 좌표). 검색어가 없고 scope !== "nation"일 때만 쓴다. null이면 거르지 않는다 */
  bounds: MapBounds | null;
  /** 지도에서 켜 둔 상태(칩). 검색어가 없을 때만 쓴다. null이면 거르지 않는다 */
  mapLevels: readonly MapShowKey[] | null;
  /** 즐겨찾기 사업장만(내 사업장 목록): 정상·측정 없음도 포함하고 지도 범위·지도 상태 칩과 상관없이 전국에서 모은다 */
  favoritesOnly?: boolean;
  /** "nation"이면 지도 범위와 상관없이 전국 경고를 보여 준다 */
  scope?: "map" | "nation";
}

/** 사업장이 지도 범위 안에 있는지 */
export function inBounds(s: SiteState, b: MapBounds): boolean {
  const [x, y] = project(s.site.lon, s.site.lat);
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
}

/** 목록에 보일 사업장을 고른다(순수 함수). 정렬: 단계 → 비율 내림차순 */
export function listAlerts(states: SiteState[], opts: ListOptions): SiteState[] {
  const q = opts.search.trim().toLowerCase();
  const fav = new Set(opts.favorites);
  const shown = opts.mapLevels ? new Set<string>(opts.mapLevels) : null;
  const out = states.filter((s) => {
    if (opts.favoritesOnly && !fav.has(s.site.id)) return false;
    if (opts.statuses.length && !(s.level && opts.statuses.includes(s.level))) return false;
    if (opts.favoritesOnly && !q) return true;
    if (q) {
      return `${s.site.name} ${s.site.sido} ${s.site.sigungu} ${s.site.address} ${s.site.id}`.toLowerCase().includes(q);
    }
    if (!s.level || s.level === "ok") return false;
    if (opts.scope !== "nation") {
      if (shown && !shown.has(showKeyOf(s))) return false;
      if (opts.bounds && !inBounds(s, opts.bounds)) return false;
    }
    return true;
  });
  return out.sort((a, b) => rankOf(b.level) - rankOf(a.level) || (b.ratio ?? -1) - (a.ratio ?? -1));
}

interface Props {
  states: SiteState[];
  day?: DayData;
  slot?: number;
  /** 타임라인에서 과거 시점을 보고 있을 때("HH:MM") */
  pastTimeLabel?: string | null;
}

export default function AlertList({ states, day, slot = 0, pastTimeLabel = null }: Props) {
  const mapBounds = useSelection((s) => s.mapBounds);
  const mapLevels = useSelection((s) => s.mapLevels);
  const statuses = useSelection((s) => s.statusFilter);
  const search = useSelection((s) => s.search);
  const favorites = useSelection((s) => s.favorites);
  const selectedSiteId = useSelection((s) => s.selectedSiteId);
  const selectSite = useSelection((s) => s.selectSite);
  const clearSelection = useSelection((s) => s.clearSelection);
  const setHoveredSite = useSelection((s) => s.setHoveredSite);
  const setSearch = useSelection((s) => s.setSearch);
  const favoritesOnly = useSelection((s) => s.favoritesOnly);
  const setFavoritesOnly = useSelection((s) => s.setFavoritesOnly);
  const nearby = useSelection((s) => s.nearby);
  const setNearby = useSelection((s) => s.setNearby);

  const [scope, setScope] = useState<"map" | "nation">("map");

  const searching = search.trim() !== "";
  const nearbyMatches = useMemo(() => {
    if (!nearby) return [];
    const within = sitesWithinRadius(states, nearby);
    return within.filter(({ state: s }) => {
      if (statuses.length && !(s.level && statuses.includes(s.level))) return false;
      if (!s.level || s.level === "ok") return false;
      return true;
    });
  }, [states, nearby, statuses]);

  const nearbyIds = useMemo(() => new Set(nearbyMatches.map((m) => m.state.site.id)), [nearbyMatches]);

  const rows = useMemo(() => {
    const all = listAlerts(states, { statuses, search, favorites, bounds: mapBounds, mapLevels, favoritesOnly, scope });
    if (!nearby || nearbyIds.size === 0) return all;
    return all.filter((s) => !nearbyIds.has(s.site.id));
  }, [states, statuses, search, favorites, mapBounds, mapLevels, favoritesOnly, scope, nearby, nearbyIds]);

  const boxRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const height = boxRef.current?.clientHeight || 420;
  const first = Math.max(0, Math.floor(top / ROW) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((top + height) / ROW) + OVERSCAN);

  const totalShown = rows.length + nearbyMatches.length;
  const headingSub = favoritesOnly
    ? searching
      ? `즐겨찾기 검색 ${totalShown}곳`
      : `내 즐겨찾기 ${totalShown}곳`
    : searching
      ? `전국 검색 결과 ${totalShown}곳`
      : scope === "nation"
        ? `전국 ${totalShown}곳`
        : `지도 안 ${totalShown}곳`;

  const renderRowButton = (s: SiteState, distanceLabel?: string) => {
    const picked = s.site.id === selectedSiteId;
    const level = s.level ?? "gap";
    const detail = day ? worstDetailAt(s.site, day, slot) : null;
    const spark = day ? recentSparkline(s.site, day, slot, 12) : null;
    const streak = day ? levelStreakAt(s.site, day, slot) : null;
    const pName = detail ? pollutantName(detail.pollutant) : "";
    const ppmText = detail ? formatPpmPair(detail.value, detail.limit) : null;
    const ratioText = s.ratio === null ? "—" : formatPct(s.ratio);
    const region = shortRegion(s.site);

    return (
      <button
        type="button"
        className={styles.main}
        onClick={() => (picked ? clearSelection() : selectSite(s.site.id, s.worstStack))}
        aria-current={picked ? "true" : undefined}
      >
        <span className={styles.markCol}>
          <LevelMark level={level} size={20} />
          <span className={styles.levelLabel}>{s.level ? labelOf(s.level) : "측정 없음"}</span>
        </span>

        <span className={styles.bodyCol}>
          <span className={styles.topLine}>
            <span className={styles.name}>{s.site.name}</span>
            <span className={styles.sep} aria-hidden="true">·</span>
            <span className={styles.region}>{distanceLabel ? `${distanceLabel} · ${region}` : region}</span>
          </span>
          <span className={styles.subLine}>
            {s.ratio === null ? (
              <span className={styles.mutedText}>측정 없음</span>
            ) : (
              <>
                <span className={styles.pollutant}>
                  {pName ? `${pName} ` : ""}
                  {ratioText}
                </span>
                {ppmText && <span className={styles.ppm}>({ppmText})</span>}
              </>
            )}
          </span>
        </span>

        <span className={styles.rightCol}>
          <span className={styles.ratio} data-level={level}>
            {ratioText}
          </span>
          {spark && streak?.durationLabel ? (
            <span className={styles.trend} data-dir={spark.direction}>
              {spark.arrow} {streak.durationLabel}
            </span>
          ) : spark ? (
            <span className={styles.trend} data-dir={spark.direction}>
              {spark.arrow}
            </span>
          ) : null}
        </span>
      </button>
    );
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h2 id="h-alerts" className={styles.title} aria-live="polite">
          경고 목록 · {headingSub}
        </h2>
        <button
          type="button"
          className={styles.scopeBtn}
          aria-pressed={scope === "nation"}
          onClick={() => setScope((s) => (s === "map" ? "nation" : "map"))}
        >
          {scope === "nation" ? "지도 안으로" : "전국으로"}
        </button>
      </div>

      {pastTimeLabel && (
        <div className={styles.timelineTag} role="status">
          타임라인 {pastTimeLabel} 기준
        </div>
      )}

      <div className={styles.searchRow}>
        <input
          className={styles.search}
          type="search"
          placeholder="사업장명·시군·코드 검색 (전국)"
          aria-label="경고 목록 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          className={styles.favOnlyBtn}
          aria-pressed={favoritesOnly}
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          aria-label="즐겨찾기만 보기"
          title="즐겨찾기한 사업장만 지도와 목록에 보입니다"
        >
          ★
        </button>
      </div>

      {nearby && (
        <section className={styles.nearbySection} aria-label="내 주변 경고">
          <div className={styles.nearbyHead}>
            <strong>내 주변 {nearbyMatches.length}곳</strong>
            <span className={styles.nearbySub}>
              {nearby.label ? `${nearby.label} · ` : ""}반경 {nearby.radiusKm}km
            </span>
            <button type="button" className={styles.nearbyReset} onClick={() => setNearby(null)}>
              해제
            </button>
          </div>
          {nearbyMatches.length === 0 ? (
            <p className={styles.nearbyEmpty}>반경 {nearby.radiusKm}km 안에 경고 사업장이 없습니다.</p>
          ) : (
            <div className={styles.nearbyList} role="list" aria-label="내 주변 경고 목록">
              {nearbyMatches.map(({ state: s, distanceKm }) => {
                const picked = s.site.id === selectedSiteId;
                return (
                  <div
                    key={s.site.id}
                    role="listitem"
                    className={styles.nearbyRow}
                    data-picked={picked || undefined}
                    onMouseEnter={() => setHoveredSite(s.site.id)}
                    onMouseLeave={() => setHoveredSite(null)}
                  >
                    {renderRowButton(s, formatDistanceKm(distanceKm))}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {rows.length === 0 && nearbyMatches.length === 0 ? (
        <p className={styles.empty}>
          {favoritesOnly
            ? searching
              ? "즐겨찾기 안에 검색 결과가 없습니다."
              : "즐겨찾기한 사업장이 없습니다. 사업장 상세에서 ☆을 눌러 추가하세요."
            : searching
              ? "검색 결과가 없습니다."
              : scope === "map"
                ? "지금 지도에 보이는 경고가 없습니다. [전국으로]를 누르거나 검색해 보세요."
                : "조건에 맞는 경고 사업장이 없습니다."}
        </p>
      ) : rows.length > 0 ? (
        <div
          ref={boxRef}
          className={styles.scroll}
          onScroll={(e) => setTop(e.currentTarget.scrollTop)}
          role="list"
          aria-label="경고 목록"
        >
          <div style={{ height: rows.length * ROW, position: "relative" }}>
            {rows.slice(first, last).map((s, i) => {
              const idx = first + i;
              const picked = s.site.id === selectedSiteId;
              return (
                <div
                  key={s.site.id}
                  role="listitem"
                  className={styles.row}
                  data-picked={picked || undefined}
                  style={{ top: idx * ROW, height: ROW }}
                  onMouseEnter={() => setHoveredSite(s.site.id)}
                  onMouseLeave={() => setHoveredSite(null)}
                >
                  {renderRowButton(s)}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
