// 관제 화면의 공통 틀(2단계): 왼쪽 레일 없음([추가 1]), 100dvh 본문 스크롤 없음([D]).
// 데스크톱(≥1280): 지도 + 오른쪽(내 사업장 40% / 경고 목록) + 오른쪽 상세 서랍(480px)
// 태블릿(641~1279): 지도 + 오른쪽 탭 패널(340px) + 오른쪽 절반 상세 서랍
// 휴대폰(≤640): 간결 머리 + 전체 지도 + 아래 시트(접힘/반/전체) + 아래 탭바(56px)
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import AgentDock from "../agent/AgentDock";
import type { AgentSiteContext } from "../agent/AgentWindow";
import { useMediaQuery } from "../agent/useMediaQuery";
import { ALERT_LEVELS, thresholdText, type LevelKey } from "../logic/status";
import { useSelection } from "../state/selection";
import { userDisplayName } from "./freshness";
import HeaderBar from "./HeaderBar";
import { CloseIcon, SearchIcon, StarIcon } from "./icons";
import LevelMark from "./LevelMark";
import MobileBottomSheet, { type SheetSnap, type SheetTab } from "./MobileBottomSheet";
import MobileTabBar, { type MobileNavKey } from "./MobileTabBar";
import styles from "./Shell.module.css";

export interface QuickSearchItem {
  siteId: string;
  name: string;
  region: string;
  address?: string;
  level: LevelKey | "gap";
  ratio: number | null;
}

export interface ShellProps {
  email?: string;
  userName?: string;
  onLogout: () => void;
  /** 최신 데이터 시각(ms). 신선도 표시용 */
  latestMs?: number | null;
  /** 신선도 계산 기준 시각(ms). 미리보기에서만 고정 오프셋을 넣는다 */
  freshnessNowMs?: number;
  /** 최신 전국 단계별 사업장 수 (로고 연기 색용) */
  latestCounts?: { exceed: number; risk: number } | null;
  /** 현재 지도 시점의 단계별 사업장 수 (2단계 4카드 유지용) */
  counts?: Record<"caution" | "warn" | "risk" | "exceed", number> | null;
  /** 각 자리에 들어갈 내용 */
  map?: ReactNode;
  list?: ReactNode;
  favoritesPanel?: ReactNode;
  favoritesCount?: number;
  trend?: ReactNode;
  trendTitle?: string;
  onClearSelection?: () => void;
  /** 경고 목록 컴포넌트가 자체 제목·범위 토글을 가지고 있으면 중복 머리를 그리지 않는다 */
  listHasHeader?: boolean;
  /** 상세 내용 안에 자체 제목·닫기 버튼이 이미 있으면 중복 머리를 그리지 않는다 */
  trendHasHeader?: boolean;
  /** 맨 윗줄 공지(2단계 기존 공지 유지, 3단계에서 정리 예정) */
  notices?: ReactNode;
  /** 그래프 설정 열기 */
  onOpenSettings?: () => void;
  settingsOpen?: boolean;
  /** 전국 사업장 빠른 검색(Ctrl+K) 항목 */
  searchItems?: ReadonlyArray<QuickSearchItem>;
  onSelectSearchItem?: (siteId: string) => void;
  /** AI 창 외부 제어 및 현재 사업장 맥락 */
  agentOpen?: boolean;
  onAgentOpenChange?: (open: boolean) => void;
  agentSiteContext?: AgentSiteContext | null;
  /** 타임라인에서 과거 시점을 보고 있을 때("HH:MM") */
  pastTimeLabel?: string | null;
  /** 과거 시점 배지를 눌러 최신으로 복귀 */
  onBackToLatest?: () => void;
  /** 휴대폰 아래 시트 높이 외부 공유(지도 버튼 겹침 방지용) */
  mobileSheetSnap?: SheetSnap;
  onMobileSheetSnapChange?: (snap: SheetSnap) => void;
}

export default function Shell({
  email,
  userName,
  onLogout,
  latestMs = null,
  freshnessNowMs,
  latestCounts = null,
  counts = null,
  map,
  list,
  listHasHeader = false,
  favoritesPanel,
  favoritesCount = 0,
  trend,
  trendTitle = "사업장 상세",
  onClearSelection,
  trendHasHeader = false,
  notices,
  onOpenSettings,
  settingsOpen = false,
  searchItems = [],
  onSelectSearchItem,
  agentOpen: controlledAgentOpen,
  onAgentOpenChange,
  agentSiteContext = null,
  pastTimeLabel = null,
  onBackToLatest,
  mobileSheetSnap: controlledSheetSnap,
  onMobileSheetSnapChange,
}: ShellProps) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const isTablet = useMediaQuery("(min-width: 641px) and (max-width: 1279px)");

  const statusFilter = useSelection((s) => s.statusFilter);
  const toggleStatus = useSelection((s) => s.toggleStatus);

  const [tabletTab, setTabletTab] = useState<SheetTab>("alerts");
  const [innerSheetSnap, setInnerSheetSnap] = useState<SheetSnap>("collapsed");
  const sheetSnap = controlledSheetSnap ?? innerSheetSnap;
  const setSheetSnap = (next: SheetSnap | ((prev: SheetSnap) => SheetSnap)) => {
    const value = typeof next === "function" ? next(sheetSnap) : next;
    setInnerSheetSnap(value);
    onMobileSheetSnapChange?.(value);
  };
  const [sheetTab, setSheetTab] = useState<SheetTab>("alerts");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [innerAgentOpen, setInnerAgentOpen] = useState(false);
  const agentOpen = controlledAgentOpen ?? innerAgentOpen;
  const setAgentOpen = (next: boolean | ((v: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(agentOpen) : next;
    setInnerAgentOpen(value);
    onAgentOpenChange?.(value);
  };

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const alertsScrollRef = useRef<HTMLDivElement>(null);

  const displayName = userDisplayName(userName, email);

  // 휴대폰에서 사업장을 고르면 아래 시트를 전체 높이로 열어 그래프까지 바로 보여 준다
  const hadTrendRef = useRef(false);
  const wasMobileRef = useRef(isMobile);
  useEffect(() => {
    const hasTrend = Boolean(trend);
    if (isMobile && hasTrend && (!hadTrendRef.current || !wasMobileRef.current)) {
      setSheetSnap("full");
    }
    hadTrendRef.current = hasTrend;
    wasMobileRef.current = isMobile;
  }, [isMobile, trend]);

  // 빠른 검색 열릴 때 입력창에 초점
  useEffect(() => {
    if (!searchOpen) return;
    setSearchQuery("");
    setSearchIndex(0);
    const id = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [searchOpen]);

  // Esc: 검색 모달 → 데스크톱/태블릿 상세 서랍 순으로 닫기(사용자 메뉴가 먼저 소비했으면 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (searchOpen) {
        setSearchOpen(false);
        return;
      }
      if (!isMobile && trend && onClearSelection) {
        onClearSelection();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchOpen, isMobile, trend, onClearSelection]);

  const filteredSearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matched = q
      ? searchItems.filter(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            it.region.toLowerCase().includes(q) ||
            (it.address && it.address.toLowerCase().includes(q)) ||
            it.siteId.toLowerCase().includes(q),
        )
      : searchItems;
    return matched.slice(0, 15);
  }, [searchItems, searchQuery]);

  useEffect(() => {
    setSearchIndex(0);
  }, [searchQuery]);

  const handlePickSearch = (siteId: string) => {
    setSearchOpen(false);
    onSelectSearchItem?.(siteId);
  };

  const handleMobileNav = (key: MobileNavKey) => {
    if (key === "map") {
      setMobileMenuOpen(false);
      setAgentOpen(false);
      setSheetSnap("collapsed");
      return;
    }
    if (key === "alerts") {
      setMobileMenuOpen(false);
      setAgentOpen(false);
      onClearSelection?.();
      setSheetTab("alerts");
      setSheetSnap((prev) => (prev === "half" && sheetTab === "alerts" && !trend ? "full" : "half"));
      return;
    }
    if (key === "favorites") {
      setMobileMenuOpen(false);
      setAgentOpen(false);
      onClearSelection?.();
      setSheetTab("favorites");
      setSheetSnap((prev) => (prev === "half" && sheetTab === "favorites" && !trend ? "full" : "half"));
      return;
    }
    if (key === "ai") {
      setMobileMenuOpen(false);
      setAgentOpen((v) => !v);
      return;
    }
    if (key === "menu") {
      setAgentOpen(false);
      setMobileMenuOpen((v) => !v);
    }
  };

  const activeMobileNav: MobileNavKey = mobileMenuOpen
    ? "menu"
    : agentOpen
      ? "ai"
      : sheetSnap === "collapsed"
        ? "map"
        : sheetTab === "favorites" && !trend
          ? "favorites"
          : "alerts";

  const onTabletTabKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setTabletTab((t) => (t === "favorites" ? "alerts" : "favorites"));
    }
  };

  const hasStatusFilter = statusFilter.length > 0;
  const cardsNode = (
    <section
      className={isMobile ? styles.mobileCards : styles.cards}
      data-has-filter={hasStatusFilter ? "true" : undefined}
      aria-label="단계별 굴뚝 수"
    >
      {ALERT_LEVELS.map((lv) => {
        const val = counts ? counts[lv.key as keyof typeof counts] : null;
        const isZero = val === 0;
        const active = statusFilter.includes(lv.key);
        const isExceedActive = lv.key === "exceed" && val !== null && val > 0;
        return (
          <button
            type="button"
            className={styles.card}
            key={lv.key}
            data-level={lv.key}
            data-zero={isZero ? "true" : undefined}
            data-siren={isExceedActive ? "true" : undefined}
            aria-pressed={active}
            onClick={() => toggleStatus(lv.key)}
            title={active ? `${lv.label} 단계 선택 해제` : `${lv.label} 단계만 걸러서 보기`}
          >
            <div className={styles.cardMeta}>
              <div className={styles.cardLabel}>
                <LevelMark level={lv.key} size={24} />
                <span>{lv.label}</span>
                {isExceedActive && (
                  <span className={styles.sirenBeacon} aria-hidden="true">
                    <span className={styles.sirenDome} />
                    <span className={styles.sirenBase} />
                  </span>
                )}
              </div>
              <div className={styles.cardNoteRow}>
                <span className={styles.cardNote}>
                  ≥{lv.min}%{pastTimeLabel ? " · 최신" : ""}
                </span>
                {active && <span className={styles.cardSelectedBadge}>✓ 선택됨</span>}
              </div>
            </div>
            <div className={styles.cardValue}>{val !== null ? val : "—"}</div>
          </button>
        );
      })}
    </section>
  );

  const favContent = favoritesPanel ?? (
    <p className={styles.placeholder}>사업장 상세에서 ☆을 눌러 추가하세요</p>
  );

  const alertsContent = list ?? <p className={styles.placeholder}>준비 중</p>;

  return (
    <div className={styles.app}>
      <a className={styles.skip} href="#main">
        본문으로 건너뛰기
      </a>

      <HeaderBar
        email={email}
        userName={userName}
        latestMs={latestMs}
        freshnessNowMs={freshnessNowMs}
        latestCounts={latestCounts}
        pastTimeLabel={pastTimeLabel}
        onBackToLatest={onBackToLatest}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={onOpenSettings}
        settingsOpen={settingsOpen}
        onLogout={onLogout}
      />

      {notices && <div className={styles.noticesWrap}>{notices}</div>}

      {isMobile ? (
        <>
          <main id="main" className={styles.mobileStage}>
            <div className={styles.mobileMapWrap}>
              <section id="overview" className={`${styles.panel} ${styles.mapPane}`} aria-labelledby="h-overview">
                <h2 id="h-overview" className={styles.srOnly}>
                  지도
                </h2>
                {map ?? <p className={styles.placeholder}>준비 중 — 최신 1일치 흐름 지도가 들어갑니다.</p>}
              </section>
            </div>

            <MobileBottomSheet
              snap={sheetSnap}
              onSnapChange={setSheetSnap}
              tab={sheetTab}
              onTabChange={setSheetTab}
              showingDetail={Boolean(trend)}
              onBackFromDetail={() => onClearSelection?.()}
              favoritesCount={favoritesCount}
              favoritesContent={favContent}
              alertsContent={
                <>
                  {cardsNode}
                  {alertsContent}
                </>
              }
              detailContent={
                trend ? (
                  <section id="trend" aria-labelledby="h-trend-mobile">
                    <h2 id="h-trend-mobile" className={styles.srOnly}>
                      측정 추세
                    </h2>
                    {trend}
                  </section>
                ) : undefined
              }
            />
          </main>

          <MobileTabBar
            active={activeMobileNav}
            onSelect={handleMobileNav}
            menuOpen={mobileMenuOpen}
            onCloseMenu={() => setMobileMenuOpen(false)}
            displayName={displayName}
            email={email}
            onOpenSettings={onOpenSettings}
            settingsOpen={settingsOpen}
            onLogout={onLogout}
          />
        </>
      ) : (
        <main id="main" className={styles.workspace}>
          <div className={styles.leftCol}>
            {cardsNode}
            <section id="overview" className={`${styles.panel} ${styles.mapPane}`} aria-labelledby="h-overview">
              <h2 id="h-overview" className={styles.srOnly}>
                지도
              </h2>
              {map ?? <p className={styles.placeholder}>준비 중 — 최신 1일치 흐름 지도가 들어갑니다.</p>}
            </section>
          </div>

          {isTablet ? (
            <aside className={`${styles.panel} ${styles.rightCol}`} aria-label="즐겨찾기 한 사업장 및 경고 목록">
              <div className={styles.tabletTabs} role="tablist" aria-label="오른쪽 패널 전환">
                <button
                  type="button"
                  role="tab"
                  className={styles.tabletTab}
                  aria-selected={tabletTab === "favorites"}
                  onClick={() => setTabletTab("favorites")}
                  onKeyDown={onTabletTabKeyDown}
                >
                  ★ 즐겨찾기 한 사업장 ({favoritesCount})
                </button>
                <button
                  type="button"
                  role="tab"
                  className={styles.tabletTab}
                  aria-selected={tabletTab === "alerts"}
                  onClick={() => setTabletTab("alerts")}
                  onKeyDown={onTabletTabKeyDown}
                >
                  경고 목록
                </button>
              </div>
              <div className={tabletTab === "favorites" ? styles.favScroll : styles.panelScroll} ref={alertsScrollRef}>
                {tabletTab === "favorites" ? favContent : alertsContent}
              </div>
            </aside>
          ) : (
            <div className={styles.rightCol}>
              <section className={`${styles.panel} ${styles.favPane}`} aria-labelledby="h-favorites">
                <div className={styles.panelHead}>
                  <h2 id="h-favorites" className={styles.panelTitle}>
                    <StarIcon filled />
                    <span>즐겨찾기 한 사업장</span>
                  </h2>
                  <span className={styles.panelCount}>{favoritesCount}곳</span>
                </div>
                <div className={styles.favScroll}>{favContent}</div>
              </section>

              <section id="alerts" className={`${styles.panel} ${styles.listPane}`} aria-labelledby="h-alerts">
                {!listHasHeader && (
                  <div className={styles.panelHead}>
                    <h2 id="h-alerts" className={styles.panelTitle}>
                      경고 목록
                    </h2>
                  </div>
                )}
                <div className={listHasHeader ? styles.listBodyFill : styles.panelScroll} ref={alertsScrollRef}>
                  {alertsContent}
                </div>
              </section>
            </div>
          )}

          {trend && (
            <aside id="trend" className={styles.drawer} role="region" aria-label={trendTitle}>
              {!trendHasHeader && (
                <div className={styles.drawerHead}>
                  <h2 id="h-trend" className={styles.drawerTitle}>
                    {trendTitle}
                  </h2>
                  {onClearSelection && (
                    <button
                      type="button"
                      className={styles.drawerClose}
                      aria-label="상세 패널 닫기"
                      title="닫기 (Esc)"
                      onClick={onClearSelection}
                    >
                      <CloseIcon size={24} />
                    </button>
                  )}
                </div>
              )}
              <div className={styles.drawerBody}>{trend}</div>
            </aside>
          )}
        </main>
      )}

      <footer className={styles.footer}>
        <span>{thresholdText()}</span>
        <span>보관 기록 · 실시간/법적 판정 아님</span>
      </footer>

      {searchOpen && (
        <div
          className={styles.searchBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSearchOpen(false);
          }}
        >
          <div className={styles.searchModal} role="dialog" aria-modal="true" aria-label="전국 사업장 검색">
            <div className={styles.searchInputRow}>
              <SearchIcon />
              <input
                ref={searchInputRef}
                type="search"
                className={styles.searchInput}
                placeholder="사업장 이름·주소·코드 검색…"
                aria-label="전국 사업장 검색어"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" && filteredSearch.length > 0) {
                    e.preventDefault();
                    setSearchIndex((idx) => (idx + 1) % filteredSearch.length);
                  } else if (e.key === "ArrowUp" && filteredSearch.length > 0) {
                    e.preventDefault();
                    setSearchIndex((idx) => (idx - 1 + filteredSearch.length) % filteredSearch.length);
                  } else if (e.key === "Enter" && filteredSearch.length > 0) {
                    e.preventDefault();
                    const picked = filteredSearch[Math.min(searchIndex, filteredSearch.length - 1)];
                    if (picked) handlePickSearch(picked.siteId);
                  }
                }}
              />
              <button
                type="button"
                className={styles.drawerClose}
                aria-label="검색 닫기"
                onClick={() => setSearchOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>
            <div className={styles.searchResults}>
              {filteredSearch.length > 0 ? (
                <ul className={styles.favList}>
                  {filteredSearch.map((it, idx) => (
                    <li key={it.siteId}>
                      <button
                        type="button"
                        className={styles.favItem}
                        data-selected={idx === searchIndex || undefined}
                        onMouseEnter={() => setSearchIndex(idx)}
                        onClick={() => handlePickSearch(it.siteId)}
                      >
                        <LevelMark level={it.level} />
                        <span className={styles.favNameWrap}>
                          <span className={styles.favName}>{it.name}</span>
                          <span className={styles.favRegion}>
                            {it.region} · {it.siteId}
                          </span>
                        </span>
                        <span className={styles.favRatio}>
                          {it.ratio !== null ? `${Math.round(it.ratio)}%` : "측정 없음"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.searchEmpty}>
                  {searchItems.length === 0 ? "불러온 사업장이 없습니다." : "일치하는 사업장이 없습니다."}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <AgentDock
        externalOpen={agentOpen}
        onExternalOpenChange={setAgentOpen}
        hideFloatingOnMobile
        drawerOpen={!isMobile && Boolean(trend)}
        siteContext={agentSiteContext}
      />
    </div>
  );
}
