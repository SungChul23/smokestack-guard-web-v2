// 내 주변([E-11]) 반경 계산(순수 함수).
// - 지도 클릭·길게 누르기·주소 선택으로 중심을 정하고 반경 5 / 10 / 20km 안 사업장을 찾는다.
// - 웹 메르카토르 역투영(unproject)과 반경(km) → 화면 픽셀(radiusPixelsAt) 계산을 제공한다.
import type { SiteState } from "../data/model";
import { rankOf, WORLD, type View } from "./geometry";

export type NearbyRadiusKm = 5 | 10 | 20;
export const NEARBY_RADII: readonly NearbyRadiusKm[] = [5, 10, 20];

export interface NearbyFilter {
  lon: number;
  lat: number;
  radiusKm: NearbyRadiusKm;
  label?: string;
}

export interface NearbyPreset {
  id: string;
  label: string;
  lon: number;
  lat: number;
}

/** 주요 산단·지역 중심 좌표 (빠른 주소/위치 선택용) */
export const NEARBY_PRESETS: readonly NearbyPreset[] = [
  { id: "dangjin", label: "충남 당진 산단", lon: 126.62, lat: 36.96 },
  { id: "ulsan", label: "울산 온산산단", lon: 129.36, lat: 35.43 },
  { id: "yeosu", label: "전남 여수산단", lon: 127.67, lat: 34.84 },
  { id: "pohang", label: "경북 포항 철강산단", lon: 129.39, lat: 36.0 },
  { id: "gwangyang", label: "전남 광양산단", lon: 127.74, lat: 34.92 },
  { id: "incheon", label: "인천 남동산단", lon: 126.69, lat: 37.4 },
  { id: "seoul", label: "서울 시청", lon: 126.978, lat: 37.5665 },
  { id: "gumi", label: "경북 구미산단", lon: 128.39, lat: 36.1 },
];

const EARTH_RADIUS_KM = 6371.0088;
const EQUATOR_CIRCUMFERENCE_KM = 40075.01668557849;

/** 두 좌표(경도, 위도) 사이의 대원 거리(km) */
export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const rLat1 = lat1 * toRad;
  const rLat2 = lat2 * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_KM * c;
}

/** 웹 메르카토르 세계 좌표(0..256) → 경도·위도(도). geometry.project의 역함수 */
export function unproject(x: number, y: number): [number, number] {
  const lon = (x / WORLD) * 360 - 180;
  const n = Math.PI * (1 - (2 * y) / WORLD);
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  return [lon, lat];
}

/** 화면 좌표(sx, sy) → 경도·위도 */
export function screenToLonLat(view: View, sx: number, sy: number): [number, number] {
  const wx = (sx - view.ox) / view.scale;
  const wy = (sy - view.oy) / view.scale;
  return unproject(wx, wy);
}

/** 특정 위도에서 반경(km)이 현재 지도 배율(view.scale)에서 차지하는 화면 반지름(px) */
export function radiusPixelsAt(lat: number, radiusKm: number, viewScale: number): number {
  const cosLat = Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  const kmPerWorldUnit = (EQUATOR_CIRCUMFERENCE_KM * cosLat) / WORLD;
  return (radiusKm / kmPerWorldUnit) * viewScale;
}

export interface NearbyMatch {
  state: SiteState;
  distanceKm: number;
}

/** 반경 안의 사업장을 단계 → 비율 내림차순 → 거리 오름차순으로 고른다 */
export function sitesWithinRadius(states: readonly SiteState[], nearby: NearbyFilter): NearbyMatch[] {
  const out: NearbyMatch[] = [];
  for (const state of states) {
    const distanceKm = haversineKm(nearby.lon, nearby.lat, state.site.lon, state.site.lat);
    if (distanceKm <= nearby.radiusKm) {
      out.push({ state, distanceKm });
    }
  }
  return out.sort(
    (a, b) =>
      rankOf(b.state.level) - rankOf(a.state.level) ||
      (b.state.ratio ?? -1) - (a.state.ratio ?? -1) ||
      a.distanceKm - b.distanceKm,
  );
}

/** 거리 표기: 1km 미만은 m, 이상은 소수 첫째 자리 km */
export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round(km * 100) * 10)}m`;
  return `${km.toFixed(1)}km`;
}
