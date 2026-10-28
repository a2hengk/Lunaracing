/**
 * Kurvennamen pro Strecke. Die Kurven selbst werden automatisch erkannt, hier stehen nur
 * die Namen dazu: `at` ist die Distanz des Scheitels in Metern ab Start/Ziel, die
 * Zuordnung passt, wenn eine erkannte Kurve höchstens 150 m daneben liegt.
 *
 * Die Distanzen stehen in der Kurven-Tabelle („bei 2,9 km“). Neue Strecke: einen Eintrag
 * mit TrackName und TrackLayout aus LMU anlegen und die Namen ergänzen.
 */
export type TrackInfo = {
  track: string;
  layout: string;
  corners: { at: number; name: string }[];
};

export const tracks: TrackInfo[] = [
  {
    track: "Circuit de Spa-Francorchamps",
    layout: "Circuit de Spa-Francorchamps Endurance",
    // Nur Kurven, deren Zuordnung eindeutig ist. Die Kurven bei 3,2 km, 4,4 km und
    // 4,8 km (vermutlich Bruxelles, Fagnes, Campus/Stavelot) noch prüfen und ergänzen.
    corners: [
      { at: 275, name: "La Source" },
      { at: 1100, name: "Raidillon" },
      { at: 2365, name: "Les Combes" },
      { at: 2905, name: "Rivage" },
      { at: 3680, name: "Pouhon" },
      { at: 6665, name: "Bus Stop" },
    ],
  },
];

const MATCH_M = 150;

export function cornerName(track: string, layout: string, apex: number): string | undefined {
  const info = tracks.find((t) => t.track === track && t.layout === layout);
  return info?.corners
    .filter((c) => Math.abs(c.at - apex) <= MATCH_M)
    .toSorted((a, b) => Math.abs(a.at - apex) - Math.abs(b.at - apex))
    .at(0)?.name;
}
