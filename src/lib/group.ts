import type { SessionListItem } from "./data-types";
import { sessionTypeToDb, type SessionTypeDb } from "./lmu/store";

export type SessionKind = Exclude<SessionTypeDb, "unbekannt"> | "sonstige";

export const KIND_ORDER: SessionKind[] = ["rennen", "quali", "training", "sonstige"];

export const KIND_LABEL: Record<SessionKind, string> = {
  rennen: "Rennen",
  quali: "Qualifying",
  training: "Training",
  sonstige: "Sonstige",
};

export function sessionKind(lmuType: string): SessionKind {
  const t = sessionTypeToDb(lmuType);
  return t === "unbekannt" ? "sonstige" : t;
}

export type TrackGroup = {
  /** Strecke + Layout, eindeutig */
  key: string;
  track: string;
  layout: string;
  /** Sessions, sortiert nach Art (Rennen zuerst) und dann neueste zuerst */
  sessions: (SessionListItem & { kind: SessionKind })[];
  latest: string;
  /** schnellste gewertete Runde pro Art */
  bestMs: Partial<Record<SessionKind, number>>;
};

/** Fasst Sessions derselben Strecke (und desselben Layouts) zusammen, neueste Strecke zuerst. */
export function groupByTrack(list: SessionListItem[]): TrackGroup[] {
  const groups = new Map<string, TrackGroup>();
  for (const s of list) {
    const key = `${s.track}|${s.layout}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, track: s.track, layout: s.layout, sessions: [], latest: "", bestMs: {} };
      groups.set(key, g);
    }
    const kind = sessionKind(s.sessionType);
    g.sessions.push({ ...s, kind });
    if (s.recordedAt > g.latest) g.latest = s.recordedAt;
    if (s.bestMs !== null && (g.bestMs[kind] === undefined || s.bestMs < g.bestMs[kind]!)) g.bestMs[kind] = s.bestMs;
  }
  for (const g of groups.values()) {
    g.sessions.sort(
      (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.recordedAt.localeCompare(a.recordedAt),
    );
  }
  return [...groups.values()].sort((a, b) => b.latest.localeCompare(a.latest));
}
