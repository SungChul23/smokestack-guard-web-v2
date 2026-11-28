// 굴뚝 연기 레이어 계산(순수 함수).
// - 기본 켜짐이며, 화면 효과 끄기·움직임 줄이기 설정에서 다른 애니메이션과 함께 멈춘다.
// - 비율이 높을수록 양과 상승 속도가 크고(초과 가장 큼), 정상(ok)도 은은한 연기를 낸다. 측정 없음(null)만 연기를 내지 않는다.
// - 색은 단계 기운(초과 진홍, 위험 빨강, 주의·경고 연회색, 정상 연한 수증기). 휴대폰은 입자 수를 절반으로 줄인다.
import type { LevelKey } from "../logic/status";

export type SmokeColorKind = "exceed" | "risk" | "neutral" | "ok";

export interface SmokeEmitterConfig {
  /** 초당 생성 입자 수 */
  spawnRate: number;
  /** 위로 오르는 속도 (px/s) */
  riseSpeed: number;
  /** 시작 반지름 (px) */
  startRadius: number;
  /** 사라질 때 반지름 (px) */
  endRadius: number;
  /** 수명 (초) */
  lifeSec: number;
  /** 단계 색 계열 */
  colorKind: SmokeColorKind;
}

export interface SmokeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r0: number;
  r1: number;
  colorKind: SmokeColorKind;
}

export function maxSmokeParticles(isMobile: boolean): number {
  return isMobile ? 110 : 220;
}

/**
 * 사업장 단계·비율에 따른 연기 방출 설정.
 * 정상(ok)도 은은한 연기를 내고, 측정 없음(null)만 연기를 내지 않는다(null 반환).
 */
export function smokeConfigFor(
  level: LevelKey | null,
  ratio: number | null,
  isMobile: boolean,
): SmokeEmitterConfig | null {
  if (!level) return null;

  let cfg: SmokeEmitterConfig;
  if (level === "ok") {
    const okFactor = Math.min(1, Math.max(0, (ratio ?? 35) / 70));
    cfg = {
      spawnRate: 1.2 + okFactor * 0.3,
      riseSpeed: 15 + okFactor * 3,
      startRadius: 3.5,
      endRadius: 13.5,
      lifeSec: 2.0,
      colorKind: "ok",
    };
  } else {
    const r = Math.min(160, Math.max(70, ratio ?? 75));
    const factor = (r - 70) / 90; // 0..1
    if (level === "exceed") {
      cfg = {
        spawnRate: 4.2 + factor * 2.0,
        riseSpeed: 34 + factor * 16,
        startRadius: 4.6,
        endRadius: 19.5,
        lifeSec: 2.3,
        colorKind: "exceed",
      };
    } else if (level === "risk") {
      cfg = {
        spawnRate: 3.0 + factor * 1.2,
        riseSpeed: 28 + factor * 10,
        startRadius: 4.2,
        endRadius: 17,
        lifeSec: 2.15,
        colorKind: "risk",
      };
    } else if (level === "warn") {
      cfg = {
        spawnRate: 2.2 + factor * 0.7,
        riseSpeed: 23 + factor * 6,
        startRadius: 3.9,
        endRadius: 15.5,
        lifeSec: 2.05,
        colorKind: "neutral",
      };
    } else {
      cfg = {
        spawnRate: 1.6 + factor * 0.5,
        riseSpeed: 19 + factor * 5,
        startRadius: 3.7,
        endRadius: 14.5,
        lifeSec: 2.0,
        colorKind: "neutral",
      };
    }
  }

  if (isMobile) {
    return { ...cfg, spawnRate: cfg.spawnRate * 0.5 };
  }
  return cfg;
}

/** 새 입자 하나를 만든다(seed 0..1 값으로 좌우 미세 흔들림 결정) */
export function createSmokeParticle(
  x: number,
  y: number,
  cfg: SmokeEmitterConfig,
  randA: number,
  randB: number,
): SmokeParticle {
  const driftX = (randA - 0.42) * 14; // 아주 살짝 오른쪽 위로 퍼지는 기류
  const speedJitter = 0.85 + randB * 0.3;
  return {
    x: x + (randA - 0.5) * 4,
    y,
    vx: driftX,
    vy: -cfg.riseSpeed * speedJitter,
    age: 0,
    life: cfg.lifeSec * (0.85 + randB * 0.3),
    r0: cfg.startRadius,
    r1: cfg.endRadius,
    colorKind: cfg.colorKind,
  };
}

/** dtSec만큼 입자를 이동시키고 수명이 끝난 입자를 버린다 */
export function stepSmokeParticles(particles: readonly SmokeParticle[], dtSec: number): SmokeParticle[] {
  const dt = Math.min(0.1, Math.max(0, dtSec));
  const next: SmokeParticle[] = [];
  for (const p of particles) {
    const age = p.age + dt;
    if (age >= p.life) continue;
    next.push({
      ...p,
      x: p.x + p.vx * dt,
      y: p.y + p.vy * dt,
      vx: p.vx + 2.2 * dt, // 위로 오르며 아주 부드럽게 퍼짐
      age,
    });
  }
  return next;
}

/** 입자 투명도(0..0.42): 처음 부드럽게 나타났다가 위로 갈수록 옅어져 사라진다 */
export function smokeParticleAlpha(p: SmokeParticle): number {
  const t = Math.min(1, Math.max(0, p.age / p.life));
  if (t < 0.18) return (t / 0.18) * 0.42;
  return 0.42 * (1 - (t - 0.18) / 0.82);
}

/** 입자 반지름(px): 오르면서 커지며 퍼진다 */
export function smokeParticleRadius(p: SmokeParticle): number {
  const t = Math.min(1, Math.max(0, p.age / p.life));
  return p.r0 + (p.r1 - p.r0) * t;
}
