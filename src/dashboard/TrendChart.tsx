// 추세 차트(직접 그린 SVG · 서랍 1열 세로 흐름 [4]).
// - 수치는 모두 "기준 대비 %"(상대 수치)로만 보여 준다. ppm 같은 절대 수치는 화면에 쓰지 않는다.
// - 서랍 폭 변화에 맞춰 ResizeObserver로 SVG viewBox를 다시 계산해 축 글자 잘림·겹침을 막는다.
// - "직접…" 칩을 눌렀을 때만 시작·종료 일시, 조회 적용, 이전·다음 구간, 슬라이더, "자료 기준으로"를 펼친다(기본 접힘).
// - 그래프를 좌우로 끌어 30분씩 옮기는 기능은 접힘 상태에서도 그대로 동작한다.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  formatSlot, parseNumber, pollutantLimit, pollutantRaw, type DayData, type Pollutant, type Site,
} from "../data/model";
import {
  SLOT_MS, defaultRange, durationText, extentOf, formatKstInput, indicesIn, isDefaultRange, panRange, parseKstInput,
  periodChoices, shiftRange, validateRange, type ChartRange,
} from "../logic/chartRange";
import { ALERT_LEVELS, labelOf, levelOf } from "../logic/status";
import { useActiveStyle } from "../state/chartStyle";
import { POLLUTANT_ORDER, useSelection, type PeriodHours } from "../state/selection";
import { gapLinks, makeScale, type GapLink } from "./chartScale";
import { linePath } from "./curve";
import { CloseIcon } from "./icons";
import LevelMark from "./LevelMark";
import styles from "./TrendChart.module.css";

/** 기본 그림 크기(사용자 단위 · 시험 및 초기 렌더 기준) */
export const CHART = (() => {
  const W = 820, H = 320, PAD = { l: 60, r: 68, t: 20, b: 36 };
  return { W, H, PAD, iw: W - PAD.l - PAD.r, ih: H - PAD.t - PAD.b };
})();

/** 선택한 시점의 값 점 크기(원의 반지름, 사각형은 한 변 = 2배 − 1) */
export const DOT_R = 6;

/** 물질별 모양: 색만으로 구분하지 않도록 모양도 다르다(NOx 원, SOx 사각형) */
const SERIES: Record<Pollutant, { label: string; color: string; marker: "circle" | "square" }> = {
  nox: { label: "NOx", color: "var(--accent)", marker: "circle" },
  sox: { label: "SOx", color: "var(--series-2)", marker: "square" },
};

export interface Point { slot: number; value: number | null; raw: string | null }

/** 인덱스 i0~i1(포함) 구간의 점들. slot은 원래 배열의 인덱스다 */
export function pointsBetween(raws: Array<string | null>, i0: number, i1: number): Point[] {
  return raws.slice(i0, i1 + 1).map((raw, k) => ({ slot: i0 + k, value: parseNumber(raw), raw }));
}

/** 최근 periodHours 시간의 점들(30분 간격). 가진 시점이 모자라면 있는 만큼만 */
export function pointsOf(raws: Array<string | null>, periodHours: number): Point[] {
  const n = Math.min(periodHours * 2, raws.length);
  return pointsBetween(raws, raws.length - n, raws.length - 1);
}

/** 값이 있는 연속 구간들(공백에서 끊긴다) */
export function runsOf(points: Point[]): Point[][] {
  const runs: Point[][] = [];
  let cur: Point[] = [];
  for (const p of points) {
    if (p.value === null) { if (cur.length) runs.push(cur); cur = []; } else cur.push(p);
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** 굴뚝이 이보다 많으면 줄 대신 번호 검색으로 고른다 */
export const MANY_STACKS = 10;
const SEARCH_RESULTS = 12;

/** 굴뚝 번호 검색(순수 함수). 번호가 숫자면 숫자 순으로 */
export function findStacks(stacks: Site["stacks"], query: string): Site["stacks"] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return stacks
    .filter((s) => s.code.toLowerCase().includes(q))
    .sort((a, b) => a.code.localeCompare(b.code, "ko", { numeric: true }))
    .slice(0, SEARCH_RESULTS);
}

/** 기준 대비 비율 표기: 10% 이상은 정수, 그 아래는 소수 한 자리(작은 값이 0%로 뭉개지지 않게) */
export function formatPct(ratio: number): string {
  return `${ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10}%`;
}

function periodLabel(h: number): string {
  if (h > 24 && h % 24 === 0) return `${h / 24}일`;
  if (h === 24) return "오늘";
  return `${h}시간`;
}

interface SeriesView {
  p: Pollutant;
  pts: Point[];
  /** 기준값(없거나 0 이하면 null). 비율 계산에만 쓰고 화면에는 보이지 않는다 */
  limit: number | null;
  limitRaw: string | null;
  links: GapLink[];
}

function MarkerIcon({ p, size = 12 }: { p: Pollutant; size?: number }) {
  const s = SERIES[p];
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      {s.marker === "circle" ? <circle cx="6" cy="6" r="4.5" fill={s.color} /> : <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill={s.color} />}
    </svg>
  );
}

function effectsAllowed(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  if (document.documentElement.getAttribute("data-effects") === "off") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  return true;
}

export default function TrendChart({
  site,
  day,
  onClose,
  hideHeader = false,
  animateKey,
  preview = false,
  previewPollutants,
  initialPicked = null,
}: {
  site: Site;
  day: DayData;
  onClose?: () => void;
  hideHeader?: boolean;
  animateKey?: string;
  preview?: boolean;
  previewPollutants?: Pollutant[];
  initialPicked?: number | null;
}) {
  const stackCode = useSelection((s) => s.selectedStackCode);
  const storePollutants = useSelection((s) => s.pollutants);
  const pollutants = preview ? (previewPollutants ?? POLLUTANT_ORDER) : storePollutants;
  const periodHours = useSelection((s) => s.periodHours);
  const chartRange = useSelection((s) => s.chartRange);
  const selectStack = useSelection((s) => s.selectStack);
  const togglePollutant = useSelection((s) => s.togglePollutant);
  const isFavorite = useSelection((s) => s.favorites.includes(site.id));
  const toggleFavorite = useSelection((s) => s.toggleFavorite);
  const setPeriodHours = useSelection((s) => s.setPeriodHours);
  const setChartRange = useSelection((s) => s.setChartRange);
  const { style: cs } = useActiveStyle();

  const [picked, setPicked] = useState<number | null>(initialPicked);
  const [stackQuery, setStackQuery] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<{ start: string; end: string } | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const [countProgress, setCountProgress] = useState(1);

  const chartBoxRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; base: ChartRange; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const uid = useId().replace(/:/g, "");

  // 등장 효과: 추세 탭을 열거나 사업장 탭을 바꾸면 비율 숫자 카운트업(화면 효과 끄기·움직임 줄이기면 즉시 완료)
  useEffect(() => {
    if (!animateKey || !effectsAllowed() || typeof ResizeObserver === "undefined") {
      setCountProgress(1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 420;
    setCountProgress(0);
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - (1 - t) ** 3;
      setCountProgress(eased);
      if (t < 1) raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [animateKey]);

  // "직접…"을 펼치면 서랍 아래에 숨지 않도록 부드럽게 보이게 스크롤
  useEffect(() => {
    if (!customOpen) return;
    rangeRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [customOpen]);

  // 서랍·화면 폭 변화에 맞춰 SVG 좌표계를 다시 맞춘다(브라우저에서만 실측, jsdom에서는 CHART 기본값 유지)
  useEffect(() => {
    const el = chartBoxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      if (r.width >= 200 && r.height >= 160) {
        const w = Math.round(r.width);
        const h = Math.round(r.height);
        setMeasured((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stack = preview ? site.stacks[0] : (site.stacks.find((s) => s.code === stackCode) ?? site.stacks[0]);
  const series = stack ? day.stacks[stack.key] : undefined;
  const times = day.times;
  const ext = extentOf(times);

  const baseRange = ext ? defaultRange(times, periodHours) : null;
  const wanted = preview ? ext : (chartRange ?? baseRange);
  const idx = preview
    ? (times.length > 0 ? ([0, times.length - 1] as const) : null)
    : (wanted ? indicesIn(times, wanted) ?? (baseRange ? indicesIn(times, baseRange) : null) : null);
  const i0 = idx ? idx[0] : 0, i1 = idx ? idx[1] : 0;

  const view = useMemo(() => {
    if (!series || !idx) return null;
    const all: SeriesView[] = POLLUTANT_ORDER.map((p) => {
      const limitRaw = pollutantLimit(series, p);
      const n = parseNumber(limitRaw);
      const pts = pointsBetween(pollutantRaw(series, p), i0, i1);
      return { p, pts, limit: n !== null && n > 0 ? n : null, limitRaw, links: gapLinks(pts) };
    });
    const measuredPollutants = all.filter((s) => s.limit !== null || s.pts.some((q) => q.value !== null));
    const single = measuredPollutants.length === 1 ? measuredPollutants[0].p : null;
    const chosen = (p: Pollutant) => (single ? p === single : pollutants.includes(p));
    const plotted = all.filter((s) => chosen(s.p) && s.limit !== null);
    const omitted = all.filter((s) => chosen(s.p) && s.limit === null);
    const scale = makeScale(plotted.flatMap((s) => s.pts.map((p) => (p.value === null ? null : (p.value / s.limit!) * 100))), 100);
    return { all, plotted, omitted, scale, single };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, pollutants, i0, i1]);

  if (!stack || !series || !view || !ext) {
    return <p className={styles.empty}>사업장을 고르면 이 자리에 추세가 나옵니다.</p>;
  }

  const { all, plotted, omitted, scale, single } = view;
  const dual = plotted.length > 1;
  const n = i1 - i0 + 1;

  // 실측 크기 기반 반응형 SVG 좌표 (jsdom에서는 CHART 기본값 820×320 사용)
  const W = measured ? measured.w : CHART.W;
  const H = measured ? measured.h : CHART.H;
  const svgFont = (rawSize: number) =>
    measured ? Math.round(Math.max(14, Math.min(26, rawSize * Math.max(0.76, Math.min(1, W / 640))))) : rawSize;
  const PAD = measured
    ? {
        l: Math.max(54, Math.round(svgFont(cs.axisSize) * 3.1)),
        r: Math.max(52, Math.round(svgFont(cs.levelLabelSize) * 2.65)),
        t: 22,
        b: Math.max(30, svgFont(cs.axisSize) + 14),
      }
    : CHART.PAD;
  const iw = Math.max(120, W - PAD.l - PAD.r);
  const ih = Math.max(100, H - PAD.t - PAD.b);

  const x = (i: number) => PAD.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const yFrac = (f: number) => PAD.t + ih - f * ih;
  const yOf = (v: number, s: SeriesView) => yFrac(scale.toFraction((v / s.limit!) * 100));
  const y0 = yFrac(0);

  const win: ChartRange = { start: times[i0], end: times[i1] };
  const isCustom = chartRange !== null && !isDefaultRange(chartRange, times, periodHours);
  const reset = () => setPicked(null);

  const gapReason = (s: SeriesView, l: GapLink) => {
    const first = l.kind === "leading" ? 0 : l.i0 + 1;
    return s.pts[first]?.value === null ? s.pts[first]?.raw ?? null : null;
  };

  const shown = picked !== null && picked < n ? picked : n - 1;
  const slotAt = i0 + shown;

  // 현재 시점의 가장 높은 비율 기준 단계(머리 배지 & 단계 글자 박동)
  const allShownRatios = all.flatMap((s) => {
    const v = s.pts[shown]?.value;
    return v === null || v === undefined || s.limit === null ? [] : [(v / s.limit) * 100];
  });
  const headLevel = allShownRatios.length ? levelOf(Math.max(...allShownRatios)) : null;

  const shownRatios = plotted.flatMap((s) => {
    const v = s.pts[shown]?.value;
    return v === null || v === undefined || s.limit === null ? [] : [(v / s.limit) * 100];
  });
  const shownLevel = shownRatios.length ? levelOf(Math.max(...shownRatios)) : null;
  const activeKey = shownLevel && shownLevel !== "ok" ? shownLevel : null;

  // ── 조회 범위 ────────────────────────────────────────────────
  const startText = draft?.start ?? formatKstInput(win.start);
  const endText = draft?.end ?? formatKstInput(win.end);
  const len = i1 - i0;
  const sliderMax = Math.max(0, times.length - 1 - len);
  const move = (next: ChartRange) => { setChartRange(next); setDraft(null); setRangeError(null); reset(); };

  const applyRange = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateRange(parseKstInput(startText), parseKstInput(endText), ext, times);
    if (!check.ok) { setRangeError(check.error); return; }
    move(check.range);
  };

  // ── 그래프: 끌면 30분씩 이동, 누르면 그 시점 ──────────────────
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (preview || e.button !== 0) return;
    drag.current = { x: e.clientX, base: win, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (preview) return;
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 4) return;
    d.moved = true;
    const unitsPerPx = W / (e.currentTarget.getBoundingClientRect().width || W);
    const slots = Math.round(-dx * unitsPerPx * ((n - 1 || 1) / iw));
    const next = panRange(d.base, slots, ext);
    if (next.start !== win.start || next.end !== win.end) move(next);
  };
  const onPointerUp = () => {
    justDragged.current = !!drag.current?.moved;
    drag.current = null;
  };
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (justDragged.current) { justDragged.current = false; return; }
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / (r.width || W)) * W;
    const i = Math.round(((px - PAD.l) / iw) * (n - 1));
    setPicked(Math.min(n - 1, Math.max(0, i)));
  };

  const colorOf = (p: Pollutant) => (p === "nox" ? cs.noxColor : cs.soxColor) ?? SERIES[p].color;
  const levelColor = (key: string) =>
    (key === "caution" ? cs.levelCautionColor : key === "warn" ? cs.levelWarnColor : key === "risk" ? cs.levelRiskColor : cs.levelExceedColor) ?? `var(--lv-${key})`;
  const textFill = cs.textColor ?? "var(--muted)";
  const glowOf = (px: number, color: string) => (px > 0 ? { filter: `drop-shadow(0 0 ${px}px ${color})` } : undefined);
  const glowOf0 = (px: number, color: string) => glowOf(px, color) ?? {};
  const textStyle = (size: number, glow: number, color: string): React.CSSProperties => ({ fontSize: svgFont(size), ...glowOf0(glow, color) });
  const beatStyle = (level: string): React.CSSProperties => ({
    ...({
      "--beat-a1": cs.pulseScale,
      "--beat-a2": 1 + (cs.pulseScale - 1) * 0.65,
      "--beat-dur": `${(cs.pulseSpeed * (cs.pulseFast ? (level === "exceed" ? 0.64 : level === "risk" ? 0.8 : 1) : 1)).toFixed(2)}s`,
      "--beat-glow": `${cs.pulseGlow}px`,
      "--beat-base": `${cs.levelLabelGlow}px`,
      "--beat-color": levelColor(level),
    } as React.CSSProperties),
  });

  const names = plotted.map((s) => SERIES[s.p].label).join("·");
  const rangeLabel = `${formatSlot(win.start)} → ${formatSlot(win.end)}`;
  const zoneH = ih * (1 - 0.8);
  const regionText = `${site.sido} ${site.sigungu}`.trim() || "지역 정보 없음";

  const animActive = Boolean(animateKey) && effectsAllowed();
  const displayRatio = (r: number) => formatPct(r * countProgress);

  return (
    <div
      className={preview ? `${styles.wrap} ${styles.previewWrap}` : styles.wrap}
      role={preview ? undefined : "region"}
      aria-label={preview ? "그래프 스타일 미리보기" : "추세 차트"}
    >
      {/* ── 맨 위: 서랍 통합 머리가 없을 때만 자체 머리 표시 ── */}
      {!preview && !hideHeader && (
        <header className={styles.head}>
          <div className={styles.headTop}>
            <h3 className={styles.siteName}>{site.name}</h3>
            <span className={styles.levelBadge}>
              <LevelMark level={headLevel ?? "gap"} size={16} />
              <span>{headLevel ? labelOf(headLevel) : "측정 없음"}</span>
            </span>
            <div className={styles.headActions}>
              <button
                type="button"
                className={styles.star}
                aria-pressed={isFavorite}
                aria-label={`${site.name} 즐겨찾기`}
                onClick={() => toggleFavorite(site.id)}
              >
                {isFavorite ? "★" : "☆"}
              </button>
              {onClose && (
                <button
                  type="button"
                  className={styles.closeBtn}
                  aria-label="상세 패널 닫기"
                  title="닫기 (Esc)"
                  onClick={onClose}
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          </div>
          <div className={styles.headSub} aria-live="polite">
            <span className={styles.region}>
              {regionText} · 굴뚝 {stack.code}
            </span>
            <span className={styles.whenWrap}>
              {times[slotAt] !== undefined && (
                <span>
                  {formatSlot(times[slotAt])}
                  {picked === null ? " (최신)" : ""}
                </span>
              )}
              {picked !== null && (
                <button type="button" className={styles.latest} onClick={reset}>
                  최신으로
                </button>
              )}
            </span>
          </div>
        </header>
      )}
      {!preview && hideHeader && picked !== null && (
        <div className={styles.pickedBar} aria-live="polite">
          <span>{times[slotAt] !== undefined ? formatSlot(times[slotAt]) : ""} 선택됨</span>
          <button type="button" className={styles.latest} onClick={reset}>
            최신으로
          </button>
        </div>
      )}

      {/* ── 굴뚝 선택(가로 분절 버튼) + 기간 칩(6시간 | 12시간 | 오늘 | 직접…) ── */}
      {!preview && (
      <div className={styles.controls}>
        {site.stacks.length > MANY_STACKS ? (
          <div role="group" aria-label="굴뚝 선택" className={styles.group}>
            <button type="button" className={styles.chip} aria-pressed="true">굴뚝 {stack.code}</button>
            <input
              className={styles.stackSearch}
              type="search"
              placeholder={`굴뚝 번호 검색 (전체 ${site.stacks.length}개)`}
              aria-label="굴뚝 번호 검색"
              value={stackQuery}
              onChange={(e) => setStackQuery(e.target.value)}
            />
            {stackQuery.trim() && findStacks(site.stacks, stackQuery).length === 0 && (
              <span className={styles.none}>해당 번호의 굴뚝이 없습니다.</span>
            )}
            {findStacks(site.stacks, stackQuery)
              .filter((s) => s.code !== stack.code)
              .map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={styles.chip}
                  aria-pressed="false"
                  onClick={() => { selectStack(s.code); setStackQuery(""); reset(); }}
                >
                  굴뚝 {s.code}
                </button>
              ))}
          </div>
        ) : (
          <div role="group" aria-label="굴뚝 선택" className={styles.stackSegment}>
            {site.stacks.map((s) => (
              <button
                key={s.key}
                type="button"
                className={styles.segBtn}
                aria-pressed={s.code === stack.code}
                onClick={() => { selectStack(s.code); reset(); }}
              >
                굴뚝 {s.code}
              </button>
            ))}
          </div>
        )}

        <div role="group" aria-label="기간" className={styles.group}>
          {(() => {
            const base = periodChoices(times);
            const list = times.length > 0 && !base.includes(24) ? [...base, 24].sort((a, b) => a - b) : base;
            return list.map((h) => (
              <button
                key={h}
                type="button"
                className={styles.chip}
                aria-pressed={chartRange === null && periodHours === h}
                onClick={() => {
                  setPeriodHours(h as PeriodHours);
                  setDraft(null);
                  setRangeError(null);
                  reset();
                }}
              >
                {periodLabel(h)}
              </button>
            ));
          })()}
          <button
            type="button"
            className={styles.chip}
            aria-expanded={customOpen}
            onClick={() => setCustomOpen((v) => !v)}
          >
            직접…
          </button>
        </div>
      </div>
      )}

      {/* ── NOx·SOx 가로 2개 토글 칩 (색 점 + 물질 + 24px 굵은 비율 + 단계 기호) ── */}
      {!preview && single && (() => {
        const s = all.find((x) => x.p === single)!;
        const sp = s.pts[shown];
        const ratio = sp && sp.value !== null && s.limit !== null ? (sp.value / s.limit) * 100 : null;
        const level = ratio !== null ? levelOf(ratio) : null;
        return (
          <div className={styles.single} data-series={s.p} aria-label={`${SERIES[s.p].label} 단일 측정`}>
            <span className={styles.cardLeft}>
              <MarkerIcon p={s.p} size={13} />
              <span>{SERIES[s.p].label}</span>
            </span>
            <span className={styles.cardRight}>
              {s.limit === null ? (
                <span className={styles.gapText}>기준값 없음</span>
              ) : ratio !== null && level ? (
                <>
                  <span className={styles.cardNum}>{displayRatio(ratio)}</span>
                  <span className={styles.cardLevel}>
                    <LevelMark level={level} size={16} />
                    <span>{labelOf(level)}</span>
                  </span>
                </>
              ) : (
                <span className={styles.gapText}>측정 없음{sp?.raw ? ` (${sp.raw})` : ""}</span>
              )}
            </span>
          </div>
        );
      })()}

      {!preview && !single && (
        <div role="group" aria-label="물질" className={styles.cards}>
          {all.map((s) => {
            const on = pollutants.includes(s.p) && s.limit !== null;
            const noLimit = s.limit === null;
            const sp = s.pts[shown];
            const ratio = sp && sp.value !== null && s.limit !== null ? (sp.value / s.limit) * 100 : null;
            const level = ratio !== null ? levelOf(ratio) : null;
            return (
              <label
                key={s.p}
                className={styles.card}
                data-series={s.p}
                data-on={on || undefined}
                data-disabled={noLimit || undefined}
                style={{ ["--card-color" as string]: colorOf(s.p) }}
              >
                <input
                  type="checkbox"
                  className={styles.cardCheck}
                  checked={on}
                  disabled={noLimit}
                  aria-label={`${SERIES[s.p].label} 그래프 표시`}
                  onChange={() => { togglePollutant(s.p); reset(); }}
                />
                <span className={styles.cardLeft}>
                  <MarkerIcon p={s.p} size={13} />
                  <span>{SERIES[s.p].label}</span>
                </span>
                <span className={styles.cardRight}>
                  {noLimit ? (
                    <span className={styles.gapText}>기준값 없음</span>
                  ) : ratio !== null && level ? (
                    <>
                      <span className={styles.cardNum}>{displayRatio(ratio)}</span>
                      <span className={styles.cardLevel}>
                        <LevelMark level={level} size={16} />
                        <span>{labelOf(level)}</span>
                      </span>
                    </>
                  ) : (
                    <span className={styles.gapText}>측정 없음{sp?.raw ? ` (${sp.raw})` : ""}</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {/* ── 바로 아래 그래프 (서랍을 열자마자 스크롤 없이 전체 표시) ── */}
      {plotted.length === 0 ? (
        <p className={styles.empty}>
          {pollutants.length === 0 && !single
            ? "물질을 하나 이상 켜면 그래프가 나옵니다."
            : "켜 둔 물질은 기준값이 없어 기준 대비(%)로 그릴 수 없습니다."}
        </p>
      ) : (
        <div className={preview ? `${styles.chartBox} ${styles.previewChartBox}` : styles.chartBox} ref={chartBoxRef}>
          <svg
            className={styles.svg}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`${site.name} 굴뚝 ${stack.code} ${names} ${rangeLabel} 기준 대비 추세. 누르면 그 시점을 보여 주고, 좌우로 끌면 시간대를 옮깁니다.`}
            onClick={onClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <defs>
              {plotted.map((s) => (
                <g key={s.p}>
                  <linearGradient id={`area-${uid}-${s.p}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={cs.areaColor ?? colorOf(s.p)} stopOpacity={dual ? Math.round(cs.areaOpacity * 0.62 * 100) / 100 : cs.areaOpacity} />
                    <stop offset="100%" stopColor={cs.areaColor ?? colorOf(s.p)} stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id={`gapfill-${uid}-${s.p}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={cs.gapLineColor ?? colorOf(s.p)} stopOpacity={cs.gapFillOpacity} />
                    <stop offset="100%" stopColor={cs.gapLineColor ?? colorOf(s.p)} stopOpacity={Math.round(cs.gapFillOpacity * 25) / 100} />
                  </linearGradient>
                </g>
              ))}
              <linearGradient id={`gap-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: "var(--gap-from)", stopOpacity: "var(--gap-fill-a)" }} />
                <stop offset="100%" style={{ stopColor: "var(--gap-to)", stopOpacity: "var(--gap-fill-b)" }} />
              </linearGradient>
            </defs>

            <rect data-inner x={PAD.l} y={PAD.t} width={iw} height={ih} fill={cs.innerColor ?? "var(--stage-bg)"} fillOpacity={cs.innerOpacity} rx={cs.innerRadius} />
            {cs.gridOn && [0.2, 0.4, 0.6].map((f) => (
              <line key={f} data-grid x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih * f} y2={PAD.t + ih * f} stroke={cs.gridColor ?? "var(--stage-grid)"} strokeOpacity={cs.gridOpacity} />
            ))}

            <g data-bands="levels" key={`bands-${animateKey ?? "static"}`} className={animActive ? styles.refFade : undefined}>
              {/* 70/80/90 옅은 기준 띠 */}
              {[
                { key: "caution", from: 70, to: 80, op: 0.045 },
                { key: "warn", from: 80, to: 90, op: 0.055 },
                { key: "risk", from: 90, to: 100, op: 0.065 },
              ].map((b) => {
                const yTop = yFrac(scale.toFraction(b.to));
                const yBot = yFrac(scale.toFraction(b.from));
                return (
                  <rect
                    key={b.key}
                    data-band={b.key}
                    x={PAD.l}
                    y={yTop}
                    width={iw}
                    height={Math.max(0, yBot - yTop)}
                    fill={levelColor(b.key)}
                    fillOpacity={b.op}
                  />
                );
              })}
            </g>

            <g data-zone="exceed" key={`ref-${animateKey ?? "static"}`} className={animActive ? styles.refFade : undefined}>
              <rect x={PAD.l} y={PAD.t} width={iw} height={zoneH} fill={cs.zoneColor ?? "var(--lv-exceed)"} fillOpacity={cs.zoneOpacity} rx={cs.innerRadius} />
              <text
                data-zone-label
                x={PAD.l + 8}
                y={PAD.t + 18}
                className={styles.tick}
                style={textStyle(cs.zoneLabelSize, cs.zoneLabelGlow, cs.zoneLabelColor ?? cs.zoneColor ?? "var(--lv-exceed)")}
                fill={cs.zoneLabelColor ?? cs.zoneColor ?? "var(--lv-exceed)"}
                fillOpacity="0.9"
              >
                기준 초과 영역(압축)
              </text>
            </g>

            {plotted.map((s) => {
              if (s.links.length > 0 || !s.pts.some((p) => p.value === null)) return null;
              return (
                <rect key={`band-${s.p}`} x={PAD.l} y={PAD.t} width={iw} height={ih} fill={`url(#gap-${uid})`}>
                  <title>측정 공백{s.pts[0]?.raw ? ` · ${s.pts[0].raw}` : ""}</title>
                </rect>
              );
            })}

            {ALERT_LEVELS.map((lv) => {
              const yy = yFrac(scale.toFraction(lv.min));
              return (
                <g key={`${lv.key}-${animateKey ?? "static"}`} className={animActive ? styles.refFade : undefined}>
                  {cs.levelLinesOn && (
                    <line
                      data-level-line={lv.key}
                      x1={PAD.l}
                      x2={W - PAD.r}
                      y1={yy}
                      y2={yy}
                      stroke={levelColor(lv.key)}
                      strokeDasharray={lv.key === "exceed" ? "6 4" : !cs.levelLinesDashed ? "0" : "4 4"}
                      strokeOpacity={lv.key === "exceed" ? Math.max(cs.levelLineOpacity, 0.72) : cs.levelLineOpacity}
                    />
                  )}
                  {(!cs.labelsActiveOnly || lv.key === activeKey) && (
                    <text
                      data-level-label={lv.key}
                      data-beat={(cs.pulseOn && lv.key === activeKey) || undefined}
                      x={W - PAD.r + 6}
                      y={yy}
                      dy="0.33em"
                      className={cs.pulseOn && lv.key === activeKey ? `${styles.tick} ${styles.beat}` : styles.tick}
                      style={{ ...textStyle(cs.levelLabelSize, cs.levelLabelGlow, levelColor(lv.key)), ...(cs.pulseOn && lv.key === activeKey ? beatStyle(lv.key) : {}) }}
                      fill={levelColor(lv.key)}
                    >
                      {lv.label}
                    </text>
                  )}
                </g>
              );
            })}

            {plotted.map((s) => {
              const color = colorOf(s.p);
              const idxOf = (p: Point) => p.slot - i0;
              const lineD = (run: Point[]) => linePath(run.map((p) => [x(idxOf(p)), yOf(p.value!, s)] as const), cs.smooth);
              const areaD = (run: Point[]) =>
                `${lineD(run)} L${x(idxOf(run[run.length - 1])).toFixed(1)} ${y0.toFixed(1)} L${x(idxOf(run[0])).toFixed(1)} ${y0.toFixed(1)} Z`;
              return (
                <g key={`${s.p}-${animateKey ?? "static"}`} data-series={s.p}>
                  {s.links.map((l, k) => (
                    <g key={`link-${k}`} data-gap-link={l.kind}>
                      <path
                        d={`M${x(l.i0).toFixed(1)} ${yOf(l.v0, s).toFixed(1)} L${x(l.i1).toFixed(1)} ${yOf(l.v1, s).toFixed(1)} L${x(l.i1).toFixed(1)} ${y0.toFixed(1)} L${x(l.i0).toFixed(1)} ${y0.toFixed(1)} Z`}
                        fill={`url(#gapfill-${uid}-${s.p})`}
                      >
                        <title>측정 공백{gapReason(s, l) ? ` · ${gapReason(s, l)}` : ""}</title>
                      </path>
                      <path
                        d={`M${x(l.i0).toFixed(1)} ${yOf(l.v0, s).toFixed(1)} L${x(l.i1).toFixed(1)} ${yOf(l.v1, s).toFixed(1)}`}
                        fill="none"
                        stroke={cs.gapLineColor ?? color}
                        strokeOpacity={cs.gapLineOpacity}
                        strokeWidth={cs.gapLineWidth}
                        strokeDasharray="7 6"
                        strokeLinecap="round"
                      />
                    </g>
                  ))}
                  {runsOf(s.pts).map((run, k) => (
                    <g key={k}>
                      {cs.areaOn && run.length > 1 && (
                        <path
                          data-area
                          className={animActive ? styles.refFade : undefined}
                          d={areaD(run)}
                          fill={`url(#area-${uid}-${s.p})`}
                        />
                      )}
                      <path
                        data-line
                        pathLength={animActive ? 1 : undefined}
                        className={animActive ? styles.drawLine : undefined}
                        d={lineD(run)}
                        fill="none"
                        stroke={color}
                        strokeWidth={cs.lineWidth}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        style={glowOf(cs.lineGlow, color)}
                      />
                    </g>
                  ))}
                </g>
              );
            })}

            {cs.crosshairOn && (
              <line data-crosshair x1={x(shown)} x2={x(shown)} y1={PAD.t} y2={PAD.t + ih} stroke={cs.crosshairColor ?? "var(--ink)"} strokeOpacity="0.35" strokeDasharray="3 3" />
            )}

            {plotted.map((s) => {
              const v = s.pts[shown]?.value;
              if (v === null || v === undefined) return null;
              const cy = yOf(v, s);
              return SERIES[s.p].marker === "circle" ? (
                <circle key={s.p} data-dot={s.p} cx={x(shown)} cy={cy} r={cs.dotR} fill={colorOf(s.p)} stroke={cs.dotStrokeColor ?? "var(--bg)"} strokeWidth="2" style={glowOf(cs.dotGlow, colorOf(s.p))} />
              ) : (
                <rect key={s.p} data-dot={s.p} data-marker="square" x={x(shown) - cs.dotR + 0.5} y={cy - cs.dotR + 0.5} width={2 * cs.dotR - 1} height={2 * cs.dotR - 1} rx="1.5" fill={colorOf(s.p)} stroke={cs.dotStrokeColor ?? "var(--bg)"} strokeWidth="2" style={glowOf(cs.dotGlow, colorOf(s.p))} />
              );
            })}

            {[0, 0.5, 1].map((f) => {
              const i = Math.round(f * (n - 1));
              const t = times[i0 + i];
              return t === undefined ? null : (
                <text
                  key={f}
                  x={x(i)}
                  y={H - 8}
                  textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
                  className={styles.tick}
                  style={textStyle(cs.axisSize, cs.axisGlow, textFill)}
                  fill={textFill}
                >
                  {formatSlot(t).slice(6)}
                </text>
              );
            })}

            <text data-axis x={PAD.l - 8} y={PAD.t + 14} textAnchor="end" className={styles.tick} style={textStyle(cs.axisSize, cs.axisGlow, textFill)} fill={textFill}>{scale.topRatio}%</text>
            <text data-axis x={PAD.l - 8} y={yFrac(0.8)} dy="0.33em" textAnchor="end" className={styles.tick} style={textStyle(cs.axisSize, cs.axisGlow, levelColor("exceed"))} fill={levelColor("exceed")}>100%</text>
            <text data-axis x={PAD.l - 8} y={PAD.t + ih} textAnchor="end" className={styles.tick} style={textStyle(cs.axisSize, cs.axisGlow, textFill)} fill={textFill}>0%</text>
          </svg>
        </div>
      )}

      {/* 보관 기간 및 간결 안내 (그래프 아래 작은 글씨 14px) */}
      {!preview && (
        <p className={styles.metaFoot}>
          보관 기간 {formatSlot(ext.start)} ~ {formatSlot(ext.end)} · 30분 간격 기준 대비(%) · 좌우로 끌어 이동
          {omitted.length > 0 && ` · ${omitted.map((s) => SERIES[s.p].label).join("·")}은(는) 기준값이 없어 기준 대비(%)로 나타낼 수 없습니다.`}
        </p>
      )}

      {/* ── "직접…" 칩을 눌렀을 때만 펼쳐지는 상세 조회 범위 ── */}
      {!preview && customOpen && (
        <section ref={rangeRef} className={styles.range} aria-label="조회 범위">
          <form className={styles.rangeForm} onSubmit={applyRange} noValidate>
            <label className={styles.rangeField}>
              <span>시작 일시</span>
              <input
                type="datetime-local"
                step={SLOT_MS / 1000}
                min={formatKstInput(ext.start)}
                max={formatKstInput(ext.end)}
                value={startText}
                onChange={(e) => { setDraft({ start: e.target.value, end: endText }); setRangeError(null); }}
              />
            </label>
            <label className={styles.rangeField}>
              <span>종료 일시</span>
              <input
                type="datetime-local"
                step={SLOT_MS / 1000}
                min={formatKstInput(ext.start)}
                max={formatKstInput(ext.end)}
                value={endText}
                onChange={(e) => { setDraft({ start: startText, end: e.target.value }); setRangeError(null); }}
              />
            </label>
            <button type="submit" className={`${styles.chip} ${styles.rangeSubmit}`}>조회 적용</button>
          </form>
          {rangeError && <p className={styles.rangeError} role="alert">{rangeError}</p>}
          <div className={styles.rangeNav}>
            <button type="button" className={styles.chip} disabled={win.start <= ext.start} onClick={() => move(shiftRange(win, -1, ext))}>← 이전 구간</button>
            <button type="button" className={styles.chip} disabled={win.end >= ext.end} onClick={() => move(shiftRange(win, 1, ext))}>다음 구간 →</button>
            <input
              className={styles.rangeSlider}
              type="range"
              min={0}
              max={sliderMax}
              step={1}
              value={Math.min(i0, sliderMax)}
              disabled={sliderMax === 0}
              aria-label="조회 구간 위치"
              aria-valuetext={rangeLabel}
              onChange={(e) => { const v = Number(e.target.value); move({ start: times[v], end: times[v + len] }); }}
            />
            <button
              type="button"
              className={`${styles.chip} ${styles.rangeReset}`}
              disabled={chartRange === null}
              onClick={() => { setChartRange(null); setDraft(null); setRangeError(null); reset(); }}
            >
              자료 기준으로
            </button>
          </div>
          <p className={styles.rangeSummary} role="status" aria-live="polite">
            {isCustom ? "사용자 지정" : "기본 범위"} · {rangeLabel} · {durationText(win.end - win.start)}
            <span className={styles.rangeHint}>그래프를 좌우로 끌면 30분씩 이동합니다. 날짜는 보관된 기간 안에서만 고를 수 있습니다.</span>
          </p>
        </section>
      )}
    </div>
  );
}
