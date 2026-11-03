import { describe, expect, it } from "vitest";
import type { DistPoint } from "../telemetry/compare";
import { aheadDist, distAtTime, timeAtDist } from "./replay";

// 1000 m in 20 s, konstant 50 m/s, Raster 5 m
const lap: DistPoint[] = Array.from({ length: 201 }, (_, i) => ({
  dist: i * 5,
  time: i * 0.1,
  speed: 180,
  throttle: 1,
  brake: 0,
  steering: 0,
}));

describe("replay", () => {
  it("rechnet zwischen Zeit und Distanz hin und her", () => {
    expect(distAtTime(lap, 4.25)).toBeCloseTo(212.5);
    expect(timeAtDist(lap, 212.5)).toBeCloseTo(4.25);
    expect(distAtTime(lap, -1)).toBe(0);
    expect(distAtTime(lap, 99)).toBe(1000);
  });

  it("setzt den Vordermann um den Abstand nach vorne", () => {
    expect(aheadDist(lap, 4, 0.5)).toBeCloseTo(225);
  });

  it("geht über die Ziellinie hinaus am Anfang weiter", () => {
    expect(aheadDist(lap, 19.5, 1)).toBeCloseTo(25);
  });

  it("ohne Auto vor dir kein Punkt", () => {
    expect(aheadDist(lap, 4, 0)).toBeNull();
    expect(aheadDist(lap, 4, undefined)).toBeNull();
  });
});
