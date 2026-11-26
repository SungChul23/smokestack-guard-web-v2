// 미리보기 모드용 가짜 관제 데이터 ([G] 사양).
// src/data/model.ts의 타입(Site, DayData, StackSeries, GeoRegion)을 그대로 따른다.
// 실제 사업장명을 쓰지 않고, 전국 40곳(울산·포항·여수·당진·광양 산단 밀집), 오늘 00:00~16:30(34칸)을 만든다.
import type { DayData, GeoRegion, Raw, Site, StackSeries } from "../data/model";
import type { DashboardData } from "../data/useDay";
import { useSelection } from "../state/selection";

const SLOT_MS = 30 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const PREVIEW_SLOT_COUNT = 34; // 00:00 ~ 16:30 (30분 간격 34칸)

const mkSite = (
  id: string,
  name: string,
  sido: string,
  sigungu: string,
  address: string,
  lon: number,
  lat: number,
  codes: string[],
): Site => ({
  id,
  name,
  sido,
  sigungu,
  address,
  lon,
  lat,
  stacks: codes.map((code) => ({ key: `${id}:${code}`, code })),
});

/**
 * 가짜 사업장 40곳 (굴뚝 1~4개씩).
 * 울산(6)·포항(5)·여수(6)·광양(5)·당진(5) 산단 밀집 + 전국 분산(13).
 * 최신 칸(16:30) 분포: 초과 3, 위험 2, 경고 3, 주의 4, 측정 없음 4, 정상 24.
 */
export const PREVIEW_SITES: Site[] = [
  // ── 초과 3곳 ──────────────────────────────────────────────────
  mkSite("PV-01", "가나에너지(주)", "충남", "당진시", "충청남도 당진시 석문산단로 104", 126.582, 37.015, ["1", "2", "3"]),
  mkSite("PV-02", "동해화력발전(주)", "강원", "동해시", "강원특별자치도 동해시 공단해안로 52", 129.105, 37.495, ["1", "2"]),
  mkSite("PV-03", "남해석유화학(주)", "전남", "여수시", "전라남도 여수시 산단중앙로 218", 127.672, 34.825, ["1", "2", "3", "4"]),

  // ── 위험 2곳 ──────────────────────────────────────────────────
  mkSite("PV-04", "한빛제철(주)", "경북", "포항시", "경상북도 포항시 남구 철강로 77", 129.365, 36.019, ["1", "2", "3"]),
  mkSite("PV-05", "새별정밀소재(주)", "울산", "남구", "울산광역시 남구 용연산업로 39", 129.335, 35.515, ["1", "2"]),

  // ── 경고 3곳 ──────────────────────────────────────────────────
  mkSite("PV-06", "다라화학(주)", "울산", "남구", "울산광역시 남구 처용로 148", 129.352, 35.503, ["1", "2", "3"]),
  mkSite("PV-07", "광양특수강(주)", "전남", "광양시", "전라남도 광양시 제철산단로 312", 127.732, 34.938, ["1", "2", "3", "4"]),
  mkSite("PV-08", "청솔열병합(주)", "경기", "평택시", "경기도 평택시 포승공단로 161", 126.912, 36.985, ["1", "2"]),

  // ── 주의 4곳 ──────────────────────────────────────────────────
  mkSite("PV-09", "서해시멘트(주)", "인천", "서구", "인천광역시 서구 원창산단길 88", 126.645, 37.525, ["1", "2"]),
  mkSite("PV-10", "포항합금소재(주)", "경북", "포항시", "경상북도 포항시 남구 연일공단로 92", 129.342, 35.992, ["1", "2"]),
  mkSite("PV-11", "여수폴리머(주)", "전남", "여수시", "전라남도 여수시 중흥산단길 64", 127.688, 34.838, ["1", "2", "3"]),
  mkSite("PV-12", "당진화력에너지(주)", "충남", "당진시", "충청남도 당진시 송악공단로 210", 126.718, 36.972, ["1", "2", "3"]),

  // ── 측정 없음 4곳 (최신 칸 가동중지·기기점검 또는 null) ─────────
  mkSite("PV-13", "울주정밀화학(주)", "울산", "울주군", "울산광역시 울주군 온산공단로 215", 129.318, 35.438, ["1", "2"]),
  mkSite("PV-14", "영일만열에너지(주)", "경북", "포항시", "경상북도 포항시 북구 흥해산단로 41", 129.388, 36.082, ["1"]),
  mkSite("PV-15", "광양항만발전(주)", "전남", "광양시", "전라남도 광양시 태인산단길 85", 127.748, 34.952, ["1", "2"]),
  mkSite("PV-16", "한라청정발전(주)", "제주", "제주시", "제주특별자치도 제주시 삼양해안로 63", 126.585, 33.515, ["1"]),

  // ── 정상 24곳 (산단 밀집 + 전국 분산) ──────────────────────────
  // 울산 산단 (추가 3 → 울산 총 6)
  mkSite("PV-17", "온산그린에너지(주)", "울산", "울주군", "울산광역시 울주군 화산공단길 54", 129.338, 35.425, ["1", "2"]),
  mkSite("PV-18", "태화석유정제(주)", "울산", "남구", "울산광역시 남구 매암산단로 112", 129.365, 35.524, ["1", "2", "3"]),
  mkSite("PV-19", "미포신소재(주)", "울산", "동구", "울산광역시 동구 방어진산단로 73", 129.405, 35.512, ["1"]),

  // 포항 산단 (추가 2 → 포항 총 5)
  mkSite("PV-20", "형산강제련(주)", "경북", "포항시", "경상북도 포항시 남구 괴동산단길 19", 129.376, 36.004, ["1", "2", "3"]),
  mkSite("PV-21", "구룡금속가공(주)", "경북", "포항시", "경상북도 포항시 남구 오천공단로 133", 129.412, 35.968, ["1", "2"]),

  // 여수 산단 (추가 4 → 여수 총 6)
  mkSite("PV-22", "여천케미칼(주)", "전남", "여수시", "전라남도 여수시 평여산단로 97", 127.658, 34.812, ["1", "2", "3"]),
  mkSite("PV-23", "묘도청정열병합(주)", "전남", "여수시", "전라남도 여수시 월내산단길 44", 127.702, 34.848, ["1", "2"]),
  mkSite("PV-24", "오동정밀수지(주)", "전남", "여수시", "전라남도 여수시 낙포공단로 158", 127.716, 34.832, ["1", "2"]),
  mkSite("PV-25", "한려산업가스(주)", "전남", "여수시", "전라남도 여수시 화치산단로 26", 127.646, 34.805, ["1"]),

  // 광양 산단 (추가 3 → 광양 총 5)
  mkSite("PV-26", "백운강철소재(주)", "전남", "광양시", "전라남도 광양시 금호산단로 108", 127.718, 34.928, ["1", "2", "3"]),
  mkSite("PV-27", "섬진환경발전(주)", "전남", "광양시", "전라남도 광양시 중마공단길 61", 127.694, 34.946, ["1", "2"]),
  mkSite("PV-28", "순천만물류열원(주)", "전남", "광양시", "전라남도 광양시 광양읍 산단로 172", 127.615, 34.962, ["1"]),

  // 당진 산단 (추가 3 → 당진 총 5)
  mkSite("PV-29", "아산만철강(주)", "충남", "당진시", "충청남도 당진시 고대공단로 88", 126.648, 36.995, ["1", "2", "3"]),
  mkSite("PV-30", "삽교에코발전(주)", "충남", "당진시", "충청남도 당진시 신평산단길 52", 126.762, 36.898, ["1", "2"]),
  mkSite("PV-31", "석문정밀유리(주)", "충남", "당진시", "충청남도 당진시 석문공단중앙로 27", 126.548, 37.028, ["1"]),

  // 전국 분산 (추가 9 → 전국 분산 총 13)
  mkSite("PV-32", "대산석유소재(주)", "충남", "서산시", "충청남도 서산시 대산읍 산단로 145", 126.425, 36.982, ["1", "2", "3"]),
  mkSite("PV-33", "시화환경열병합(주)", "경기", "시흥시", "경기도 시흥시 공단대로 204", 126.735, 37.345, ["1", "2"]),
  mkSite("PV-34", "경인자원회수(주)", "인천", "서구", "인천광역시 서구 백석산단로 33", 126.672, 37.568, ["1", "2"]),
  mkSite("PV-35", "삼척석회소성(주)", "강원", "삼척시", "강원특별자치도 삼척시 근덕공단로 91", 129.215, 37.385, ["1", "2"]),
  mkSite("PV-36", "금강자원순환(주)", "충북", "청주시", "충청북도 청주시 흥덕구 산단로 45", 127.429, 36.642, ["1", "2"]),
  mkSite("PV-37", "갑천열공급(주)", "대전", "대덕구", "대전광역시 대덕구 신탄진산단로 76", 127.422, 36.445, ["1"]),
  mkSite("PV-38", "비슬정밀주조(주)", "대구", "달성군", "대구광역시 달성군 논공산단로 118", 128.452, 35.732, ["1", "2"]),
  mkSite("PV-39", "녹산청정열원(주)", "부산", "강서구", "부산광역시 강서구 녹산산단로 240", 128.862, 35.095, ["1", "2"]),
  mkSite("PV-40", "낙동강환경에너지(주)", "경남", "창원시", "경상남도 창원시 성산구 공단로 120", 128.681, 35.228, ["1", "2"]),
];

/** 초기 즐겨찾기 5곳: 초과 1곳(PV-01), 측정 없음 1곳(PV-13), 위험 1곳(PV-04), 경고 1곳(PV-06), 정상 1곳(PV-17) */
export const PREVIEW_FAVORITE_IDS: readonly string[] = [
  "PV-01",
  "PV-13",
  "PV-04",
  "PV-06",
  "PV-17",
];

interface WaveSpec {
  limit: number;
  basePct: number;
  endPct: number;
  ampPct: number;
  phase: number;
  /** 마지막 구간 등 특정 인덱스를 정확한 비율(%)로 고정 */
  overridePct?: Readonly<Record<number, number>>;
  /** 결측(null) 슬롯 인덱스 */
  nullSlots?: readonly number[];
  /** 상태 문구("가동중지"·"기기점검" 등) 슬롯 인덱스 */
  statusSlots?: Readonly<Record<number, string>>;
  /** 중간 칸 비율 상한(예: 마지막 칸에서만 처음 초과하도록 98% 이하로 제한) */
  maxMidPct?: number;
}

function buildPollutant(spec: WaveSpec): { values: Raw[]; limit: Raw } {
  const nullSet = new Set(spec.nullSlots ?? []);
  const statusMap = spec.statusSlots ?? {};
  const overrideMap = spec.overridePct ?? {};
  const values: Raw[] = Array.from({ length: PREVIEW_SLOT_COUNT }, (_, i) => {
    if (statusMap[i] !== undefined) return statusMap[i];
    if (nullSet.has(i)) return null;
    let pct: number;
    if (overrideMap[i] !== undefined) {
      pct = overrideMap[i];
    } else if (i === PREVIEW_SLOT_COUNT - 1) {
      pct = spec.endPct;
    } else {
      const t = i / (PREVIEW_SLOT_COUNT - 1);
      const trend = spec.basePct + (spec.endPct - spec.basePct) * (t * t);
      const wave =
        Math.sin((i + spec.phase) * 0.45) * spec.ampPct * 0.65 +
        Math.cos(i * 0.27 + spec.phase) * spec.ampPct * 0.35;
      pct = Math.max(4, trend + wave);
      if (spec.maxMidPct !== undefined) pct = Math.min(pct, spec.maxMidPct);
    }
    return ((pct / 100) * spec.limit).toFixed(1);
  });
  return { values, limit: String(spec.limit) };
}

function makeSeries(nox: WaveSpec, sox: WaveSpec | null): StackSeries {
  const n = buildPollutant(nox);
  if (!sox) {
    return {
      nox: n.values,
      sox: Array<Raw>(PREVIEW_SLOT_COUNT).fill(null),
      noxLimit: n.limit,
      soxLimit: null,
    };
  }
  const s = buildPollutant(sox);
  return {
    nox: n.values,
    sox: s.values,
    noxLimit: n.limit,
    soxLimit: s.limit,
  };
}

/** 오늘(KST) 00:00~16:30, 30분 간격 34칸 가짜 측정 데이터 생성 */
export function createPreviewDay(nowMs: number = Date.now()): DayData {
  const kstDayStart = Math.floor((nowMs + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
  const times = Array.from({ length: PREVIEW_SLOT_COUNT }, (_, i) => kstDayStart + i * SLOT_MS);

  const stacks: Record<string, StackSeries> = {
    // ── 초과 1: PV-01 가나에너지(주) — 오후 2시(index 28)부터 계속 오르는 추세 (114%) ──
    "PV-01:1": makeSeries(
      { limit: 80, basePct: 60, endPct: 84, ampPct: 6, phase: 0.4, maxMidPct: 92 },
      { limit: 50, basePct: 44, endPct: 58, ampPct: 5, phase: 1.2 },
    ),
    "PV-01:2": makeSeries(
      {
        limit: 50,
        basePct: 72,
        endPct: 114,
        ampPct: 5,
        phase: 0.8,
        maxMidPct: 88,
        nullSlots: [12, 13],
        // 14:00(28) → 14:30(29) → 15:00(30) → 15:30(31) → 16:00(32) → 16:30(33) 단조 상승
        overridePct: { 28: 89, 29: 94, 30: 99, 31: 105, 32: 110, 33: 114 },
      },
      { limit: 40, basePct: 50, endPct: 64, ampPct: 5, phase: 2.1 },
    ),
    "PV-01:3": makeSeries(
      { limit: 80, basePct: 40, endPct: 46, ampPct: 5, phase: 1.7, nullSlots: [18, 19] },
      { limit: 50, basePct: 30, endPct: 35, ampPct: 4, phase: 0.5 },
    ),

    // ── 초과 2: PV-02 동해화력발전(주) — 마지막 칸(16:30, index 33)에서 처음 넘음 (108%) ──
    "PV-02:1": makeSeries(
      { limit: 100, basePct: 62, endPct: 78, ampPct: 6, phase: 2.0, maxMidPct: 86 },
      {
        limit: 70,
        basePct: 70,
        endPct: 108,
        ampPct: 6,
        phase: 1.3,
        maxMidPct: 96,
        nullSlots: [8, 9],
        // 16:00(32)까지 100% 미만 유지 후, 마지막 칸 16:30(33)에서 첫 초과
        overridePct: { 29: 88, 30: 91, 31: 94, 32: 97, 33: 108 },
      },
    ),
    "PV-02:2": makeSeries(
      { limit: 100, basePct: 56, endPct: 74, ampPct: 5, phase: 0.3, maxMidPct: 82 },
      { limit: 70, basePct: 42, endPct: 52, ampPct: 4, phase: 2.6 },
    ),

    // ── 초과 3: PV-03 남해석유화학(주) — 넘었다가 내려오는 중 (119% 정점 → 104%) ──
    "PV-03:1": makeSeries(
      { limit: 90, basePct: 72, endPct: 92, ampPct: 5, phase: 1.1, maxMidPct: 96 },
      { limit: 60, basePct: 58, endPct: 74, ampPct: 5, phase: 2.4 },
    ),
    "PV-03:2": makeSeries(
      { limit: 90, basePct: 46, endPct: 52, ampPct: 5, phase: 0.8, nullSlots: [14, 15], statusSlots: { 16: "기기점검" } },
      { limit: 60, basePct: 36, endPct: 42, ampPct: 4, phase: 1.9, nullSlots: [14, 15, 16] },
    ),
    "PV-03:3": makeSeries(
      {
        limit: 100,
        basePct: 76,
        endPct: 104,
        ampPct: 6,
        phase: 2.8,
        maxMidPct: 96,
        // 14:00(28) 112% → 14:30(29) 119%(정점) → 15:00 116% → 15:30 111% → 16:00 107% → 16:30 104%
        overridePct: { 27: 98, 28: 112, 29: 119, 30: 116, 31: 111, 32: 107, 33: 104 },
      },
      { limit: 60, basePct: 68, endPct: 86, ampPct: 5, phase: 0.6, maxMidPct: 94 },
    ),
    "PV-03:4": makeSeries(
      { limit: 90, basePct: 48, endPct: 54, ampPct: 5, phase: 1.5 },
      { limit: 60, basePct: 38, endPct: 44, ampPct: 4, phase: 2.2 },
    ),

    // ── 위험 2곳 (90~<100%) ──────────────────────────────────────
    "PV-04:1": makeSeries(
      { limit: 120, basePct: 70, endPct: 95, ampPct: 6, phase: 1.6, maxMidPct: 97, nullSlots: [10, 11] },
      { limit: 80, basePct: 54, endPct: 68, ampPct: 5, phase: 2.9 },
    ),
    "PV-04:2": makeSeries(
      { limit: 120, basePct: 50, endPct: 58, ampPct: 5, phase: 0.2 },
      { limit: 80, basePct: 40, endPct: 45, ampPct: 4, phase: 1.4 },
    ),
    "PV-04:3": makeSeries(
      { limit: 120, basePct: 62, endPct: 72, ampPct: 5, phase: 2.1 },
      { limit: 80, basePct: 48, endPct: 56, ampPct: 4, phase: 0.9 },
    ),

    "PV-05:1": makeSeries(
      { limit: 70, basePct: 38, endPct: 44, ampPct: 5, phase: 2.2 },
      { limit: 50, basePct: 33, endPct: 39, ampPct: 4, phase: 0.7 },
    ),
    "PV-05:2": makeSeries(
      { limit: 70, basePct: 58, endPct: 71, ampPct: 5, phase: 1.5 },
      { limit: 50, basePct: 68, endPct: 92, ampPct: 6, phase: 2.7, maxMidPct: 96 },
    ),

    // ── 경고 3곳 (80~<90%) ──────────────────────────────────────
    "PV-06:1": makeSeries(
      { limit: 90, basePct: 66, endPct: 87, ampPct: 5, phase: 0.5, maxMidPct: 89 },
      { limit: 60, basePct: 52, endPct: 66, ampPct: 5, phase: 1.8 },
    ),
    "PV-06:2": makeSeries(
      { limit: 90, basePct: 50, endPct: 62, ampPct: 5, phase: 2.3 },
      { limit: 60, basePct: 40, endPct: 48, ampPct: 4, phase: 0.4 },
    ),
    "PV-06:3": makeSeries(
      { limit: 90, basePct: 42, endPct: 51, ampPct: 4, phase: 1.2, nullSlots: [22, 23] },
      { limit: 60, basePct: 35, endPct: 41, ampPct: 4, phase: 2.6 },
    ),

    "PV-07:1": makeSeries(
      { limit: 130, basePct: 52, endPct: 63, ampPct: 5, phase: 1.0 },
      { limit: 90, basePct: 48, endPct: 58, ampPct: 4, phase: 2.1 },
    ),
    "PV-07:2": makeSeries(
      { limit: 130, basePct: 62, endPct: 74, ampPct: 5, phase: 0.7 },
      { limit: 90, basePct: 66, endPct: 84, ampPct: 5, phase: 1.9, maxMidPct: 88 },
    ),
    "PV-07:3": makeSeries(
      { limit: 130, basePct: 44, endPct: 52, ampPct: 4, phase: 2.5 },
      { limit: 90, basePct: 36, endPct: 43, ampPct: 4, phase: 0.3 },
    ),
    "PV-07:4": makeSeries(
      { limit: 130, basePct: 38, endPct: 45, ampPct: 4, phase: 1.6 },
      null,
    ),

    "PV-08:1": makeSeries(
      { limit: 60, basePct: 64, endPct: 82, ampPct: 5, phase: 0.6, maxMidPct: 87, nullSlots: [20, 21] },
      { limit: 40, basePct: 42, endPct: 54, ampPct: 4, phase: 1.8 },
    ),
    "PV-08:2": makeSeries(
      { limit: 60, basePct: 36, endPct: 41, ampPct: 4, phase: 2.5 },
      { limit: 40, basePct: 28, endPct: 32, ampPct: 4, phase: 0.9 },
    ),

    // ── 주의 4곳 (70~<80%) ──────────────────────────────────────
    "PV-09:1": makeSeries(
      { limit: 150, basePct: 60, endPct: 77, ampPct: 5, phase: 1.2, maxMidPct: 79, nullSlots: [6, 7] },
      { limit: 90, basePct: 44, endPct: 49, ampPct: 4, phase: 2.3 },
    ),
    "PV-09:2": makeSeries(
      { limit: 150, basePct: 46, endPct: 55, ampPct: 4, phase: 0.4 },
      { limit: 90, basePct: 38, endPct: 44, ampPct: 4, phase: 1.7 },
    ),

    "PV-10:1": makeSeries(
      { limit: 110, basePct: 54, endPct: 66, ampPct: 5, phase: 2.0 },
      { limit: 70, basePct: 60, endPct: 75, ampPct: 5, phase: 0.8, maxMidPct: 79 },
    ),
    "PV-10:2": makeSeries(
      { limit: 110, basePct: 40, endPct: 48, ampPct: 4, phase: 1.5 },
      { limit: 70, basePct: 32, endPct: 39, ampPct: 4, phase: 2.7 },
    ),

    "PV-11:1": makeSeries(
      { limit: 85, basePct: 48, endPct: 57, ampPct: 5, phase: 0.9 },
      { limit: 55, basePct: 38, endPct: 45, ampPct: 4, phase: 2.1 },
    ),
    "PV-11:2": makeSeries(
      { limit: 85, basePct: 58, endPct: 73, ampPct: 5, phase: 1.4, maxMidPct: 78 },
      { limit: 55, basePct: 46, endPct: 56, ampPct: 4, phase: 0.2 },
    ),
    "PV-11:3": makeSeries(
      { limit: 85, basePct: 42, endPct: 49, ampPct: 4, phase: 2.6 },
      { limit: 55, basePct: 34, endPct: 40, ampPct: 4, phase: 1.1 },
    ),

    "PV-12:1": makeSeries(
      { limit: 100, basePct: 54, endPct: 64, ampPct: 5, phase: 1.8 },
      { limit: 80, basePct: 58, endPct: 71, ampPct: 5, phase: 0.5, maxMidPct: 78 },
    ),
    "PV-12:2": makeSeries(
      { limit: 100, basePct: 46, endPct: 53, ampPct: 4, phase: 2.4 },
      { limit: 80, basePct: 40, endPct: 46, ampPct: 4, phase: 1.0 },
    ),
    "PV-12:3": makeSeries(
      { limit: 100, basePct: 38, endPct: 44, ampPct: 4, phase: 0.7 },
      { limit: 80, basePct: 30, endPct: 35, ampPct: 4, phase: 2.0 },
    ),

    // ── 측정 없음 4곳 (최신 칸 33에서 모든 굴뚝이 문구 또는 null) ──
    "PV-13:1": makeSeries(
      { limit: 80, basePct: 48, endPct: 50, ampPct: 4, phase: 1.1, statusSlots: { 30: "가동중지", 31: "가동중지", 32: "가동중지", 33: "가동중지" } },
      { limit: 50, basePct: 36, endPct: 38, ampPct: 4, phase: 2.2, statusSlots: { 30: "가동중지", 31: "가동중지", 32: "가동중지", 33: "가동중지" } },
    ),
    "PV-13:2": makeSeries(
      { limit: 80, basePct: 42, endPct: 44, ampPct: 4, phase: 0.6, statusSlots: { 31: "가동중지", 32: "가동중지", 33: "가동중지" } },
      { limit: 50, basePct: 31, endPct: 33, ampPct: 3, phase: 1.7, statusSlots: { 31: "가동중지", 32: "가동중지", 33: "가동중지" } },
    ),

    "PV-14:1": makeSeries(
      { limit: 70, basePct: 52, endPct: 54, ampPct: 5, phase: 2.0, statusSlots: { 30: "기기점검", 31: "기기점검", 32: "기기점검", 33: "기기점검" } },
      { limit: 45, basePct: 38, endPct: 40, ampPct: 4, phase: 0.9, statusSlots: { 30: "기기점검", 31: "기기점검", 32: "기기점검", 33: "기기점검" } },
    ),

    "PV-15:1": makeSeries(
      { limit: 90, basePct: 44, endPct: 46, ampPct: 4, phase: 1.3, nullSlots: [30, 31, 32, 33] },
      { limit: 60, basePct: 34, endPct: 36, ampPct: 4, phase: 2.5, nullSlots: [30, 31, 32, 33] },
    ),
    "PV-15:2": makeSeries(
      { limit: 90, basePct: 39, endPct: 41, ampPct: 4, phase: 0.4, nullSlots: [31, 32, 33] },
      { limit: 60, basePct: 29, endPct: 31, ampPct: 3, phase: 1.6, nullSlots: [31, 32, 33] },
    ),

    "PV-16:1": makeSeries(
      { limit: 60, basePct: 40, endPct: 42, ampPct: 4, phase: 1.9, nullSlots: [29, 30, 31, 32, 33] },
      { limit: 40, basePct: 29, endPct: 31, ampPct: 4, phase: 0.4, nullSlots: [29, 30, 31, 32, 33] },
    ),
  };

  // ── 정상 24곳(PV-17 ~ PV-40): 결정적 패턴으로 굴뚝별 NOx·SOx 생성 (<70%) ──
  const normalSites = PREVIEW_SITES.slice(16);
  normalSites.forEach((site, sIdx) => {
    const noxLimit = [60, 70, 80, 90, 100, 120, 140, 150][sIdx % 8];
    const soxLimit = [30, 40, 50, 60, 70, 80, 90, 100][(sIdx * 3 + 1) % 8];
    site.stacks.forEach((st, k) => {
      const seed = sIdx * 7 + k * 3;
      const baseNox = 26 + ((seed * 11) % 28); // 26~53%
      const endNox = Math.min(66, baseNox + ((seed * 5) % 14));
      const baseSox = 20 + ((seed * 9) % 26);
      const endSox = Math.min(62, baseSox + ((seed * 7) % 12));
      const gapStart = sIdx % 4 === 0 && k === 0 ? 15 + (sIdx % 6) : -1;
      const nullSlots = gapStart >= 0 ? [gapStart, gapStart + 1] : undefined;
      const singleNoxOnly = site.id === "PV-36" && st.code === "2";

      stacks[st.key] = makeSeries(
        {
          limit: noxLimit,
          basePct: baseNox,
          endPct: endNox,
          ampPct: 4 + (seed % 4),
          phase: (seed % 10) * 0.35,
          maxMidPct: 68,
          nullSlots,
        },
        singleNoxOnly
          ? null
          : {
              limit: soxLimit,
              basePct: baseSox,
              endPct: endSox,
              ampPct: 3 + (seed % 4),
              phase: ((seed + 4) % 10) * 0.35,
              maxMidPct: 66,
              nullSlots,
            },
      );
    });
  });

  return { times, stacks };
}

let cachedDay: DayData | null = null;
let favoritesSeeded = false;

/** 시험용 캐시 초기화 */
export function resetPreviewState(): void {
  cachedDay = null;
  favoritesSeeded = false;
}

/** 미리보기용 DashboardData 로더: 경계 지도는 정적 파일에서 읽고, 사업장·측정값·초기 즐겨찾기는 가짜 데이터를 쓴다 */
export async function loadPreviewData(loadGeo: () => Promise<GeoRegion[]>): Promise<DashboardData> {
  const geo = await loadGeo();
  cachedDay ??= createPreviewDay();
  if (!favoritesSeeded && useSelection.getState().favorites.length === 0) {
    favoritesSeeded = true;
    useSelection.getState().setFavorites([...PREVIEW_FAVORITE_IDS]);
  }
  return { sites: PREVIEW_SITES, day: cachedDay, geo };
}
