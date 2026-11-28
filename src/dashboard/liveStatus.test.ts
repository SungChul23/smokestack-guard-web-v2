import { describe, expect, it } from "vitest";
import { computeFreshness } from "./freshness";
import { buildLiveStatusViewModel } from "./liveStatus";

describe("헤더 LIVE 상태 뷰 모델(buildLiveStatusViewModel)", () => {
  const base = Date.UTC(2026, 4, 10, 7, 30); // 16:30 KST

  it("실시간(live)이고 초과·전체 공지가 있으면 빨간 LIVE + 펄스 + 초과·공지 요약을 만든다", () => {
    const fresh = computeFreshness(base, base + 2 * 60_000);
    const vm = buildLiveStatusViewModel(fresh, { total: 12, exceed: 3 }, true);
    expect(vm.status).toBe("live");
    expect(vm.badgeText).toBe("LIVE");
    expect(vm.isPulsing).toBe(true);
    expect(vm.hasExceed).toBe(true);
    expect(vm.timeLabel).toBe("16:30 (2분 전)");
    expect(vm.shortTimeLabel).toBe("16:30");
    expect(vm.noticeLabel).toBe("초과 3 · 공지 12");
    expect(vm.shortNoticeLabel).toBe("초과 3");
    expect(vm.mobileBadgeCount).toBe(12);
    expect(vm.ariaLabel).toContain("실시간 LIVE");
    expect(vm.ariaLabel).toContain("초과 3곳");
    expect(vm.ariaLabel).toContain("전체 경보 공지 보기");
  });

  it("초과 없이 경보만 있으면 공지 건수만 표시하고 초과 강조는 끈다", () => {
    const fresh = computeFreshness(base, base + 5 * 60_000);
    const vm = buildLiveStatusViewModel(fresh, { total: 4, exceed: 0 }, true);
    expect(vm.hasExceed).toBe(false);
    expect(vm.noticeLabel).toBe("공지 4건");
    expect(vm.shortNoticeLabel).toBe("공지 4");
    expect(vm.mobileBadgeCount).toBe(4);
  });

  it("실시간이지만 공지가 0건이면 공지 없음으로 표시하고 모바일 카운트는 숨긴다", () => {
    const fresh = computeFreshness(base, base + 1 * 60_000);
    const vm = buildLiveStatusViewModel(fresh, { total: 0, exceed: 0 }, true);
    expect(vm.noticeLabel).toBe("공지 없음");
    expect(vm.shortNoticeLabel).toBe("");
    expect(vm.mobileBadgeCount).toBeNull();
  });

  it("지연(delayed)은 지연 배지 + 펄스를 유지하고, 끊김(disconnected)은 펄스를 끈다", () => {
    const delayed = computeFreshness(base, base + 45 * 60_000);
    const vmDelayed = buildLiveStatusViewModel(delayed, { total: 2, exceed: 1 }, true);
    expect(vmDelayed.badgeText).toBe("지연");
    expect(vmDelayed.isPulsing).toBe(true);

    const disconnected = computeFreshness(base, base + 120 * 60_000);
    const vmDisc = buildLiveStatusViewModel(disconnected, { total: 2, exceed: 1 }, true);
    expect(vmDisc.badgeText).toBe("끊김");
    expect(vmDisc.isPulsing).toBe(false);
  });

  it("데이터 연결 전(none)에는 대기 배지·데이터 연결 전 문구·펄스 꺼짐이다", () => {
    const none = computeFreshness(null, base);
    const vm = buildLiveStatusViewModel(none, { total: 0, exceed: 0 }, false);
    expect(vm.status).toBe("none");
    expect(vm.badgeText).toBe("대기");
    expect(vm.isPulsing).toBe(false);
    expect(vm.timeLabel).toBe("데이터 연결 전");
    expect(vm.noticeLabel).toBe("");
    expect(vm.ariaLabel).not.toContain("누르면");
  });
});
