// 상단 헤더의 실시간 LIVE 상태 표시 + 전체 공지 페이지 진입 버튼.
// 기존의 화면 상단 공지 배너를 대체하여, 빨간 펄스 LIVE 표시로 실시간 데이터 상태를 드러내고
// 클릭 시 독립된 전체 경보 공지 페이지(NoticesPage)로 이동한다.
import type { FreshnessInfo } from "./freshness";
import { buildLiveStatusViewModel } from "./liveStatus";
import styles from "./HeaderLiveStatus.module.css";

export interface HeaderLiveStatusProps {
  fresh: FreshnessInfo;
  noticeCount: number;
  exceedCount: number;
  favoriteAlertCount?: number;
  /** 누르면 독립된 전체 경보 공지 페이지를 연다 */
  onOpenNotices?: () => void;
  /** 과거 시점 배지와 함께 표시할 때 간결 모드로 축약 */
  compact?: boolean;
}

export default function HeaderLiveStatus({
  fresh,
  noticeCount,
  exceedCount,
  favoriteAlertCount = 0,
  onOpenNotices,
  compact = false,
}: HeaderLiveStatusProps) {
  const interactive = Boolean(onOpenNotices);
  const vm = buildLiveStatusViewModel(
    fresh,
    { total: noticeCount, exceed: exceedCount, favoriteAlerts: favoriteAlertCount },
    interactive,
  );

  const inner = (
    <>
      <span className={styles.livePill}>
        <span className={styles.beacon} aria-hidden="true">
          {vm.isPulsing && <span className={styles.beaconRing} />}
          <span className={styles.beaconCore} />
        </span>
        <span>{vm.badgeText}</span>
      </span>

      {!compact && (
        <>
          <span className={styles.timeFull}>{vm.timeLabel}</span>
          <span className={styles.timeShort}>{vm.shortTimeLabel}</span>
        </>
      )}

      {vm.noticeLabel && (
        <>
          {!compact && <span className={styles.divider} aria-hidden="true" />}
          <span className={styles.noticeFull} data-exceed={vm.hasExceed || undefined}>
            {vm.noticeLabel}
          </span>
          {vm.shortNoticeLabel && (
            <span className={styles.noticeShort} data-exceed={vm.hasExceed || undefined}>
              {vm.shortNoticeLabel}
            </span>
          )}
        </>
      )}

      {vm.mobileBadgeCount !== null && (
        <span className={styles.mobileCount} aria-hidden="true">
          {vm.mobileBadgeCount}
        </span>
      )}

      {interactive && (
        <span className={styles.arrow} aria-hidden="true">
          ›
        </span>
      )}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        className={styles.trigger}
        data-status={vm.status}
        data-pulsing={vm.isPulsing ? "true" : "false"}
        data-compact={compact ? "true" : undefined}
        aria-label={vm.ariaLabel}
        title="실시간 경보 공지 전체 보기"
        onClick={onOpenNotices}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={styles.trigger}
      role="status"
      aria-live="polite"
      data-status={vm.status}
      data-pulsing={vm.isPulsing ? "true" : "false"}
      data-compact={compact ? "true" : undefined}
      aria-label={vm.ariaLabel}
    >
      {inner}
    </div>
  );
}
