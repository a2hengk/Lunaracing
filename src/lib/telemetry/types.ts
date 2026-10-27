/**
 * Ein Messpunkt aus der Telemetrie. Egal ob er aus einer .duckdb-Datei von LMU,
 * aus dem Shared Memory oder aus der Demo kommt: alles wird auf diese Form gebracht,
 * bevor es weiterverarbeitet wird.
 */
export type Sample = {
  /** Sekunden seit Beginn der Aufnahme */
  t: number;
  /** Rundennummer laut Spiel */
  lap: number;
  /** Strecke seit Start/Ziel in Metern */
  lapDist: number;
  /** km/h */
  speed: number;
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** -1..1, optional weil nicht jede Quelle es liefert */
  steering?: number;
  gear?: number;
  /** Weltkoordinaten in Metern. x/z ist die Draufsicht, y die Höhe. */
  x: number;
  y?: number;
  z: number;
};

export type Lap = {
  lap: number;
  samples: Sample[];
  timeMs: number;
  lengthM: number;
  /** false, wenn die Runde nicht ganz aufgezeichnet wurde (Out-Lap, Abbruch) */
  complete: boolean;
};
