// Spielt die Drizzle-Migrationen ein. Läuft beim Build auf Vercel, aber nur für
// Production, damit ein Preview-Branch nie die echte Datenbank verändert.
// Lokal: npm run db:migrate (liest .env.local bzw. .env).
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

config({ path: [".env.local", ".env"], quiet: true });

const onVercel = !!process.env.VERCEL;
if (onVercel && process.env.VERCEL_ENV !== "production") {
  console.log("[migrate] Preview-Build, Migrationen übersprungen");
  process.exit(0);
}

// Migrationen über die direkte Verbindung, nicht über den Pooler
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] Keine DATABASE_URL gesetzt, Migrationen übersprungen");
  process.exit(0);
}
if (url.includes("[SENSITIVE]")) {
  console.error("[migrate] DATABASE_URL ist nur ein Platzhalter aus `vercel env pull`, echten Wert in .env.local eintragen");
  process.exit(1);
}

const db = drizzle(url);
await migrate(db, { migrationsFolder: "drizzle" });
console.log("[migrate] Datenbank ist auf dem neuesten Stand");
await db.$client.end();
