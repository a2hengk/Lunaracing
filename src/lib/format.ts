/** Gebräuchliche Kurznamen für die Strecken in LMU. Unbekannte Namen bleiben, wie sie sind. */
const TRACK_NAMES: Record<string, string> = {
  "Autodromo Nazionale Monza": "Monza",
  "Autodromo Enzo e Dino Ferrari": "Imola",
  "Autodromo Internacional do Algarve": "Portimão",
  "Autódromo Internacional do Algarve": "Portimão",
  "Autódromo José Carlos Pace": "Interlagos",
  "Bahrain International Circuit": "Bahrain",
  "Circuit de la Sarthe": "Le Mans",
  "Circuit de Spa-Francorchamps": "Spa-Francorchamps",
  "Circuit of the Americas": "COTA",
  "Fuji Speedway": "Fuji",
  "Lusail International Circuit": "Lusail",
  "Sebring International Raceway": "Sebring",
};

export function shortTrack(name: string): string {
  return TRACK_NAMES[name] ?? name;
}

/**
 * Layout ohne den Streckennamen, z. B. „Circuit de Spa-Francorchamps Endurance“ → „Endurance“.
 * Leer, wenn das Layout nur der Streckenname ist.
 */
export function shortLayout(track: string, layout: string): string {
  if (!layout || layout === track) return "";
  if (layout.startsWith(track)) return layout.slice(track.length).trim();
  // z. B. „Bahrain Endurance Circuit“ zu „Bahrain International Circuit“: gemeinsame Wörter weg
  const trackWords = new Set(track.toLowerCase().split(/\s+/));
  const rest = layout.split(/\s+/).filter((w) => !trackWords.has(w.toLowerCase()));
  return rest.join(" ");
}

/** Teile einer Unterzeile ohne leere Einträge, mit „ · “ verbunden. */
export function joinParts(...parts: (string | undefined | null | false)[]): string {
  return parts.filter((p): p is string => !!p && p.trim() !== "").join(" · ");
}

const SESSION_TYPES: Record<string, string> = {
  Practice: "Training",
  Qualify: "Qualifying",
  Qualifying: "Qualifying",
  Warmup: "Warm-up",
  Race: "Rennen",
};

export function sessionTypeDe(type: string): string {
  return SESSION_TYPES[type] ?? type;
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(iso));
}

export function formatSector(ms: number): string {
  return ms > 0 ? (ms / 1000).toFixed(3) : "–";
}
