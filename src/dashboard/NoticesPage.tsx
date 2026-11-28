// 전체 공지 페이지: 헤더의 LIVE 표시를 누르면 열리는 독립 전체 화면 뷰.
// - 빨간 펄스 LIVE 표시와 실시간 기준 시각, 모든 경보(초과·위험·경고·주의)와 내 사업장(즐겨찾기) 경보를 한눈에 확인한다.
// - 단계별·즐겨찾기 필터와 검색을 지원하며, 항목을 누르면 해당 사업장으로 바로 이동한다.
import { useEffect, useMemo, useRef, useState } from "react";
import { formatSlot, type DayData, type Site } from "../data/model";
import { labelOf, type LevelKey } from "../logic/status";
import { computeFreshness } from "./freshness";
import { CloseIcon } from "./icons";
import LevelMark from "./LevelMark";
import type { Notice } from "./notices";
import { formatPct } from "./TrendChart";
import { formatPpmPair, levelStreakAt, pollutantName, shortRegion, worstDetailAt } from "./siteMetrics";
import styles from "./NoticesPage.module.css";

type FilterKey = "all" | "favorites" | "exceed" | "risk" | "warn" | "caution" | "ok";

const ALERT_TABS: ReadonlyArray<{ key: Exclude<FilterKey, "favorites">; label: string }> = [
  { key: "all", label: "전체" },
  { key: "exceed", label: "초과" },
  { key: "risk", label: "위험" },
  { key: "warn", label: "경고" },
  { key: "caution", label: "주의" },
];

const RISING_TABS: ReadonlyArray<{ key: Exclude<FilterKey, "favorites">; label: string }> = [
  { key: "all", label: "전체" },
  { key: "risk", label: "위험" },
  { key: "warn", label: "경고" },
  { key: "caution", label: "주의" },
  { key: "ok", label: "정상" },
];

interface Props {
  open: boolean;
  items: readonly Notice[];
  sites: readonly Site[];
  day: DayData;
  latestMs: number | null;
  freshnessNowMs?: number;
  favoriteIds?: readonly string[];
  mode?: "alerts" | "rising";
  onClose: () => void;
  onPick: (n: Notice) => void;
}

export default function NoticesPage({
  open,
  items,
  sites,
  day,
  latestMs,
  freshnessNowMs,
  favoriteIds = [],
  mode = "alerts",
  onClose,
  onPick,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setFilter("all");
    setQuery("");
    backRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: items.length,
      favorites: 0,
      exceed: 0,
      risk: 0,
      warn: 0,
      caution: 0,
      ok: 0,
    };
    for (const it of items) {
      if (favoriteSet.has(it.siteId)) c.favorites++;
      if (
        it.level === "exceed" ||
        it.level === "risk" ||
        it.level === "warn" ||
        it.level === "caution" ||
        it.level === "ok"
      ) {
        c[it.level]++;
      }
    }
    return c;
  }, [items, favoriteSet]);

  const tabs = useMemo<ReadonlyArray<{ key: FilterKey; label: string }>>(() => {
    const base = mode === "rising" ? RISING_TABS : ALERT_TABS;
    if (favoriteIds.length === 0) return base;
    return [base[0], { key: "favorites", label: "★ 즐겨찾기 한 사업장" }, ...base.slice(1)];
  }, [favoriteIds.length, mode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === "favorites") {
        if (!favoriteSet.has(it.siteId)) return false;
      } else if (filter !== "all" && it.level !== filter) {
        return false;
      }
      if (!q) return true;
      const site = siteMap.get(it.siteId);
      const hay = `${it.name} ${it.stackCode} ${site ? `${site.sido} ${site.sigungu} ${site.address}` : ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, filter, query, siteMap, favoriteSet]);

  if (!open) return null;

  const isRising = mode === "rising";
  const latestSlot = Math.max(day.times.length - 1, 0);
  const fresh = computeFreshness(latestMs, freshnessNowMs);
  const liveLabel =
    fresh.status === "live"
      ? "LIVE"
      : fresh.status === "delayed"
        ? "지연"
        : fresh.status === "disconnected"
          ? "끊김"
          : "대기";
  const pulsing = fresh.status === "live" || fresh.status === "delayed";

  return (
    <div
      className={styles.page}
      role="dialog"
      aria-modal="true"
      aria-label={isRising ? "실시간 상승 추세 사업장 전체보기" : "전체 경보 공지"}
    >
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <button
              ref={backRef}
              type="button"
              className={styles.backBtn}
              onClick={onClose}
            >
              ← 관제 화면으로
            </button>
            <div className={styles.titleRow}>
              <span
                className={styles.liveTag}
                data-status={fresh.status}
                data-pulsing={pulsing ? "true" : "false"}
              >
                <span className={styles.liveBeacon} aria-hidden="true">
                  {pulsing && <span className={styles.liveRing} />}
                  <span className={styles.liveDot} />
                </span>
                {liveLabel}
              </span>
              <h2 className={styles.title}>{isRising ? "실시간 상승 추세 사업장" : "실시간 경보 공지"}</h2>
              <span className={styles.totalCount}>{items.length}곳</span>
            </div>
          </div>

          <div className={styles.headerRight}>
            {latestMs !== null && (
              <span className={styles.timestamp}>
                {formatSlot(latestMs)} 기준{fresh.agoText ? ` · ${fresh.agoText}` : ""}
              </span>
            )}
            <button
              type="button"
              className={styles.closeBtn}
              aria-label="전체보기 닫기"
              title="닫기 (Esc)"
              onClick={onClose}
            >
              <CloseIcon size={24} />
            </button>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.controls}>
          <div className={styles.tabs} role="tablist" aria-label="단계 필터">
            {tabs.map((t) => {
              const active = filter === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={styles.tab}
                  data-level={t.key !== "all" && t.key !== "favorites" ? t.key : undefined}
                  onClick={() => setFilter(t.key)}
                >
                  {t.key !== "all" && t.key !== "favorites" && <LevelMark level={t.key as LevelKey} size={14} />}
                  <span>{t.label}</span>
                  <span className={styles.tabCount}>{counts[t.key]}</span>
                </button>
              );
            })}
          </div>

          <input
            type="search"
            className={styles.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="사업장명·지역·굴뚝 번호 검색"
            aria-label="공지 검색"
          />
        </div>

        {filtered.length === 0 ? (
          <div className={styles.empty}>
            {isRising ? "조건에 맞는 상승 추세 사업장이 없습니다." : "조건에 맞는 경보 공지가 없습니다."}
          </div>
        ) : (
          <ul className={styles.list} aria-label={isRising ? "상승 추세 사업장 목록" : "전체 공지 목록"}>
            {filtered.map((it) => {
              const site = siteMap.get(it.siteId);
              const region = site ? shortRegion(site) : "";
              const worst = site ? worstDetailAt(site, day, latestSlot) : null;
              const ppmText = worst ? formatPpmPair(worst.value, worst.limit) : null;
              const streak = site ? levelStreakAt(site, day, latestSlot) : null;
              const duration = streak?.durationLabel || null;
              const isFavorite = favoriteSet.has(it.siteId);
              const hasRise = typeof it.delta === "number" && it.delta > 0;

              return (
                <li key={it.key} className={styles.cardWrap}>
                  <button
                    type="button"
                    className={styles.card}
                    data-level={it.level}
                    onClick={() => {
                      onPick(it);
                      onClose();
                    }}
                  >
                    <div className={styles.cardTop}>
                      <span className={styles.levelBadge} data-level={it.level}>
                        <LevelMark level={it.level} size={16} />
                        <span>{labelOf(it.level)}</span>
                      </span>
                      <strong className={styles.siteName}>
                        {isFavorite ? "★ " : ""}
                        {it.name}
                      </strong>
                      <span className={styles.stackTag}>굴뚝 {it.stackCode}</span>
                      {hasRise && (
                        <span className={styles.deltaBadge}>▲ +{Math.round(it.delta!)}%p</span>
                      )}
                      <span className={styles.ratio} data-level={it.level}>
                        {formatPct(it.ratio)}
                      </span>
                    </div>

                    <div className={styles.cardMeta}>
                      {region && <span>{region}</span>}
                      {hasRise && typeof it.prevRatio === "number" && (
                        <span className={styles.trendFlow}>
                          최근 6시간 {Math.round(it.prevRatio)}% → {Math.round(it.ratio)}%
                        </span>
                      )}
                      {worst?.pollutant && worst.ratio !== null && (
                        <span>
                          {pollutantName(worst.pollutant)} {formatPct(worst.ratio)}
                          {ppmText ? ` (${ppmText})` : ""}
                        </span>
                      )}
                      {duration && <span className={styles.duration}>지속 {duration}</span>}
                      <span className={styles.cta}>상세 보기 →</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
