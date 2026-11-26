// 사업장별 파생 지표(순수 함수): 내 사업장·경고 목록·상세 서랍(개요·굴뚝별·사업장 탭)에서 공유한다.
import {
  parseNumber,
  pollutantLimit,
  pollutantRaw,
  ratioOf,
  siteStateAt,
  type DayData,
  type Pollutant,
  type Site,
} from "../data/model";
import { levelOf, type LevelKey } from "../logic/status";

export type TrendDir = "up" | "down" | "flat";
export type DetailTabKey = "overview" | "trend" | "stacks" | "ai";

export interface PollutantSnapshot {
  value: number | null;
  limit: number | null;
  raw: string | null;
  ratio: number | null;
  level: LevelKey | null;
}

export interface WorstDetail extends PollutantSnapshot {
  stackCode: string | null;
  pollutant: Pollutant | null;
}

export interface SparklineSummary {
  /** 최근 6시간(기본 12칸, 30분 간격) 비율(%) 목록. 결측은 null */
  points: Array<number | null>;
  direction: TrendDir;
  arrow: "↑" | "↓" | "→";
}

export interface LevelStreak {
  level: LevelKey | null;
  slots: number;
  sinceMs: number | null;
  durationLabel: string;
}

export interface StackRowSummary {
  code: string;
  key: string;
  nox: PollutantSnapshot;
  sox: PollutantSnapshot;
  worstRatio: number | null;
  worstLevel: LevelKey | null;
}

export const MAX_OPEN_TABS = 6;
const TREND_EPS = 3; // ±3%p 이상 변화해야 상승/하강 화살표

/** 주소 전체 대신 "시·도 시·군" 한 줄 */
export function shortRegion(site: Pick<Site, "sido" | "sigungu">): string {
  return `${site.sido} ${site.sigungu}`.trim() || "지역 정보 없음";
}

/** 물질 표시 이름 */
export function pollutantName(p: Pollutant | null): string {
  if (p === "nox") return "NOx";
  if (p === "sox") return "SOx";
  return "";
}

/** ppm 숫자 표시: 측정값은 소수 1자리(예: 57.0), 기준값은 정수면 정수(예: 50) */
export function formatMeasurePpm(v: number | null): string {
  if (v === null) return "—";
  return v.toFixed(1);
}

export function formatLimitPpm(v: number | null): string {
  if (v === null) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function formatPpmPair(value: number | null, limit: number | null): string | null {
  if (value === null || limit === null) return null;
  return `${formatMeasurePpm(value)} / ${formatLimitPpm(limit)} ppm`;
}

/** 특정 시점에서 사업장의 가장 높은 비율 굴뚝·물질·실측값·기준값 */
export function worstDetailAt(site: Site, day: DayData, slot: number): WorstDetail {
  let best: WorstDetail = {
    stackCode: null,
    pollutant: null,
    value: null,
    limit: null,
    raw: null,
    ratio: null,
    level: null,
  };
  for (const st of site.stacks) {
    const s = day.stacks[st.key];
    if (!s) continue;
    for (const p of ["nox", "sox"] as const) {
      const raw = pollutantRaw(s, p)[slot] ?? null;
      const limitRaw = pollutantLimit(s, p);
      const r = ratioOf(raw, limitRaw);
      if (r !== null && (best.ratio === null || r > best.ratio)) {
        best = {
          stackCode: st.code,
          pollutant: p,
          value: parseNumber(raw),
          limit: parseNumber(limitRaw),
          raw,
          ratio: r,
          level: levelOf(r),
        };
      }
    }
  }
  return best;
}

/** 최근 6시간(30분×12칸) 미니 추세선 데이터와 방향(↑↓→) */
export function recentSparkline(site: Site, day: DayData, slot: number, count = 12): SparklineSummary {
  const end = Math.min(slot, day.times.length - 1);
  if (end < 0) return { points: [], direction: "flat", arrow: "→" };
  const start = Math.max(0, end - count + 1);
  const points: Array<number | null> = [];
  for (let i = start; i <= end; i++) {
    points.push(siteStateAt(site, day, i).ratio);
  }
  const valid = points.filter((v): v is number => v !== null);
  if (valid.length < 2) return { points, direction: "flat", arrow: "→" };
  const delta = valid[valid.length - 1] - valid[0];
  if (delta >= TREND_EPS) return { points, direction: "up", arrow: "↑" };
  if (delta <= -TREND_EPS) return { points, direction: "down", arrow: "↓" };
  return { points, direction: "flat", arrow: "→" };
}

/** 30분 칸 수 → "30분째", "1시간째", "1시간 30분째", "2시간째" */
export function formatStreakDuration(slots: number): string {
  if (slots <= 0) return "";
  const mins = slots * 30;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}분째`;
  if (m === 0) return `${h}시간째`;
  return `${h}시간 ${m}분째`;
}

/** 현재 단계가 몇 칸(언제부터) 연속 유지됐는지 계산 */
export function levelStreakAt(site: Site, day: DayData, slot: number): LevelStreak {
  const end = Math.min(slot, day.times.length - 1);
  if (end < 0) return { level: null, slots: 0, sinceMs: null, durationLabel: "" };
  const cur = siteStateAt(site, day, end).level;
  if (!cur) return { level: null, slots: 0, sinceMs: null, durationLabel: "" };
  let first = end;
  while (first > 0 && siteStateAt(site, day, first - 1).level === cur) {
    first--;
  }
  const slots = end - first + 1;
  return {
    level: cur,
    slots,
    sinceMs: day.times[first] ?? null,
    durationLabel: formatStreakDuration(slots),
  };
}

/** 오늘(0..slot) 중 사업장 측정값이 아예 없는 칸 수 */
export function missingSlotsCount(site: Site, day: DayData, slot: number): number {
  const end = Math.min(slot, day.times.length - 1);
  let missing = 0;
  for (let i = 0; i <= end; i++) {
    if (siteStateAt(site, day, i).ratio === null) missing++;
  }
  return missing;
}

/** 굴뚝별 NOx·SOx 현재값 / 기준 / 비율 / 단계 표 데이터 */
export function stackRowsAt(site: Site, day: DayData, slot: number): StackRowSummary[] {
  return site.stacks.map((st) => {
    const s = day.stacks[st.key];
    const snap = (p: Pollutant): PollutantSnapshot => {
      if (!s) return { value: null, limit: null, raw: null, ratio: null, level: null };
      const raw = pollutantRaw(s, p)[slot] ?? null;
      const limitRaw = pollutantLimit(s, p);
      const r = ratioOf(raw, limitRaw);
      return {
        value: parseNumber(raw),
        limit: parseNumber(limitRaw),
        raw,
        ratio: r,
        level: levelOf(r),
      };
    };
    const nox = snap("nox");
    const sox = snap("sox");
    const worstRatio =
      nox.ratio === null ? sox.ratio : sox.ratio === null ? nox.ratio : Math.max(nox.ratio, sox.ratio);
    return {
      code: st.code,
      key: st.key,
      nox,
      sox,
      worstRatio,
      worstLevel: levelOf(worstRatio),
    };
  });
}

/** 상세 서랍 기본 내용 탭: 초과·위험이면 추세, 그 밖에는 개요 */
export function defaultDetailTab(level: LevelKey | null): DetailTabKey {
  return level === "exceed" || level === "risk" ? "trend" : "overview";
}

/** 크롬형 사업장 탭 추가(최대 max개). 이미 열려 있으면 순서 유지 */
export function pushOpenTab(tabs: readonly string[], siteId: string, max = MAX_OPEN_TABS): string[] {
  if (tabs.includes(siteId)) return [...tabs];
  const next = [...tabs, siteId];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** 크롬형 사업장 탭 닫기: 현재 탭을 닫으면 옆 탭으로 이동(없으면 null) */
export function closeOpenTab(
  tabs: readonly string[],
  activeId: string | null,
  closeId: string,
): { tabs: string[]; nextActive: string | null } {
  const idx = tabs.indexOf(closeId);
  if (idx < 0) return { tabs: [...tabs], nextActive: activeId };
  const next = tabs.filter((id) => id !== closeId);
  if (activeId !== closeId) return { tabs: next, nextActive: activeId };
  if (next.length === 0) return { tabs: [], nextActive: null };
  const nextIdx = Math.min(idx, next.length - 1);
  return { tabs: next, nextActive: next[nextIdx] };
}
