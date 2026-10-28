import "server-only";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { cars, lapTraces, laps, sessions, tracks } from "@/db/schema";
import type { SessionFile } from "@/lib/lmu/session";
import { isLapData, rowToLap } from "@/lib/lmu/store";

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

/** Alle Sessions, neueste zuerst. Nicht gecacht, damit neue Importe sofort auftauchen. */
export async function listSessions(): Promise<SessionListItem[]> {
  const rows = await db
    .select({
      id: sessions.id,
      slug: sessions.slug,
      track: tracks.name,
      layout: tracks.layout,
      car: cars.name,
      carClass: cars.carClass,
      lmuType: sessions.lmuType,
      startedAt: sessions.startedAt,
      importedAt: sessions.importedAt,
    })
    .from(sessions)
    .innerJoin(tracks, eq(sessions.trackId, tracks.id))
    .innerJoin(cars, eq(sessions.carId, cars.id))
    .orderBy(desc(sessions.startedAt), desc(sessions.importedAt));

  const lapStats = await db
    .select({
      sessionId: laps.sessionId,
      n: count(),
      best: sql<number | null>`min(${laps.timeMs}) filter (where ${laps.valid})`,
    })
    .from(laps)
    .groupBy(laps.sessionId);

  return rows
    .filter((r) => r.slug)
    .map((r) => {
      const stats = lapStats.find((l) => l.sessionId === r.id);
      return {
        slug: r.slug!,
        track: r.track,
        layout: r.layout,
        car: r.car,
        carClass: r.carClass ?? "",
        sessionType: r.lmuType ?? "",
        recordedAt: (r.startedAt ?? r.importedAt).toISOString(),
        laps: stats?.n ?? 0,
        bestMs: stats?.best !== null && stats?.best !== undefined ? Number(stats.best) : null,
      };
    });
}

/**
 * Eine Session mit allen Runden und Messwerten. Eine importierte Session ändert sich
 * nicht mehr, deshalb wird das Ergebnis dauerhaft gecacht.
 */
export async function getSession(slug: string): Promise<SessionFile | null> {
  "use cache";
  cacheLife("max");
  cacheTag(`session-${slug}`);

  const [head] = await db
    .select({
      id: sessions.id,
      slug: sessions.slug,
      track: tracks.name,
      layout: tracks.layout,
      car: cars.name,
      carClass: cars.carClass,
      lmuType: sessions.lmuType,
      startedAt: sessions.startedAt,
      weather: sessions.weather,
      lengthM: sessions.lengthM,
      sampleHz: sessions.sampleHz,
    })
    .from(sessions)
    .innerJoin(tracks, eq(sessions.trackId, tracks.id))
    .innerJoin(cars, eq(sessions.carId, cars.id))
    .where(eq(sessions.slug, slug))
    .limit(1);
  if (!head) return null;

  const rows = await db
    .select({ lap: laps, blobUrl: lapTraces.blobUrl })
    .from(laps)
    .innerJoin(lapTraces, eq(lapTraces.lapId, laps.id))
    .where(eq(laps.sessionId, head.id))
    .orderBy(asc(laps.lapNumber));

  const loaded = await Promise.all(
    rows.map(async ({ lap, blobUrl }) => {
      const res = await fetch(blobUrl);
      if (!res.ok) throw new Error(`Rundendaten ${lap.lapNumber} nicht ladbar (${res.status})`);
      const data: unknown = await res.json();
      if (!isLapData(data)) throw new Error(`Rundendaten ${lap.lapNumber} unvollständig`);
      return rowToLap(lap, data);
    }),
  );

  return {
    id: head.slug!,
    track: head.track,
    layout: head.layout,
    car: head.car,
    carClass: head.carClass ?? "",
    sessionType: head.lmuType ?? "",
    recordedAt: head.startedAt?.toISOString() ?? "",
    weather: head.weather ?? {},
    lengthM: head.lengthM ?? 0,
    sampleHz: head.sampleHz ?? 20,
    laps: loaded,
  };
}
