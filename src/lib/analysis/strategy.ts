/**
 * Sprit- und Virtual-Energy-Rechner für ein Rennen.
 *
 * In LMU begrenzt bei GT3 und Hypercars die Virtual Energy (VE) den Stint: Ein Stint
 * geht höchstens so lange, bis 100 % VE verbraucht sind. Sprit wird pro Stopp passend
 * nachgefüllt.
 */
export type StrategyInput = {
  /** Renndauer in Minuten (Zeitrennen) oder Rundenzahl, je nach mode */
  mode: "minutes" | "laps";
  value: number;
  lapTimeS: number;
  fuelPerLapL: number;
  /** VE-Verbrauch pro Runde in Prozentpunkten, 0 wenn das Auto keine VE hat */
  vePerLapPct: number;
  /** Sicherheitsrunden, die zusätzlich eingeplant werden */
  reserveLaps: number;
};

export type StrategyResult = {
  /** Runden, die im Rennen gefahren werden */
  raceLaps: number;
  /** Runden inklusive Reserve */
  plannedLaps: number;
  fuelTotalL: number;
  veTotalPct: number;
  /** Runden mit 100 % VE, null ohne VE */
  lapsPerStint: number | null;
  stints: number;
  stops: number;
  /** Runden im letzten Stint */
  lastStintLaps: number;
  /** Sprit für einen vollen Stint */
  fuelPerStintL: number;
};

export function planRace(input: StrategyInput): StrategyResult {
  const { mode, value, lapTimeS, fuelPerLapL, vePerLapPct, reserveLaps } = input;
  // Zeitrennen: Wenn die Zeit abläuft, wird die angefangene Runde noch zu Ende gefahren
  const raceLaps =
    mode === "laps" ? Math.max(0, Math.round(value)) : lapTimeS > 0 ? Math.floor((value * 60) / lapTimeS) + 1 : 0;
  const plannedLaps = raceLaps + Math.max(0, reserveLaps);

  const lapsPerStint = vePerLapPct > 0 ? Math.floor(100 / vePerLapPct) : null;
  const stints = lapsPerStint && lapsPerStint > 0 ? Math.max(1, Math.ceil(plannedLaps / lapsPerStint)) : 1;
  const lastStintLaps = lapsPerStint ? plannedLaps - (stints - 1) * lapsPerStint : plannedLaps;

  return {
    raceLaps,
    plannedLaps,
    fuelTotalL: plannedLaps * fuelPerLapL,
    veTotalPct: plannedLaps * vePerLapPct,
    lapsPerStint,
    stints,
    stops: stints - 1,
    lastStintLaps,
    fuelPerStintL: (lapsPerStint ?? plannedLaps) * fuelPerLapL,
  };
}
