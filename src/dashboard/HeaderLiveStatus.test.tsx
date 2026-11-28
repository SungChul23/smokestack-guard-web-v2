import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { computeFreshness } from "./freshness";
import HeaderLiveStatus from "./HeaderLiveStatus";

describe("HeaderLiveStatus 컴포넌트", () => {
  const base = Date.UTC(2026, 4, 10, 7, 30); // 16:30 KST

  it("실시간 상태에서 빨간 LIVE 배지·펄스 속성·공지 요약을 표시하고 클릭 시 전체 공지를 연다", async () => {
    const onOpenNotices = vi.fn();
    const fresh = computeFreshness(base, base + 2 * 60_000);
    render(
      <HeaderLiveStatus
        fresh={fresh}
        noticeCount={12}
        exceedCount={3}
        onOpenNotices={onOpenNotices}
      />,
    );

    const btn = screen.getByRole("button", { name: /실시간 LIVE/ });
    expect(btn).toHaveAttribute("data-status", "live");
    expect(btn).toHaveAttribute("data-pulsing", "true");
    expect(btn).toHaveTextContent("LIVE");
    expect(btn).toHaveTextContent("16:30 (2분 전)");
    expect(btn).toHaveTextContent("초과 3 · 공지 12");

    await userEvent.click(btn);
    expect(onOpenNotices).toHaveBeenCalledOnce();
  });

  it("끊김·연결 전 상태에서는 data-pulsing=false로 펄스 애니메이션을 끈다", () => {
    const disc = computeFreshness(base, base + 100 * 60_000);
    const { rerender } = render(
      <HeaderLiveStatus fresh={disc} noticeCount={2} exceedCount={0} onOpenNotices={() => {}} />,
    );
    const btn = screen.getByRole("button", { name: /끊김/ });
    expect(btn).toHaveAttribute("data-status", "disconnected");
    expect(btn).toHaveAttribute("data-pulsing", "false");

    const none = computeFreshness(null, base);
    rerender(<HeaderLiveStatus fresh={none} noticeCount={0} exceedCount={0} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("data-status", "none");
    expect(status).toHaveAttribute("data-pulsing", "false");
    expect(status).toHaveTextContent("데이터 연결 전");
  });
});
