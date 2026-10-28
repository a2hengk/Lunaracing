import type { StoredLap } from "../lmu/session";

export type Stint = {
  n: number;
  laps: StoredLap[];
  /** Runden ohne Boxengasse, aus denen Pace und Trend gerechnet werden */
  paceLaps: StoredLap[];
  avgMs: number;
  bestMs: number | null;
  /** Standardabweichung der Rundenzeiten in ms, Maß für Konstanz */
  stdevMs: number;
  /** Veränderung der Rundenzeit pro Runde in ms (positiv = wird langsamer) */
  trendMsPerLap: number;
  fuelL?: number;
  vePct?: number;
  /** Verschleiß im Stint pro Rad, VL, VR, HL, HR */
  tyreWearPct?: number[];
  /** Durchschnitt pro Rad: innen, Mitte, außen in °C */
  tyreTempC?: [number, number, number][];
  tyrePressureKpa?: number[];
};

/**
 * Teilt die Runden einer Session in Stints. Ein Stint endet mit einer Runde, in der das
 * Auto in der Boxengasse war, oder wenn Rundennummern fehlen (z. B. Out-Lap übersprungen).
 */
export function splitStints(laps: StoredLap[]): Stint[] {
  const groups: StoredLap[][] = [];
  let current: StoredLap[] = [];
  for (const lap of laps.toSorted((a, b) => a.lap - b.lap)) {
    const prev = current.at(-1);
    if (prev && (prev.pit || lap.lap !== prev.lap + 1)) {
      groups.push(current);
      current = [];
    }
    current.push(lap);
  }
  if (current.length) groups.push(current);
  return groups.map((g, i) => stintStats(g, i + 1));
}

function stintStats(laps: StoredLap[], n: number): Stint {
  const pace = laps.filter((l) => !l.pit);
  const times = pace.map((l) => l.timeMs);
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const stdev = times.length > 1 ? Math.sqrt(times.reduce((a, t) => a + (t - avg) ** 2, 0) / (times.length - 1)) : 0;
  const valid = pace.filter((l) => l.valid).map((l) => l.timeMs);

  const sum = (pick: (l: StoredLap) => number | undefined) => {
    const vals = laps.map(pick);
    return vals.every((v) => v !== undefined) ? (vals as number[]).reduce((a, b) => a + b, 0) : undefined;
  };
  const wear = [0, 1, 2, 3].map((w) => sum((l) => l.usage?.tyreWearPct?.at(w)));

  const withTyres = pace.filter((l) => l.tyres);
  const tyreTempC = withTyres.length
    ? [0, 1, 2, 3].map((w) => {
        // LMU misst links/Mitte/rechts aus Sicht des Autos. Innen ist bei den linken
        // Rädern die rechte Seite, bei den rechten Rädern die linke.
        const left = w % 2 === 0;
        const avgAt = (k: number) => mean(withTyres.map((l) => l.tyres!.tempC.at(w)!.at(k)!));
        const inner = avgAt(left ? 2 : 0);
        const outer = avgAt(left ? 0 : 2);
        return [inner, avgAt(1), outer] as [number, number, number];
      })
    : undefined;

  return {
    n,
    laps,
    paceLaps: pace,
    avgMs: avg,
    bestMs: valid.length ? Math.min(...valid) : null,
    stdevMs: stdev,
    trendMsPerLap: slope(times),
    fuelL: sum((l) => l.usage?.fuelL),
    vePct: sum((l) => l.usage?.vePct),
    tyreWearPct: wear.every((v) => v !== undefined) ? (wear as number[]) : undefined,
    tyreTempC,
    tyrePressureKpa: withTyres.length
      ? [0, 1, 2, 3].map((w) => mean(withTyres.map((l) => l.tyres!.pressureKpa.at(w)!)))
      : undefined,
  };
}

/** Steigung einer Regressionsgeraden durch die Werte (x = 0, 1, 2, …). */
export function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((v, i) => {
    num += (i - mx) * (v - my);
    den += (i - mx) ** 2;
  });
  return num / den;
}

function mean(values: number[]) {
  return values.reduce((a, b) => a + b, 0) / (values.length || 1);
}
