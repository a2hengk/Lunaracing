import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { OutlinePoint } from "@/lib/track/outline";

/**
 * Phase 1: Strecken, Autos, Sessions, Runden und die Rohdaten pro Runde.
 * Rohdaten liegen als Datei im Blob-Speicher, hier steht nur der Verweis.
 * Kurven, Setups und Kennzahlen pro Kurve kommen in Phase 2/3 dazu.
 */

export const tracks = pgTable(
  "tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    layout: text("layout").notNull().default(""),
    lengthM: real("length_m"),
    /** Punkte der Strecke, einmal aus einer sauberen Runde erzeugt */
    outline: jsonb("outline").$type<OutlinePoint[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("tracks_name_layout").on(t.name, t.layout)],
);

export const cars = pgTable("cars", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  /** z. B. GT3, LMP2, Hyper */
  carClass: text("car_class"),
});

export const sessionType = pgEnum("session_type", ["training", "quali", "rennen", "unbekannt"]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  trackId: uuid("track_id")
    .notNull()
    .references(() => tracks.id),
  carId: uuid("car_id")
    .notNull()
    .references(() => cars.id),
  type: sessionType("type").notNull().default("unbekannt"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  /** Dateiname der .duckdb-Datei */
  sourceFile: text("source_file").notNull(),
  /** Hash der Datei, damit derselbe Import nicht doppelt landet */
  sourceHash: text("source_hash").notNull().unique(),
  weather: jsonb("weather").$type<Record<string, unknown>>(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

export const laps = pgTable(
  "laps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    lapNumber: integer("lap_number").notNull(),
    timeMs: integer("time_ms").notNull(),
    s1Ms: integer("s1_ms"),
    s2Ms: integer("s2_ms"),
    s3Ms: integer("s3_ms"),
    /** vollständig aufgezeichnet und nicht ungültig (Track Limits) */
    valid: boolean("valid").notNull().default(true),
    fuelUsed: real("fuel_used"),
    tyreCompound: text("tyre_compound"),
  },
  (t) => [unique("laps_session_lap").on(t.sessionId, t.lapNumber)],
);

export const lapTraces = pgTable("lap_traces", {
  lapId: uuid("lap_id")
    .primaryKey()
    .references(() => laps.id, { onDelete: "cascade" }),
  blobUrl: text("blob_url").notNull(),
  sampleHz: integer("sample_hz").notNull(),
  channels: text("channels").array().notNull(),
});
