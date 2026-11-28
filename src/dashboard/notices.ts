// 공지(롤링 배너·스티커)의 판정·정렬(순수 함수). 옛 웹 notice-banner-core.js를 옮겼다.
// 판정은 지도 시간대 슬라이더가 아니라 **최신 데이터**(마지막 칸)를 현재 상태로 본다.
import { stackRatioAt, type DayData, type Site } from "../data/model";
import { levelOf, type LevelKey } from "../logic/status";

/** 최신 값이 이 칸 수(30분 × 6 = 3시간)보다 오래됐으면 현재 상황으로 알리지 않는다(옛 웹의 3시간 규칙) */
export const STALE_SLOTS = 6;

const ORDER: Record<LevelKey, number> = { ok: 0, caution: 1, warn: 2, risk: 3, exceed: 4 };

/** 상승 추세 판정 창(30분 × 12 = 최근 6시간)과 최소 상승폭(%p) */
export const RISING_WINDOW_SLOTS = 12;
export const RISING_MIN_DELTA = 3;

export interface Notice {
  /** 같은 사업장·굴뚝·단계면 같은 키. 닫은 공지를 기억하고, 새 키(새 굴뚝·더 나빠진 단계)가 생기면 다시 보이게 한다 */
  key: string;
  siteId: string;
  name: string;
  stackCode: string;
  level: LevelKey;
  ratio: number;
  /** 최근 창 대비 상승폭(%p). 상승 추세 공지에서만 채운다 */
  delta?: number;
  /** 상승 비교 기준 이전 비율(%) */
  prevRatio?: number;
}

export interface NoticeOptions {
  /** 공지로 만들 단계 */
  levels: readonly LevelKey[];
  /** 주면 이 사업장만(즐겨찾기) */
  only?: ReadonlySet<string>;
}

export interface RisingNoticeOptions {
  /** 최소 상승폭(%p). 기본 RISING_MIN_DELTA(3) */
  minDelta?: number;
  /** 비교 창 칸 수(30분 단위). 기본 RISING_WINDOW_SLOTS(12 = 6시간) */
  windowSlots?: number;
  /** 이미 초과 단계인 굴뚝 제외 여부. 기본 true */
  excludeExceed?: boolean;
  /** 주면 이 사업장만 */
  only?: ReadonlySet<string>;
}

/** 굴뚝의 현재 비율: 마지막 칸에서 거슬러 올라가 값이 있는 첫 칸(최대 STALE_SLOTS칸). 없으면 null */
export function latestRatio(day: DayData, stackKey: string): number | null {
  const s = day.stacks[stackKey];
  if (!s) return null;
  const last = day.times.length - 1;
  for (let i = last; i > last - STALE_SLOTS && i >= 0; i--) {
    const r = stackRatioAt(s, i);
    if (r !== null) return r;
  }
  return null;
}

/** 사업장마다 비율이 가장 높은 굴뚝 하나를 공지로 만든다. 높은 단계 → 높은 비율 → 이름 순 */
export function buildNotices(sites: readonly Site[], day: DayData, opts: NoticeOptions): Notice[] {
  const out: Notice[] = [];
  for (const site of sites) {
    if (opts.only && !opts.only.has(site.id)) continue;
    let best: { ratio: number; code: string } | null = null;
    for (const st of site.stacks) {
      const r = latestRatio(day, st.key);
      if (r !== null && (best === null || r > best.ratio)) best = { ratio: r, code: st.code };
    }
    if (!best) continue;
    const level = levelOf(best.ratio);
    if (!level || !opts.levels.includes(level)) continue;
    out.push({ key: `${site.id}|${best.code}|${level}`, siteId: site.id, name: site.name, stackCode: best.code, level, ratio: best.ratio });
  }
  return out.sort(
    (a, b) => ORDER[b.level] - ORDER[a.level] || b.ratio - a.ratio || a.name.localeCompare(b.name, "ko"),
  );
}

/**
 * 최근 6시간 창에서 비율이 뚜렷하게 상승 중인 사업장을 뽑는다(기본: 초과 제외).
 * 사업장마다 상승폭이 가장 큰 굴뚝 하나를 대표로 두고, 높은 단계 → 큰 상승폭 → 높은 비율 → 이름 순으로 정렬한다.
 */
export function buildRisingNotices(
  sites: readonly Site[],
  day: DayData,
  opts: RisingNoticeOptions = {},
): Notice[] {
  const minDelta = opts.minDelta ?? RISING_MIN_DELTA;
  const windowSlots = opts.windowSlots ?? RISING_WINDOW_SLOTS;
  const excludeExceed = opts.excludeExceed ?? true;
  const last = day.times.length - 1;
  if (last < 1) return [];

  const windowStart = Math.max(0, last - (windowSlots - 1));
  const out: Notice[] = [];

  for (const site of sites) {
    if (opts.only && !opts.only.has(site.id)) continue;
    let best: { code: string; ratio: number; prevRatio: number; delta: number; level: LevelKey } | null = null;

    for (const st of site.stacks) {
      const s = day.stacks[st.key];
      if (!s) continue;

      let latestVal: number | null = null;
      let latestIdx = -1;
      for (let i = last; i > last - STALE_SLOTS && i >= 0; i--) {
        const r = stackRatioAt(s, i);
        if (r !== null) {
          latestVal = r;
          latestIdx = i;
          break;
        }
      }
      if (latestVal === null || latestIdx <= windowStart) continue;

      const level = levelOf(latestVal);
      if (!level) continue;
      if (excludeExceed && level === "exceed") continue;

      let firstVal: number | null = null;
      for (let i = windowStart; i < latestIdx; i++) {
        const r = stackRatioAt(s, i);
        if (r !== null) {
          firstVal = r;
          break;
        }
      }
      if (firstVal === null) continue;

      const delta = latestVal - firstVal;
      if (delta < minDelta) continue;

      if (
        !best ||
        delta > best.delta ||
        (delta === best.delta && latestVal > best.ratio)
      ) {
        best = { code: st.code, ratio: latestVal, prevRatio: firstVal, delta, level };
      }
    }

    if (!best) continue;
    out.push({
      key: `${site.id}|${best.code}|rising|${best.level}`,
      siteId: site.id,
      name: site.name,
      stackCode: best.code,
      level: best.level,
      ratio: best.ratio,
      delta: best.delta,
      prevRatio: best.prevRatio,
    });
  }

  return out.sort(
    (a, b) =>
      ORDER[b.level] - ORDER[a.level] ||
      (b.delta ?? 0) - (a.delta ?? 0) ||
      b.ratio - a.ratio ||
      a.name.localeCompare(b.name, "ko"),
  );
}

/** 닫은 공지를 빼고 보여 줄 목록. 닫지 않은 새 공지가 하나라도 있으면 전체가 다시 보인다(옛 웹 규칙) */
export function visibleNotices(items: readonly Notice[], dismissed: readonly string[]): Notice[] {
  const d = new Set(dismissed);
  return items.some((i) => !d.has(i.key)) ? [...items] : [];
}

const STORAGE_KEY = "tms-notice-dismissed";
export function readDismissed(): string[] {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function writeDismissed(keys: readonly string[]): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(keys)]));
  } catch {
    /* 저장하지 못해도 이번 화면에서는 닫힌다 */
  }
}
