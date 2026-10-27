CREATE TYPE "public"."session_type" AS ENUM('training', 'quali', 'rennen', 'unbekannt');--> statement-breakpoint
CREATE TABLE "cars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"car_class" text,
	CONSTRAINT "cars_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "lap_traces" (
	"lap_id" uuid PRIMARY KEY NOT NULL,
	"blob_url" text NOT NULL,
	"sample_hz" integer NOT NULL,
	"channels" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "laps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"lap_number" integer NOT NULL,
	"time_ms" integer NOT NULL,
	"s1_ms" integer,
	"s2_ms" integer,
	"s3_ms" integer,
	"valid" boolean DEFAULT true NOT NULL,
	"fuel_used" real,
	"tyre_compound" text,
	CONSTRAINT "laps_session_lap" UNIQUE("session_id","lap_number")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"car_id" uuid NOT NULL,
	"type" "session_type" DEFAULT 'unbekannt' NOT NULL,
	"started_at" timestamp with time zone,
	"source_file" text NOT NULL,
	"source_hash" text NOT NULL,
	"weather" jsonb,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_source_hash_unique" UNIQUE("source_hash")
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"layout" text DEFAULT '' NOT NULL,
	"length_m" real,
	"outline" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracks_name_layout" UNIQUE("name","layout")
);
--> statement-breakpoint
ALTER TABLE "lap_traces" ADD CONSTRAINT "lap_traces_lap_id_laps_id_fk" FOREIGN KEY ("lap_id") REFERENCES "public"."laps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "laps" ADD CONSTRAINT "laps_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE no action ON UPDATE no action;