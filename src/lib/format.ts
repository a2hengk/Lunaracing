/** Kürzere Anzeige-Namen für die langen Streckennamen aus LMU. */
export function shortTrack(name: string): string {
  return name.replace(/^Circuit de /, "").replace(/^Autodromo /, "");
}

export function shortLayout(track: string, layout: string): string {
  const rest = layout.replace(track, "").trim();
  return rest;
}

const SESSION_TYPES: Record<string, string> = {
  Practice: "Training",
  Qualifying: "Qualifying",
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
