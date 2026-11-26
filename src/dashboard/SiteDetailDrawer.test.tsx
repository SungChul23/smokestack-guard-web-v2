import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DayData, Site } from "../data/model";
import { initialSelection, MAP_SHOW_ORDER, useSelection } from "../state/selection";
import SiteDetailDrawer from "./SiteDetailDrawer";

function makeSite(id: string, name: string, sigungu: string, stackCodes = ["1", "2"]): Site {
  return {
    id,
    name,
    sido: "충청남도",
    sigungu,
    address: `충청남도 ${sigungu} 산단로 10`,
    lat: 36.8,
    lon: 126.7,
    stacks: stackCodes.map((code) => ({
      code,
      key: `${id}:${code}`,
    })),
  };
}

function makeDay(sites: Site[]): DayData {
  const base = Date.UTC(2026, 3, 1, 0, 0);
  const times = Array.from({ length: 12 }, (_, i) => base + i * 30 * 60_000);
  const stacks: DayData["stacks"] = {};
  for (const s of sites) {
    for (const st of s.stacks) {
      if (s.id === "EX1" && st.code === "1") {
        // 초과: 116% (58 / 50 ppm)
        stacks[st.key] = {
          nox: Array(12).fill("58"),
          sox: Array(12).fill("20"),
          noxLimit: "50",
          soxLimit: "40",
        };
      } else if (s.id === "OK1" && st.code === "1") {
        // 정상: 40% (20 / 50 ppm)
        stacks[st.key] = {
          nox: Array(12).fill("20"),
          sox: Array(12).fill("12"),
          noxLimit: "50",
          soxLimit: "40",
        };
      } else {
        stacks[st.key] = {
          nox: Array(12).fill("30"),
          sox: Array(12).fill("16"),
          noxLimit: "50",
          soxLimit: "40",
        };
      }
    }
  }
  return { times, stacks };
}

beforeEach(() => {
  useSelection.setState({ ...initialSelection, mapLevels: [...MAP_SHOW_ORDER] });
});

describe("SiteDetailDrawer (4단계 상세 서랍)", () => {
  it("초과·위험 사업장은 기본 탭이 '추세', 정상·주의·경고 사업장은 기본 탭이 '개요'다", () => {
    const ex = makeSite("EX1", "초과발전소", "당진시");
    const ok = makeSite("OK1", "정상공장", "서산시");
    const day = makeDay([ex, ok]);

    useSelection.getState().selectSite(ex.id);
    const { rerender } = render(
      <SiteDetailDrawer site={ex} sites={[ex, ok]} day={day} slot={11} onClose={vi.fn()} />,
    );
    expect(screen.getByRole("tab", { name: "추세" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "false");

    useSelection.getState().selectSite(ok.id);
    rerender(<SiteDetailDrawer site={ok} sites={[ex, ok]} day={day} slot={11} onClose={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "개요" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "추세" })).toHaveAttribute("aria-selected", "false");
  });

  it("내용 탭은 ←→·Home/End 키보드로 이동하며 초점이 따라간다", () => {
    const ok = makeSite("OK1", "정상공장", "서산시");
    const day = makeDay([ok]);
    useSelection.getState().selectSite(ok.id);

    render(<SiteDetailDrawer site={ok} sites={[ok]} day={day} slot={11} onClose={vi.fn()} />);
    const overview = screen.getByRole("tab", { name: "개요" });
    const trend = screen.getByRole("tab", { name: "추세" });
    const stacks = screen.getByRole("tab", { name: "굴뚝별" });
    const ai = screen.getByRole("tab", { name: "AI에게 묻기" });

    overview.focus();
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(trend).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(trend);

    fireEvent.keyDown(trend, { key: "ArrowRight" });
    expect(stacks).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(stacks);

    fireEvent.keyDown(stacks, { key: "End" });
    expect(ai).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(ai);

    fireEvent.keyDown(ai, { key: "Home" });
    expect(overview).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(overview);

    fireEvent.keyDown(overview, { key: "ArrowLeft" });
    expect(ai).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(ai);
  });

  it("크롬형 사업장 탭은 최대 6개까지 쌓이고 × 버튼으로 탭을 닫을 수 있다", () => {
    const sites = Array.from({ length: 7 }, (_, i) => makeSite(`S${i + 1}`, `사업장${i + 1}`, "울산 남구", ["1"]));
    const day = makeDay(sites);
    for (const s of sites) useSelection.getState().selectSite(s.id);

    // 최대 6개 유지(가장 오래된 S1이 빠지고 S2~S7 유지)
    expect(useSelection.getState().openTabs).toEqual(["S2", "S3", "S4", "S5", "S6", "S7"]);

    render(<SiteDetailDrawer site={sites[6]} sites={sites} day={day} slot={11} onClose={vi.fn()} />);
    const closeBtn = screen.getByRole("button", { name: "사업장7 탭 닫기" });
    fireEvent.click(closeBtn);
    expect(useSelection.getState().openTabs).toEqual(["S2", "S3", "S4", "S5", "S6"]);
    expect(useSelection.getState().selectedSiteId).toBe("S6");
  });

  it("굴뚝별 탭에서 NOx·SOx 현재값/기준(ppm)·비율·단계를 표로 보여 주고, 행 클릭 시 추세 탭으로 이동한다", () => {
    const ex = makeSite("EX1", "초과발전소", "당진시", ["1", "2"]);
    const day = makeDay([ex]);
    useSelection.getState().selectSite(ex.id);

    render(<SiteDetailDrawer site={ex} sites={[ex]} day={day} slot={11} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "굴뚝별" }));

    expect(screen.getByRole("table", { name: /굴뚝별 측정 현황/ })).toBeInTheDocument();
    expect(screen.getByText("58.0 / 50 ppm")).toBeInTheDocument();
    expect(screen.getByText("116%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "굴뚝 2" }));
    expect(screen.getByRole("tab", { name: "추세" })).toHaveAttribute("aria-selected", "true");
    expect(useSelection.getState().selectedStackCode).toBe("2");
  });

  it("AI에게 묻기 탭은 미리보기 모드에서 '미리보기에서는 사용할 수 없음'을 알린다", () => {
    const ex = makeSite("EX1", "초과발전소", "당진시", ["1"]);
    const day = makeDay([ex]);
    useSelection.getState().selectSite(ex.id);

    render(<SiteDetailDrawer site={ex} sites={[ex]} day={day} slot={11} onClose={vi.fn()} onAskAi={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "AI에게 묻기" }));
    expect(screen.getByText(/미리보기에서는 사용할 수 없음/)).toBeInTheDocument();
  });
});
