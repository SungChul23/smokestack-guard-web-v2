// 상단 머리([추가 2]): 로고(연기 애니메이션) + 워드마크 + 데이터 신선도 + 전국 검색(Ctrl/⌘+K) + 알림 종 + 인사·아바타 메뉴.
import { useEffect, useRef, useState } from "react";
import { useTheme, type ThemePreference } from "../theme/theme";
import BrandLogo from "./BrandLogo";
import { computeFreshness, smokeToneOf, userDisplayName, userInitial } from "./freshness";
import { AlertIcon, ChevronDownIcon, GearIcon, LogoutIcon, MonitorIcon, MoonIcon, SearchIcon, SunIcon } from "./icons";
import styles from "./HeaderBar.module.css";

export interface UserMenuFieldsProps {
  displayName: string;
  email?: string;
  onOpenSettings?: () => void;
  settingsOpen?: boolean;
  onLogout: () => void;
  onDone?: () => void;
}

const THEME_OPTIONS: ReadonlyArray<{ key: ThemePreference; label: string }> = [
  { key: "dark", label: "다크" },
  { key: "light", label: "라이트" },
  { key: "system", label: "시스템" },
];

/** 데스크톱 아바타 드롭다운과 휴대폰 "메뉴" 시트가 함께 쓰는 사용자 설정 메뉴 내용 */
export function UserMenuContent({
  displayName,
  email,
  onOpenSettings,
  settingsOpen = false,
  onLogout,
  onDone,
}: UserMenuFieldsProps) {
  const { preference, setPreference, effectsEnabled, setEffectsEnabled } = useTheme();
  return (
    <>
      <div className={styles.menuHead}>
        <div className={styles.menuName}>안녕하세요, {displayName}님</div>
        {email && <div className={styles.menuEmail}>{email}</div>}
      </div>

      <div className={styles.menuSection}>
        <span className={styles.menuLabel}>테마</span>
        <div className={styles.segment} role="group" aria-label="테마 선택">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={styles.segBtn}
              aria-pressed={preference === opt.key}
              onClick={() => setPreference(opt.key)}
            >
              {opt.key === "dark" && <MoonIcon />}
              {opt.key === "light" && <SunIcon />}
              {opt.key === "system" && <MonitorIcon />}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.switchRow}>
        <div className={styles.switchMeta}>
          <span className={styles.switchTitle}>화면 효과</span>
          <span className={styles.switchHint}>{effectsEnabled ? "연기·전환 효과 켜짐" : "정지 화면 모드"}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={effectsEnabled}
          aria-label="화면 효과"
          className={styles.switch}
          onClick={() => setEffectsEnabled(!effectsEnabled)}
        >
          <span className={styles.thumb} />
        </button>
      </div>

      <hr className={styles.menuDivider} />

      {onOpenSettings && (
        <button
          type="button"
          className={styles.menuAction}
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          onClick={() => {
            onDone?.();
            onOpenSettings();
          }}
        >
          <GearIcon />
          <span>그래프 설정</span>
        </button>
      )}

      <button
        type="button"
        className={`${styles.menuAction} ${styles.menuActionDanger}`}
        onClick={() => {
          onDone?.();
          onLogout();
        }}
      >
        <LogoutIcon />
        <span>로그아웃</span>
      </button>
    </>
  );
}

export interface HeaderBarProps {
  email?: string;
  userName?: string;
  /** 최신 데이터 시각(ms). 없으면 데이터 연결 전 */
  latestMs?: number | null;
  /** 신선도 기준 현재 시각(ms). 미리보기에서 고정 오프셋 주입 가능 */
  freshnessNowMs?: number;
  /** 최신 전국 단계별 사업장 수 (로고 연기 색 & 알림 종 배지용) */
  latestCounts?: { exceed: number; risk: number } | null;
  onOpenSearch?: () => void;
  onBellClick?: () => void;
  onOpenSettings?: () => void;
  settingsOpen?: boolean;
  onLogout: () => void;
  /** 타임라인에서 과거 시점을 보고 있을 때 표시할 시각("HH:MM") */
  pastTimeLabel?: string | null;
  /** 과거 시점 배지를 눌러 최신으로 복귀 */
  onBackToLatest?: () => void;
}

export default function HeaderBar({
  email,
  userName,
  latestMs = null,
  freshnessNowMs,
  latestCounts = null,
  onOpenSearch,
  onBellClick,
  onOpenSettings,
  settingsOpen = false,
  onLogout,
  pastTimeLabel = null,
  onBackToLatest,
}: HeaderBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tickNow, setTickNow] = useState(() => Date.now());
  const menuWrapRef = useRef<HTMLDivElement>(null);

  // 1분마다 신선도 상대 시각("2분 전") 갱신
  useEffect(() => {
    if (freshnessNowMs !== undefined) return;
    const id = window.setInterval(() => setTickNow(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, [freshnessNowMs]);

  // Ctrl+K / ⌘K 단축키로 전국 검색 열기
  useEffect(() => {
    if (!onOpenSearch) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenSearch]);

  // 사용자 메뉴 바깥 클릭·Esc 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menuOpen]);

  const nowMs = freshnessNowMs ?? tickNow;
  const fresh = computeFreshness(latestMs, nowMs);
  const tone = smokeToneOf(latestCounts);
  const urgentCount = (latestCounts?.exceed ?? 0) + (latestCounts?.risk ?? 0);
  const displayName = userDisplayName(userName, email);
  const initial = userInitial(displayName);

  return (
    <header className={styles.header}>
      {/* 왼쪽: 로고(연기 애니메이션) + 워드마크 + 부제 */}
      <div className={styles.brand}>
        <BrandLogo tone={tone} size={40} />
        <div className={styles.brandText}>
          <h1 className={styles.wordmark} aria-label="smokestack-guard 굴뚝 통합 관제">
            smokestack-guard
          </h1>
          <span className={styles.subtitle}>굴뚝 통합 관제</span>
        </div>
      </div>

      {/* 가운데: 데이터 신선도 + (과거 시점 배지) + 전국 사업장 검색 */}
      <div className={styles.center}>
        {pastTimeLabel ? (
          <button
            type="button"
            className={styles.pastBadge}
            onClick={onBackToLatest}
            title="누르면 최신 시점으로 돌아갑니다"
            aria-label={`과거 시점 ${pastTimeLabel} 보는 중. 누르면 최신 시점으로 이동`}
          >
            <span className={styles.pastDot} aria-hidden="true" />
            <span className={styles.pastFull}>과거 시점 {pastTimeLabel} 보는 중</span>
            <span className={styles.pastShort}>과거 {pastTimeLabel}</span>
          </button>
        ) : (
          <div className={styles.freshness} data-status={fresh.status} role="status" aria-live="polite">
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.freshFull}>{fresh.fullText}</span>
            <span className={styles.freshShort}>{fresh.shortText}</span>
          </div>
        )}

        <button
          type="button"
          className={styles.searchBtn}
          aria-label="전국 사업장 검색 (Ctrl+K)"
          onClick={onOpenSearch}
        >
          <SearchIcon />
          <span className={styles.searchPlaceholder}>전국 사업장 검색</span>
          <kbd className={styles.kbd} aria-hidden="true">Ctrl+K</kbd>
        </button>
      </div>

      {/* 오른쪽(데스크톱·태블릿): 알림 종 + 인사 + 아바타 메뉴 */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={urgentCount > 0 ? `초과·위험 알림, ${urgentCount}곳` : "초과·위험 알림 없음"}
          title={urgentCount > 0 ? `초과·위험 ${urgentCount}곳` : "초과·위험 없음"}
          onClick={onBellClick}
        >
          <AlertIcon />
          {urgentCount > 0 && (
            <span className={styles.bellBadge} aria-hidden="true">
              {urgentCount}
            </span>
          )}
        </button>

        <div className={styles.userWrap} ref={menuWrapRef}>
          <button
            type="button"
            className={styles.userTrigger}
            aria-label={`사용자 메뉴 (${displayName}님)`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className={styles.greeting}>
              안녕하세요, <strong>{displayName}</strong>님
            </span>
            <span className={styles.avatar} aria-hidden="true">
              {initial}
            </span>
            <span className={styles.chevron} aria-hidden="true">
              <ChevronDownIcon />
            </span>
          </button>

          {menuOpen && (
            <div className={styles.menu} role="menu" aria-label="사용자 메뉴">
              <UserMenuContent
                displayName={displayName}
                email={email}
                onOpenSettings={onOpenSettings}
                settingsOpen={settingsOpen}
                onLogout={onLogout}
                onDone={() => setMenuOpen(false)}
              />
            </div>
          )}
        </div>
      </div>

      {/* 휴대폰 전용 검색 아이콘 */}
      <button
        type="button"
        className={`${styles.iconBtn} ${styles.mobileSearchBtn}`}
        aria-label="전국 사업장 검색"
        onClick={onOpenSearch}
      >
        <SearchIcon />
      </button>
    </header>
  );
}
