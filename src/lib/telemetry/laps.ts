import type { Lap, Sample } from "./types";

/**
 * Teilt einen durchgehenden Strom von Messpunkten in Runden auf.
 *
 * Eine Runde gilt als vollständig, wenn sie nahe Start/Ziel beginnt und fast die
 * ganze Streckenlänge abdeckt. Die Streckenlänge schätzen wir aus der längsten Runde,
 * solange wir sie nicht aus den Metadaten der Datei kennen.
 */
export function splitLaps(samples: Sample[], trackLengthM?: number): Lap[] {
  const groups = new Map<number, Sample[]>();
  for (const s of samples) {
    const list = groups.get(s.lap);
    if (list) list.push(s);
    else groups.set(s.lap, [s]);
  }

  const raw = [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([lap, list]) => {
      const sorted = list.toSorted((a, b) => a.t - b.t);
      const first = sorted[0];
      const last = sorted.at(-1)!;
      return { lap, samples: sorted, first, last };
    });

  const length = trackLengthM ?? Math.max(0, ...raw.map((r) => r.last.lapDist));

  return raw.map(({ lap, samples: s, first, last }) => ({
    lap,
    samples: s,
    timeMs: Math.round((last.t - first.t) * 1000),
    lengthM: last.lapDist,
    complete: length > 0 && first.lapDist < 50 && last.lapDist > length * 0.98,
  }));
}

/** Schnellste vollständige Runde, oder undefined wenn keine dabei ist. */
export function fastestLap(laps: Lap[]): Lap | undefined {
  return laps.filter((l) => l.complete).toSorted((a, b) => a.timeMs - b.timeMs)[0];
}

export function formatLapTime(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return `${min}:${sec}`;
}
