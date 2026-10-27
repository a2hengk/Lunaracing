import { describe, expect, it } from "vitest";
import { demoSamples } from "../demo";
import { resampleByDistance, type DistPoint } from "../telemetry/compare";
import { splitLaps } from "../telemetry/laps";
import { cornerStats, detectCorners } from "./corners";
import { drivingStyle } from "./style";

const laps = splitLaps(demoSamples());
const lap1 = resampleByDistance(laps[0]!.samples, 5);
const lap2 = resampleByDistance(laps[1]!.samples, 5);
const length = laps[0]!.lengthM;

describe("detectCorners", () => {
  const corners = detectCorners(lap1, 5);

  it("findet mehrere Kurven, nummeriert und sortiert", () => {
    expect(corners.length).toBeGreaterThanOrEqual(4);
    expect(corners.map((c) => c.n)).toEqual(corners.map((_, i) => i + 1));
    expect(corners.every((c, i) => i === 0 || c.apex > corners.at(i - 1)!.apex)).toBe(true);
  });

  it("Kurvengrenzen schließen lückenlos aneinander an", () => {
    for (let i = 1; i < corners.length; i++) expect(corners.at(i)!.from).toBeCloseTo(corners.at(i - 1)!.to);
  });

  it("findet nichts auf einer Geraden", () => {
    const straight: DistPoint[] = Array.from({ length: 400 }, (_, i) => ({
      dist: i * 5,
      time: i * 0.07,
      speed: 250,
      throttle: 1,
      brake: 0,
      steering: 0,
    }));
    expect(detectCorners(straight, 5)).toEqual([]);
  });
});

describe("cornerStats", () => {
  const corners = detectCorners(lap1, 5);
  // Demo: Runde 2 bremst zwischen 18 und 26 % der Runde schwächer (also früher)
  // und fährt zwischen 55 und 62 % mit weniger Grip durch die Kurve
  const softBrake = corners.find((c) => c.apex > length * 0.24 && c.apex < length * 0.3);
  const lowGrip = corners.find((c) => c.apex > length * 0.58 && c.apex < length * 0.63);

  it("erkennt den früheren Bremspunkt und den Zeitverlust", () => {
    const a = cornerStats(lap1, softBrake!, 5);
    const b = cornerStats(lap2, softBrake!, 5);
    expect(b.brakeAt!).toBeLessThan(a.brakeAt!);
    expect(b.time).toBeGreaterThan(a.time + 0.1);
  });

  it("erkennt den niedrigeren Kurvenspeed", () => {
    const a = cornerStats(lap1, lowGrip!, 5);
    const b = cornerStats(lap2, lowGrip!, 5);
    expect(a.minSpeed - b.minSpeed).toBeGreaterThan(10);
  });

  it("Minimum-Speed liegt nahe am Scheitel", () => {
    for (const c of corners) {
      const s = cornerStats(lap1, c, 5);
      expect(Math.abs(s.minSpeedAt - c.apex)).toBeLessThanOrEqual(120);
    }
  });

  it("zählt Trail-Braking nur bei gleichzeitiger Lenkung", () => {
    const c = corners.at(0)!;
    expect(cornerStats(lap1, c, 5).trailBrakeM).toBe(0); // Demo hat keine Lenkung
    const steered = lap1.map((p) => ({ ...p, steering: 0.3 }));
    expect(cornerStats(steered, c, 5).trailBrakeM).toBeGreaterThan(0);
  });
});

describe("drivingStyle", () => {
  const point = (i: number, throttle: number, brake: number, steering = 0): DistPoint => ({
    dist: i * 5,
    time: i * 0.1,
    speed: 150,
    throttle,
    brake,
    steering,
  });

  it("zählt Lupfer ohne Bremsen, aber nicht Bremszonen", () => {
    const lap = [
      ...Array.from({ length: 10 }, (_, i) => point(i, 1, 0)),
      ...Array.from({ length: 3 }, (_, i) => point(10 + i, 0.5, 0)), // Lupfer
      ...Array.from({ length: 10 }, (_, i) => point(13 + i, 1, 0)),
      ...Array.from({ length: 5 }, (_, i) => point(23 + i, 0, 0.8, 0.2)), // Bremszone mit Lenkung
      ...Array.from({ length: 10 }, (_, i) => point(28 + i, 1, 0)),
    ];
    const s = drivingStyle(lap);
    expect(s.throttleLifts).toBe(1);
    expect(s.trailBrakePct).toBe(100);
    expect(s.brakingPct).toBeCloseTo((5 / lap.length) * 100);
  });
});
