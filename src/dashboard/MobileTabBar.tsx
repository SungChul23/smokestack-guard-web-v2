// 휴대폰 하단 탭바([D]): 관제 · 목록 · 내 사업장 · AI · 메뉴 (높이 56px + safe-area).
import { useEffect } from "react";
import { UserMenuContent } from "./HeaderBar";
import { CloseIcon, ListIcon, MenuIcon, OverviewIcon, SparkleIcon, StarIcon } from "./icons";
import styles from "./MobileTabBar.module.css";

export type MobileNavKey = "map" | "alerts" | "favorites" | "ai" | "menu";

interface Props {
  active: MobileNavKey;
  onSelect: (key: MobileNavKey) => void;
  menuOpen: boolean;
  onCloseMenu: () => void;
  displayName: string;
  email?: string;
  onOpenSettings?: () => void;
  settingsOpen?: boolean;
  onLogout: () => void;
}

export default function MobileTabBar({
  active,
  onSelect,
  menuOpen,
  onCloseMenu,
  displayName,
  email,
  onOpenSettings,
  settingsOpen,
  onLogout,
}: Props) {
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseMenu();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, onCloseMenu]);

  return (
    <>
      <nav className={styles.tabBar} aria-label="하단 메뉴">
        <button
          type="button"
          className={styles.item}
          aria-current={active === "map" ? "page" : undefined}
          onClick={() => onSelect("map")}
        >
          <OverviewIcon />
          <span>관제</span>
        </button>
        <button
          type="button"
          className={styles.item}
          aria-current={active === "alerts" ? "page" : undefined}
          onClick={() => onSelect("alerts")}
        >
          <ListIcon />
          <span>목록</span>
        </button>
        <button
          type="button"
          className={styles.item}
          aria-label="즐겨찾기 한 사업장"
          aria-current={active === "favorites" ? "page" : undefined}
          onClick={() => onSelect("favorites")}
        >
          <StarIcon filled={active === "favorites"} />
          <span>즐겨찾기</span>
        </button>
        <button
          type="button"
          className={styles.item}
          aria-pressed={active === "ai"}
          onClick={() => onSelect("ai")}
        >
          <SparkleIcon />
          <span>AI</span>
        </button>
        <button
          type="button"
          className={styles.item}
          aria-pressed={menuOpen}
          onClick={() => onSelect("menu")}
        >
          <MenuIcon />
          <span>메뉴</span>
        </button>
      </nav>

      {menuOpen && (
        <div
          className={styles.backdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) onCloseMenu();
          }}
        >
          <div className={styles.menuSheet} role="dialog" aria-modal="true" aria-label="사용자 및 화면 설정">
            <div className={styles.menuTop}>
              <h2 className={styles.menuTitle}>메뉴</h2>
              <button type="button" className={styles.closeBtn} aria-label="메뉴 닫기" onClick={onCloseMenu}>
                <CloseIcon />
              </button>
            </div>
            <UserMenuContent
              displayName={displayName}
              email={email}
              onOpenSettings={onOpenSettings}
              settingsOpen={settingsOpen}
              onLogout={onLogout}
              onDone={onCloseMenu}
            />
          </div>
        </div>
      )}
    </>
  );
}
