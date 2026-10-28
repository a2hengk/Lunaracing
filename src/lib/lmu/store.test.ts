import { describe, expect, it } from "vitest";
import type { StoredLap } from "./session";
import { isLapData, lapToRow, rowToLap, sessionTypeToDb } from "./store";

const data: StoredLap["data"] = {
  t: [0, 0.05],
  d: [0, 2],
  speed: [150, 151],
  throttle: [1, 1],
  brake: [0, 0],
  steering: [0, 0.01],
  gear: [4, 4],
  x: [1, 2],
  z: [3, 4],
};

const lap: StoredLap = {
  lap: 2,
  timeMs: 146295,
  sectorsMs: [39259, 66394, 40643],
  valid: true,
  pit: false,
  usage: { fuelL: 3.88, vePct: 4.69, tyreWearPct: [1.5, 1.4, 1.6, 1.2] },
  aids: { absSeconds: 7.1, tcSeconds: 2.8, tcLevel: 2 },
  offTrack: [{ from: 2942, to: 2973 }],
  data,
};

describe("store", () => {
  it("Runde → Zeile → Runde ergibt dieselbe Runde", () => {
    expect(rowToLap(lapToRow(lap), data)).toEqual({ ...lap, tyres: undefined });
  });

  it("fehlende Sektoren werden zu null und zurück zu 0", () => {
    const row = lapToRow({ ...lap, sectorsMs: [0, 0, 0] });
    expect([row.s1Ms, row.s2Ms, row.s3Ms]).toEqual([null, null, null]);
    expect(rowToLap(row, data).sectorsMs).toEqual([0, 0, 0]);
  });

  it("übersetzt die Sessiontypen von LMU", () => {
    expect(sessionTypeToDb("Practice")).toBe("training");
    expect(sessionTypeToDb("Qualifying")).toBe("quali");
    expect(sessionTypeToDb("Race")).toBe("rennen");
    expect(sessionTypeToDb("")).toBe("unbekannt");
  });

  it("erkennt gültige und kaputte Blob-Dateien", () => {
    expect(isLapData(data)).toBe(true);
    expect(isLapData({ ...data, speed: [1] })).toBe(false);
    expect(isLapData(null)).toBe(false);
  });
});
