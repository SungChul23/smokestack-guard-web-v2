import { render, screen, within } from "@testing-library/react";
import { AuthProvider } from "react-oidc-context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { oidcConfig } from "../auth";
import { buildNotices } from "../dashboard/notices";
import { allSiteStates, countByLevel, formatSlot, stackRatioAt } from "../data/model";
import { makeLoader, usesApi } from "../data/useDay";
import { initialSelection, MAP_SHOW_ORDER, useSelection } from "../state/selection";
import { ThemeProvider } from "../theme/theme";
import { createPreviewDay, PREVIEW_FAVORITE_IDS, PREVIEW_SITES, PREVIEW_SLOT_COUNT, resetPreviewState } from "./fakeData";
import { isPreviewMode } from "./mode";

beforeEach(() => {
  resetPreviewState();
  useSelection.setState({ ...initialSelection, mapLevels: [...MAP_SHOW_ORDER] });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("미리보기 모드 판정", () => {
  it("VITE_COGNITO_CLIENT_ID가 비어 있으면 켜지고, 값이 있으면 꺼진다", () => {
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "");
    expect(isPreviewMode()).toBe(true);
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "   ");
    expect(isPreviewMode()).toBe(true);
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "real-cognito-client-id");
    expect(isPreviewMode()).toBe(false);
  });
});

describe("미리보기 가짜 데이터 ([G] 사양)", () => {
  it("사업장 40곳(굴뚝 1~4개), 오늘 00:00~16:30 34칸, 정확한 단계 분포를 가진다", () => {
    expect(PREVIEW_SITES).toHaveLength(40);
    for (const s of PREVIEW_SITES) {
      expect(s.stacks.length).toBeGreaterThanOrEqual(1);
      expect(s.stacks.length).toBeLessThanOrEqual(4);
    }

    // 5대 산단(울산·포항·여수·당진·광양)에 과반 이상 밀집
    const clusterCount = PREVIEW_SITES.filter(
      (s) =>
        s.sido === "울산" ||
        s.sigungu === "포항시" ||
        s.sigungu === "여수시" ||
        s.sigungu === "당진시" ||
        s.sigungu === "광양시",
    ).length;
    expect(clusterCount).toBeGreaterThanOrEqual(25);

    const day = createPreviewDay(Date.UTC(2026, 10, 24, 12, 0));
    expect(day.times).toHaveLength(PREVIEW_SLOT_COUNT);
    expect(formatSlot(day.times[0])).toMatch(/00:00$/);
    expect(formatSlot(day.times[33])).toMatch(/16:30$/);
    for (let i = 1; i < day.times.length; i++) {
      expect(day.times[i] - day.times[i - 1]).toBe(30 * 60 * 1000);
    }

    const states = allSiteStates(PREVIEW_SITES, day, day.times.length - 1);
    const counts = countByLevel(states);
    const gapCount = states.filter((s) => s.level === null).length;
    const okCount = states.filter((s) => s.level === "ok").length;

    expect(counts).toEqual({ caution: 4, warn: 3, risk: 2, exceed: 3 });
    expect(gapCount).toBe(4);
    expect(okCount).toBe(24);

    const notices = buildNotices(PREVIEW_SITES, day, { levels: ["exceed"] });
    expect(notices).toHaveLength(3);
  });

  it("초과 3곳은 각각 계속 오름 / 마지막 칸 첫 초과 / 넘었다가 내려오는 추세를 가진다", () => {
    const day = createPreviewDay(Date.UTC(2026, 10, 24, 12, 0));

    // 1) PV-01:2 — 14:00(index 28)부터 16:30(index 33)까지 계속 상승하며 초과
    const rise = [28, 29, 30, 31, 32, 33].map((i) => stackRatioAt(day.stacks["PV-01:2"], i)!);
    for (let i = 1; i < rise.length; i++) expect(rise[i]).toBeGreaterThan(rise[i - 1]);
    expect(rise[rise.length - 1]).toBeGreaterThanOrEqual(100);

    // 2) PV-02:1 — 0..32는 모두 100% 미만, 마지막 칸(33)에서 처음 100% 초과
    for (let i = 0; i < 33; i++) {
      const r = stackRatioAt(day.stacks["PV-02:1"], i);
      if (r !== null) expect(r).toBeLessThan(100);
    }
    expect(stackRatioAt(day.stacks["PV-02:1"], 33)!).toBeGreaterThanOrEqual(100);

    // 3) PV-03:3 — 앞에서 더 높게 넘었다가 16:30 현재 내려오는 중(여전히 초과)
    const peak = stackRatioAt(day.stacks["PV-03:3"], 29)!;
    const prev = stackRatioAt(day.stacks["PV-03:3"], 32)!;
    const last = stackRatioAt(day.stacks["PV-03:3"], 33)!;
    expect(peak).toBeGreaterThan(prev);
    expect(prev).toBeGreaterThan(last);
    expect(last).toBeGreaterThanOrEqual(100);
  });

  it("즐겨찾기 초깃값 5곳은 초과 1곳과 측정 없음 1곳을 포함한다", () => {
    expect(PREVIEW_FAVORITE_IDS).toHaveLength(5);
    const day = createPreviewDay(Date.UTC(2026, 10, 24, 12, 0));
    const states = allSiteStates(PREVIEW_SITES, day, day.times.length - 1);
    const favStates = states.filter((s) => PREVIEW_FAVORITE_IDS.includes(s.site.id));
    expect(favStates).toHaveLength(5);
    expect(favStates.some((s) => s.level === "exceed")).toBe(true);
    expect(favStates.some((s) => s.level === null)).toBe(true);
  });

  it("미리보기 모드에서는 서버 API 대신 가짜 데이터를 돌려주고 초기 즐겨찾기를 채운다", async () => {
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "");
    const calledUrls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      calledUrls.push(String(url));
      return Promise.resolve(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    });
    expect(usesApi()).toBe(false);
    const data = await makeLoader(() => "preview")();
    expect(data.sites).toHaveLength(40);
    expect(data.day.times).toHaveLength(34);
    expect(calledUrls.some((u) => u.includes("/api/"))).toBe(false);
    expect(useSelection.getState().favorites).toEqual([...PREVIEW_FAVORITE_IDS]);
  });
});

describe("App 미리보기 진입", () => {
  const renderApp = () =>
    render(
      <ThemeProvider>
        <AuthProvider {...oidcConfig}>
          <App />
        </AuthProvider>
      </ThemeProvider>,
    );

  it("VITE_COGNITO_CLIENT_ID가 비어 있으면 로그인 없이 관제 화면과 공지·경고 목록이 바로 뜬다", async () => {
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "");
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response("[]", { status: 200, headers: { "content-type": "application/json" } })),
    );
    renderApp();
    const userBtn = await screen.findByRole("button", { name: /사용자 메뉴 \(미리보기님\)/ });
    expect(userBtn).toBeInTheDocument();
    const header = screen.getByRole("banner");
    const liveBtn = await within(header).findByRole("button", { name: /실시간 LIVE/ });
    expect(liveBtn).toHaveAttribute("data-status", "live");
    expect(liveBtn).toHaveAttribute("data-pulsing", "true");
    expect(liveBtn).toHaveTextContent("초과 3 · 공지 12");
    expect(screen.queryByRole("region", { name: "초과 공지" })).toBeNull();
    const list = await screen.findByRole("list", { name: "경고 목록" });
    expect(within(list).getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
  });

  it("VITE_COGNITO_CLIENT_ID가 있으면 기존처럼 첫 화면(Landing)을 보여 준다", async () => {
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "real-client-id");
    renderApp();
    expect(await screen.findByRole("button", { name: /로그인/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /사용자 메뉴 \(미리보기님\)/ })).toBeNull();
  });
});
