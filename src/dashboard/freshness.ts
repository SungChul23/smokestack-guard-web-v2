// 머리 표시용 순수 계산: 데이터 신선도(실시간·지연·끊김), 로고 연기 색 상태, 사용자 표시 이름·이니셜.

export type FreshnessStatus = "live" | "delayed" | "disconnected" | "none";

export interface FreshnessInfo {
  status: FreshnessStatus;
  label: string;
  /** "16:30" 시각 표시 */
  timeText: string;
  /** "2분 전" 등 상대 시각 */
  agoText: string;
  /** 데스크톱 전체 문구: "실시간 · 16:30 기준 (2분 전)" */
  fullText: string;
  /** 휴대폰 축약 문구: "16:30 (2분 전)" */
  shortText: string;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function formatHHMM(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(11, 16);
}

/**
 * 데이터 신선도 판정([추가 2]):
 *  - 40분 미만: 실시간
 *  - 40분 이상 ~ 90분 미만: 지연 (노랑)
 *  - 90분 이상: 끊김 (빨강)
 */
export function computeFreshness(latestMs: number | null, nowMs: number = Date.now()): FreshnessInfo {
  if (latestMs === null || !Number.isFinite(latestMs)) {
    return {
      status: "none",
      label: "연결 전",
      timeText: "—",
      agoText: "",
      fullText: "기준 시각 — (데이터 연결 전)",
      shortText: "연결 전",
    };
  }
  const diffMin = Math.max(0, Math.round((nowMs - latestMs) / 60000));
  const status: FreshnessStatus = diffMin >= 90 ? "disconnected" : diffMin >= 40 ? "delayed" : "live";
  const label = status === "disconnected" ? "끊김" : status === "delayed" ? "지연" : "실시간";
  const timeText = formatHHMM(latestMs);
  const agoText =
    diffMin < 1
      ? "방금"
      : diffMin < 60
        ? `${diffMin}분 전`
        : `${Math.floor(diffMin / 60)}시간${diffMin % 60 ? ` ${diffMin % 60}분` : ""} 전`;
  return {
    status,
    label,
    timeText,
    agoText,
    fullText: `${label} · ${timeText} 기준 (${agoText})`,
    shortText: `${timeText} (${agoText})`,
  };
}

export type SmokeTone = "exceed" | "risk" | "calm";

/** 전국 최신 상태에 따른 로고 연기 색 기운([추가 2]) */
export function smokeToneOf(counts: { exceed: number; risk: number } | null | undefined): SmokeTone {
  if (!counts) return "calm";
  if (counts.exceed > 0) return "exceed";
  if (counts.risk > 0) return "risk";
  return "calm";
}

/** 사용자 표시 이름: 로그인 name 우선, 없으면 email의 @ 앞부분 */
export function userDisplayName(name?: string, email?: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  const local = email?.split("@")[0]?.trim();
  return local || "사용자";
}

/** 아바타 이니셜 1글자 */
export function userInitial(displayName: string): string {
  const ch = displayName.trim().charAt(0);
  return ch ? ch.toUpperCase() : "U";
}
