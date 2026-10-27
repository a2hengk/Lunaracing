import type { Sample } from "../telemetry/types";

/**
 * Eine importierte Session, so wie sie als JSON gespeichert wird.
 * Die Messwerte stehen spaltenweise drin (ein Array pro Kanal), das hält die Datei klein.
 */
export type SessionFile = {
  id: string;
  track: string;
  layout: string;
  car: string;
  carClass: string;
  sessionType: string;
  /** ISO-Zeitpunkt der Aufnahme (UTC) */
  recordedAt: string;
  weather: { ambientC?: number; trackC?: number; conditions?: string };
  /** Länge der Strecke laut Lap Dist, in Metern */
  lengthM: number;
  sampleHz: number;
  laps: StoredLap[];
};

export type StoredLap = {
  /** Rundenzähler laut LMU. 0 ist die Out-Lap aus der Box. */
  lap: number;
  timeMs: number;
  /** S1, S2, S3 in Millisekunden */
  sectorsMs: [number, number, number];
  /** false, wenn LMU die Runde nicht gewertet hat (z. B. Track Limits) */
  valid: boolean;
  /** Verbrauch in der Runde. Fehlt bei älteren Importen. */
  usage?: {
    fuelL?: number;
    /** Virtual Energy in Prozentpunkten */
    vePct?: number;
    /** Reifenverschleiß in Prozentpunkten, VL, VR, HL, HR */
    tyreWearPct?: [number, number, number, number];
  };
  /** Fahrhilfen in der Runde */
  aids?: {
    /** Sekunden, in denen das ABS eingegriffen hat */
    absSeconds?: number;
    /** Sekunden, in denen die Traktionskontrolle eingegriffen hat */
    tcSeconds?: number;
    /** Einstellungen beim Start der Runde */
    tcLevel?: number;
    absLevel?: number;
    engineMap?: number;
    brakeBiasFront?: number;
  };
  /** true, wenn das Auto in dieser Runde in der Boxengasse war (In- oder Out-Lap) */
  pit?: boolean;
  /** Durchschnitt über die Runde, pro Rad VL, VR, HL, HR */
  tyres?: {
    /** Lauffläche links, Mitte, rechts in °C */
    tempC: [number, number, number][];
    pressureKpa: number[];
  };
  /** Abschnitte (Distanz in m), in denen das Auto neben der Strecke war */
  offTrack?: { from: number; to: number }[];
  /** spaltenweise Messwerte, alle gleich lang */
  data: {
    t: number[];
    d: number[];
    speed: number[];
    throttle: number[];
    brake: number[];
    steering: number[];
    gear: number[];
    x: number[];
    z: number[];
  };
};

/** Spaltenweise gespeicherte Runde zurück in Messpunkte. */
export function lapSamples(lap: StoredLap): Sample[] {
  const { t, d, speed, throttle, brake, steering, gear, x, z } = lap.data;
  return t.map((time, i) => ({
    t: time,
    lap: lap.lap,
    lapDist: d.at(i)!,
    speed: speed.at(i)!,
    throttle: throttle.at(i)!,
    brake: brake.at(i)!,
    steering: steering.at(i)!,
    gear: gear.at(i)!,
    x: x.at(i)!,
    z: z.at(i)!,
  }));
}

export function bestLap(session: SessionFile): StoredLap | undefined {
  return session.laps.filter((l) => l.valid).toSorted((a, b) => a.timeMs - b.timeMs)[0];
}
