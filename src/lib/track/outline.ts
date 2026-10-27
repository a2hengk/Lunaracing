import type { Sample } from "../telemetry/types";

/** Ein Punkt der Strecken-Outline: Weltkoordinate plus Streckendistanz. */
export type OutlinePoint = { d: number; x: number; z: number; y?: number };

/**
 * Baut aus einer sauberen Runde die Outline der Strecke: ein Punkt alle `stepM` Meter.
 * Wird einmal pro Strecke gespeichert und für alle weiteren Runden wiederverwendet.
 */
export function buildOutline(samples: Sample[], stepM = 10): OutlinePoint[] {
  if (samples.length < 2) return [];
  const sorted = samples.toSorted((a, b) => a.lapDist - b.lapDist);
  const end = sorted.at(-1)!.lapDist;
  const out: OutlinePoint[] = [];
  let i = 0;
  for (let d = 0; d <= end; d += stepM) {
    while (i < sorted.length - 2 && sorted.at(i + 1)!.lapDist < d) i++;
    const a = sorted.at(i)!;
    const b = sorted.at(i + 1)!;
    const span = b.lapDist - a.lapDist;
    const f = span > 0 ? Math.min(1, Math.max(0, (d - a.lapDist) / span)) : 0;
    const mix = (u: number, v: number) => u + (v - u) * f;
    out.push({
      d,
      x: mix(a.x, b.x),
      z: mix(a.z, b.z),
      ...(a.y !== undefined && b.y !== undefined ? { y: mix(a.y, b.y) } : {}),
    });
  }
  return out;
}

/** Position auf der Outline zu einer Streckendistanz, für den Hover-Punkt. */
export function pointAtDistance(outline: OutlinePoint[], d: number): OutlinePoint | undefined {
  if (outline.length === 0) return undefined;
  let lo = 0;
  let hi = outline.length - 1;
  if (d <= outline.at(0)!.d) return outline.at(0);
  if (d >= outline.at(hi)!.d) return outline.at(hi);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (outline.at(mid)!.d <= d) lo = mid;
    else hi = mid;
  }
  const a = outline.at(lo)!;
  const b = outline.at(hi)!;
  const f = (d - a.d) / (b.d - a.d);
  return { d, x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
}

export type Projection = {
  width: number;
  height: number;
  /** Weltkoordinate → SVG-Koordinate */
  project: (p: { x: number; z: number }) => [number, number];
};

/**
 * Passt die Strecke in eine SVG-Fläche mit festem Rand, Seitenverhältnis bleibt erhalten.
 * `mirror` spiegelt die z-Achse. Welche Variante die Strecke richtig herum zeigt,
 * hängt vom Koordinatensystem ab und muss mit einer echten Datei geprüft werden.
 */
export function fitToBox(
  outline: OutlinePoint[],
  maxWidth: number,
  maxHeight = maxWidth,
  pad = 16,
  mirror = true,
): Projection {
  const xs = outline.map((p) => p.x);
  const zs = outline.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  const scale = Math.min((maxWidth - 2 * pad) / spanX, (maxHeight - 2 * pad) / spanZ);
  return {
    width: Math.round(spanX * scale + 2 * pad),
    height: Math.round(spanZ * scale + 2 * pad),
    project: (p) => [
      pad + (p.x - minX) * scale,
      pad + (mirror ? maxZ - p.z : p.z - minZ) * scale,
    ],
  };
}
