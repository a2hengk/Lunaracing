import { describe, expect, it } from "vitest";
import { convertRecording, sampleAt, unwrapLapDist, type RawRecording } from "./convert";

/**
 * Nachgebaute Aufnahme im Format der LMU-Dateien: Kanäle ohne Zeitstempel mit fester
 * Frequenz, Events mit ts. Ein Auto fährt mit 50 m/s auf einer 1000-m-Strecke:
 * Out-Lap ab der Box, dann zwei ganze Runden (eine davon ungültig), dann abgebrochen.
 */
function fakeRecording(): RawRecording {
  const t0 = 1000;
  const L = 1000;
  const v = 50;
  const duration = 75; // s
  const pitExit = 10; // ab hier Runde 1, Distanz 0
  const lapDist: number[] = [];
  const lat: number[] = [];
  const lon: number[] = [];
  for (let i = 0; i <= duration * 10; i++) {
    const t = i / 10;
    const s = Math.max(0, t - pitExit) * v;
    const d = t < pitExit ? 900 + t * 9 : s % L;
    lapDist.push(d);
    const a = (d / L) * 2 * Math.PI;
    lat.push(60 + 0.001 * Math.sin(a));
    lon.push(0.002 * Math.cos(a));
  }
  const speed = Array.from({ length: duration * 100 + 1 }, () => v * 3.6);
  const half = Array.from({ length: duration * 50 + 1 }, (_, i) => ((i / 50) % 20 < 15 ? 100 : 0));
  return {
    t0,
    meta: { TrackName: "Teststrecke", CarName: "Testauto #1:WEC", CarClass: "GT3", SessionType: "Practice", RecordingTime: "2026-10-27T21_05_01Z" },
    channels: {
      "Ground Speed": { hz: 100, values: speed },
      "Throttle Pos": { hz: 50, values: half },
      "Brake Pos": { hz: 50, values: half.map((x) => 100 - x) },
      "Steering Pos": { hz: 100, values: speed.map(() => 0) },
      "Lap Dist": { hz: 10, values: lapDist },
      "GPS Latitude": { hz: 10, values: lat },
      "GPS Longitude": { hz: 10, values: lon },
    },
    events: {
      Lap: [0, 1, 2, 3].map((n, k) => ({ ts: t0 + (k === 0 ? 0 : pitExit + (k - 1) * 20), value: n })),
      "Lap Time": [
        { ts: t0 + 30, value: 20 },
        { ts: t0 + 50, value: 0 },
      ],
      "Last Sector1": [{ ts: t0 + 30, value: 6 }],
      "Last Sector2": [{ ts: t0 + 30, value: 13 }],
      Gear: [{ ts: t0, value: 0 }, { ts: t0 + 5, value: 3 }],
      "Current Sector": [
        { ts: t0 + 36, value: 2 },
        { ts: t0 + 43, value: 0 },
      ],
    },
  };
}

describe("convertRecording", () => {
  const session = convertRecording(fakeRecording(), "test");

  it("lässt Out-Lap und abgebrochene Runde weg", () => {
    expect(session.laps.map((l) => l.lap)).toEqual([1, 2]);
  });

  it("nimmt offizielle Zeiten und erkennt ungültige Runden", () => {
    const [l1, l2] = session.laps;
    expect(l1!.timeMs).toBe(20000);
    expect(l1!.valid).toBe(true);
    expect(l1!.sectorsMs).toEqual([6000, 7000, 7000]);
    // Runde 2: von LMU mit 0 gemeldet → gemessene Zeit, Sektoren aus den Sektorwechseln
    expect(l2!.valid).toBe(false);
    expect(l2!.timeMs).toBe(20000);
    expect(l2!.sectorsMs).toEqual([6000, 7000, 7000]);
  });

  it("Distanz läuft pro Runde von 0 bis zur Streckenlänge", () => {
    const d = session.laps[0]!.data.d;
    expect(d.at(0)).toBe(0);
    expect(d.at(-1)).toBeCloseTo(1000, 0);
    expect(d.every((v, i) => i === 0 || v >= d.at(i - 1)!)).toBe(true);
  });

  it("rechnet Prozent in 0..1 und GPS in Meter um", () => {
    const lap = session.laps[0]!;
    expect(Math.max(...lap.data.throttle)).toBe(1);
    const xs = lap.data.x;
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(200);
    expect(lap.data.gear.at(0)).toBe(3);
  });

  it("liest Metadaten", () => {
    expect(session.car).toBe("Testauto #1");
    expect(session.recordedAt).toBe("2026-10-27T21:05:01Z");
  });
});

/**
 * Rennen: Zähler 0 umfasst Einführungsrunde und erste Rennrunde (Start bei 20 s), danach
 * Runde 1. Bis 40 s fährt ein Auto 0,5 s vor uns, danach ist frei.
 */
function fakeRace(): RawRecording {
  const t0 = 2000;
  const duration = 70;
  const lapDist: number[] = [];
  const lat: number[] = [];
  const lon: number[] = [];
  const gap: number[] = [];
  for (let i = 0; i <= duration * 10; i++) {
    const t = i / 10;
    const d = (t * 50) % 1000;
    lapDist.push(d);
    const a = (d / 1000) * 2 * Math.PI;
    lat.push(60 + 0.001 * Math.sin(a));
    lon.push(0.002 * Math.cos(a));
    gap.push(t < 40 ? -0.5 : 0);
  }
  const n = duration * 50 + 1;
  return {
    t0,
    meta: { TrackName: "Teststrecke", CarName: "Testauto #1:WEC", CarClass: "GT3", SessionType: "Race", RecordingTime: "2026-11-03T19_57_59Z" },
    channels: {
      "Ground Speed": { hz: 50, values: Array.from({ length: n }, () => 180) },
      "Throttle Pos": { hz: 50, values: Array.from({ length: n }, () => 100) },
      "Brake Pos": { hz: 50, values: Array.from({ length: n }, () => 0) },
      "Steering Pos": { hz: 50, values: Array.from({ length: n }, () => 0) },
      "Lap Dist": { hz: 10, values: lapDist },
      "GPS Latitude": { hz: 10, values: lat },
      "GPS Longitude": { hz: 10, values: lon },
      "Time Behind Next": { hz: 10, values: gap },
    },
    events: {
      Lap: [
        { ts: t0, value: 0 },
        { ts: t0 + 40, value: 1 },
        { ts: t0 + 60, value: 2 },
      ],
      "Lap Time": [
        { ts: t0 + 40, value: 20 },
        { ts: t0 + 60, value: 20 },
      ],
      Gear: [{ ts: t0, value: 4 }],
    },
  };
}

describe("convertRecording im Rennen", () => {
  const session = convertRecording(fakeRace(), "rennen");

  it("behält die Startrunde ohne Einführungsrunde", () => {
    expect(session.laps.map((l) => l.lap)).toEqual([0, 1]);
    const [start, l1] = session.laps;
    expect(start!.start).toBe(true);
    expect(start!.timeMs).toBe(20000);
    expect(start!.data.t.at(-1)! - start!.data.t.at(0)!).toBeCloseTo(20, 0);
    expect(l1!.start).toBeUndefined();
  });

  it("speichert den Abstand zum Vordermann als positive Sekunden", () => {
    const [start, l1] = session.laps;
    // die letzten Punkte liegen auf dem Wechsel und werden interpoliert
    expect(start!.data.gap?.slice(0, -2).every((g) => g === 0.5)).toBe(true);
    expect(l1!.data.gap?.slice(5).every((g) => g === 0)).toBe(true);
  });
});

describe("Hilfsfunktionen", () => {
  it("unwrapLapDist macht aus dem Sprung eine steigende Kurve", () => {
    const { values, length } = unwrapLapDist([980, 990, 0, 10, 20]);
    expect(values).toEqual([980, 990, 1000, 1010, 1020]);
    expect(length).toBe(1000);
  });

  it("sampleAt interpoliert linear", () => {
    expect(sampleAt({ hz: 10, values: [0, 10, 20] }, 5, 5.15)).toBeCloseTo(15);
  });
});
