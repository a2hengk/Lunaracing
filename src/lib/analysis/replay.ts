import type { DistPoint } from "../telemetry/compare";

/**
 * Wiedergabe einer Runde auf der Karte. Die Runde liegt auf dem Distanz-Raster, jeder
 * Punkt hat Distanz und Zeit seit Rundenbeginn.
 */

/** Distanz zu einer Zeit seit Rundenbeginn, linear zwischen den Rasterpunkten. */
export function distAtTime(lap: DistPoint[], t: number): number {
  if (lap.length === 0) return 0;
  if (t <= lap.at(0)!.time) return lap.at(0)!.dist;
  if (t >= lap.at(-1)!.time) return lap.at(-1)!.dist;
  let lo = 0;
  let hi = lap.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lap.at(mid)!.time <= t) lo = mid;
    else hi = mid;
  }
  const a = lap.at(lo)!;
  const b = lap.at(hi)!;
  const span = b.time - a.time;
  return span > 0 ? a.dist + ((t - a.time) / span) * (b.dist - a.dist) : a.dist;
}

/** Zeit seit Rundenbeginn an einer Distanz, linear zwischen den Rasterpunkten. */
export function timeAtDist(lap: DistPoint[], d: number): number {
  if (lap.length === 0) return 0;
  if (d <= lap.at(0)!.dist) return lap.at(0)!.time;
  if (d >= lap.at(-1)!.dist) return lap.at(-1)!.time;
  let lo = 0;
  let hi = lap.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lap.at(mid)!.dist <= d) lo = mid;
    else hi = mid;
  }
  const a = lap.at(lo)!;
  const b = lap.at(hi)!;
  const span = b.dist - a.dist;
  return span > 0 ? a.time + ((d - a.dist) / span) * (b.time - a.time) : a.time;
}

/**
 * Wo das Auto vor dir ungefähr ist. LMU speichert nur den Abstand in Sekunden: so lange
 * braucht es, bis du dort bist, wo der Vordermann jetzt ist. Mit deiner eigenen Runde als
 * Fahrplan ist das die Stelle, an der du `gap` Sekunden später bist. Über die Ziellinie
 * hinaus geht es am Rundenanfang weiter.
 *
 * Gibt die Distanz auf der Strecke zurück, null ohne Auto vor dir.
 */
export function aheadDist(lap: DistPoint[], t: number, gap: number | undefined): number | null {
  if (gap === undefined || gap <= 0 || lap.length < 2) return null;
  const lapTime = lap.at(-1)!.time;
  if (lapTime <= 0) return null;
  const target = (t + gap) % lapTime;
  return distAtTime(lap, target);
}
