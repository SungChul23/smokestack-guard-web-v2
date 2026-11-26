// 에이전트 열기 버튼 · 마스코트 · 창을 묶는다.
// - 창이 닫혀 있으면: 마스코트가 켜져 있고 화면이 넓으면(540px 초과) 마스코트가 돌아다니고, 아니면 우하단 고정 버튼이다.
// - 창이 열려 있으면 둘 다 숨고, 닫으면 다시 나타난다(마스코트는 우하단에서).
// - 마스코트는 기본 꺼짐(옛 웹과 같음). 창 안의 "화면 돌아다니기" 스위치나 ?mascot=on으로 켠다. ?mascot=off가 가장 우선이다.
// - 휴대폰(≤640px)에서는 hideFloatingOnMobile일 때 떠 있는 열기 버튼을 숨기고 하단 탭바의 AI 칸으로 연다.
import { useEffect, useRef, useState } from "react";
import AgentWindow, { type AgentSiteContext } from "./AgentWindow";
import Mascot from "./Mascot";
import { mascotWanted, writeMascot } from "./prefs";
import { NARROW_QUERY, useMediaQuery } from "./useMediaQuery";
import styles from "./AgentDock.module.css";

interface Props {
  /** 외부(예: 휴대폰 하단 탭바 AI 버튼·상세 서랍 AI 탭)에서 창 열림 상태를 제어할 때 사용 */
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  /** 휴대폰(≤640px)에서는 떠 있는 마스코트/런처 버튼을 숨긴다 */
  hideFloatingOnMobile?: boolean;
  /** 오른쪽 상세 서랍이 열려 있으면 버튼을 서랍 바깥 왼쪽으로 옮겨 가리지 않는다 */
  drawerOpen?: boolean;
  /** 상세 서랍에서 넘긴 현재 사업장 맥락 */
  siteContext?: AgentSiteContext | null;
}

export default function AgentDock({
  externalOpen,
  onExternalOpenChange,
  hideFloatingOnMobile = false,
  drawerOpen = false,
  siteContext = null,
}: Props = {}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = externalOpen ?? innerOpen;
  const setOpen = (next: boolean) => {
    setInnerOpen(next);
    onExternalOpenChange?.(next);
  };
  const [mascotOn, setMascotOn] = useState(() => mascotWanted());
  const narrow = useMediaQuery(NARROW_QUERY);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  const roaming = mascotOn && !narrow; // 마스코트가 돌아다니는 상태(좁은 화면에서는 고정 버튼)
  const showLauncher = !open && !roaming;

  // 창을 닫으면 열기 버튼으로 초점을 돌려준다(마스코트일 때는 마스코트가 다시 나타난다)
  useEffect(() => {
    if (wasOpen.current && !open) launcherRef.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  const changeMascot = (on: boolean) => {
    writeMascot(on);
    setMascotOn(mascotWanted()); // 주소의 ?mascot= 이 있으면 그쪽이 우선이다
  };

  const launcherCls = [
    styles.launcher,
    hideFloatingOnMobile ? styles.hideMobile : "",
    drawerOpen ? styles.drawerOffset : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      {showLauncher && (
        <button
          ref={launcherRef}
          type="button"
          className={launcherCls}
          aria-label="에이전트 열기"
          aria-controls="agent-window"
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          <img src="/mascot.png" alt="" width={28} height={30} className={styles.launcherIcon} />
          <span className={styles.launcherText}>AI에게 묻기</span>
        </button>
      )}
      <Mascot visible={roaming && !open} onOpen={() => setOpen(true)} />
      {open && (
        <AgentWindow
          onClose={() => setOpen(false)}
          mascotOn={mascotOn}
          onMascotChange={changeMascot}
          siteContext={siteContext}
        />
      )}
    </>
  );
}
