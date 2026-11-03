import type { DistPoint } from "../telemetry/compare";
import { CLOSE_GAP_S } from "./corners";

/** Fahrstil-Kennzahlen einer Runde, alle über die Distanz gerechnet. */
export type DrivingStyle = {
  /** Anteil der Strecke mit Vollgas (≥ 98 %) */
  fullThrottlePct: number;
  /** Anteil der Strecke auf der Bremse (> 5 %) */
  brakingPct: number;
  /** Meter ohne Gas und ohne Bremse (Rollen), außerhalb langsamer Boxenpassagen */
  coastM: number;
  /** Anteil der Bremsstrecke, auf der gleichzeitig gelenkt wird */
  trailBrakePct: number;
  /** wie oft das Gas außerhalb von Bremszonen kurz zurückgenommen wird */
  throttleLifts: number;
  /** Anteil der Strecke mit weniger als 1 s Abstand zum Vordermann, null = keine Daten */
  closePct: number | null;
};

export function drivingStyle(lap: DistPoint[]): DrivingStyle {
  const n = lap.length || 1;
  const braking = lap.filter((p) => p.brake > 0.05);
  const step = lap.length > 1 ? lap.at(1)!.dist - lap.at(0)!.dist : 5;

  // Lupfer: von über 90 % auf unter 70 % und wieder hoch, ohne dazwischen zu bremsen
  let lifts = 0;
  let state: "full" | "lifted" | "other" = "other";
  for (const p of lap) {
    if (p.brake > 0.05) state = "other";
    else if (p.throttle > 0.9) {
      if (state === "lifted") lifts++;
      state = "full";
    } else if (p.throttle < 0.7 && state === "full") state = "lifted";
  }

  return {
    fullThrottlePct: (lap.filter((p) => p.throttle >= 0.98).length / n) * 100,
    brakingPct: (braking.length / n) * 100,
    coastM: lap.filter((p) => p.throttle < 0.05 && p.brake <= 0.05 && p.speed > 60).length * step,
    trailBrakePct: braking.length
      ? (braking.filter((p) => Math.abs(p.steering) > 0.05).length / braking.length) * 100
      : 0,
    throttleLifts: lifts,
    closePct: lap.some((p) => p.gap !== undefined)
      ? (lap.filter((p) => p.gap !== undefined && p.gap > 0 && p.gap < CLOSE_GAP_S).length / n) * 100
      : null,
  };
}
