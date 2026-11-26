// 관제 화면 진입점. 데이터를 읽어 지도·목록·차트·지표 카드에 나눠 준다. 테마 공급자는 main.tsx(루트)에 있다.
import { useEffect, useMemo, useRef, useState } from "react";
import { allSiteStates, countByLevel, formatSlot, type SiteState } from "../data/model";
import { makeLoader, useDashboardData, usesApi, type DashboardData } from "../data/useDay";
import { useFavoritesSync } from "../data/useFavorites";
import { LEVELS, type LevelKey } from "../logic/status";
import type { AgentSiteContext } from "../agent/AgentWindow";
import MapPanel from "../map/MapPanel";
import { isPreviewMode, PREVIEW_FRESHNESS_OFFSET_MS } from "../preview/mode"; // PREVIEW-ONLY
import { useSelection } from "../state/selection";
import AlertList from "./AlertList";
import ChartStylePanel from "./ChartStylePanel";
import type { SheetSnap } from "./MobileBottomSheet";
import MySitesPanel from "./MySitesPanel";
import NoticeBanner from "./NoticeBanner";
import NoticeSticker from "./NoticeSticker";
import { buildNotices, type Notice } from "./notices";
import Shell, { type QuickSearchItem, type ShellProps } from "./Shell";
import SiteDetailDrawer from "./SiteDetailDrawer";
import { shortRegion } from "./siteMetrics";

type Props = Pick<ShellProps, "email" | "userName" | "onLogout"> & {
  /** 데이터 읽는 방법. 시험에서 가짜 데이터를 넣을 때만 쓴다. */
  load?: () => Promise<DashboardData>;
  /** 서버 API를 부를 로그인 토큰(운영) */
  accessToken?: string;
};

const LEVEL_ORDER: Record<LevelKey, number> = Object.fromEntries(LEVELS.map((l, i) => [l.key, i])) as Record<LevelKey, number>;

function compareBySeverity(a: SiteState, b: SiteState): number {
  const rankA = a.level ? LEVEL_ORDER[a.level] : -1;
  const rankB = b.level ? LEVEL_ORDER[b.level] : -1;
  if (rankA !== rankB) return rankB - rankA;
  const ratioA = a.ratio ?? -1;
  const ratioB = b.ratio ?? -1;
  if (ratioA !== ratioB) return ratioB - ratioA;
  return a.site.name.localeCompare(b.site.name, "ko");
}

export default function DashboardApp({ load, accessToken, ...props }: Props) {
  // 토큰은 갱신돼도 데이터를 다시 읽지 않도록 ref로 건다
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const loader = useMemo(() => load ?? makeLoader(() => tokenRef.current), [load]);
  const live = !load && usesApi(); // 운영: 서버 데이터
  const state = useDashboardData(loader, live); // 30분 적재 직후 새 값으로 바꾼다
  useFavoritesSync(accessToken, live); // 즐겨찾기는 Cognito sub 기준으로 서버에 저장한다
  const favoriteNotice = useSelection((s) => s.favoriteNotice);
  const [slotPick, setSlotPick] = useState<number | null>(null); // null = 최신
  const [settingsOpen, setSettingsOpen] = useState(false); // 그래프 설정 패널
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentSiteContext, setAgentSiteContext] = useState<AgentSiteContext | null>(null);
  const [mobileSheetSnap, setMobileSheetSnap] = useState<SheetSnap>("collapsed");
  const selectedSiteId = useSelection((s) => s.selectedSiteId);
  const clearSelection = useSelection((s) => s.clearSelection);

  // 사업장을 고르면 상세 서랍(#trend)에 초점을 맞출 수 있게 다음 프레임에 호출한다(기존 시험 호환)
  useEffect(() => {
    if (!selectedSiteId) return;
    const id = requestAnimationFrame(() => {
      const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("trend")?.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedSiteId]);

  const ready = state.status === "ready" ? state.data : null;

  // 새 값이 들어와 시점 목록이 한 칸씩 밀리면, 고른 시점이 같은 시각을 가리키도록 맞춘다(밀려 나가면 최신으로)
  const firstTime = useRef<number | null>(null);
  useEffect(() => {
    const first = ready?.day.times[0] ?? null;
    const prev = firstTime.current;
    firstTime.current = first;
    if (prev === null || first === null || prev === first) return;
    const shift = Math.round((first - prev) / (30 * 60 * 1000));
    setSlotPick((p) => (p === null || p - shift < 0 ? null : p - shift));
  }, [ready]);

  const slot = ready ? Math.min(slotPick ?? ready.day.times.length - 1, ready.day.times.length - 1) : 0;

  const states = useMemo(() => (ready ? allSiteStates(ready.sites, ready.day, slot) : []), [ready, slot]);
  const selected = ready?.sites.find((s) => s.id === selectedSiteId) ?? null;

  // 최신 시점(마지막 칸) 상태: 상단 머리 알림 종 배지 · 로고 연기 색 · 내 사업장 · 빠른 검색
  const latestStates = useMemo(
    () => (ready && ready.day.times.length > 0 ? allSiteStates(ready.sites, ready.day, ready.day.times.length - 1) : []),
    [ready],
  );
  const latestCounts = useMemo(() => (ready ? countByLevel(latestStates) : null), [ready, latestStates]);

  // 공지는 지도 시간대 슬라이더가 아니라 최신 데이터(마지막 칸)를 현재 상태로 본다.
  const favorites = useSelection((s) => s.favorites);
  const selectSite = useSelection((s) => s.selectSite);
  const rolling = useMemo(() => (ready ? buildNotices(ready.sites, ready.day, { levels: ["exceed"] }) : []), [ready]);
  const sticker = useMemo(
    () => (ready ? buildNotices(ready.sites, ready.day, { levels: ["warn", "risk", "exceed"], only: new Set(favorites) }) : []),
    [ready, favorites],
  );
  const pick = (n: Notice) => selectSite(n.siteId, n.stackCode);
  // 그래프 설정을 만져 볼 예시: 지금 초과인 사업장 중 첫 곳(없으면 첫 사업장)
  const sample = rolling[0] ?? (ready?.sites[0] ? { siteId: ready.sites[0].id, stackCode: ready.sites[0].stacks[0]?.code ?? null } : null);

  const favoriteStates = useMemo(() => {
    if (!favorites.length) return [];
    const set = new Set(favorites);
    return latestStates.filter((st) => set.has(st.site.id)).sort(compareBySeverity);
  }, [latestStates, favorites]);

  const searchItems = useMemo<QuickSearchItem[]>(
    () =>
      [...latestStates].sort(compareBySeverity).map((st) => ({
        siteId: st.site.id,
        name: st.site.name,
        region: shortRegion(st.site),
        address: st.site.address,
        level: st.level ?? "gap",
        ratio: st.ratio,
      })),
    [latestStates],
  );

  const handleAskAi = (ctx: AgentSiteContext) => {
    setAgentSiteContext(ctx);
    setAgentOpen(true);
  };

  if (!ready) {
    const note = state.status === "unavailable" ? `데이터 연결 전 (${state.reason})` : "데이터를 불러오는 중…";
    // 준비된 화면과 같은 구조로 둔다(데이터가 들어올 때 Shell이 새로 만들어지지 않게)
    return (
      <>
        {null}
        {null}
        <Shell
          {...props}
          map={<p style={{ color: "var(--muted)" }}>{note}</p>}
          list={<p style={{ color: "var(--muted)" }}>{note}</p>}
        />
      </>
    );
  }

  const times = ready.day.times;
  const latestMs = times.length > 0 ? times[times.length - 1] : null;
  const freshnessNowMs = isPreviewMode() && latestMs !== null ? latestMs + PREVIEW_FRESHNESS_OFFSET_MS : undefined; // PREVIEW-ONLY

  const notice = favoriteNotice && (
    <p
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        zIndex: 95,
        margin: 0,
        padding: "10px 16px",
        borderRadius: 10,
        background: "var(--panel-solid)",
        color: "var(--ink)",
        border: "1px solid var(--lv-warn)",
        fontSize: 15,
      }}
    >
      {favoriteNotice}
    </p>
  );

  const latestSlot = Math.max(times.length - 1, 0);
  const pastTimeLabel =
    times.length > 0 && slot < latestSlot
      ? (formatSlot(times[slot]).split(" ")[1] ?? formatSlot(times[slot]))
      : null;

  return (
    <>
      {notice}
      <ChartStylePanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onPickSample={sample ? () => selectSite(sample.siteId, sample.stackCode) : undefined}
      />
      <Shell
        {...props}
        onOpenSettings={() => setSettingsOpen((v) => !v)}
        settingsOpen={settingsOpen}
        latestMs={latestMs}
        freshnessNowMs={freshnessNowMs}
        latestCounts={latestCounts}
        counts={latestCounts}
        pastTimeLabel={pastTimeLabel}
        onBackToLatest={() => setSlotPick(null)}
        mobileSheetSnap={mobileSheetSnap}
        onMobileSheetSnapChange={setMobileSheetSnap}
        notices={
          rolling.length || sticker.length ? (
            <>
              <NoticeBanner items={rolling} onPick={pick} />
              <NoticeSticker items={sticker} onPick={pick} />
            </>
          ) : undefined
        }
        map={
          <MapPanel
            states={states}
            geo={ready.geo}
            times={times}
            slot={slot}
            onSlot={setSlotPick}
          />
        }
        favoritesPanel={<MySitesPanel states={favoriteStates} day={ready.day} slot={latestSlot} />}
        favoritesCount={favoriteStates.length}
        list={<AlertList states={states} day={ready.day} slot={slot} pastTimeLabel={pastTimeLabel} />}
        listHasHeader
        trend={
          selected ? (
            <SiteDetailDrawer
              site={selected}
              sites={ready.sites}
              day={ready.day}
              slot={slot}
              onClose={clearSelection}
              onAskAi={handleAskAi}
            />
          ) : undefined
        }
        trendHasHeader={Boolean(selected)}
        trendTitle={selected ? `${selected.name} · 상세` : "사업장 상세"}
        onClearSelection={clearSelection}
        searchItems={searchItems}
        onSelectSearchItem={(siteId) => selectSite(siteId)}
        agentOpen={agentOpen}
        onAgentOpenChange={setAgentOpen}
        agentSiteContext={agentSiteContext}
      />
    </>
  );
}
