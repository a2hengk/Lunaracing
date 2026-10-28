/**
 * Importiert Telemetrie-Dateien von LMU (.duckdb) in die Datenbank (Neon) und den
 * Blob-Speicher (Vercel Blob). Die App auf Vercel zeigt sie danach sofort an.
 *
 * Aufruf:
 *   npm run import -- "<pfad>\UserData\Telemetry"                (alle Dateien im Ordner)
 *   npm run import -- "<pfad>\UserData\Telemetry\<datei>.duckdb"
 *
 * Braucht DATABASE_URL und BLOB_READ_WRITE_TOKEN in .env.local oder .env
 * (am einfachsten: `npx vercel env pull .env.local`).
 *
 * Bereits importierte Dateien werden übersprungen. Dateien ohne eine ganze gefahrene
 * Runde (nur Out-Lap, abgebrochen) werden gemeldet und ausgelassen.
 */
import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { convertRecording } from "../src/lib/lmu/convert";
import { readRecording } from "./lib/read-lmu.mjs";
import { connect, saveSession, sessionExists } from "./lib/save.mjs";

config({ path: [".env.local", ".env"], quiet: true });

const arg = process.argv[2];
if (!arg) {
  console.error('Pfad fehlt. Beispiel: npm run import -- "C:\\...\\UserData\\Telemetry"');
  process.exit(1);
}

const files = (await stat(arg)).isDirectory()
  ? (await readdir(arg)).filter((f) => f.endsWith(".duckdb")).map((f) => join(arg, f))
  : [arg];

let db: ReturnType<typeof connect>;
try {
  db = connect();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
let imported = 0;

for (const file of files.toSorted()) {
  const name = basename(file);
  try {
    const result = await importFile(file);
    if (result.status === "imported") imported++;
    console.log(`${result.message}: ${name}`);
  } catch (e) {
    console.error(`Fehler bei ${name}: ${e instanceof Error ? e.message : e}`);
  }
}

console.log(`${imported} neu importiert. * = von LMU nicht gewertet`);
await db.$client.end();

async function importFile(file: string) {
  const id = slug(basename(file, ".duckdb"));
  const hash = createHash("sha256").update(await readFile(file)).digest("hex");
  if (await sessionExists(db, id, hash)) return { status: "skipped", message: "übersprungen (schon importiert)" };

  const session = convertRecording(await readRecording(file), id);
  if (session.laps.length === 0) return { status: "skipped", message: "übersprungen (keine ganze Runde)" };

  await saveSession(db, session, basename(file), hash);
  const laps = session.laps.map((l) => `${l.lap}${l.valid ? "" : "*"}`).join(", ");
  return { status: "imported", message: `importiert, ${session.laps.length} Runden (${laps})` };
}

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
