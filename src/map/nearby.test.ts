import { describe, expect, it } from "vitest";
import type { SiteState } from "../data/model";
import { project, toScreen } from "./geometry";
import { formatDistanceKm, haversineKm, radiusPixelsAt, screenToLonLat, sitesWithinRadius, unproject } from "./nearby";

const mk = (id: string, lon: number, lat: number, level: SiteState["level"], ratio: number | null): SiteState => ({
  site: { id, name: `사업장${id}`, sido: "충남", sigungu: "당진시", address: "", lon, lat, stacks: [] },
  level,
  ratio,
  worstStack: "1",
});

describe("내 주변 반경 계산", () => {
  it("project ↔ unproject 왕복이 소수 5자리 이내로 일치한다", () => {
    const [x, y] = project(126.62, 36.96);
    const [lon, lat] = unproject(x, y);
    expect(lon).toBeCloseTo(126.62, 5);
    expect(lat).toBeCloseTo(36.96, 5);
  });

  it("screenToLonLat은 화면 좌표를 원래 경위도로 되돌린다", () => {
    const view = { scale: 640, ox: -138000, oy: -62000 };
    const [wx, wy] = project(129.36, 35.43);
    const [sx, sy] = toScreen(view, wx, wy);
    const [lon, lat] = screenToLonLat(view, sx, sy);
    expect(lon).toBeCloseTo(129.36, 5);
    expect(lat).toBeCloseTo(35.43, 5);
  });

  it("서울 시청–울산 시청 거리가 약 300km 대다", () => {
    const d = haversineKm(126.978, 37.5665, 129.3114, 35.5384);
    expect(d).toBeGreaterThan(290);
    expect(d).toBeLessThan(330);
    expect(haversineKm(127, 37, 127, 37)).toBe(0);
  });

  it("radiusPixelsAt은 같은 위도의 실제 투영 거리(px)와 일치한다", () => {
    const lat = 36.96;
    const scale = 1200;
    const rPx = radiusPixelsAt(lat, 10, scale);
    // 10km 동쪽 경도 차이: 10 / (111.32 * cos(lat))
    const dLon = 10 / (111.3195 * Math.cos((lat * Math.PI) / 180));
    const [x0] = project(126.62, lat);
    const [x1] = project(126.62 + dLon, lat);
    const projectedPx = (x1 - x0) * scale;
    expect(rPx).toBeCloseTo(projectedPx, 1);
  });

  it("sitesWithinRadius는 반경 안 사업장만 고르고 단계 → 비율 → 거리 순으로 정렬한다", () => {
    const states = [
      mk("far", 129.36, 35.43, "exceed", 140),
      mk("near-warn", 126.63, 36.96, "warn", 85),
      mk("near-exceed", 126.64, 36.96, "exceed", 118),
      mk("near-ok", 126.625, 36.96, "ok", 35),
    ];
    const matches = sitesWithinRadius(states, { lon: 126.62, lat: 36.96, radiusKm: 10 });
    expect(matches.map((m) => m.state.site.id)).toEqual(["near-exceed", "near-warn", "near-ok"]);
    expect(matches.every((m) => m.distanceKm <= 10)).toBe(true);
  });

  it("formatDistanceKm는 1km 미만은 m, 이상은 km로 표시한다", () => {
    expect(formatDistanceKm(0.45)).toBe("450m");
    expect(formatDistanceKm(3.24)).toBe("3.2km");
  });
});
