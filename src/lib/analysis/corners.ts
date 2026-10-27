import type { DistPoint } from "../telemetry/compare";

/**
 * Eine Kurve, wie sie aus dem Speed-Verlauf erkannt wurde. Die Grenzen liegen jeweils
 * in der Mitte zwischen zwei Scheitelpunkten, so dass Bremszone und Ausgang dazugehören.
 */
export type Corner = {
  n: number;
  /** Distanz des langsamsten Punkts (Scheitel) in m */
  apex: number;
  from: number;
  to: number;
  /** Name aus src/data/tracks.ts, wenn bekannt */
  name?: string;
};

/** Ab so viel Speed-Verlust gilt eine Stelle als Kurve */
const MIN_DROP_KMH = 12;
/** Zwei Scheitel, die näher beieinander liegen, zählen als eine Kurve (Schikanen) */
const MERGE_M = 150;

/**
 * Erkennt Kurven in einer Runde: lokale Minima der Geschwindigkeit, vor denen der Speed
 * deutlich höher war. Am besten auf die Bestrunde anwenden, damit die Kurven für alle
 * Runden einer Session gleich nummeriert sind.
 */
export function detectCorners(lap: DistPoint[], stepM: number): Corner[] {
  if (lap.length < 10) return [];
  const speed = smooth(
    lap.map((p) => p.speed),
    Math.max(1, Math.round(15 / stepM)),
  );
  const win = Math.round(120 / stepM);
  const back = Math.round(400 / stepM);

  const apexIdx: number[] = [];
  for (let i = 1; i < speed.length - 1; i++) {
    const v = speed.at(i)!;
    const lo = Math.max(0, i - win);
    const hi = Math.min(speed.length - 1, i + win);
    let isMin = true;
    for (let k = lo; k <= hi; k++) {
      if (speed.at(k)! < v) {
        isMin = false;
        break;
      }
    }
    if (!isMin) continue;
    const before = Math.max(...speed.slice(Math.max(0, i - back), i));
    const after = Math.max(...speed.slice(i + 1, Math.min(speed.length, i + back)));
    if (before - v < MIN_DROP_KMH || after - v < MIN_DROP_KMH / 2) continue;
    const last = apexIdx.at(-1);
    if (last !== undefined && (i - last) * stepM < MERGE_M) {
      if (v < speed.at(last)!) apexIdx[apexIdx.length - 1] = i;
      continue;
    }
    apexIdx.push(i);
  }

  const end = lap.at(-1)!.dist;
  const apexes = apexIdx.map((i) => lap.at(i)!.dist);
  return apexes.map((apex, k) => {
    const prev = apexes.at(k - 1);
    const next = apexes.at(k + 1);
    return {
      n: k + 1,
      apex,
      from: k === 0 || prev === undefined ? Math.max(0, apex - 500) : (prev + apex) / 2,
      to: next === undefined ? Math.min(end, apex + 400) : (apex + next) / 2,
    };
  });
}

export type CornerStats = {
  /** Distanz, an der gebremst wird (Bremse > 5 %), null wenn ohne Bremse durchfahren */
  brakeAt: number | null;
  /** Distanz, an der die Bremse ganz gelöst wird */
  brakeOff: number | null;
  /** maximaler Bremsdruck 0..1 */
  brakePeak: number;
  minSpeed: number;
  minSpeedAt: number;
  /** wo wieder Gas gegeben wird (> 10 %) */
  throttleAt: number | null;
  /** wo wieder Vollgas anliegt (≥ 98 %) */
  fullThrottleAt: number | null;
  /** Meter, in denen gleichzeitig gebremst und gelenkt wird */
  trailBrakeM: number;
  /** Meter ohne Gas und ohne Bremse zwischen Bremsende und Gas */
  coastM: number;
  /** Zeit von from bis to in s */
  time: number;
};

const BRAKE_ON = 0.05;
const STEER_ON = 0.05;

/** Kennzahlen einer Runde für eine Kurve. Die Runde muss auf dem Distanz-Raster liegen. */
export function cornerStats(lap: DistPoint[], c: Corner, stepM: number): CornerStats {
  const idx = (d: number) => Math.min(lap.length - 1, Math.max(0, Math.round(d / stepM)));
  const seg = lap.slice(idx(c.from), idx(c.to) + 1);

  // langsamster Punkt in der Nähe des erkannten Scheitels
  const near = seg.filter((p) => Math.abs(p.dist - c.apex) <= 120);
  const min = (near.length ? near : seg).reduce((a, b) => (b.speed < a.speed ? b : a));

  // Bremszone: vom Scheitel rückwärts bis zum Beginn der zusammenhängenden Bremsphase
  const before = seg.filter((p) => p.dist <= min.dist);
  let brakeEndIdx = -1;
  for (let i = before.length - 1; i >= 0; i--) {
    if (before.at(i)!.brake > BRAKE_ON) {
      brakeEndIdx = i;
      break;
    }
  }
  let brakeAt: number | null = null;
  let brakeOff: number | null = null;
  let brakePeak = 0;
  let trailBrakeM = 0;
  if (brakeEndIdx >= 0) {
    let startIdx = brakeEndIdx;
    while (startIdx > 0 && before.at(startIdx - 1)!.brake > BRAKE_ON) startIdx--;
    brakeAt = before.at(startIdx)!.dist;
    const zone = before.slice(startIdx, brakeEndIdx + 1);
    brakePeak = Math.max(...zone.map((p) => p.brake));
    // die Bremse kann auch nach dem Scheitel noch anliegen
    const after = seg.filter((p) => p.dist > min.dist);
    let offIdx = after.findIndex((p) => p.brake <= BRAKE_ON);
    if (offIdx < 0) offIdx = after.length;
    const tail = after.slice(0, offIdx);
    brakeOff = (tail.at(-1) ?? zone.at(-1)!).dist;
    trailBrakeM = [...zone, ...tail].filter((p) => Math.abs(p.steering) > STEER_ON).length * stepM;
  }

  const exit = seg.filter((p) => p.dist >= (brakeOff ?? min.dist));
  const throttleAt = exit.find((p) => p.throttle > 0.1)?.dist ?? null;
  const fullThrottleAt = seg.find((p) => p.dist >= min.dist && p.throttle >= 0.98)?.dist ?? null;
  const coastFrom = brakeOff ?? min.dist;
  const coastM =
    seg.filter(
      (p) => p.dist >= coastFrom && (throttleAt === null || p.dist < throttleAt) && p.throttle < 0.05 && p.brake <= BRAKE_ON,
    ).length * stepM;

  return {
    brakeAt,
    brakeOff,
    brakePeak,
    minSpeed: min.speed,
    minSpeedAt: min.dist,
    throttleAt,
    fullThrottleAt,
    trailBrakeM,
    coastM,
    time: (seg.at(-1)?.time ?? 0) - (seg.at(0)?.time ?? 0),
  };
}

function smooth(values: number[], radius: number): number[] {
  return values.map((_, i) => {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(values.length, i + radius + 1);
    let sum = 0;
    for (let k = lo; k < hi; k++) sum += values.at(k)!;
    return sum / (hi - lo);
  });
}
