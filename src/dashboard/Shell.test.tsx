import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme/theme";
import LevelMark from "./LevelMark";
import Shell, { type ShellProps } from "./Shell";

function setup(props: Partial<ShellProps> = {}) {
  const onLogout = vi.fn();
  render(
    <ThemeProvider>
      <Shell email="a@b.com" userName="미리보기" onLogout={onLogout} {...props} />
    </ThemeProvider>,
  );
  return { onLogout };
}

function mockViewport(matchesFn: (query: string) => boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: matchesFn(query),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-effects");
  // 기본 jsdom 상태로 복원
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

describe("관제 화면 공통 틀(2단계 · 레일 없음)", () => {
  it("왼쪽 레일이 없고, 새 머리(워드마크·인사)·지표 카드 4개·푸터가 있다", () => {
    setup();
    expect(screen.queryByRole("navigation", { name: "주 메뉴" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: /smokestack-guard/ })).toBeInTheDocument();
    expect(screen.getByText("굴뚝 통합 관제")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /사용자 메뉴 \(미리보기님\)/ })).toBeInTheDocument();

    const cards = screen.getByRole("region", { name: "단계별 굴뚝 수" });
    for (const label of ["주의", "경고", "위험", "초과"]) {
      expect(within(cards).getByText(label)).toBeInTheDocument();
    }
    expect(within(cards).queryByText("정상")).toBeNull();
  });

  it("푸터에 단계 기준과 보관 기록 안내가 있다", () => {
    setup();
    expect(screen.getByText(/주의 ≥70%.*초과 ≥100%/)).toBeInTheDocument();
    expect(screen.getByText(/법적 판정 아님/)).toBeInTheDocument();
  });

  it("데이터가 없으면 값 자리는 0이 아니라 —로 두고 신선도는 연결 전이다", () => {
    setup();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/데이터 연결 전/)).toBeInTheDocument();
  });

  it("최신 초과+위험 개수가 로고 연기 색에 반영되고 상단 알림 종 버튼은 없다", () => {
    setup({ latestCounts: { exceed: 3, risk: 2 } });
    expect(screen.queryByRole("button", { name: /초과·위험 알림/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "즐겨찾기 한 사업장" })).toBeInTheDocument();
    const logo = document.querySelector("[data-tone]");
    expect(logo?.getAttribute("data-tone")).toBe("exceed");
  });

  it("사용자 메뉴에서 테마(다크/라이트/시스템)·화면 효과·로그아웃을 조작한다", async () => {
    const { onLogout } = setup();
    await userEvent.click(screen.getByRole("button", { name: /사용자 메뉴/ }));

    expect(screen.getByText("a@b.com")).toBeInTheDocument();

    // 라이트 테마 전환
    await userEvent.click(screen.getByRole("button", { name: "라이트" }));
    expect(document.documentElement.dataset.theme).toBe("light");

    // 화면 효과 끄기 → html[data-effects="off"] & 로고 연기 정지
    const effectsSwitch = screen.getByRole("switch", { name: "화면 효과" });
    expect(effectsSwitch).toHaveAttribute("aria-checked", "true");
    await userEvent.click(effectsSwitch);
    expect(effectsSwitch).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.dataset.effects).toBe("off");
    expect(document.querySelector("[data-paused]")?.getAttribute("data-paused")).toBe("true");

    // 로그아웃
    await userEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("그래프 설정은 사용자 메뉴 안에 있으며 열기 콜백을 부른다", async () => {
    const onOpenSettings = vi.fn();
    setup({ onOpenSettings, settingsOpen: false });
    await userEvent.click(screen.getByRole("button", { name: /사용자 메뉴/ }));
    const btn = screen.getByRole("button", { name: "그래프 설정" });
    expect(btn).toHaveAttribute("aria-haspopup", "dialog");
    await userEvent.click(btn);
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("본문 건너뛰기 링크와 전국 검색(Ctrl+K) 모달이 동작한다", async () => {
    const onSelect = vi.fn();
    setup({
      searchItems: [
        { siteId: "PV-01", name: "동해화력발전(주)", region: "울산 남구", level: "exceed", ratio: 118 },
      ],
      onSelectSearchItem: onSelect,
    });
    expect(screen.getByRole("link", { name: "본문으로 건너뛰기" })).toHaveAttribute("href", "#main");

    await userEvent.click(screen.getByRole("button", { name: "전국 사업장 검색 (Ctrl+K)" }));
    const dialog = screen.getByRole("dialog", { name: "전국 사업장 검색" });
    await userEvent.click(within(dialog).getByRole("button", { name: /동해화력발전/ }));
    expect(onSelect).toHaveBeenCalledWith("PV-01");
  });

  it("휴대폰(≤640px)에서는 아래 시트와 5개 하단 탭바가 나온다", async () => {
    mockViewport((q) => q === "(max-width: 640px)");
    setup();
    expect(screen.getByRole("navigation", { name: "하단 메뉴" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "목록 및 상세 시트" })).toHaveAttribute("data-snap", "collapsed");

    await userEvent.click(screen.getByRole("button", { name: "목록" }));
    expect(screen.getByRole("region", { name: "목록 및 상세 시트" })).toHaveAttribute("data-snap", "half");

    await userEvent.click(screen.getByRole("button", { name: "메뉴" }));
    expect(screen.getByRole("dialog", { name: "사용자 및 화면 설정" })).toBeInTheDocument();
  });
});

describe("LevelMark", () => {
  it("단계마다 모양이 다르다(측정 없음 포함 6종, 색만으로 구분하지 않는다)", () => {
    const shapes = (["gap", "ok", "caution", "warn", "risk", "exceed"] as const).map((level) => {
      const { container, unmount } = render(<LevelMark level={level} />);
      const html = container.querySelector("svg")!.innerHTML;
      unmount();
      return html;
    });
    expect(new Set(shapes).size).toBe(6);
  });
});

describe("에이전트", () => {
  it("화면에 에이전트 열기 버튼이 있고, 누르면 대화 창이 열린다", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "에이전트 열기" }));
    expect(screen.getByRole("dialog", { name: "에이전트 대화" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "에이전트 열기" })).toBeNull();
  });
});
