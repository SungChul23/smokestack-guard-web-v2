// 상단 헤더의 실시간 LIVE 표시 및 경보 공지 트리거용 순수 뷰 모델 계산.
import type { FreshnessInfo, FreshnessStatus } from "./freshness";

export interface LiveNoticeCounts {
  total: number;
  exceed: number;
  favoriteAlerts?: number;
}

export interface LiveStatusViewModel {
  status: FreshnessStatus;
  /** 배지 텍스트: 실시간일 때 "LIVE", 지연·끊김·대기 시 한국어 상태 */
  badgeText: string;
  /** 빨간 펄스 애니메이션 활성 여부 */
  isPulsing: boolean;
  /** 데스크톱 기준 시각 표시 ("16:30 (2분 전)" 또는 "데이터 연결 전") */
  timeLabel: string;
  /** 태블릿 축약 시각 표시 ("16:30" 또는 "연결 전") */
  shortTimeLabel: string;
  /** 데스크톱 공지 요약 ("초과 3 · 공지 12", "공지 5건", "공지 없음", 또는 연결 전 빈 문자열) */
  noticeLabel: string;
  /** 태블릿·모바일 축약 공지 요약 ("초과 3", "공지 5", 또는 빈 문자열) */
  shortNoticeLabel: string;
  /** 모바일 컴팩트 카운트 배지 숫자 (0이면 null) */
  mobileBadgeCount: number | null;
  /** 초과 경보 존재 여부 (강조 색상용) */
  hasExceed: boolean;
  /** 스크린리더용 전체 설명 */
  ariaLabel: string;
}

export function buildLiveStatusViewModel(
  fresh: FreshnessInfo,
  counts: LiveNoticeCounts,
  interactive: boolean,
): LiveStatusViewModel {
  const total = Math.max(0, Math.floor(counts.total));
  const exceed = Math.max(0, Math.floor(counts.exceed));
  const hasExceed = exceed > 0;

  const badgeText =
    fresh.status === "live"
      ? "LIVE"
      : fresh.status === "delayed"
        ? "지연"
        : fresh.status === "disconnected"
          ? "끊김"
          : "대기";

  const isPulsing = fresh.status === "live" || fresh.status === "delayed";

  const timeLabel = fresh.status === "none" ? "데이터 연결 전" : fresh.shortText;
  const shortTimeLabel = fresh.status === "none" ? "연결 전" : fresh.timeText;

  let noticeLabel = "";
  let shortNoticeLabel = "";
  if (fresh.status !== "none" || total > 0) {
    if (exceed > 0) {
      noticeLabel = total > exceed ? `초과 ${exceed} · 공지 ${total}` : `초과 ${exceed}건`;
      shortNoticeLabel = `초과 ${exceed}`;
    } else if (total > 0) {
      noticeLabel = `공지 ${total}건`;
      shortNoticeLabel = `공지 ${total}`;
    } else {
      noticeLabel = "공지 없음";
      shortNoticeLabel = "";
    }
  }

  const mobileBadgeCount = total > 0 ? total : null;

  const parts: string[] = [];
  if (fresh.status === "live") {
    parts.push(`실시간 LIVE, ${fresh.timeText} 기준 (${fresh.agoText})`);
  } else if (fresh.status === "none") {
    parts.push("데이터 연결 전");
  } else {
    parts.push(fresh.fullText);
  }

  if (exceed > 0) {
    parts.push(`초과 ${exceed}곳 포함 경보 공지 ${total}건`);
  } else if (total > 0) {
    parts.push(`경보 공지 ${total}건`);
  } else if (fresh.status !== "none") {
    parts.push("경보 공지 없음");
  }

  if (interactive) {
    parts.push("누르면 전체 경보 공지 보기");
  }

  return {
    status: fresh.status,
    badgeText,
    isPulsing,
    timeLabel,
    shortTimeLabel,
    noticeLabel,
    shortNoticeLabel,
    mobileBadgeCount,
    hasExceed,
    ariaLabel: parts.join(". "),
  };
}
