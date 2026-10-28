ALTER TABLE "laps" ADD COLUMN "pit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "laps" ADD COLUMN "usage" jsonb;--> statement-breakpoint
ALTER TABLE "laps" ADD COLUMN "aids" jsonb;--> statement-breakpoint
ALTER TABLE "laps" ADD COLUMN "tyres" jsonb;--> statement-breakpoint
ALTER TABLE "laps" ADD COLUMN "off_track" jsonb;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "lmu_type" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "length_m" real;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "sample_hz" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_slug_unique" UNIQUE("slug");