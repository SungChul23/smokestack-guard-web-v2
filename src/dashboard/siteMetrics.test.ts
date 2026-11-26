import { describe, expect, it } from "vitest";
import type { DayData, Site } from "../data/model";
import {
  closeOpenTab,
  defaultDetailTab,
  formatPpmPair,
  formatStreakDuration,
  levelStreakAt,
  missingSlotsCount,
  pushOpenTab,
  recentSparkline,
  shortRegion,
  stackRowsAt,
  worstDetailAt,
} from "./siteMetrics";

const SLOT = 30 * 60 * 1000;
const t0 = Date.UTC(2026, 10, 25, 0, 0);
const times = Array.from({ length: 12 }, (_, i) => t0 + i * SLOT);

const site: Site = {
  id: "S1",
  name: "가나에너지(주)",
  sido: "충남",
  sigungu: "당진시",
  address: "충청남도 당진시 석문산단로 104",
  lon: 126.6,
  lat: 36.9,
  stacks: [
    { key: "S1:1", code: "1" },
    { key: "S1:2", code: "2" },
  ],
};

const day: DayData = {
  times,
  stacks: {
    "S1:1": {
      nox: ["20", "22", "24", "25", "25", "25", "26", "26", "28", "30", "32", "34"],
      sox: ["10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10"],
      noxLimit: "50",
      soxLimit: "50",
    },
    "S1:2": {
      // 마지막 4칸(2시간)이 100% 이상 초과, 2칸 결측
      nox: ["35", "38", null, "미수신", "42", "44", "46", "48", "51", "53", "55", "57"],
      sox: ["20", "20", "20", "20", "20", "20", "20", "20", "25", "28", "30", "32"],
      noxLimit: "50",
      soxLimit: "50",
    },
  },
};

describe("siteMetrics 순수 함수", () => {
  it("shortRegion은 주소 전체 대신 시·도 시·군만 돌려준다", () => {
    expect(shortRegion(site)).toBe("충남 당진시");
    expect(shortRegion({ sido: "", sigungu: "" })).toBe("지역 정보 없음");
  });

  it("worstDetailAt은 최고 비율의 굴뚝·물질·실측/기준값을 고른다", () => {
    const w = worstDetailAt(site, day, 11);
    expect(w.stackCode).toBe("2");
    expect(w.pollutant).toBe("nox");
    expect(w.ratio).toBeCloseTo(114);
    expect(w.level).toBe("exceed");
    expect(formatPpmPair(w.value, w.limit)).toBe("57.0 / 50 ppm");
  });

  it("recentSparkline은 최근 6시간 추세와 방향(↑↓→)을 계산한다", () => {
    const up = recentSparkline(site, day, 11, 12);
    expect(up.points).toHaveLength(12);
    expect(up.direction).toBe("up");
    expect(up.arrow).toBe("↑");

    const flatDay: DayData = {
      times,
      stacks: {
        "S1:1": { nox: times.map(() => "30"), sox: times.map(() => null), noxLimit: "50", soxLimit: null },
      },
    };
    const flat = recentSparkline({ ...site, stacks: [site.stacks[0]] }, flatDay, 11, 12);
    expect(flat.direction).toBe("flat");
    expect(flat.arrow).toBe("→");
  });

  it("levelStreakAt은 현재 단계 지속 칸 수와 시작 시각을 계산한다", () => {
    const st = levelStreakAt(site, day, 11);
    expect(st.level).toBe("exceed");
    expect(st.slots).toBe(4);
    expect(st.sinceMs).toBe(times[8]);
    expect(st.durationLabel).toBe("2시간째");
    expect(formatStreakDuration(1)).toBe("30분째");
    expect(formatStreakDuration(3)).toBe("1시간 30분째");
  });

  it("missingSlotsCount는 모든 굴뚝에 측정값이 없는 칸만 센다", () => {
    const gapSite: Site = { ...site, stacks: [{ key: "S1:2", code: "2" }] };
    const gapDay: DayData = {
      times,
      stacks: {
        "S1:2": { ...day.stacks["S1:2"], sox: times.map(() => null), soxLimit: null },
      },
    };
    expect(missingSlotsCount(gapSite, gapDay, 11)).toBe(2);
  });

  it("stackRowsAt은 굴뚝별 NOx·SOx 현재값/기준/비율/단계를 돌려준다", () => {
    const rows = stackRowsAt(site, day, 11);
    expect(rows).toHaveLength(2);
    expect(rows[0].code).toBe("1");
    expect(rows[0].nox.ratio).toBeCloseTo(68);
    expect(rows[1].code).toBe("2");
    expect(rows[1].nox.value).toBe(57);
    expect(rows[1].nox.limit).toBe(50);
    expect(rows[1].worstLevel).toBe("exceed");
  });

  it("defaultDetailTab은 초과·위험이면 추세, 그 밖에는 개요를 기본으로 연다", () => {
    expect(defaultDetailTab("exceed")).toBe("trend");
    expect(defaultDetailTab("risk")).toBe("trend");
    expect(defaultDetailTab("warn")).toBe("overview");
    expect(defaultDetailTab("caution")).toBe("overview");
    expect(defaultDetailTab("ok")).toBe("overview");
    expect(defaultDetailTab(null)).toBe("overview");
  });

  it("pushOpenTab / closeOpenTab은 최대 6개 크롬형 탭을 유지하고 옆 탭으로 이동한다", () => {
    let tabs: string[] = [];
    for (const id of ["A", "B", "C", "D", "E", "F", "G"]) {
      tabs = pushOpenTab(tabs, id, 6);
    }
    expect(tabs).toEqual(["B", "C", "D", "E", "F", "G"]);
    // 이미 열린 탭을 다시 열면 순서 유지
    expect(pushOpenTab(tabs, "C", 6)).toEqual(["B", "C", "D", "E", "F", "G"]);
    // 활성 탭을 닫으면 옆 탭으로 이동
    expect(closeOpenTab(["A", "B", "C"], "B", "B")).toEqual({ tabs: ["A", "C"], nextActive: "C" });
    expect(closeOpenTab(["A", "B"], "B", "B")).toEqual({ tabs: ["A"], nextActive: "A" });
    expect(closeOpenTab(["A"], "A", "A")).toEqual({ tabs: [], nextActive: null });
  });
});
