import { describe, expect, it } from "vitest";
import type { StoredLap } from "../lmu/session";
import { slope, splitStints } from "./stints";
import { planRace } from "./strategy";

const lap = (n: number, timeMs: number, extra: Partial<StoredLap> = {}): StoredLap => ({
  lap: n,
  timeMs,
  sectorsMs: [0, 0, 0],
  valid: true,
  usage: { fuelL: 4, vePct: 5, tyreWearPct: [1, 1, 0.5, 0.5] },
  tyres: {
    tempC: [
      [70, 80, 85],
      [85, 80, 70],
      [65, 75, 76],
      [76, 75, 65],
    ],
    pressureKpa: [170, 168, 165, 164],
  },
  data: { t: [], d: [], speed: [], throttle: [], brake: [], steering: [], gear: [], x: [], z: [] },
  ...extra,
});

describe("splitStints", () => {
  it("trennt an einer Runde mit Boxengasse", () => {
    const stints = splitStints([lap(1, 100000), lap(2, 101000), lap(3, 130000, { pit: true }), lap(4, 99000), lap(5, 99500)]);
    expect(stints.map((s) => s.laps.map((l) => l.lap))).toEqual([[1, 2, 3], [4, 5]]);
    // die Box-Runde zählt für Verbrauch, aber nicht für die Pace
    expect(stints[0]!.avgMs).toBe(100500);
    expect(stints[0]!.fuelL).toBe(12);
  });

  it("trennt bei fehlenden Rundennummern", () => {
    expect(splitStints([lap(1, 1), lap(2, 1), lap(5, 1)]).length).toBe(2);
  });

  it("rechnet Trend, Konstanz und Bestzeit nur aus gewerteten Runden", () => {
    const [s] = splitStints([lap(1, 100000), lap(2, 100500, { valid: false }), lap(3, 101000)]);
    expect(s!.trendMsPerLap).toBeCloseTo(500);
    expect(s!.stdevMs).toBeCloseTo(500);
    expect(s!.bestMs).toBe(100000);
  });

  it("dreht Reifentemperaturen auf innen/Mitte/außen", () => {
    const [s] = splitStints([lap(1, 1)]);
    // links vorne: rechts gemessen = innen
    expect(s!.tyreTempC!.at(0)).toEqual([85, 80, 70]);
    // rechts vorne: links gemessen = innen
    expect(s!.tyreTempC!.at(1)).toEqual([85, 80, 70]);
  });
});

describe("planRace", () => {
  it("Zeitrennen: angefangene Runde wird zu Ende gefahren", () => {
    const r = planRace({ mode: "minutes", value: 60, lapTimeS: 145, fuelPerLapL: 3.9, vePerLapPct: 4.7, reserveLaps: 1 });
    expect(r.raceLaps).toBe(25); // 3600 / 145 = 24,8 → 24 + 1
    expect(r.plannedLaps).toBe(26);
    expect(r.lapsPerStint).toBe(21); // 100 / 4,7 = 21,3
    expect(r.stints).toBe(2);
    expect(r.stops).toBe(1);
    expect(r.lastStintLaps).toBe(5);
    expect(r.fuelTotalL).toBeCloseTo(101.4);
  });

  it("Rundenrennen ohne VE: ein Stint", () => {
    const r = planRace({ mode: "laps", value: 10, lapTimeS: 100, fuelPerLapL: 3, vePerLapPct: 0, reserveLaps: 0 });
    expect(r.stints).toBe(1);
    expect(r.lapsPerStint).toBeNull();
    expect(r.fuelTotalL).toBe(30);
  });
});

it("slope", () => {
  expect(slope([1, 2, 3, 4])).toBeCloseTo(1);
  expect(slope([5])).toBe(0);
});
