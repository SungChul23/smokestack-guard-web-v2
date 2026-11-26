import { describe, expect, it } from "vitest";
import { computeFreshness, smokeToneOf, userDisplayName, userInitial } from "./freshness";

describe("데이터 신선도 계산(computeFreshness)", () => {
  const base = Date.UTC(2026, 4, 10, 7, 30); // 16:30 KST

  it("40분 미만이면 실시간(live)이다", () => {
    const res = computeFreshness(base, base + 2 * 60_000);
    expect(res.status).toBe("live");
    expect(res.label).toBe("실시간");
    expect(res.fullText).toBe("실시간 · 16:30 기준 (2분 전)");
    expect(res.shortText).toBe("16:30 (2분 전)");
  });

  it("40분 이상 90분 미만이면 지연(delayed)이다", () => {
    const res = computeFreshness(base, base + 40 * 60_000);
    expect(res.status).toBe("delayed");
    expect(res.label).toBe("지연");
    expect(res.fullText).toContain("40분 전");
  });

  it("90분 이상이면 끊김(disconnected)이다", () => {
    const res = computeFreshness(base, base + 95 * 60_000);
    expect(res.status).toBe("disconnected");
    expect(res.label).toBe("끊김");
    expect(res.fullText).toContain("1시간 35분 전");
  });

  it("시각이 없으면 연결 전 상태다", () => {
    const res = computeFreshness(null, base);
    expect(res.status).toBe("none");
    expect(res.fullText).toContain("데이터 연결 전");
  });
});

describe("로고 연기 색(smokeToneOf)", () => {
  it("초과가 1곳 이상이면 exceed, 위험만 있으면 risk, 그 밖엔 calm이다", () => {
    expect(smokeToneOf({ exceed: 2, risk: 1 })).toBe("exceed");
    expect(smokeToneOf({ exceed: 0, risk: 3 })).toBe("risk");
    expect(smokeToneOf({ exceed: 0, risk: 0 })).toBe("calm");
    expect(smokeToneOf(null)).toBe("calm");
  });
});

describe("사용자 이름·이니셜", () => {
  it("name이 있으면 name, 없으면 email 앞부분, 둘 다 없으면 사용자", () => {
    expect(userDisplayName("김환경", "kim@example.com")).toBe("김환경");
    expect(userDisplayName(undefined, "preview@example.com")).toBe("preview");
    expect(userDisplayName("  ", undefined)).toBe("사용자");
  });

  it("이니셜은 첫 글자 대문자다", () => {
    expect(userInitial("미리보기")).toBe("미");
    expect(userInitial("alex")).toBe("A");
  });
});
