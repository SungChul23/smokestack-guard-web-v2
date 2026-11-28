// 그래프 설정 창: 사용자 메뉴에서 여는 넓은 불투명 모달 창.
// 바꾸는 즉시 왼쪽 미리보기와 추세 그래프에 반영되고 이 브라우저에 다크·라이트 모드별로 저장된다.
// 값은 JSON으로 복사·붙여 넣기 할 수 있다.
import { useEffect, useRef, useState } from "react";
import type { DayData, Pollutant, Site } from "../data/model";
import { changedCount, defaultsFor, RANGES, useActiveStyle, useChartStyle, type ChartStyle, type ColorKey } from "../state/chartStyle";
import { useThemeName, type ThemeName } from "../theme/useThemeName";
import styles from "./ChartStylePanel.module.css";
import TrendChart from "./TrendChart";

type NumKey = keyof typeof RANGES;
type BoolKey = "smooth" | "areaOn" | "gridOn" | "levelLinesOn" | "levelLinesDashed" | "crosshairOn" | "labelsActiveOnly" | "pulseOn" | "pulseFast";
const MODE_NAME: Record<ThemeName, string> = { dark: "다크", light: "라이트" };

/** 그래프 설정 창 안에서 실시간으로 변화를 보여 주는 고정 예시 데이터(초과 피크 + 측정 공백 + NOx·SOx 2선 포함) */
const PREVIEW_START_MS = Date.UTC(2026, 10, 25, 0, 0, 0); // KST 09:00
const PREVIEW_SITE: Site = {
  id: "__style_preview__",
  name: "미리보기 예시",
  sido: "충남",
  sigungu: "당진시",
  address: "충남 당진시",
  lon: 126.62,
  lat: 36.9,
  stacks: [{ key: "__style_preview__:1", code: "1" }],
};
const PREVIEW_DAY: DayData = {
  times: Array.from({ length: 20 }, (_, i) => PREVIEW_START_MS + i * 30 * 60_000),
  stacks: {
    "__style_preview__:1": {
      noxLimit: "100",
      soxLimit: "100",
      nox: ["46", "52", "58", "66", "74", "82", "88", null, null, "93", "98", "105", "112", "116", "110", "103", "96", "91", "85", "78"],
      sox: ["34", "38", "42", "49", "55", "61", "64", "68", "72", "75", "79", "83", "81", "76", "72", "68", "65", "61", "58", "54"],
    },
  },
};

function Slider({ id, label, k, unit = "", digits = 2 }: { id: string; label: string; k: NumKey; unit?: string; digits?: number }) {
  const { style, theme } = useActiveStyle();
  const set = useChartStyle((s) => s.set);
  const value = style[k];
  const [min, max, step] = RANGES[k];
  const changed = value !== defaultsFor(theme)[k];
  return (
    <div className={styles.row} data-changed={changed || undefined}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={`${Number(value.toFixed(digits))}${unit}`}
        onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<ChartStyle>)}
      />
      <span className={styles.value} aria-hidden="true">{Number(value.toFixed(digits))}{unit}</span>
    </div>
  );
}

function Toggle({ label, k }: { label: string; k: BoolKey }) {
  const { style, theme } = useActiveStyle();
  const set = useChartStyle((s) => s.set);
  const on = style[k];
  return (
    <label className={styles.toggle} data-changed={on !== defaultsFor(theme)[k] || undefined}>
      <input type="checkbox" checked={on} onChange={(e) => set({ [k]: e.target.checked } as Partial<ChartStyle>)} />
      <span>{label}</span>
    </label>
  );
}

/** 테마 색(CSS 변수)을 #rrggbb로 풀어 쓴다. 변수를 못 읽는 환경(시험 등)에서는 fallback */
export function resolveThemeHex(cssVar: string, fallback: string): string {
  try {
    const probe = document.createElement("span");
    probe.style.color = `var(${cssVar})`;
    probe.style.display = "none";
    document.body.appendChild(probe);
    const m = getComputedStyle(probe).color.match(/\d+(?:\.\d+)?/g);
    probe.remove();
    if (!m || m.length < 3) return fallback;
    return "#" + m.slice(0, 3).map((n) => Math.round(Number(n)).toString(16).padStart(2, "0")).join("");
  } catch {
    return fallback;
  }
}

/** 색 한 줄. cssVar는 "기본색"이 가리키는 테마 색, follow는 기본이 다른 색을 따를 때의 설명 */
function ColorPick({ label, k, cssVar, fallback, follow }: { label: string; k: ColorKey; cssVar?: string; fallback: string; follow?: string }) {
  const { style, theme } = useActiveStyle(); // 모드가 바뀌면 다시 그려서 기본색 견본도 그 모드의 색이 된다
  const set = useChartStyle((s) => s.set);
  const value = style[k];
  const base = cssVar ? resolveThemeHex(cssVar, fallback) : fallback;
  const dflt = defaultsFor(theme)[k];
  const shownHex = (value ?? base).toUpperCase();
  return (
    <div className={styles.colorRow} data-changed={value !== dflt || undefined}>
      <label htmlFor={`cs-${k}`} title={follow ? `기본: ${follow}` : undefined}>{label}</label>
      <input id={`cs-${k}`} type="color" value={value ?? base} onChange={(e) => set({ [k]: e.target.value } as Partial<ChartStyle>)} />
      <span className={styles.hex} aria-hidden="true">{shownHex}</span>
      <button type="button" className={styles.small} disabled={value === dflt} onClick={() => set({ [k]: dflt } as Partial<ChartStyle>)}>
        기본색
      </button>
    </div>
  );
}

export default function ChartStylePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useThemeName();
  const { style } = useActiveStyle();
  const reset = useChartStyle((s) => s.reset);
  const replace = useChartStyle((s) => s.replace);
  const [note, setNote] = useState("");
  const [paste, setPaste] = useState<string | null>(null);
  const [previewPolls, setPreviewPolls] = useState<Pollutant[]>(["nox", "sox"]);
  const ref = useRef<HTMLDivElement>(null);

  const togglePreviewPoll = (p: Pollutant) => {
    setPreviewPolls((prev) => {
      if (prev.includes(p)) return prev.length > 1 ? prev.filter((x) => x !== p) : prev;
      return [...prev, p];
    });
  };

  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const n = changedCount(style, theme);
  const json = JSON.stringify(style, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setNote(`${MODE_NAME[theme]} 모드의 현재 값을 복사했습니다.`);
    } catch {
      setPaste(json); // 복사 권한이 없으면 글상자에 보여 준다
      setNote("복사하지 못해 아래에 보여 드립니다. 직접 복사해 주세요.");
    }
  };
  const apply = () => {
    try {
      replace(JSON.parse(paste ?? ""));
      setNote(`붙여 넣은 값을 ${MODE_NAME[theme]} 모드에 적용했습니다.`);
    } catch {
      setNote("값을 읽지 못했습니다. 복사한 JSON 그대로 붙여 넣어 주세요.");
    }
  };

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} tabIndex={-1} className={styles.modal} role="dialog" aria-modal="true" aria-label="그래프 설정">
        <header className={styles.head}>
          <div className={styles.headTitle}>
            <strong>그래프 설정 · {MODE_NAME[theme]} 모드</strong>
            <span className={styles.statusText} data-changed={n > 0 || undefined}>
              {n ? `이 모드의 기본값에서 ${n}개 바꿈` : "이 모드의 기본값 그대로"}
            </span>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="그래프 설정 닫기">×</button>
        </header>

        <div className={styles.toolbar}>
          <p className={styles.toolbarHint}>
            바꾸면 왼쪽 미리보기와 실제 그래프에 바로 반영됩니다. <strong>다크·라이트 모드는 설정이 따로</strong> 저장됩니다.
          </p>
        </div>

        <div className={styles.workspace}>
          <aside className={styles.previewPane} aria-label="실시간 미리보기">
            <div className={styles.previewHead}>
              <div className={styles.previewTitleWrap}>
                <strong>실시간 미리보기</strong>
                <span className={styles.previewBadge}>NOx 초과 · 공백 구간 포함</span>
              </div>
              <div className={styles.previewSeries} role="group" aria-label="미리보기 물질">
                {(["nox", "sox"] as const).map((p) => {
                  const on = previewPolls.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      className={styles.previewChip}
                      aria-pressed={on}
                      onClick={() => togglePreviewPoll(p)}
                    >
                      {p === "nox" ? "NOx" : "SOx"}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.previewStage}>
              <TrendChart
                site={PREVIEW_SITE}
                day={PREVIEW_DAY}
                preview
                previewPollutants={previewPolls}
                initialPicked={13}
              />
            </div>

            <p className={styles.previewTip}>
              미리보기 그래프의 다른 시점을 누르면 세로선·점·단계 글자 박동이 바로 바뀝니다.
            </p>
          </aside>

          <div className={styles.body}>
            <div className={styles.grid}>
              <section className={styles.card} aria-label="선">
                <h3>선</h3>
                <Slider id="cs-lw" label="굵기" k="lineWidth" digits={1} />
                <Toggle label="부드러운 곡선" k="smooth" />
                <Slider id="cs-lg" label="빛(라이팅)" k="lineGlow" unit="px" digits={0} />
              </section>

            <section className={styles.card} aria-label="영역 채움">
              <h3>선 아래 영역(안쪽 채움)</h3>
              <Toggle label="영역 채움" k="areaOn" />
              <Slider id="cs-ao" label="진하기" k="areaOpacity" />
              <ColorPick label="영역 색" k="areaColor" fallback="#38bdf8" follow="물질 색" />
            </section>

            <section className={styles.card} aria-label="공백 구간">
              <h3>값이 없는 구간(점선)</h3>
              <Slider id="cs-gw" label="점선 굵기" k="gapLineWidth" digits={1} />
              <Slider id="cs-go" label="점선 진하기" k="gapLineOpacity" />
              <Slider id="cs-gf" label="아래 칠 진하기" k="gapFillOpacity" />
              <ColorPick label="점선·칠 색" k="gapLineColor" fallback="#38bdf8" follow="물질 색" />
            </section>

            <section className={styles.card} aria-label="색">
              <h3>물질 색(선·점·카드)</h3>
              <ColorPick label="NOx" k="noxColor" cssVar="--accent" fallback="#38bdf8" />
              <ColorPick label="SOx" k="soxColor" cssVar="--series-2" fallback="#a78bfa" />
              <p className={styles.hint}>
                색을 고르지 않은 줄은 이 모드에 맞는 테마 색을 씁니다. &ldquo;기본색&rdquo;은 그 줄만, 아래 &ldquo;기본값으로 되돌리기&rdquo;는 이 모드의 모든 설정을 되돌립니다.
              </p>
            </section>

            <section className={styles.card} aria-label="안쪽 판">
              <h3>안쪽 판(그래프 바탕)</h3>
              <Slider id="cs-ir" label="모서리 둥글기" k="innerRadius" digits={0} />
              <Slider id="cs-io" label="바탕 진하기" k="innerOpacity" />
              <ColorPick label="바탕 색" k="innerColor" cssVar="--stage-bg" fallback="#0e141b" />
            </section>

            <section className={styles.card} aria-label="선택한 시점">
              <h3>선택한 시점</h3>
              <Toggle label="세로선" k="crosshairOn" />
              <Slider id="cs-dr" label="점 크기" k="dotR" digits={0} />
              <Slider id="cs-dg" label="점 빛(라이팅)" k="dotGlow" unit="px" digits={0} />
              <ColorPick label="세로선 색" k="crosshairColor" cssVar="--ink" fallback="#e6edf3" />
              <ColorPick label="점 테두리 색" k="dotStrokeColor" cssVar="--bg" fallback="#0b0f14" />
            </section>

            <section className={`${styles.card} ${styles.wide}`} aria-label="눈금과 기준선">
              <h3>눈금·기준선</h3>
              <div className={styles.twoCol}>
                <div className={styles.colGroup}>
                  <Toggle label="안쪽 눈금선" k="gridOn" />
                  <Slider id="cs-go2" label="눈금선 진하기" k="gridOpacity" />
                  <Toggle label="주의·경고·위험·초과 기준선" k="levelLinesOn" />
                  <Toggle label="기준선 점선(초과선 제외)" k="levelLinesDashed" />
                  <Slider id="cs-lo" label="기준선 진하기" k="levelLineOpacity" />
                  <Slider id="cs-zo" label="위쪽 20% 초과 영역 칠" k="zoneOpacity" digits={2} />
                </div>
                <div className={styles.colGroup}>
                  <ColorPick label="눈금선 색" k="gridColor" cssVar="--stage-grid" fallback="#1f2937" />
                  <ColorPick label="초과 영역 색" k="zoneColor" cssVar="--lv-exceed" fallback="#e11d74" />
                  <ColorPick label="주의 기준선 색" k="levelCautionColor" cssVar="--lv-caution" fallback="#facc15" />
                  <ColorPick label="경고 기준선 색" k="levelWarnColor" cssVar="--lv-warn" fallback="#fb923c" />
                  <ColorPick label="위험 기준선 색" k="levelRiskColor" cssVar="--lv-risk" fallback="#ef4444" />
                  <ColorPick label="초과 기준선 색" k="levelExceedColor" cssVar="--lv-exceed" fallback="#e11d74" />
                </div>
              </div>
            </section>

            <section className={`${styles.card} ${styles.wide}`} aria-label="바깥 글자와 숫자">
              <h3>바깥 글자·숫자</h3>
              <div className={styles.threeCol}>
                <div className={styles.subCard}>
                  <h4>&ldquo;기준 초과 영역(압축)&rdquo; 글자</h4>
                  <Slider id="cs-zs" label="크기" k="zoneLabelSize" unit="px" digits={0} />
                  <Slider id="cs-zg" label="빛(라이팅)" k="zoneLabelGlow" unit="px" digits={0} />
                  <ColorPick label="글자 색(영역)" k="zoneLabelColor" cssVar="--lv-exceed" fallback="#e11d74" follow="초과 영역 색" />
                </div>

                <div className={styles.subCard}>
                  <h4>단계 글자(초과·위험·경고·주의)</h4>
                  <Slider id="cs-ls" label="크기" k="levelLabelSize" unit="px" digits={0} />
                  <Slider id="cs-lg2" label="빛(라이팅)" k="levelLabelGlow" unit="px" digits={0} />
                  <Toggle label="점의 단계 글자만 보이기" k="labelsActiveOnly" />
                  <p className={styles.hint}>
                    그래프에서 점을 찍으면 그 점의 %가 속한 단계 글자 하나만 남습니다. 70% 미만이면 모두 숨고, 글자 색은 기준선 색을 따릅니다.
                  </p>
                </div>

                <div className={styles.subCard}>
                  <h4>축 숫자(% · 시각)</h4>
                  <Slider id="cs-as" label="크기" k="axisSize" unit="px" digits={0} />
                  <Slider id="cs-ag" label="빛(라이팅)" k="axisGlow" unit="px" digits={0} />
                  <ColorPick label="축 글자 색" k="textColor" cssVar="--muted" fallback="#9aa7b4" />
                </div>
              </div>
            </section>

            <section className={`${styles.card} ${styles.wide}`} aria-label="박동">
              <h3>박동(두근두근)</h3>
              <div className={styles.twoCol}>
                <div className={styles.colGroup}>
                  <Toggle label="박동 켜기" k="pulseOn" />
                  <Toggle label="높은 단계일수록 빠르게" k="pulseFast" />
                  <p className={styles.hint}>
                    로그인 화면의 &ldquo;넘기 전에&rdquo;처럼 두 번 뛰고 쉽니다. 그래프에서 점을 찍으면 그 점의 %가 속한 단계(주의·경고·위험·초과) 글자가 박동하며, 움직임 줄이기 설정에서는 멈춥니다.
                  </p>
                </div>
                <div className={styles.colGroup}>
                  <Slider id="cs-ps" label="부푸는 크기(배)" k="pulseScale" digits={2} />
                  <Slider id="cs-pt" label="한 번 뛰는 시간" k="pulseSpeed" unit="초" digits={2} />
                  <Slider id="cs-pg" label="번지는 빛" k="pulseGlow" unit="px" digits={0} />
                </div>
              </div>
            </section>

            <section className={`${styles.card} ${styles.wide}`} aria-label="저장과 공유">
              <h3>저장·공유</h3>
              <div className={styles.actions}>
                <button type="button" className={styles.btn} onClick={copy}>현재 값 복사(JSON)</button>
                <button type="button" className={styles.btn} onClick={() => setPaste(paste === null ? "" : null)}>값 붙여 넣기</button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => {
                    reset();
                    setNote(`${MODE_NAME[theme]} 모드를 기본값으로 되돌렸습니다.`);
                  }}
                  disabled={n === 0}
                >
                  기본값으로 되돌리기
                </button>
              </div>
              {paste !== null && (
                <div className={styles.paste}>
                  <textarea aria-label="그래프 설정 JSON" value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} spellCheck={false} />
                  <div className={styles.pasteActions}>
                    <button type="button" className={styles.btnPrimary} onClick={apply}>적용</button>
                  </div>
                </div>
              )}
              <p className={styles.statusNote} role="status">
                {note || "설정은 이 브라우저에 모드별로 저장됩니다. 마음에 드는 값을 복사해 알려 주시면 기본값으로 반영할 수 있어요."}
              </p>
            </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
