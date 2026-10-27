import type { Sample } from "./types";

/** Ein Punkt einer Runde, auf ein festes Distanz-Raster gebracht. */
export type DistPoint = {
  dist: number;
  /** Sekunden seit Rundenbeginn */
  time: number;
  speed: number;
  throttle: number;
  brake: number;
};

/**
 * Bringt eine Runde auf ein Raster alle `stepM` Meter. Erst dadurch lassen sich zwei
 * Runden vergleichen: Messpunkte kommen nach Zeit, verglichen wird aber nach Ort.
 */
export function resampleByDistance(samples: Sample[], stepM = 5): DistPoint[] {
  if (samples.length < 2) return [];
  const sorted = samples.toSorted((a, b) => a.lapDist - b.lapDist);
  const t0 = samples.reduce((min, s) => Math.min(min, s.t), Infinity);
  const end = sorted.at(-1)!.lapDist;

  const out: DistPoint[] = [];
  let i = 0;
  for (let d = 0; d <= end; d += stepM) {
    while (i < sorted.length - 2 && sorted.at(i + 1)!.lapDist < d) i++;
    const a = sorted.at(i)!;
    const b = sorted.at(i + 1)!;
    const span = b.lapDist - a.lapDist;
    const f = span > 0 ? Math.min(1, Math.max(0, (d - a.lapDist) / span)) : 0;
    const mix = (u: number, v: number) => u + (v - u) * f;
    out.push({
      dist: d,
      time: mix(a.t, b.t) - t0,
      speed: mix(a.speed, b.speed),
      throttle: mix(a.throttle, b.throttle),
      brake: mix(a.brake, b.brake),
    });
  }
  return out;
}

export type DeltaPoint = { dist: number; delta: number };

/**
 * Zeitabstand der Vergleichsrunde zur Referenz über die Distanz.
 * Positiv = langsamer als die Referenz, negativ = schneller.
 */
export function deltaTrace(ref: DistPoint[], cmp: DistPoint[]): DeltaPoint[] {
  const n = Math.min(ref.length, cmp.length);
  const out: DeltaPoint[] = [];
  for (let k = 0; k < n; k++) {
    const r = ref.at(k)!;
    const c = cmp.at(k)!;
    out.push({ dist: r.dist, delta: c.time - r.time });
  }
  return out;
}
