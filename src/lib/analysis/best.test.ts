import { describe, expect, it } from "vitest";
import type { StoredLap } from "../lmu/session";
import { theoreticalBest } from "./best";

const lap = (n: number, sectors: [number, number, number], valid = true): StoredLap => ({
  lap: n,
  timeMs: sectors.reduce((a, b) => a + b, 0),
  sectorsMs: sectors,
  valid,
  data: { t: [], d: [], speed: [], throttle: [], brake: [], steering: [], gear: [], x: [], z: [] },
});

describe("theoreticalBest", () => {
  it("zählt die besten Sektoren aus gewerteten Runden zusammen", () => {
    const r = theoreticalBest([
      lap(1, [37000, 38000, 37200]),
      lap(2, [36900, 38100, 37000]),
      lap(3, [36000, 37000, 36000], false), // nicht gewertet, zählt nicht
    ])!;
    expect(r.timeMs).toBe(36900 + 38000 + 37000);
    expect(r.sectors.map((s) => s.lap)).toEqual([2, 1, 2]);
    // Bestrunde ist Runde 2 (112000): verliert nur in S2
    expect(r.bestLapMs).toBe(112000);
    expect(r.bestLapLossMs).toEqual([0, 100, 0]);
  });

  it("ohne Sektorzeiten keine theoretische Bestzeit", () => {
    expect(theoreticalBest([lap(1, [0, 0, 0])])).toBeNull();
    expect(theoreticalBest([])).toBeNull();
  });
});
