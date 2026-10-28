import type { SessionFile, StoredLap } from "./session";

/**
 * Umrechnung zwischen einer Session (wie sie der Import erzeugt und die App anzeigt)
 * und den Zeilen in der Datenbank. Bewusst ohne Datenbank-Zugriff, damit es testbar ist.
 * Die Messwerte einer Runde (`StoredLap["data"]`) liegen nicht in der Datenbank,
 * sondern als JSON-Datei im Blob-Speicher.
 */

export type SessionTypeDb = "training" | "quali" | "rennen" | "unbekannt";

export function sessionTypeToDb(lmu: string): SessionTypeDb {
  if (/practice|warm/i.test(lmu)) return "training";
  if (/qual/i.test(lmu)) return "quali";
  if (/race/i.test(lmu)) return "rennen";
  return "unbekannt";
}

export type LapRow = {
  lapNumber: number;
  timeMs: number;
  s1Ms: number | null;
  s2Ms: number | null;
  s3Ms: number | null;
  valid: boolean;
  pit: boolean;
  fuelUsed: number | null;
  usage: StoredLap["usage"] | null;
  aids: StoredLap["aids"] | null;
  tyres: StoredLap["tyres"] | null;
  offTrack: StoredLap["offTrack"] | null;
};

export function lapToRow(lap: StoredLap): LapRow {
  const s = (i: number) => (lap.sectorsMs.at(i)! > 0 ? lap.sectorsMs.at(i)! : null);
  return {
    lapNumber: lap.lap,
    timeMs: lap.timeMs,
    s1Ms: s(0),
    s2Ms: s(1),
    s3Ms: s(2),
    valid: lap.valid,
    pit: lap.pit ?? false,
    fuelUsed: lap.usage?.fuelL ?? null,
    usage: lap.usage ?? null,
    aids: lap.aids ?? null,
    tyres: lap.tyres ?? null,
    offTrack: lap.offTrack ?? null,
  };
}

export function rowToLap(row: LapRow, data: StoredLap["data"]): StoredLap {
  return {
    lap: row.lapNumber,
    timeMs: row.timeMs,
    sectorsMs: [row.s1Ms ?? 0, row.s2Ms ?? 0, row.s3Ms ?? 0],
    valid: row.valid,
    pit: row.pit,
    usage: row.usage ?? undefined,
    aids: row.aids ?? undefined,
    tyres: row.tyres ?? undefined,
    offTrack: row.offTrack ?? undefined,
    data,
  };
}

/** Kopf einer Session ohne Runden, so wie er aus der Datenbank kommt. */
export type SessionHead = Omit<SessionFile, "laps">;

export const TRACE_CHANNELS = ["t", "d", "speed", "throttle", "brake", "steering", "gear", "x", "z"] as const;

/** Prüft, ob eine geladene Blob-Datei die erwarteten Kanäle hat. */
export function isLapData(v: unknown): v is StoredLap["data"] {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const n = Array.isArray(o.t) ? o.t.length : -1;
  return n >= 0 && TRACE_CHANNELS.every((k) => Array.isArray(o[k]) && (o[k] as unknown[]).length === n);
}
