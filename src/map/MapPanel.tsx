// 지도 패널: 원본 Canvas 2D 지도를 유지하고, 아날로그 시계를 30분 타임라인으로 대체했다.
// - 경계는 월드 좌표로 Path2D를 한 번만 만들고, 그릴 때는 변환 행렬만 바꾼다.
// - 점은 줌에 따라 반경이 다른 화면 거리 묶기(전국 100px, 그 밖 86px)로 묶고 묶음 단위로 그린다.
// - 상단 상태 바 필터(statusFilter), 경고 목록 호버 강조·선택, 공지·검색·내 사업장 이동, 타임라인이 모두 연결된다.
// - 굴뚝 연기 애니메이션은 기본 켜짐이며 정상(ok) 포함 측정값이 있는 모든 굴뚝에서 피어오른다.
// - 내 주변([E-11]): 지도 클릭(데스크톱)·길게 누르기(휴대폰)·위치 선택으로 중심과 5/10/20km 반경 원을 표시한다.
// - 화면 효과 끄기·OS 움직임 줄이기·탭 숨김 시 모든 움직임(연기·파형·비행·바다 그라데이션)을 함께 멈춘다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "../agent/useMediaQuery";
import { type GeoRegion, type SiteState } from "../data/model";
import LevelMark from "../dashboard/LevelMark";
import { LEVELS, type LevelKey } from "../logic/status";
import { useSelection, type MapShowKey } from "../state/selection";
import { useTheme } from "../theme/theme";
import {
  beamHeight, boundsOf, canSeparate, carryClusters, clusterRadius, clusterRadiusMerge, fitView, pinHit, project, rankOf,
  toScreen, zoomAt, clampView, minScaleFor, centeredOn, easeOutCubic, interpolateView, needsFocus, stepZoomView, flightDuration, FOCUS_SCALE, MAX_SCALE, MIN_SCALE,
  type Bounds, type Cluster, type View,
} from "./geometry";
import { freshAlerts, ranksOf, type RankMap } from "./freshAlerts";
import Compass from "./Compass";
import MapTimeline from "./MapTimeline";
import MapKindSelect from "./naver/MapKindSelect";
import { loadNaverSdk, naverKeyId, onNaverAuthFailure, NAVER_NOTES } from "./naver/loader";
import { readMapMode, writeMapMode, type MapMode } from "./naver/mode";
import { createNaverMap, type NaverCallbacks, type NaverController } from "./naver/NaverController";
import { NAVER_ZOOM, focusTarget, needsNaverFocus, targetOfView } from "./naver/viewMath";
import naverStyles from "./naver/NaverMap.module.css";
import { visibleIndices } from "./mapFilter";
import {
  NEARBY_PRESETS, NEARBY_RADII, radiusPixelsAt, screenToLonLat,
  type NearbyFilter, type NearbyRadiusKm,
} from "./nearby";
import { regionAtCenter } from "./regionAtCenter";
import {
  createSmokeParticle, maxSmokeParticles, smokeConfigFor, smokeParticleAlpha, smokeParticleRadius, stepSmokeParticles,
  type SmokeParticle,
} from "./smokeLayer";
import styles from "./MapPanel.module.css";

interface Props {
  states: SiteState[];
  geo: GeoRegion[];
  times: number[];
  slot: number;
  onSlot: (slot: number) => void;
}

type Ring = Array<[number, number]>;
interface Region {
  name: string;
  polys: Ring[][];
  path: Path2D | null;
  bounds: Bounds;
}

const RANK_LEVEL: Array<LevelKey> = ["ok", "caution", "warn", "risk", "exceed"];
const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim();

function buildRegions(geo: GeoRegion[]): Region[] {
  return geo.map((g) => {
    const polygons = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as number[][][][];
    const polys = polygons.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => project(lon, lat))));
    const all = polys.flat(2);
    let path: Path2D | null = null;
    if (typeof Path2D !== "undefined") {
      path = new Path2D();
      for (const poly of polys) for (const ring of poly) {
        ring.forEach(([x, y], i) => (i === 0 ? path!.moveTo(x, y) : path!.lineTo(x, y)));
        path.closePath();
      }
    }
    return { name: g.name, polys, path, bounds: boundsOf(all)! };
  });
}

/** 선택 표시: 사업장의 실제 위치(x, y)를 꼭짓점으로 가리키는 노란 아래 화살표 */
function drawSelectArrow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 9, y - 11);
  ctx.lineTo(x + 3.5, y - 11);
  ctx.lineTo(x + 3.5, y - 24);
  ctx.lineTo(x - 3.5, y - 24);
  ctx.lineTo(x - 3.5, y - 11);
  ctx.lineTo(x - 9, y - 11);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(10, 17, 15, 0.9)";
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
}

/** 내 주변 반경 원과 중심 핀을 캔버스에 그린다 */
function drawNearbyCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radiusPx: number,
  radiusKm: number,
  accent: string,
  ink: string,
  bg: string,
) {
  const r = Math.max(12, radiusPx);
  ctx.save();
  // 연한 채움
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.1;
  ctx.fill();
  // 테두리 선
  ctx.globalAlpha = 0.88;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  // 중심 점 + 흰 테두리
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = bg;
  ctx.stroke();
  // 반경 배지(원 위쪽)
  const label = `반경 ${radiusKm}km`;
  ctx.font = "700 14px Pretendard, system-ui, sans-serif";
  const tw = ctx.measureText(label).width + 16;
  const th = 24;
  const bx = cx - tw / 2;
  const by = cy - r - th - 6;
  ctx.beginPath();
  ctx.roundRect(bx, by, tw, th, 999);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, by + th / 2 + 0.5);
  ctx.restore();
}

/** 굴뚝 표시: 타원 후광 + 위로 솟는 빛기둥 + 바닥 받침 + 개수 배지 */
function drawPin(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  o: { color: string; level: LevelKey | null; count: number; hot: boolean; ink: string; bg: string; accent: string },
) {
  const strong = o.level !== null && o.level !== "ok";
  if (o.hot) { ctx.shadowColor = o.color; ctx.shadowBlur = 18; }
  // 후광(타원)
  ctx.beginPath();
  ctx.ellipse(x, y, strong ? 22 : 13, strong ? 7 : 4, 0, 0, Math.PI * 2);
  ctx.globalAlpha = strong ? 0.16 : 0.1;
  ctx.fillStyle = o.color;
  ctx.fill();
  ctx.globalAlpha = o.hot ? 1 : 0.65;
  ctx.lineWidth = o.hot ? 2 : 1;
  ctx.strokeStyle = o.hot ? o.accent : o.color;
  ctx.stroke();
  ctx.globalAlpha = 1;
  // 빛기둥
  const bh = beamHeight(rankOf(o.level));
  if (bh) {
    const g = ctx.createLinearGradient(0, y - bh, 0, y);
    g.addColorStop(0, "transparent");
    g.addColorStop(1, o.color);
    ctx.beginPath();
    ctx.moveTo(x - 1.6, y - bh); ctx.lineTo(x + 1.6, y - bh); ctx.lineTo(x + 5, y); ctx.lineTo(x - 5, y);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  }
  // 받침
  ctx.beginPath();
  ctx.ellipse(x, y, 5, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = o.color;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  // 개수 배지(묶음일 때만)
  if (o.count > 1) {
    const text = String(o.count);
    const w = Math.max(36, ctx.measureText(text).width + 20), h = 28;
    const bx = x + 7, by = y - Math.max(bh, 24) - 4;
    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, 3);
    ctx.fillStyle = o.bg;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = o.color;
    ctx.stroke();
    ctx.fillStyle = o.ink;
    ctx.fillText(text, bx + w / 2, by + h / 2 + 0.5);
  }
}

const RIPPLE_MS = 1800;
const FLARE_MS = 700;

/** 수면 파형: 후광 타원이 퍼져 나가며 사라지는 고리 두 겹 */
function drawRipples(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, now: number, still: boolean) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  for (const offset of [0, 0.5]) {
    const phase = still ? 0.35 + offset * 0.4 : ((now / RIPPLE_MS) + offset) % 1;
    ctx.globalAlpha = 0.65 * (1 - phase);
    const k = 1 + 0.9 * phase;
    ctx.beginPath();
    ctx.ellipse(x, y, 23 * k, 7 * k, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** 새로 경고가 된 굴뚝: 한 번 번쩍이며 퍼지는 고리 */
function drawFlare(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, t: number): boolean {
  if (t >= 1) return true;
  const a = t < 0.18 ? (t / 0.18) * 0.95 : 0.95 * (1 - (t - 0.18) / 0.82);
  const k = 0.65 + 1.2 * t;
  ctx.globalAlpha = Math.max(0, a);
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, 23 * k, 7 * k, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.globalAlpha = Math.max(0, a * 0.16);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.globalAlpha = 1;
  return false;
}

/** 지도에 표시할 상태 칩: 정상·주의·경고·위험·초과 + 측정 없음(미수신·점검·가동중지 등) */
const SHOW_CHIPS: Array<{ key: MapShowKey; label: string; hint: string }> = [
  ...LEVELS.map((l) => ({ key: l.key as MapShowKey, label: l.label, hint: `${l.label} 굴뚝 표시` })),
  { key: "gap", label: "측정 없음", hint: "측정값이 없는 굴뚝 표시(미수신·점검·가동중지 등)" },
];

export default function MapPanel({ states, geo, times, slot, onSlot }: Props) {
  const { theme, reducedMotion } = useTheme();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const selectedSiteId = useSelection((s) => s.selectedSiteId);
  const hoveredSiteId = useSelection((s) => s.hoveredSiteId);
  const hoveredSiteIdRef = useRef<string | null>(hoveredSiteId);
  hoveredSiteIdRef.current = hoveredSiteId;
  const mapPath = useSelection((s) => s.mapPath);
  const selectSite = useSelection((s) => s.selectSite);
  const setMapPath = useSelection((s) => s.setMapPath);
  const setMapBounds = useSelection((s) => s.setMapBounds);
  const mapLevels = useSelection((s) => s.mapLevels);
  const toggleMapLevel = useSelection((s) => s.toggleMapLevel);
  const statusFilter = useSelection((s) => s.statusFilter);
  const clearSelection = useSelection((s) => s.clearSelection);
  const nearby = useSelection((s) => s.nearby);
  const setNearby = useSelection((s) => s.setNearby);
  const nearbyRef = useRef<NearbyFilter | null>(nearby);
  nearbyRef.current = nearby;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smokeCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ scale: 1, ox: 0, oy: 0 });
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const clustersRef = useRef<Cluster[]>([]);
  const clusterView = useRef<{ view: View; clusters: Cluster[] } | null>(null);
  const visibleRef = useRef<number[]>([]);
  const statesRef = useRef<SiteState[]>(states);
  statesRef.current = states;
  const rafRef = useRef(0);
  const hoverRef = useRef(-1);
  const movingRef = useRef(false);
  const animRef = useRef<{ from: View; to: View; start: number; dur: number } | null>(null);
  const settleTimer = useRef(0);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number; items: SiteState[] } | null>(null);
  const effects = useRef(new Map<string, { start: number; color: string }>());
  const baseCache = useRef<{ key: string; view: View; rough: boolean; mw: number; mh: number; canvas: HTMLCanvasElement } | null>(null);

  // 내 주변([E-11]) 상태
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [nearbyRadius, setNearbyRadius] = useState<NearbyRadiusKm>(10);
  const [geoMessage, setGeoMessage] = useState("");
  const nearbyOpenRef = useRef(nearbyOpen);
  nearbyOpenRef.current = nearbyOpen;
  const nearbyRadiusRef = useRef<NearbyRadiusKm>(nearbyRadius);
  nearbyRadiusRef.current = nearbyRadius;
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  // 지도 종류: 기본 지도(Canvas) / 네이버 일반 / 네이버 위성
  const [mode, setMode] = useState<MapMode>("control");
  const modeRef = useRef<MapMode>("control");
  const [naverBusy, setNaverBusy] = useState(false);
  const [naverNote, setNaverNote] = useState("");
  const hostRef = useRef<HTMLDivElement>(null);
  const naverRef = useRef<NaverController | null>(null);
  const modeToken = useRef(0);
  const naverOn = mode !== "control";

  const regions = useMemo(() => buildRegions(geo), [geo]);

  const siteKey = `${states.length}:${states[0]?.site.id ?? ""}:${states[states.length - 1]?.site.id ?? ""}`;
  const projected = useMemo(() => {
    const xs = new Float64Array(states.length), ys = new Float64Array(states.length);
    states.forEach((st, i) => { const [x, y] = project(st.site.lon, st.site.lat); xs[i] = x; ys[i] = y; });
    return { xs, ys };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const indexById = useMemo(() => new Map(states.map((st, i) => [st.site.id, i])), [siteKey]);

  const favorites = useSelection((s) => s.favorites);
  const favoritesOnly = useSelection((s) => s.favoritesOnly);
  const setFavoritesOnly = useSelection((s) => s.setFavoritesOnly);
  const visibleIdx = useMemo(
    () => visibleIndices(states, mapLevels, favoritesOnly ? new Set(favorites) : null, statusFilter),
    [states, mapLevels, favoritesOnly, favorites, statusFilter],
  );
  visibleRef.current = visibleIdx;

  const nationBounds = useMemo<Bounds>(() => {
    if (!regions.length) {
      const [x0, y0] = project(124.6, 38.7), [x1, y1] = project(131.9, 33.0);
      return { minX: x0, minY: y0, maxX: x1, maxY: y1 };
    }
    return {
      minX: Math.min(...regions.map((r) => r.bounds.minX)), minY: Math.min(...regions.map((r) => r.bounds.minY)),
      maxX: Math.max(...regions.map((r) => r.bounds.maxX)), maxY: Math.max(...regions.map((r) => r.bounds.maxY)),
    };
  }, [regions]);
  const nationView = (): View | null => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return null;
    return fitView(nationBounds, w, h, 28);
  };

  const limitMinScale = () => { const { w, h } = sizeRef.current; return w && h ? minScaleFor(nationBounds, w, h) : MIN_SCALE; };
  const constrain = (v: View): View => {
    const { w, h } = sizeRef.current;
    if (modeRef.current !== "control" || !w || !h) return v;
    return clampView(v, nationBounds, w, h, limitMinScale());
  };
  const constrainRef = useRef(constrain);
  constrainRef.current = constrain;
  const minScaleRef = useRef(limitMinScale);
  minScaleRef.current = limitMinScale;
  const fit = () => { const v = nationView(); if (v) viewRef.current = v; };

  const flyTo = (to: View, rounding: "round" | "floor" = "round") => {
    to = constrain(to);
    const { w, h } = sizeRef.current;
    const still = reducedRef.current;
    const nv = naverRef.current;
    if (nv && w && h) { if (!still) hidePinsRef.current(); nv.moveTo(targetOfView(to, w, h, rounding), !still); return; }
    if (!w || !h || still) { animRef.current = null; viewRef.current = to; scheduleRef.current(); syncRef.current(); return; }
    const from = { ...viewRef.current };
    animRef.current = { from, to, start: performance.now(), dur: flightDuration(from.scale, to.scale) };
    movingRef.current = true;
    window.clearTimeout(settleTimer.current);
    scheduleRef.current();
  };

  const syncPath = () => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const v = viewRef.current;
    setMapBounds({ minX: -v.ox / v.scale, minY: -v.oy / v.scale, maxX: (w - v.ox) / v.scale, maxY: (h - v.oy) / v.scale });
    const sites = states.map((st, i) => ({ sido: st.site.sido, sigungu: st.site.sigungu, x: projected.xs[i], y: projected.ys[i] }));
    setMapPath(regionAtCenter(viewRef.current, w, h, regions, sites));
  };

  const cancelFlight = () => {
    if (!animRef.current) return;
    animRef.current = null;
    movingRef.current = false;
  };

  /** 내 주변 중심을 설정하고 원이 잘 보이게 지도를 맞춘다 */
  const applyNearbyCenter = (lon: number, lat: number, radiusKm: NearbyRadiusKm, label?: string) => {
    setGeoMessage("");
    setNearby({ lon, lat, radiusKm, label });
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const dLat = (radiusKm * 1.6) / 111.32;
    const dLon = (radiusKm * 1.6) / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
    const [x0, y0] = project(lon - dLon, lat + dLat);
    const [x1, y1] = project(lon + dLon, lat - dLat);
    const b: Bounds = { minX: Math.min(x0, x1), minY: Math.min(y0, y1), maxX: Math.max(x0, x1), maxY: Math.max(y0, y1) };
    flyTo(fitView(b, w, h, 36), "floor");
  };

  const toggleNearbyMode = () => {
    if (nearbyOpen || nearby) {
      setNearbyOpen(false);
      setNearby(null);
      setGeoMessage("");
    } else {
      setNearbyOpen(true);
      setGeoMessage("");
    }
  };

  const requestCurrentPosition = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoMessage("이 환경에서는 현재 위치를 사용할 수 없습니다. 지도를 길게 누르거나 지역을 고르세요.");
      return;
    }
    setGeoMessage("현재 위치를 확인하는 중…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyNearbyCenter(pos.coords.longitude, pos.coords.latitude, nearbyRadius, "현재 위치");
      },
      () => {
        setGeoMessage("위치 권한을 얻지 못했습니다. 지도를 길게 누르거나 지역을 고르세요.");
      },
      { enableHighAccuracy: false, timeout: 6000 },
    );
  };

  const drawBase = (ctx: CanvasRenderingContext2D, css: (n: string) => string, view: View, w: number, h: number, dpr: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.ox, dpr * view.oy);
    ctx.lineJoin = "round";
    for (const r of regions) {
      if (!r.path) continue;
      ctx.globalAlpha = 1;
      ctx.fillStyle = css("--map-land");
      ctx.fill(r.path, "evenodd");
    }
    ctx.globalAlpha = 1;

    for (const r of regions) {
      if (!r.path) continue;
      const active = mapPath.sido === r.name;
      ctx.lineWidth = (active ? 1.8 : 1.1) / view.scale;
      ctx.strokeStyle = active ? css("--accent") : css("--map-line");
      ctx.globalAlpha = active ? 0.7 : 1;
      ctx.stroke(r.path);
    }
    ctx.restore();
  };

  // ── 그리기 ────────────────────────────────────────────────────
  const draw = () => {
    rafRef.current = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { w, h, dpr } = sizeRef.current;
    if (w <= 0 || h <= 0 || dpr <= 0 || canvas.width <= 0 || canvas.height <= 0) return;
    const now = performance.now();
    const still = reducedRef.current;
    const flight = animRef.current;
    if (flight) {
      const t = still ? 1 : (now - flight.start) / flight.dur;
      if (t >= 1) { viewRef.current = flight.to; animRef.current = null; movingRef.current = false; syncRef.current(); }
      else viewRef.current = interpolateView(flight.from, flight.to, easeOutCubic(t), w, h);
    }
    const view = viewRef.current;
    const css = (n: string) => cssVar(canvas, n);

    const onNaver = modeRef.current !== "control";
    if (!onNaver) {
      const staticKey = [w, h, dpr, mapPath.sido, theme, regions.length].join("|");
      const c = baseCache.current;
      const moving = movingRef.current;
      let fresh = !c || c.key !== staticKey;
      if (c && !fresh) {
        const same = Math.abs(c.view.scale - view.scale) < 1e-9 && Math.abs(c.view.ox - view.ox) < 0.01 && Math.abs(c.view.oy - view.oy) < 0.01;
        if (!moving) fresh = !same || c.rough;
        else {
          const k = view.scale / c.view.scale;
          const tx = view.ox - k * c.view.ox, ty = view.oy - k * c.view.oy;
          const covered = (-tx) / k >= -c.mw && (w - tx) / k <= w + c.mw && (-ty) / k >= -c.mh && (h - ty) / k <= h + c.mh;
          fresh = !covered || k < 0.55 || k > 2;
        }
      }
      if (fresh) {
        const mw = Math.round(w * 0.5), mh = Math.round(h * 0.5);
        const off = c?.canvas ?? document.createElement("canvas");
        off.width = Math.round((w + 2 * mw) * dpr);
        off.height = Math.round((h + 2 * mh) * dpr);
        const octx = off.getContext("2d");
        const rough = moving;
        if (octx) drawBase(octx, css, { scale: view.scale, ox: view.ox + mw, oy: view.oy + mh }, w + 2 * mw, h + 2 * mh, dpr);
        baseCache.current = { key: staticKey, view: { ...view }, rough, mw, mh, canvas: off };
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!onNaver && baseCache.current && baseCache.current.canvas.width > 0 && baseCache.current.canvas.height > 0) {
      const c = baseCache.current;
      const k = view.scale / c.view.scale;
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (view.ox - k * c.view.ox), dpr * (view.oy - k * c.view.oy));
      ctx.drawImage(c.canvas, -c.mw, -c.mh, c.canvas.width / dpr, c.canvas.height / dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 내 주변 반경 원 (핀 아래에 그려 가독성 유지)
    const nb = nearbyRef.current;
    if (nb) {
      const [wx, wy] = project(nb.lon, nb.lat);
      const [cx, cy] = toScreen(view, wx, wy);
      const rPx = radiusPixelsAt(nb.lat, nb.radiusKm, view.scale);
      drawNearbyCircle(ctx, cx, cy, rPx, nb.radiusKm, css("--accent") || "#38bdf8", css("--map-ink") || "#e6edf3", css("--stage-bg") || "#0e141b");
    }

    if (zoomHide.current && onNaver) return;
    const vis = visibleRef.current;
    let clusters: Cluster[];
    const cached = clusterView.current;
    if (movingRef.current && cached) {
      clusters = carryClusters(cached.clusters, cached.view, view);
    } else {
      const xs = new Float32Array(vis.length), ys = new Float32Array(vis.length), ranks = new Int8Array(vis.length);
      for (let k = 0; k < vis.length; k++) {
        const i = vis[k];
        const [sx, sy] = toScreen(view, projected.xs[i], projected.ys[i]);
        xs[k] = sx; ys[k] = sy; ranks[k] = rankOf(states[i].level);
      }
      clusters = clusterRadiusMerge(xs, ys, ranks, clusterRadius(view.scale), w, h);
      clustersRef.current = clusters;
      clusterView.current = { view: { ...view }, clusters };
    }
    const colorOf = (rank: number) => (rank < 0 ? css("--gap-from") : css(`--lv-${RANK_LEVEL[rank]}`));
    const ink = css("--map-ink"), bg = css("--stage-bg"), accent = css("--accent");
    const order = clusters.map((_, i) => i).sort((a, b) => clusters[a].maxRank - clusters[b].maxRank || clusters[a].y - clusters[b].y);
    ctx.font = "700 17px ui-monospace, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const clusterOf = new Map<number, number>();
    clusters.forEach((c, ci) => { for (const m of c.members) clusterOf.set(vis[m], ci); });
    const listHoverId = hoveredSiteIdRef.current;
    const listHoverCluster = listHoverId !== null
      ? (clusterOf.get(indexById.get(listHoverId) ?? -1) ?? -1)
      : -1;
    const hovered = movingRef.current
      ? -1
      : hoverRef.current >= 0
        ? hoverRef.current
        : listHoverCluster;
    for (const ci of order) {
      const c = clusters[ci];
      if (c.x < -60 || c.y < -90 || c.x > w + 60 || c.y > h + 40) continue;
      const color = colorOf(c.maxRank);
      if (ci === hovered) drawRipples(ctx, c.x, c.y, color, now, still);
      drawPin(ctx, c.x, c.y, {
        color, level: c.maxRank < 0 ? null : RANK_LEVEL[c.maxRank], count: c.count,
        hot: ci === hovered, ink, bg, accent,
      });
    }

    let animating = (hovered >= 0 && !still) || animRef.current !== null;
    const flared = new Set<number>();
    for (const [id, f] of effects.current) {
      const idx = indexById.get(id);
      const t = (now - f.start) / FLARE_MS;
      if (idx === undefined || t >= 1 || still) { effects.current.delete(id); continue; }
      animating = true;
      const ci = clusterOf.get(idx);
      if (ci === undefined || flared.has(ci)) continue;
      flared.add(ci);
      const c = clusters[ci];
      if (c.x > -40 && c.y > -40 && c.x < w + 40 && c.y < h + 40) {
        drawFlare(ctx, c.x, c.y, c.maxRank < 0 ? f.color : colorOf(c.maxRank), t);
      }
    }
    if (selectedSiteId) {
      const idx = indexById.get(selectedSiteId);
      if (idx !== undefined) {
        const [sx, sy] = toScreen(view, projected.xs[idx], projected.ys[idx]);
        if (sx > -30 && sy > -10 && sx < w + 30 && sy < h + 30) drawSelectArrow(ctx, sx, sy, css("--map-select"));
      }
    }
    if (animating) scheduleRef.current();
  };

  const drawRef = useRef(draw);
  drawRef.current = draw;
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const scheduleRef = useRef(() => {});
  scheduleRef.current = () => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(() => drawRef.current());
  };
  const syncRef = useRef(() => {});
  syncRef.current = syncPath;
  const schedule = () => scheduleRef.current();

  const markMoving = () => {
    movingRef.current = true;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => { movingRef.current = false; scheduleRef.current(); syncRef.current(); }, 160);
  };

  // ── 굴뚝 연기 오버레이 캔버스 루프(기본 켜짐 · 정상 포함 · 화면 효과 끄기 시 멈춤) ────
  useEffect(() => {
    const canvas = smokeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (reducedMotion) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    let rafId = 0;
    let lastTs = performance.now();
    let particles: SmokeParticle[] = [];
    const accum = new Map<number, number>();
    const maxCap = maxSmokeParticles(isMobile);

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.08, (now - lastTs) / 1000);
      lastTs = now;
      const { w, h, dpr } = sizeRef.current;
      if (!w || !h) return;

      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // 지도를 옮기거나 확대하는 중에는 연기를 멈추고 비운다(멈추면 자연스럽게 다시 피어오른다)
      if (movingRef.current || (zoomHide.current && modeRef.current !== "control")) {
        particles = [];
        accum.clear();
        return;
      }

      const cs = clustersRef.current;
      const vis = visibleRef.current;
      const sts = statesRef.current;

      for (let ci = 0; ci < cs.length; ci++) {
        const c = cs[ci];
        if (c.x < -20 || c.y < -20 || c.x > w + 20 || c.y > h + 20) continue;
        if (c.maxRank < 0) continue; // 측정 없음(-1)만 연기를 내지 않는다(정상 0 포함 모두 방출)
        const level = RANK_LEVEL[c.maxRank];
        let maxRatio: number | null = null;
        for (const m of c.members) {
          const st = sts[vis[m]];
          if (st?.ratio !== null && st?.ratio !== undefined && (maxRatio === null || st.ratio > maxRatio)) {
            maxRatio = st.ratio;
          }
        }
        const cfg = smokeConfigFor(level, maxRatio, isMobile);
        if (!cfg) continue;
        const carry = (accum.get(ci) ?? 0) + cfg.spawnRate * dt;
        const spawnCount = Math.floor(carry);
        accum.set(ci, carry - spawnCount);
        const topY = c.y - Math.max(beamHeight(c.maxRank), 8);
        for (let k = 0; k < spawnCount && particles.length < maxCap; k++) {
          particles.push(createSmokeParticle(c.x, topY, cfg, Math.random(), Math.random()));
        }
      }

      particles = stepSmokeParticles(particles, dt);

      const cExceed = cssVar(canvas, "--lv-exceed") || "#e11d74";
      const cRisk = cssVar(canvas, "--lv-risk") || "#ef4444";
      const cNeutral = theme === "light" ? "#64748b" : "#94a3b8";
      const cOk = theme === "light" ? "#475569" : "#e2e8f0";

      for (const p of particles) {
        const alpha = smokeParticleAlpha(p);
        if (alpha <= 0.01) continue;
        const rad = smokeParticleRadius(p);
        const color =
          p.colorKind === "exceed"
            ? cExceed
            : p.colorKind === "risk"
              ? cRisk
              : p.colorKind === "ok"
                ? cOk
                : cNeutral;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = p.colorKind === "ok" ? alpha * 0.88 : alpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [reducedMotion, isMobile, theme]);

  // 크기: 컨테이너를 따라가고 DPR을 반영한다
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const apply = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (w <= 0 || h <= 0) return;
      const prev = sizeRef.current;
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      const smokeCanvas = smokeCanvasRef.current;
      if (smokeCanvas) {
        smokeCanvas.width = Math.round(w * dpr);
        smokeCanvas.height = Math.round(h * dpr);
      }
      const nv = naverRef.current;
      if (nv) { nv.setSize(w, h); viewRef.current = nv.getView(); }
      else if (!prev.w) fitRef.current();
      else {
        const v = viewRef.current;
        viewRef.current = constrainRef.current({ ...v, ox: v.ox + (w - prev.w) / 2, oy: v.oy + (h - prev.h) / 2 });
      }
      scheduleRef.current();
      syncRef.current();
    };
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(wrap);
    return () => { ro?.disconnect(); cancelAnimationFrame(rafRef.current); rafRef.current = 0; window.clearTimeout(settleTimer.current); };
  }, []);

  const initDone = useRef(false);
  useEffect(() => {
    if (initDone.current) return;
    if (naverRef.current) { initDone.current = true; return; }
    const v = nationView();
    if (!v) return;
    initDone.current = true;
    viewRef.current = v;
    scheduleRef.current();
    syncRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions]);

  // 사업장을 고르면 그 사업장으로 부드럽게 이동
  useEffect(() => {
    if (!selectedSiteId) return;
    const idx = indexById.get(selectedSiteId);
    const { w, h } = sizeRef.current;
    if (idx === undefined || !w || !h) return;
    const view = viewRef.current;
    const [sx, sy] = toScreen(view, projected.xs[idx], projected.ys[idx]);
    const still = reducedRef.current;
    const nv = naverRef.current;
    if (nv) {
      const z = nv.getZoom();
      if (needsNaverFocus(z, sx, sy, w, h)) { if (!still) hidePinsRef.current(); nv.moveTo(focusTarget(states[idx].site.lon, states[idx].site.lat, z), !still); }
      return;
    }
    if (!needsFocus(view, sx, sy, w, h)) return;
    flyTo(centeredOn(projected.xs[idx], projected.ys[idx], Math.max(view.scale, FOCUS_SCALE), w, h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSiteId]);

  useEffect(() => { schedule(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [states, selectedSiteId, hoveredSiteId, theme, reducedMotion, mapLevels, statusFilter, favoritesOnly, favorites, nearby]);
  useEffect(() => { hoverRef.current = -1; setTip(null); setPicker(null); }, [mapLevels, statusFilter, selectedSiteId, favoritesOnly]);

  // 새로 경고가 된 굴뚝 번쩍임
  const prevRanks = useRef<{ slot: number; ranks: RankMap } | null>(null);
  useEffect(() => {
    const prev = prevRanks.current;
    prevRanks.current = { slot, ranks: ranksOf(states) };
    if (!prev || reducedRef.current) return;
    const fresh = freshAlerts(prev.ranks, states, slot - prev.slot);
    if (fresh.length === 0) return;
    const start = performance.now();
    const get = (n: string) => (canvasRef.current ? cssVar(canvasRef.current, n) : "");
    for (const f of fresh) effects.current.set(f.site.id, { start, color: get(`--lv-${f.level}`) || "#e04b35" });
    scheduleRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states, slot]);

  // 휠: 지도 안에서만 확대하고 페이지 스크롤로 새지 않게 한다
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const r = canvas.getBoundingClientRect();
      setPicker(null);
      cancelFlight();
      markMoving();
      viewRef.current = constrainRef.current(zoomAt(viewRef.current, e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.25 : 0.8, minScaleRef.current(), MAX_SCALE));
      scheduleRef.current();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // ── 마우스·터치: 이동·올림·클릭·내 주변 지정 ──────────────────────
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const local = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setPicker(null);
    cancelFlight();
    const [x, y] = local(e);
    drag.current = { x, y, moved: false };
    longPressFired.current = false;
    cancelLongPress();
    // 휴대폰에서 내 주변 모드가 켜져 있으면 길게 눌러(450ms) 중심을 정한다
    if (nearbyOpenRef.current && (e.pointerType === "touch" || isMobile)) {
      longPressTimer.current = window.setTimeout(() => {
        longPressFired.current = true;
        const [lon, lat] = screenToLonLat(viewRef.current, x, y);
        applyNearbyCenter(lon, lat, nearbyRadiusRef.current, "지정한 위치");
      }, 450);
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const [x, y] = local(e);
    const d = drag.current;
    if (d) {
      const dx = x - d.x, dy = y - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        d.moved = true;
        cancelLongPress();
      }
      if (d.moved) {
        const v = viewRef.current;
        markMoving();
        viewRef.current = constrain({ ...v, ox: v.ox + dx, oy: v.oy + dy });
        d.x = x; d.y = y;
        schedule();
        return;
      }
    }
    hoverAt(x, y);
  };
  const hoverAt = (x: number, y: number) => {
    const ci = movingRef.current ? -1 : pinHit(clustersRef.current, x, y);
    if (ci !== hoverRef.current) {
      hoverRef.current = ci;
      schedule();
      if (ci < 0) setTip(null);
      else {
        const c = clustersRef.current[ci];
        const sts = c.members.map((m) => states[visibleRef.current[m]]);
        const top = sts.reduce((a, b) => (rankOf(b.level) > rankOf(a.level) ? b : a));
        const text = c.count === 1
          ? `${top.site.name}${top.ratio === null ? " · 측정 없음" : ` · ${top.ratio.toFixed(0)}%`}`
          : `${c.count}곳 · 최고 ${top.level ? LEVELS.find((l) => l.key === top.level)!.label : "측정 없음"} · ${splittable(c) ? "눌러서 확대" : "눌러서 고르기"}`;
        setTip({ x: c.x, y: c.y - 30, text });
      }
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    cancelLongPress();
    const d = drag.current;
    drag.current = null;
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (d?.moved) {
      window.clearTimeout(settleTimer.current);
      movingRef.current = false;
      schedule();
      syncRef.current();
      return;
    }
    const [x, y] = local(e);
    clickAt(x, y);
  };
  const clickAt = (x: number, y: number) => {
    const ci = pinHit(clustersRef.current, x, y);
    if (ci >= 0) {
      clickCluster(clustersRef.current[ci]);
      return;
    }
    // 데스크톱에서 "내 주변" 모드가 열려 있을 때 지도의 빈 곳을 누르면 그 자리가 중심이 된다
    if (nearbyOpenRef.current && !isMobile) {
      const [lon, lat] = screenToLonLat(viewRef.current, x, y);
      applyNearbyCenter(lon, lat, nearbyRadiusRef.current, "지정한 위치");
    }
  };
  const leaveHover = () => { if (hoverRef.current !== -1) { hoverRef.current = -1; setTip(null); schedule(); } };
  const maxScale = () => (modeRef.current === "control" ? MAX_SCALE : 2 ** NAVER_ZOOM.max);
  const lastPin = useRef<{ id: string; t: number } | null>(null);
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setPicker(null);
    clearSelection();
  };
  const splittable = (c: Cluster) => {
    const b = boundsOf(c.members.map((m) => { const i = visibleRef.current[m]; return [projected.xs[i], projected.ys[i]] as [number, number]; }));
    return !!b && canSeparate(b) && viewRef.current.scale < maxScale() * 0.98;
  };
  const clickCluster = (c: Cluster) => {
    const sts = c.members.map((m) => states[visibleRef.current[m]]);
    if (c.count === 1) {
      const t = performance.now();
      const lp = lastPin.current;
      lastPin.current = { id: sts[0].site.id, t };
      if (lp && lp.id === sts[0].site.id && t - lp.t < 350) return;
      if (sts[0].site.id === selectedSiteId) clearSelection();
      else selectSite(sts[0].site.id, sts[0].worstStack);
      return;
    }
    const b = boundsOf(c.members.map((m) => { const i = visibleRef.current[m]; return [projected.xs[i], projected.ys[i]] as [number, number]; }));
    if (!b) return;
    if (!canSeparate(b) || viewRef.current.scale >= maxScale() * 0.98) { openPicker(c, sts); return; }
    const { w, h } = sizeRef.current;
    flyTo(stepZoomView(b, viewRef.current, w, h), "floor");
  };
  const openPicker = (c: Cluster, sts: SiteState[]) => {
    const { w, h } = sizeRef.current;
    const items = [...sts].sort((a, b) => rankOf(b.level) - rankOf(a.level) || (b.ratio ?? -1) - (a.ratio ?? -1));
    setPicker({ x: Math.min(Math.max(c.x + 12, 8), Math.max(8, w - 248)), y: Math.min(Math.max(c.y - 110, 8), Math.max(8, h - 248)), items });
    setTip(null);
  };

  // ── 네이버 지도 연결 ───────────────────────────────────────────
  const leaveNaver = () => {
    naverRef.current?.destroy();
    naverRef.current = null;
    hostRef.current?.replaceChildren();
    modeRef.current = "control";
    setMode("control");
    hoverRef.current = -1; setTip(null); setPicker(null);
    clusterView.current = null;
    window.clearTimeout(settleTimer.current);
    movingRef.current = false;
    scheduleRef.current();
    syncRef.current();
  };
  const chooseMode = (next: MapMode) => {
    if (next === modeRef.current && !naverBusy) return;
    const token = ++modeToken.current;
    setPicker(null); setTip(null); hoverRef.current = -1;
    if (next === "control") { leaveNaver(); setNaverNote(""); setNaverBusy(false); writeMapMode("control"); return; }
    const live = naverRef.current;
    if (live) { live.setMapType(next); modeRef.current = next; setMode(next); setNaverNote(""); writeMapMode(next); return; }
    setNaverBusy(true);
    setNaverNote(NAVER_NOTES.loading);
    loadNaverSdk(naverKeyId()).then((N) => {
      const host = hostRef.current;
      if (token !== modeToken.current || !host) return;
      const { w, h } = sizeRef.current;
      const ctl = createNaverMap(N, host, { w: w || 300, h: h || 300 }, {
        onFollow: () => nvh.current.onFollow(), onIdle: () => nvh.current.onIdle(),
        onHover: (x, y) => nvh.current.onHover(x, y), onLeave: () => nvh.current.onLeave(),
        onClick: (x, y) => nvh.current.onClick(x, y), onContextMenu: () => nvh.current.onContextMenu(),
      });
      ctl.setMapType(next);
      if (w && h) ctl.moveTo(targetOfView(viewRef.current, w, h, "floor"), false);
      naverRef.current = ctl;
      modeRef.current = next;
      animRef.current = null;
      clusterView.current = null;
      movingRef.current = false;
      viewRef.current = ctl.getView();
      setMode(next); setNaverBusy(false); setNaverNote(""); writeMapMode(next);
      scheduleRef.current();
      syncRef.current();
    }).catch((e: unknown) => {
      if (token !== modeToken.current) return;
      setNaverBusy(false);
      setNaverNote(e instanceof Error && e.message ? e.message : NAVER_NOTES.noMap);
    });
  };

  const nvh = useRef<NaverCallbacks>({ onFollow() {}, onIdle() {}, onHover() {}, onLeave() {}, onClick() {}, onContextMenu() {} });
  const followLoop = useRef(0);
  const followStable = useRef(0);
  const startFollow = () => {
    followStable.current = 0;
    if (followLoop.current) return;
    let lastSig = "";
    const step = () => {
      followLoop.current = 0;
      const nv = naverRef.current;
      if (!nv) return;
      const v = nv.getView();
      const sig = `${v.scale.toFixed(4)}|${v.ox.toFixed(1)}|${v.oy.toFixed(1)}`;
      if (sig !== lastSig) { lastSig = sig; followStable.current = 0; viewRef.current = v; markMoving(); scheduleRef.current(); }
      else followStable.current++;
      if (followStable.current < 30) followLoop.current = requestAnimationFrame(step);
    };
    followLoop.current = requestAnimationFrame(step);
  };
  const startFollowRef = useRef(startFollow);
  startFollowRef.current = startFollow;
  const zoomHide = useRef(false);
  const zoomHideTimer = useRef(0);
  const lastZoomInput = useRef(0);
  const hidePins = (guardIdle = false) => {
    if (!naverRef.current) return;
    zoomHide.current = true;
    lastZoomInput.current = guardIdle ? performance.now() : 0;
    scheduleRef.current();
    window.clearTimeout(zoomHideTimer.current);
    zoomHideTimer.current = window.setTimeout(() => {
      if (!zoomHide.current) return;
      zoomHide.current = false;
      const nv = naverRef.current;
      if (nv) viewRef.current = nv.getView();
      movingRef.current = false;
      scheduleRef.current();
      syncRef.current();
    }, 800);
  };
  const hidePinsRef = useRef(hidePins);
  hidePinsRef.current = hidePins;
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const dragFn = () => startFollowRef.current();
    const zoomFn = () => hidePinsRef.current(true);
    host.addEventListener("wheel", zoomFn, { passive: true, capture: true });
    host.addEventListener("dblclick", zoomFn, { passive: true, capture: true });
    host.addEventListener("pointerdown", dragFn, { passive: true, capture: true });
    return () => {
      host.removeEventListener("wheel", zoomFn, true);
      host.removeEventListener("dblclick", zoomFn, true);
      host.removeEventListener("pointerdown", dragFn, true);
      cancelAnimationFrame(followLoop.current);
      followLoop.current = 0;
      window.clearTimeout(zoomHideTimer.current);
    };
  }, []);
  nvh.current = {
    onFollow: () => { const nv = naverRef.current; if (!nv) return; viewRef.current = nv.getView(); markMoving(); scheduleRef.current(); },
    onIdle: () => {
      const nv = naverRef.current;
      if (!nv) return;
      if (zoomHide.current && performance.now() - lastZoomInput.current < 250) {
        window.clearTimeout(zoomHideTimer.current);
        zoomHideTimer.current = window.setTimeout(() => nvh.current.onIdle(), 300);
        return;
      }
      viewRef.current = nv.getView();
      zoomHide.current = false;
      window.clearTimeout(zoomHideTimer.current);
      window.clearTimeout(settleTimer.current);
      movingRef.current = false;
      scheduleRef.current();
      syncRef.current();
    },
    onHover: hoverAt, onLeave: leaveHover, onClick: clickAt,
    onContextMenu: () => { setPicker(null); clearSelection(); },
  };
  const chooseRef = useRef(chooseMode);
  chooseRef.current = chooseMode;
  const leaveRef = useRef(leaveNaver);
  leaveRef.current = leaveNaver;

  useEffect(() => {
    const saved = readMapMode();
    if (saved !== "control") chooseRef.current(saved);
  }, []);
  useEffect(() => onNaverAuthFailure(() => {
    modeToken.current++;
    if (naverRef.current) leaveRef.current();
    setNaverBusy(false);
    setNaverNote(NAVER_NOTES.auth);
  }), []);
  useEffect(() => () => { modeToken.current++; naverRef.current?.destroy(); naverRef.current = null; }, []);

  return (
    <div className={styles.panel}>
      <div className={styles.bar}>
        <strong className={styles.title}>지도</strong>
        <nav className={styles.crumbs} aria-label="지도 중앙 위치">
          <span className={styles.crumbHint}>지도 중앙</span>
          <span className={styles.crumbNow} aria-current="location">{mapPath.sido ?? "전국"}</span>
          {mapPath.sigungu && (<><span className={styles.crumbSep} aria-hidden="true">›</span><span className={styles.crumbNow}>{mapPath.sigungu}</span></>)}
        </nav>

        <div className={styles.right}>
          {/* 6단계 [2]: 내 주변 버튼 */}
          <button
            type="button"
            className={styles.up}
            aria-pressed={nearbyOpen || Boolean(nearby)}
            onClick={toggleNearbyMode}
            title="지도에서 중심을 골라 반경 5·10·20km 안 사업장을 찾습니다"
          >
            내 주변{nearby ? ` · ${nearby.radiusKm}km` : ""}
          </button>

          <MapKindSelect mode={mode} busy={naverBusy} onChange={chooseMode} />

          <div className={styles.levels} role="group" aria-label="지도에 표시할 상태">
            {SHOW_CHIPS.map((c) => (
              <button
                key={c.key}
                type="button"
                className={styles.level}
                aria-pressed={mapLevels.includes(c.key)}
                onClick={() => toggleMapLevel(c.key)}
                title={c.hint}
              >
                <LevelMark level={c.key} size={12} /> {c.label}
              </button>
            ))}
          </div>

          <div className={styles.levels} role="group" aria-label="지도 사업장 범위">
            <button
              type="button"
              className={styles.level}
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly(!favoritesOnly)}
              aria-label="즐겨찾기만 보기"
              title="즐겨찾기한 사업장만 지도와 목록에 표시합니다"
            >
              ★
            </button>
          </div>

          <div className={styles.tools}>
            <button type="button" className={styles.up} onClick={() => { const v = nationView(); if (v) flyTo(v, "floor"); }}>전국 보기</button>
          </div>
        </div>
      </div>

      {/* 내 주변 컨트롤 띠 */}
      {(nearbyOpen || nearby) && (
        <div className={styles.nearbyBar} role="region" aria-label="내 주변 반경 설정">
          <span className={styles.nearbyLabel}>
            내 주변{nearby?.label ? ` · ${nearby.label}` : ""}
          </span>
          <div className={styles.nearbyRadii} role="group" aria-label="반경 선택">
            {NEARBY_RADII.map((r) => (
              <button
                key={r}
                type="button"
                className={styles.radiusBtn}
                aria-pressed={(nearby?.radiusKm ?? nearbyRadius) === r}
                onClick={() => {
                  setNearbyRadius(r);
                  if (nearby) applyNearbyCenter(nearby.lon, nearby.lat, r, nearby.label);
                }}
              >
                {r}km
              </button>
            ))}
          </div>
          <select
            className={styles.nearbySelect}
            aria-label="지역 중심으로 이동"
            value=""
            onChange={(e) => {
              const p = NEARBY_PRESETS.find((x) => x.id === e.target.value);
              if (p) applyNearbyCenter(p.lon, p.lat, nearby?.radiusKm ?? nearbyRadius, p.label);
            }}
          >
            <option value="">지역 선택…</option>
            {NEARBY_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          {isMobile && (
            <button type="button" className={styles.radiusBtn} onClick={requestCurrentPosition}>
              현재 위치
            </button>
          )}
          <span className={styles.nearbyHint}>
            {geoMessage || (nearby
              ? "다른 곳을 누르면 중심이 옮겨집니다"
              : isMobile
                ? "지도를 길게 누르거나 지역을 고르세요"
                : "지도를 클릭하거나 지역을 고르세요")}
          </span>
          <button type="button" className={styles.nearbyClear} onClick={() => { setNearbyOpen(false); setNearby(null); setGeoMessage(""); }}>
            해제
          </button>
        </div>
      )}

      <div ref={wrapRef} className={styles.canvasWrap}>
        {/* 6단계 [4]: 바다·바깥 배경의 아주 느리고 은은한 그라데이션 */}
        {!naverOn && <div className={styles.oceanDrift} aria-hidden="true" />}

        <div ref={hostRef} className={naverOn ? naverStyles.host : `${naverStyles.host} ${naverStyles.hostHidden}`} />
        <canvas
          ref={canvasRef}
          className={naverOn ? `${styles.canvas} ${naverStyles.overlay}` : styles.canvas}
          data-picking={nearbyOpen && !isMobile ? "true" : undefined}
          role="img"
          aria-label={`굴뚝 ${visibleIdx.length}곳을 보여 주는 지도. 같은 내용을 오른쪽 목록에서 키보드로 고를 수 있습니다.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onContextMenu={onContextMenu}
          onPointerLeave={() => { cancelLongPress(); drag.current = null; if (hoverRef.current !== -1) { hoverRef.current = -1; setTip(null); schedule(); } }}
        />

        {/* 6단계 [3]: 굴뚝 연기 오버레이 캔버스 */}
        <canvas ref={smokeCanvasRef} className={styles.smokeCanvas} aria-hidden="true" />

        {naverNote && <div className={naverStyles.note} role="status">{naverNote}</div>}
        {tip && <div className={styles.tip} style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
        {picker && (
          <div
            className={styles.picker}
            style={{ left: picker.x, top: picker.y }}
            role="menu"
            aria-label={`같은 자리의 사업장 ${picker.items.length}곳 중 고르기`}
            onKeyDown={(e) => { if (e.key === "Escape") setPicker(null); }}
          >
            <div className={styles.pickerHead}>같은 자리 {picker.items.length}곳 · 하나를 고르세요</div>
            <div className={styles.pickerList}>
              {picker.items.map((it) => (
                <button
                  key={it.site.id}
                  type="button"
                  role="menuitem"
                  className={styles.pickerItem}
                  onClick={() => { selectSite(it.site.id, it.worstStack); setPicker(null); }}
                >
                  <LevelMark level={it.level ?? "gap"} size={12} />
                  <span className={styles.pickerName}>{it.site.name}</span>
                  <span className={styles.pickerRatio}>{it.ratio === null ? "—" : `${it.ratio.toFixed(0)}%`}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <Compass />
        <p className={styles.guide}>드래그 이동 · 휠 확대/축소 · 묶음·굴뚝 클릭 시 확대 · 오른쪽 클릭 선택 해제</p>
      </div>

      {/* 6단계 [0]: 아날로그 시계를 대신하는 30분 타임라인 */}
      <MapTimeline times={times} slot={slot} onSlot={onSlot} />
    </div>
  );
}
