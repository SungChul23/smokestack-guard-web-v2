import { describe, expect, it } from "vitest";
import {
  createSmokeParticle,
  maxSmokeParticles,
  smokeConfigFor,
  smokeParticleAlpha,
  smokeParticleRadius,
  stepSmokeParticles,
} from "./smokeLayer";

describe("굴뚝 연기 레이어 계산", () => {
  it("정상(ok)과 측정 없음(null)은 연기를 내지 않는다", () => {
    expect(smokeConfigFor("ok", 40, false)).toBeNull();
    expect(smokeConfigFor(null, null, false)).toBeNull();
  });

  it("단계·비율이 높을수록 방출량과 상승 속도가 크고 초과가 가장 크다", () => {
    const caution = smokeConfigFor("caution", 72, false)!;
    const warn = smokeConfigFor("warn", 84, false)!;
    const risk = smokeConfigFor("risk", 94, false)!;
    const exceed = smokeConfigFor("exceed", 125, false)!;
    expect(exceed.spawnRate).toBeGreaterThan(risk.spawnRate);
    expect(risk.spawnRate).toBeGreaterThan(warn.spawnRate);
    expect(warn.spawnRate).toBeGreaterThan(caution.spawnRate);
    expect(exceed.riseSpeed).toBeGreaterThan(risk.riseSpeed);
    expect(exceed.colorKind).toBe("exceed");
    expect(risk.colorKind).toBe("risk");
    expect(warn.colorKind).toBe("neutral");
  });

  it("휴대폰에서는 방출량과 최대 입자 수가 절반이다", () => {
    const desk = smokeConfigFor("exceed", 120, false)!;
    const mob = smokeConfigFor("exceed", 120, true)!;
    expect(mob.spawnRate).toBeCloseTo(desk.spawnRate * 0.5, 5);
    expect(maxSmokeParticles(true)).toBe(maxSmokeParticles(false) / 2);
  });

  it("입자는 위로 오르며 커지다가 수명이 다하면 사라진다", () => {
    const cfg = smokeConfigFor("exceed", 115, false)!;
    const p0 = createSmokeParticle(100, 200, cfg, 0.5, 0.5);
    expect(smokeParticleAlpha(p0)).toBe(0);
    const [p1] = stepSmokeParticles([p0], 0.5);
    expect(p1.y).toBeLessThan(p0.y);
    expect(smokeParticleRadius(p1)).toBeGreaterThan(smokeParticleRadius(p0));
    expect(smokeParticleAlpha(p1)).toBeGreaterThan(0);
    // 수명 초과 시 제거
    const gone = stepSmokeParticles([{ ...p1, age: p1.life }], 0.05);
    expect(gone).toHaveLength(0);
  });
});
