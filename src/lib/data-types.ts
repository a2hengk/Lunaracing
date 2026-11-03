/** Eine Zeile der Session-Liste auf der Startseite. */
export type SessionListItem = {
  slug: string;
  track: string;
  layout: string;
  car: string;
  carClass: string;
  sessionType: string;
  recordedAt: string;
  laps: number;
  bestMs: number | null;
};
