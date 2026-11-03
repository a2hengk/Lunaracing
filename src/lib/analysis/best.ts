import type { StoredLap } from "../lmu/session";

export type TheoreticalBest = {
  /** Summe der besten Sektoren in ms */
  timeMs: number;
  /** pro Sektor: beste Zeit und aus welcher Runde */
  sectors: { ms: number; lap: number }[];
  /** was die Bestrunde pro Sektor gegenüber dem besten Sektor verliert, in ms */
  bestLapLossMs: number[];
  bestLapMs: number;
};

/**
 * Theoretische Bestzeit: die besten drei Sektoren aus gewerteten Runden zusammengezählt.
 * null, wenn ein Sektor in keiner gewerteten Runde eine Zeit hat.
 */
export function theoreticalBest(laps: StoredLap[]): TheoreticalBest | null {
  const valid = laps.filter((l) => l.valid);
  if (valid.length === 0) return null;
  const sectors = [0, 1, 2].map((i) => {
    let best: { ms: number; lap: number } | null = null;
    for (const l of valid) {
      const ms = l.sectorsMs.at(i) ?? 0;
      if (ms > 0 && (best === null || ms < best.ms)) best = { ms, lap: l.lap };
    }
    return best;
  });
  if (sectors.some((s) => s === null)) return null;
  const s = sectors as { ms: number; lap: number }[];
  const bestLap = valid.toSorted((a, b) => a.timeMs - b.timeMs).at(0)!;
  return {
    timeMs: s.reduce((a, x) => a + x.ms, 0),
    sectors: s,
    bestLapLossMs: s.map((x, i) => Math.max(0, (bestLap.sectorsMs.at(i) ?? 0) - x.ms)),
    bestLapMs: bestLap.timeMs,
  };
}
