// 라이트·다크·시스템 테마 + 화면 효과(움직임) 켜기/끄기.
// <html data-theme>와 <html data-effects>, <html data-doc-hidden>을 관리한다.
// 저장 키 tms-theme는 기존과 호환되며, tms-effects로 화면 효과 설정을 저장한다.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";
export type ThemePreference = "dark" | "light" | "system";
export const THEME_KEY = "tms-theme";
export const EFFECTS_KEY = "tms-effects";

function systemTheme(): Theme {
  try {
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function osReducedMotion(): boolean {
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function readThemePreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
    return "dark";
  } catch {
    return "dark";
  }
}

export function readTheme(): Theme {
  const pref = readThemePreference();
  return pref === "system" ? systemTheme() : pref;
}

export function readEffectsEnabled(): boolean {
  try {
    return window.localStorage.getItem(EFFECTS_KEY) !== "off";
  } catch {
    return true;
  }
}

function savePreference(pref: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_KEY, pref);
  } catch {
    // 저장이 막혀도 이번 화면에서는 바뀐다
  }
}

function saveEffects(on: boolean) {
  try {
    window.localStorage.setItem(EFFECTS_KEY, on ? "on" : "off");
  } catch {
    // 저장이 막혀도 이번 화면에서는 바뀐다
  }
}

interface ThemeValue {
  /** 현재 실제 적용된 테마 (dark | light) */
  theme: Theme;
  /** 사용자가 고른 테마 설정 (dark | light | system) */
  preference: ThemePreference;
  /** 다크 ↔ 라이트 빠른 전환 */
  toggle: () => void;
  /** 다크 / 라이트 / 시스템 중 선택 */
  setPreference: (pref: ThemePreference) => void;
  /** 화면 효과 사용자 설정 (켜짐/꺼짐) */
  effectsEnabled: boolean;
  setEffectsEnabled: (on: boolean) => void;
  /** 움직임을 멈춰야 하는 최종 상태 (사용자 끄기 || OS 움직임 줄이기 || 탭 숨김) */
  reducedMotion: boolean;
  /** 현재 탭이 숨어 있는지 */
  docHidden: boolean;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference);
  const [sysTheme, setSysTheme] = useState<Theme>(systemTheme);
  const [effectsEnabled, setEffectsState] = useState<boolean>(readEffectsEnabled);
  const [osReduced, setOsReduced] = useState<boolean>(osReducedMotion);
  const [docHidden, setDocHidden] = useState<boolean>(() => typeof document !== "undefined" && !!document.hidden);

  const theme: Theme = preference === "system" ? sysTheme : preference;
  const reducedMotion = !effectsEnabled || osReduced || docHidden;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.effects = !effectsEnabled || osReduced ? "off" : "on";
  }, [effectsEnabled, osReduced]);

  useEffect(() => {
    document.documentElement.dataset.docHidden = docHidden ? "true" : "false";
  }, [docHidden]);

  // OS 테마·움직임 줄이기·탭 가시성·다른 탭 저장 변경 추적
  useEffect(() => {
    const colorMql = window.matchMedia?.("(prefers-color-scheme: light)");
    const motionMql = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onColor = () => setSysTheme(systemTheme());
    const onMotion = () => setOsReduced(osReducedMotion());
    const onVis = () => setDocHidden(!!document.hidden);
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) setPreferenceState(readThemePreference());
      if (e.key === EFFECTS_KEY) setEffectsState(readEffectsEnabled());
    };
    colorMql?.addEventListener?.("change", onColor);
    motionMql?.addEventListener?.("change", onMotion);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("storage", onStorage);
    return () => {
      colorMql?.removeEventListener?.("change", onColor);
      motionMql?.removeEventListener?.("change", onMotion);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setPreference = useCallback((pref: ThemePreference) => {
    savePreference(pref);
    setPreferenceState(pref);
  }, []);

  const toggle = useCallback(() => {
    setPreferenceState((cur) => {
      const currentActual = cur === "system" ? systemTheme() : cur;
      const next: Theme = currentActual === "dark" ? "light" : "dark";
      savePreference(next);
      return next;
    });
  }, []);

  const setEffectsEnabled = useCallback((on: boolean) => {
    saveEffects(on);
    setEffectsState(on);
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      theme,
      preference,
      toggle,
      setPreference,
      effectsEnabled,
      setEffectsEnabled,
      reducedMotion,
      docHidden,
    }),
    [theme, preference, toggle, setPreference, effectsEnabled, setEffectsEnabled, reducedMotion, docHidden],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme은 ThemeProvider 안에서만 쓴다");
  return value;
}
