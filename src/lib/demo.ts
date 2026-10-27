import type { Sample } from "./telemetry/types";

/**
 * Erfundene Strecke und zwei erfundene Runden, damit Karte und Vergleich schon laufen,
 * bevor der Import echter LMU-Dateien steht. Fliegt raus, sobald echte Runden da sind.
 *
 * Das Speed-Profil kommt aus einer einfachen Grip-Rechnung: Kurvenspeed aus der
 * Krümmung, dazu Beschleunigen und Bremsen mit festen Grenzwerten.
 */

type Variant = {
  /** Querbeschleunigung in m/s², global */
  lateral: number;
  /** Bremsverzögerung in m/s² */
  braking: number;
  /** Abschnitte (Anteil der Runde 0..1), in denen der Fahrer schlechter fährt */
  slow?: { from: number; to: number; lateral?: number; braking?: number }[];
};

const N = 4000;
const ACCEL = 6.5;
const VMAX = 74; // m/s, ca. 266 km/h

function trackPoint(theta: number): [number, number] {
  const r =
    600 * (1 + 0.28 * Math.sin(3 * theta) + 0.12 * Math.cos(5 * theta) + 0.08 * Math.sin(2 * theta + 1));
  return [r * Math.cos(theta), r * Math.sin(theta)];
}

function buildGeometry() {
  const pts = Array.from({ length: N }, (_, i) => trackPoint((i / N) * Math.PI * 2));
  const ds: number[] = [];
  for (let i = 0; i < N; i++) {
    const [ax, az] = pts.at(i)!;
    const [bx, bz] = pts.at((i + 1) % N)!;
    ds.push(Math.hypot(bx - ax, bz - az));
  }
  const curvature = pts.map((_, i) => {
    const [ax, az] = pts.at((i - 1 + N) % N)!;
    const [bx, bz] = pts.at(i)!;
    const [cx, cz] = pts.at((i + 1) % N)!;
    const area2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
    const ab = Math.hypot(bx - ax, bz - az);
    const bc = Math.hypot(cx - bx, cz - bz);
    const ca = Math.hypot(ax - cx, az - cz);
    return (2 * area2) / (ab * bc * ca || 1);
  });
  return { pts, ds, curvature };
}

function driveLap(variant: Variant) {
  const { pts, ds, curvature } = buildGeometry();
  const at = (i: number, key: "lateral" | "braking") => {
    const frac = i / N;
    const zone = variant.slow?.find((z) => frac >= z.from && frac <= z.to);
    return zone?.[key] ?? variant[key];
  };

  const vCorner = curvature.map((k, i) => Math.min(VMAX, Math.sqrt(at(i, "lateral") / Math.max(k, 1e-6))));

  // Vorwärts: wie schnell kann ich werden. Rückwärts: wann muss ich bremsen.
  // Zwei Durchläufe, damit die Runde sauber über Start/Ziel geschlossen wird.
  const v = [...vCorner];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < 2 * N; i++) {
      const k = i % N;
      const prev = (i - 1) % N;
      v[k] = Math.min(v[k]!, Math.sqrt(v[prev]! ** 2 + 2 * ACCEL * ds.at(prev)!));
    }
    for (let i = 2 * N - 1; i > 0; i--) {
      const k = (i - 1) % N;
      const next = i % N;
      v[k] = Math.min(v[k]!, Math.sqrt(v[next]! ** 2 + 2 * at(k, "braking") * ds.at(k)!));
    }
  }

  // Pro Geometriepunkt: Zeit, Distanz, Inputs
  const rows: { t: number; d: number; v: number; throttle: number; brake: number; x: number; z: number }[] = [];
  let t = 0;
  let d = 0;
  for (let i = 0; i < N; i++) {
    const vi = v.at(i)!;
    const vn = v.at((i + 1) % N)!;
    const dv = vn - vi;
    const braking = dv < -0.05;
    const throttle = braking ? 0 : vi >= VMAX - 0.5 || dv > 0.02 ? 1 : 0.35;
    const brake = braking ? Math.min(1, ((vi * vi - vn * vn) / (2 * ds.at(i)!)) / 16) : 0;
    const [x, z] = pts.at(i)!;
    rows.push({ t, d, v: vi, throttle, brake, x, z });
    t += ds.at(i)! / ((vi + vn) / 2);
    d += ds.at(i)!;
  }
  return { rows, lapTime: t, length: d };
}

/** Zwei Runden hintereinander als ein Strom mit 50 Hz, wie er aus einer Datei käme. */
export function demoSamples(): Sample[] {
  const laps = [
    driveLap({ lateral: 15, braking: 15 }),
    driveLap({
      lateral: 15,
      braking: 15,
      slow: [
        { from: 0.18, to: 0.26, braking: 11 }, // zu früh und zu sanft gebremst
        { from: 0.55, to: 0.62, lateral: 13 }, // zu langsam durch die Kurve
      ],
    }),
  ];

  const out: Sample[] = [];
  let offset = 0;
  laps.forEach((lap, idx) => {
    const { rows } = lap;
    let j = 0;
    for (let t = 0; t < lap.lapTime; t += 1 / 50) {
      while (j < rows.length - 2 && rows.at(j + 1)!.t < t) j++;
      const a = rows.at(j)!;
      const b = rows.at(j + 1)!;
      const f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t || 1)));
      const mix = (u: number, w: number) => u + (w - u) * f;
      out.push({
        t: offset + t,
        lap: idx + 1,
        lapDist: mix(a.d, b.d),
        speed: mix(a.v, b.v) * 3.6,
        throttle: f < 0.5 ? a.throttle : b.throttle,
        brake: mix(a.brake, b.brake),
        x: mix(a.x, b.x),
        z: mix(a.z, b.z),
      });
    }
    // letzter Punkt exakt auf Start/Ziel, damit die Runde vollständig ist
    const last = rows.at(-1)!;
    out.push({
      t: offset + lap.lapTime,
      lap: idx + 1,
      lapDist: lap.length,
      speed: last.v * 3.6,
      throttle: last.throttle,
      brake: last.brake,
      x: rows.at(0)!.x,
      z: rows.at(0)!.z,
    });
    offset += lap.lapTime + 0.02;
  });
  return out;
}
