// 사업장 상세 서랍(4단계 · 설계 추가 4):
// - 맨 위: 크롬형 사업장 탭(최대 6개, × 닫기, 휴대폰 가로 스크롤).
// - 그 아래 머리: 이름 20px + 단계 기호·글자 + ☆ + ×, 시·군 한 줄.
// - 그 아래 내용 탭(role=tablist, ←→·Home/End): 개요 | 추세 | 굴뚝별 | AI에게 묻기.
//   기본은 개요, 초과·위험이면 추세.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { formatSlot, siteStateAt, type DayData, type Site } from "../data/model";
import { labelOf } from "../logic/status";
import { isPreviewMode } from "../preview/mode"; // PREVIEW-ONLY
import { useSelection } from "../state/selection";
import { CloseIcon } from "./icons";
import LevelMark from "./LevelMark";
import MiniSparkline from "./MiniSparkline";
import {
  defaultDetailTab,
  formatPpmPair,
  levelStreakAt,
  missingSlotsCount,
  pollutantName,
  recentSparkline,
  shortRegion,
  stackRowsAt,
  worstDetailAt,
  type DetailTabKey,
} from "./siteMetrics";
import TrendChart, { formatPct } from "./TrendChart";
import styles from "./SiteDetailDrawer.module.css";

const CONTENT_TABS: ReadonlyArray<{ key: DetailTabKey; label: string }> = [
  { key: "overview", label: "개요" },
  { key: "trend", label: "추세" },
  { key: "stacks", label: "굴뚝별" },
  { key: "ai", label: "AI에게 묻기" },
];

export interface SiteAiContext {
  siteId: string;
  siteName: string;
  stackCode: string | null;
  summary: string;
  initialPrompt?: string;
}

interface Props {
  site: Site;
  sites: ReadonlyArray<Site>;
  day: DayData;
  slot: number;
  onClose: () => void;
  onAskAi?: (ctx: SiteAiContext) => void;
}

export default function SiteDetailDrawer({ site, sites, day, slot, onClose, onAskAi }: Props) {
  const openTabs = useSelection((s) => s.openTabs);
  const selectSite = useSelection((s) => s.selectSite);
  const selectStack = useSelection((s) => s.selectStack);
  const closeTab = useSelection((s) => s.closeTab);
  const stackCode = useSelection((s) => s.selectedStackCode);
  const isFavorite = useSelection((s) => s.favorites.includes(site.id));
  const toggleFavorite = useSelection((s) => s.toggleFavorite);

  const state = useMemo(() => siteStateAt(site, day, slot), [site, day, slot]);
  const detail = useMemo(() => worstDetailAt(site, day, slot), [site, day, slot]);
  const streak = useMemo(() => levelStreakAt(site, day, slot), [site, day, slot]);
  const spark = useMemo(() => recentSparkline(site, day, slot, 12), [site, day, slot]);
  const missingCount = useMemo(() => missingSlotsCount(site, day, slot), [site, day, slot]);
  const stackRows = useMemo(() => stackRowsAt(site, day, slot), [site, day, slot]);

  // 사업장이 바뀔 때마다 기본 탭(초과·위험 → 추세, 그 밖 → 개요)으로 맞춘다
  const [tab, setTab] = useState<DetailTabKey>(() => defaultDetailTab(state.level));
  const prevSiteId = useRef(site.id);
  useEffect(() => {
    if (prevSiteId.current !== site.id) {
      prevSiteId.current = site.id;
      setTab(defaultDetailTab(state.level));
    }
  }, [site.id, state.level]);

  const tabBtnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const siteTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const tabSites = useMemo(() => {
    const ids = openTabs.includes(site.id) ? openTabs : [...openTabs, site.id];
    return ids.map((id) => siteMap.get(id)).filter((s): s is Site => Boolean(s));
  }, [openTabs, site.id, siteMap]);

  const activeStack = stackCode ?? state.worstStack ?? site.stacks[0]?.code ?? null;
  const latestTime = day.times[slot] !== undefined ? formatSlot(day.times[slot]) : "";
  const levelText = state.level ? labelOf(state.level) : "측정 없음";
  const worstRatioText = detail.ratio !== null ? formatPct(detail.ratio) : "—";
  const worstPollutantText = pollutantName(detail.pollutant);
  const preview = isPreviewMode(); // PREVIEW-ONLY

  const onContentTabKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, idx: number) => {
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % CONTENT_TABS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + CONTENT_TABS.length) % CONTENT_TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = CONTENT_TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(CONTENT_TABS[next].key);
    tabBtnRefs.current[next]?.focus();
  };

  const onSiteTabKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (tabSites.length <= 1) return;
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % tabSites.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabSites.length) % tabSites.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabSites.length - 1;
    else return;
    e.preventDefault();
    const target = tabSites[next];
    if (target) {
      selectSite(target.id);
      siteTabRefs.current[next]?.focus();
    }
  };

  const aiSummary = `${site.name} (${shortRegion(site)}) · 굴뚝 ${activeStack ?? "—"} · ${levelText}${
    detail.ratio !== null ? ` (${worstPollutantText} ${worstRatioText})` : ""
  }`;
  const aiStarters = [
    `${site.name} 최근 6시간 추세를 요약해 줘`,
    `굴뚝 ${activeStack ?? "1"} ${worstPollutantText || "NOx"} 상승 원인 점검 항목은?`,
    `${shortRegion(site)} 인근 사업장 현황과 비교해 줘`,
  ];

  const triggerAi = (prompt?: string) => {
    onAskAi?.({
      siteId: site.id,
      siteName: site.name,
      stackCode: activeStack,
      summary: aiSummary,
      initialPrompt: prompt,
    });
  };

  return (
    <div className={styles.drawerInner}>
      {/* ── 1. 맨 위: 크롬형 사업장 탭 (최대 6개, 가로 스크롤) ── */}
      {tabSites.length > 0 && (
        <div className={styles.siteTabs} role="tablist" aria-label="열린 사업장 탭">
          {tabSites.map((ts, i) => {
            const active = ts.id === site.id;
            const tsState = siteStateAt(ts, day, slot);
            return (
              <div key={ts.id} className={styles.siteTabWrap} data-active={active || undefined}>
                <button
                  ref={(el) => {
                    siteTabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  className={styles.siteTabBtn}
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => selectSite(ts.id)}
                  onKeyDown={(e) => onSiteTabKeyDown(e, i)}
                >
                  <LevelMark level={tsState.level ?? "gap"} size={14} />
                  <span className={styles.siteTabName}>{ts.name}</span>
                </button>
                <button
                  type="button"
                  className={styles.siteTabClose}
                  aria-label={`${ts.name} 탭 닫기`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(ts.id);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 2. 머리: 사업장 이름 20px + 단계 기호·글자 + ☆ + × / 시·군 한 줄 ── */}
      <header className={styles.head}>
        <div className={styles.headTop}>
          <h3 className={styles.siteName}>{site.name}</h3>
          <span className={styles.levelBadge} data-level={state.level ?? "gap"}>
            <LevelMark level={state.level ?? "gap"} size={16} />
            <span>{levelText}</span>
          </span>
          <div className={styles.headActions}>
            <button
              type="button"
              className={styles.starBtn}
              aria-pressed={isFavorite}
              aria-label={`${site.name} 즐겨찾기`}
              onClick={() => toggleFavorite(site.id)}
            >
              {isFavorite ? "★" : "☆"}
            </button>
            <button
              type="button"
              className={styles.closeBtn}
              aria-label="상세 패널 닫기"
              title="닫기 (Esc)"
              onClick={onClose}
            >
              <CloseIcon size={24} />
            </button>
          </div>
        </div>
        <div className={styles.headSub}>
          <span className={styles.region}>
            {shortRegion(site)}
            {activeStack ? ` · 굴뚝 ${activeStack}` : ""}
          </span>
          {latestTime && <span className={styles.time}>{latestTime} 기준</span>}
        </div>
      </header>

      {/* ── 3. 내용 탭 (role=tablist, ←→·Home/End) ── */}
      <div className={styles.contentTabs} role="tablist" aria-label="상세 내용 탭">
        {CONTENT_TABS.map((t, idx) => {
          const selected = tab === t.key;
          return (
            <button
              key={t.key}
              ref={(el) => {
                tabBtnRefs.current[idx] = el;
              }}
              id={`detail-tab-${t.key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`detail-panel-${t.key}`}
              tabIndex={selected ? 0 : -1}
              className={styles.contentTab}
              onClick={() => setTab(t.key)}
              onKeyDown={(e) => onContentTabKeyDown(e, idx)}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── 4. 활성 탭 패널 ── */}
      <div
        id={`detail-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`detail-tab-${tab}`}
        className={styles.panelBody}
      >
        {tab === "overview" && (
          <div className={styles.overview}>
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard} data-level={state.level ?? "gap"}>
                <span className={styles.kpiLabel}>현재 단계 · 최고 비율</span>
                <div className={styles.kpiMain}>
                  <LevelMark level={state.level ?? "gap"} size={24} />
                  <span className={styles.kpiLevel}>{levelText}</span>
                  <span className={styles.kpiNum}>{worstRatioText}</span>
                </div>
                <span className={styles.kpiSub}>
                  {detail.stackCode
                    ? `굴뚝 ${detail.stackCode} · ${worstPollutantText}`
                    : "유효 측정값 없음"}
                </span>
              </div>

              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>지속 시간 · 결측</span>
                <div className={styles.kpiMain}>
                  <span className={styles.kpiStrong}>
                    {streak.durationLabel || "측정 없음"}
                  </span>
                </div>
                <span className={styles.kpiSub}>
                  {streak.sinceMs !== null
                    ? `${formatSlot(streak.sinceMs).slice(6)}부터 · 측정 없음 ${missingCount}칸`
                    : `오늘 측정 없음 ${missingCount}칸`}
                </span>
              </div>
            </div>

            <div className={styles.sparkCard}>
              <div className={styles.sparkHead}>
                <span className={styles.sparkTitle}>최근 6시간 미니 추세</span>
                <span className={styles.sparkDir} data-dir={spark.direction}>
                  {spark.arrow}{" "}
                  {spark.direction === "up" ? "상승 추세" : spark.direction === "down" ? "하강 추세" : "유지"}
                </span>
              </div>
              <MiniSparkline
                points={spark.points}
                level={state.level}
                width={460}
                height={76}
                showThreshold
                className={styles.sparkSvg}
              />
              <div className={styles.sparkFoot}>
                <span>6시간 전</span>
                <span>점선: 기준 100%</span>
                <span>현재</span>
              </div>
            </div>

            <div className={styles.overviewFoot}>
              <span className={styles.overviewMeta}>전체 굴뚝 {site.stacks.length}개</span>
              <button type="button" className={styles.primaryLink} onClick={() => setTab("trend")}>
                추세 자세히 보기 →
              </button>
            </div>
          </div>
        )}

        {tab === "trend" && (
          <TrendChart
            site={site}
            day={day}
            hideHeader
            animateKey={`${site.id}:${tab}`}
          />
        )}

        {tab === "stacks" && (
          <div className={styles.tableWrap}>
            <table className={styles.table} aria-label={`${site.name} 굴뚝별 측정 현황`}>
              <thead>
                <tr>
                  <th scope="col">굴뚝</th>
                  <th scope="col">NOx (현재/기준 · %)</th>
                  <th scope="col">SOx (현재/기준 · %)</th>
                  <th scope="col">단계</th>
                </tr>
              </thead>
              <tbody>
                {stackRows.map((r) => {
                  const isCur = r.code === activeStack;
                  const noxPair = formatPpmPair(r.nox.value, r.nox.limit);
                  const soxPair = formatPpmPair(r.sox.value, r.sox.limit);
                  return (
                    <tr
                      key={r.key}
                      className={styles.stackRow}
                      data-active={isCur || undefined}
                      onClick={() => {
                        selectStack(r.code);
                        setTab("trend");
                      }}
                    >
                      <th scope="row" className={styles.stackCode}>
                        <button
                          type="button"
                          className={styles.stackRowBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectStack(r.code);
                            setTab("trend");
                          }}
                        >
                          굴뚝 {r.code}
                        </button>
                      </th>
                      <td className={styles.numCell}>
                        {r.nox.ratio !== null ? (
                          <>
                            <strong className={styles.cellPct}>{formatPct(r.nox.ratio)}</strong>
                            {noxPair && <span className={styles.cellPpm}>{noxPair}</span>}
                          </>
                        ) : (
                          <span className={styles.cellMuted}>{r.nox.raw ?? "—"}</span>
                        )}
                      </td>
                      <td className={styles.numCell}>
                        {r.sox.ratio !== null ? (
                          <>
                            <strong className={styles.cellPct}>{formatPct(r.sox.ratio)}</strong>
                            {soxPair && <span className={styles.cellPpm}>{soxPair}</span>}
                          </>
                        ) : (
                          <span className={styles.cellMuted}>{r.sox.raw ?? "—"}</span>
                        )}
                      </td>
                      <td className={styles.levelCell}>
                        <span className={styles.tableBadge}>
                          <LevelMark level={r.worstLevel ?? "gap"} size={15} />
                          <span>{r.worstLevel ? labelOf(r.worstLevel) : "측정 없음"}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className={styles.tableHint}>굴뚝 줄을 누르면 해당 굴뚝의 추세 그래프로 이동합니다.</p>
          </div>
        )}

        {tab === "ai" && (
          <div className={styles.aiPane}>
            <div className={styles.aiContextCard}>
              <span className={styles.aiContextLabel}>현재 선택 사업장 맥락</span>
              <strong className={styles.aiContextSummary}>{aiSummary}</strong>
            </div>

            {preview && ( // PREVIEW-ONLY
              <div className={styles.aiPreviewNotice} role="status">
                미리보기에서는 사용할 수 없음 · 실제 서버 연결 시 이 사업장 데이터로 바로 질문할 수 있습니다.
              </div>
            )}

            <div className={styles.aiStarters}>
              <span className={styles.kpiLabel}>빠른 질문</span>
              {aiStarters.map((q) => (
                <button
                  key={q}
                  type="button"
                  className={styles.aiStarterBtn}
                  onClick={() => triggerAi(q)}
                >
                  {q}
                </button>
              ))}
            </div>

            <button type="button" className={styles.aiOpenBtn} onClick={() => triggerAi()}>
              이 사업장으로 AI 에이전트 창 열기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
