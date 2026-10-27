import { describe, expect, it } from "vitest";
import { demoSamples } from "../demo";
import { buildOutline, fitToBox, pointAtDistance } from "../track/outline";
import { deltaTrace, resampleByDistance } from "./compare";
import { fastestLap, formatLapTime, splitLaps } from "./laps";

const samples = demoSamples();
const laps = splitLaps(samples);

describe("splitLaps", () => {
  it("findet beide Demo-Runden als vollständig", () => {
    expect(laps.map((l) => l.lap)).toEqual([1, 2]);
    expect(laps.every((l) => l.complete)).toBe(true);
  });

  it("Runde 2 ist langsamer als Runde 1", () => {
    expect(laps[1]!.timeMs).toBeGreaterThan(laps[0]!.timeMs);
    expect(fastestLap(laps)?.lap).toBe(1);
  });

  it("markiert eine angefangene Runde als unvollständig", () => {
    const partial = samples.filter((s) => s.lap === 2 && s.lapDist > 800);
    const [lap] = splitLaps(partial, laps[0]!.lengthM);
    expect(lap!.complete).toBe(false);
  });
});

describe("Vergleich", () => {
  it("Delta am Ende entspricht der Differenz der Rundenzeiten", () => {
    const ref = resampleByDistance(laps[0]!.samples);
    const cmp = resampleByDistance(laps[1]!.samples);
    const delta = deltaTrace(ref, cmp);
    const expected = (laps[1]!.timeMs - laps[0]!.timeMs) / 1000;
    expect(delta.at(-1)!.delta).toBeCloseTo(expected, 1);
    // vor der ersten schlechten Zone (ab 18 % der Runde) ist das Delta praktisch null
    const early = delta.filter((p) => p.dist < laps[0]!.lengthM * 0.15);
    expect(Math.max(...early.map((p) => Math.abs(p.delta)))).toBeLessThan(0.02);
  });
});

describe("Streckenkarte", () => {
  const outline = buildOutline(laps[0]!.samples, 10);

  it("hat einen Punkt alle 10 m", () => {
    expect(outline.length).toBe(Math.floor(laps[0]!.lengthM / 10) + 1);
  });

  it("findet die Position zu einer Distanz", () => {
    const p = pointAtDistance(outline, 15)!;
    const a = outline.at(1)!;
    const b = outline.at(2)!;
    expect(p.x).toBeCloseTo((a.x + b.x) / 2, 5);
  });

  it("passt in die Box", () => {
    const proj = fitToBox(outline, 600, 400);
    expect(proj.width).toBeLessThanOrEqual(600);
    expect(proj.height).toBeLessThanOrEqual(400);
    for (const p of outline) {
      const [x, y] = proj.project(p);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(proj.height);
    }
  });
});

it("formatiert Rundenzeiten", () => {
  expect(formatLapTime(125432)).toBe("2:05.432");
  expect(formatLapTime(61005)).toBe("1:01.005");
});
