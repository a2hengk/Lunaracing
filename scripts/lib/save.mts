/**
 * Speichert eine importierte Session: Messwerte pro Runde als JSON in den öffentlichen
 * Blob-Speicher, alles andere in die Datenbank. Wird vom Import und vom Watcher benutzt.
 */
import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../src/db/schema";
import type { SessionFile } from "../../src/lib/lmu/session";
import { lapToRow, sessionTypeToDb, TRACE_CHANNELS } from "../../src/lib/lmu/store";

const { cars, lapTraces, laps, sessions, tracks } = schema;

export function connect({ needBlob = true } = {}) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL fehlt. `npx vercel env pull .env.local` ausführen oder .env anlegen.");
  if (needBlob && !process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN fehlt (Vercel Blob).");
  return drizzle(url, { schema });
}

export type Db = ReturnType<typeof connect>;

export async function sessionExists(db: Db, slug: string, hash: string) {
  const bySlug = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.slug, slug)).limit(1);
  if (bySlug.length) return true;
  const byHash = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.sourceHash, hash)).limit(1);
  return byHash.length > 0;
}

/** Wohin die Messwerte hochgeladen werden. Standard: Vercel Blob, im Test ein lokaler Ordner. */
export type LapStorage = {
  upload: (pathname: string, json: string) => Promise<string>;
  remove: (urls: string[]) => Promise<void>;
};

export const vercelBlob: LapStorage = {
  upload: async (pathname, json) =>
    (
      await put(pathname, json, {
        access: "public",
        addRandomSuffix: true,
        contentType: "application/json",
        // Rundendaten ändern sich nie, ein Jahr Cache ist sicher
        cacheControlMaxAge: 60 * 60 * 24 * 365,
      })
    ).url,
  remove: (urls) => del(urls),
};

export async function saveSession(
  db: Db,
  session: SessionFile,
  sourceFile: string,
  sourceHash: string,
  storage: LapStorage = vercelBlob,
) {
  // 1. Messwerte hochladen. Schlägt danach die Datenbank fehl, werden sie wieder gelöscht.
  const uploaded: { lap: number; url: string }[] = [];
  try {
    for (const lap of session.laps) {
      const url = await storage.upload(`laps/${session.id}/lap-${lap.lap}.json`, JSON.stringify(lap.data));
      uploaded.push({ lap: lap.lap, url });
    }

    // 2. Alles andere in einer Transaktion
    await db.transaction(async (tx) => {
      const [track] = await tx
        .insert(tracks)
        .values({ name: session.track, layout: session.layout, lengthM: session.lengthM })
        .onConflictDoUpdate({ target: [tracks.name, tracks.layout], set: { lengthM: session.lengthM } })
        .returning({ id: tracks.id });
      const [car] = await tx
        .insert(cars)
        .values({ name: session.car, carClass: session.carClass })
        .onConflictDoUpdate({ target: cars.name, set: { carClass: session.carClass } })
        .returning({ id: cars.id });

      const [row] = await tx
        .insert(sessions)
        .values({
          slug: session.id,
          trackId: track!.id,
          carId: car!.id,
          type: sessionTypeToDb(session.sessionType),
          lmuType: session.sessionType,
          startedAt: session.recordedAt ? new Date(session.recordedAt) : null,
          sourceFile,
          sourceHash,
          weather: session.weather,
          lengthM: session.lengthM,
          sampleHz: session.sampleHz,
        })
        .returning({ id: sessions.id });

      for (const lap of session.laps) {
        const [lapRow] = await tx
          .insert(laps)
          .values({ sessionId: row!.id, ...lapToRow(lap) })
          .returning({ id: laps.id });
        await tx.insert(lapTraces).values({
          lapId: lapRow!.id,
          blobUrl: uploaded.find((u) => u.lap === lap.lap)!.url,
          sampleHz: session.sampleHz,
          channels: [...TRACE_CHANNELS],
        });
      }
    });
  } catch (e) {
    if (uploaded.length) await storage.remove(uploaded.map((u) => u.url)).catch(() => {});
    throw e;
  }
}
