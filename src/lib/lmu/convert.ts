import type { SessionFile, StoredLap } from "./session";

/**
 * Rohdaten aus einer LMU-Telemetriedatei (.duckdb), so wie sie aus der Datei kommen.
 *
 * Aufbau der Datei (LMU 1.2, Format-Version 1):
 * - Kanäle: eine Tabelle pro Kanal, ohne Zeitstempel. Zeile i gehört zur Zeit
 *   t0 + i / Frequenz. t0 ist der erste Wert von „GPS Time“ (Sessionzeit in Sekunden).
 * - Events: eine Tabelle pro Event mit Spalten ts (Sessionzeit) und value,
 *   nur geschrieben, wenn sich der Wert ändert.
 * - channelsList / eventsList: Frequenz und Einheit jedes Kanals
 * - metadata: Strecke, Auto, Sessiontyp, Wetter, Setup als key/value
 */
export type RawRecording = {
  meta: Record<string, string>;
  /** Sessionzeit der ersten Zeile aller Kanäle */
  t0: number;
  channels: Record<string, { hz: number; values: number[] }>;
  events: Record<string, { ts: number; value: number }[]>;
};

const OUT_HZ = 20;

/** Diese Kanäle braucht der Import. Fehlt einer, ist die Datei unbrauchbar. */
export const REQUIRED_CHANNELS = [
  "Ground Speed",
  "Throttle Pos",
  "Brake Pos",
  "Steering Pos",
  "Lap Dist",
  "GPS Latitude",
  "GPS Longitude",
] as const;

export const REQUIRED_EVENTS = ["Lap", "Lap Time", "Gear", "Current Sector"] as const;

export function convertRecording(raw: RawRecording, id: string): SessionFile {
  for (const c of REQUIRED_CHANNELS) {
    if (!raw.channels[c]?.values.length) throw new Error(`Kanal „${c}“ fehlt oder ist leer`);
  }

  const ch = (name: (typeof REQUIRED_CHANNELS)[number]) => raw.channels[name]!;
  const ev = (name: string) => (raw.events[name] ?? []).toSorted((a, b) => a.ts - b.ts);

  const lapDist = unwrapLapDist(ch("Lap Dist").values);
  const lengthM = lapDist.length;
  const lapDistCh = { hz: ch("Lap Dist").hz, values: lapDist.values };

  // LMU gibt Pseudo-GPS aus. Für die Karte reicht eine flache Projektion in Meter.
  const lat = ch("GPS Latitude");
  const lon = ch("GPS Longitude");
  const lat0 = mean(lat.values);
  const lon0 = mean(lon.values);
  const mPerDegLat = 110_574;
  const mPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);

  const at = (c: { hz: number; values: number[] }, t: number) => sampleAt(c, raw.t0, t);
  const step = (list: { ts: number; value: number }[], t: number) => {
    let v = list.at(0)?.value ?? 0;
    for (const e of list) {
      if (e.ts <= t) v = e.value;
      else break;
    }
    return v;
  };

  const lapEvents = ev("Lap");
  const lapTimes = ev("Lap Time");
  const sectorEvents = ev("Current Sector");
  const gears = ev("Gear");
  const s1 = ev("Last Sector1");
  const s2 = ev("Last Sector2");
  const end = raw.t0 + ch("Ground Speed").values.length / ch("Ground Speed").hz;

  const laps: StoredLap[] = [];
  for (let k = 0; k < lapEvents.length - 1; k++) {
    const start = lapEvents.at(k)!;
    const finish = lapEvents.at(k + 1)!;
    // Out-Lap aus der Box und abgeschnittene Runden überspringen
    if (start.value === 0) continue;
    if (finish.ts > end) continue;

    const measured = finish.ts - start.ts;
    const official = lapTimes.find((e) => Math.abs(e.ts - finish.ts) < 0.05)?.value ?? 0;
    const valid = official > 0;
    const timeS = valid ? official : measured;

    // Sektoren: offiziell, wenn gewertet, sonst aus den Sektorwechseln
    const sectorStarts = sectorEvents.filter((e) => e.ts > start.ts + 0.05 && e.ts < finish.ts - 0.05);
    const s2Start = sectorStarts.find((e) => e.value === 2)?.ts;
    const s3Start = sectorStarts.find((e) => e.value === 0)?.ts;
    const off1 = s1.find((e) => Math.abs(e.ts - finish.ts) < 0.05)?.value ?? 0;
    const off2 = s2.find((e) => Math.abs(e.ts - finish.ts) < 0.05)?.value ?? 0;
    const sectors: [number, number, number] =
      valid && off1 > 0 && off2 > 0
        ? [off1, off2 - off1, official - off2]
        : s2Start && s3Start
          ? [s2Start - start.ts, s3Start - s2Start, finish.ts - s3Start]
          : [0, 0, 0];

    const startDist = at(lapDistCh, start.ts);
    const data: StoredLap["data"] = { t: [], d: [], speed: [], throttle: [], brake: [], steering: [], gear: [], x: [], z: [] };
    const n = Math.floor(measured * OUT_HZ);
    for (let i = 0; i <= n; i++) {
      const t = i === n ? finish.ts : start.ts + i / OUT_HZ;
      data.t.push(round(t - start.ts, 3));
      data.d.push(round(Math.max(0, at(lapDistCh, t) - startDist), 1));
      data.speed.push(round(at(ch("Ground Speed"), t), 1));
      data.throttle.push(round(at(ch("Throttle Pos"), t) / 100, 3));
      data.brake.push(round(at(ch("Brake Pos"), t) / 100, 3));
      data.steering.push(round(at(ch("Steering Pos"), t) / 100, 3));
      data.gear.push(step(gears, t));
      data.x.push(round((at(lon, t) - lon0) * mPerDegLon, 1));
      data.z.push(round((at(lat, t) - lat0) * mPerDegLat, 1));
    }

    laps.push({
      lap: start.value,
      timeMs: Math.round(timeS * 1000),
      sectorsMs: sectors.map((s) => Math.round(s * 1000)) as [number, number, number],
      valid,
      data,
    });
  }

  const m = raw.meta;
  return {
    id,
    track: m.TrackName ?? "Unbekannte Strecke",
    layout: m.TrackLayout ?? "",
    car: (m.CarName ?? "").split(":")[0] ?? "",
    carClass: m.CarClass ?? "",
    sessionType: m.SessionType ?? "",
    recordedAt: parseRecordingTime(m.RecordingTime),
    weather: {
      ambientC: raw.channels["Ambient Temperature"] ? round(mean(raw.channels["Ambient Temperature"].values), 1) : undefined,
      trackC: raw.channels["Track Temperature"] ? round(mean(raw.channels["Track Temperature"].values), 1) : undefined,
      conditions: m.WeatherConditions,
    },
    lengthM: round(lengthM, 1),
    sampleHz: OUT_HZ,
    laps,
  };
}

/**
 * „Lap Dist“ springt an Start/Ziel von ca. Streckenlänge auf 0. Für die Interpolation
 * wird daraus eine durchgehend steigende Kurve. Gibt auch die Streckenlänge zurück.
 */
export function unwrapLapDist(values: number[]): { values: number[]; length: number } {
  const out: number[] = [];
  let offset = 0;
  let length = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values.at(i)!;
    const prev = values.at(i - 1);
    if (i > 0 && prev !== undefined && prev - v > 100 && v < prev / 2) {
      // letzter Schritt vor dem Sprung als Schätzung für den Fortschritt über die Linie
      const before = values.at(i - 2) ?? prev;
      const stepM = Math.max(0, prev - before);
      length = Math.max(length, prev + stepM - v);
      offset += prev + stepM - v;
    }
    out.push(v + offset);
  }
  if (length === 0) length = Math.max(...values);
  return { values: out, length };
}

/** Linear interpolierter Kanalwert zur Sessionzeit t. */
export function sampleAt(c: { hz: number; values: number[] }, t0: number, t: number): number {
  const pos = (t - t0) * c.hz;
  const last = c.values.length - 1;
  if (pos <= 0) return c.values.at(0)!;
  if (pos >= last) return c.values.at(last)!;
  const i = Math.floor(pos);
  const a = c.values.at(i)!;
  const b = c.values.at(i + 1)!;
  return a + (b - a) * (pos - i);
}

/** „2026-10-27T21_05_01Z“ → „2026-10-27T21:05:01Z“ */
function parseRecordingTime(s: string | undefined): string {
  if (!s) return "";
  return s.replace(/T(\d\d)_(\d\d)_(\d\d)/, "T$1:$2:$3");
}

function mean(values: number[]) {
  return values.reduce((a, b) => a + b, 0) / (values.length || 1);
}

function round(v: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
