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
 *
 * Mit --neu werden schon importierte Dateien gelöscht und neu eingelesen, z. B. wenn der
 * Import neue Werte kennt:  npm run import -- --neu "<pfad>\UserData\Telemetry"
 */
import { config } from "dotenv";
import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { importFile } from "./lib/import.mjs";
import { checkDb, connect, describeDbError } from "./lib/save.mjs";

config({ path: [".env.local", ".env"], quiet: true });

const args = process.argv.slice(2);
const reimport = args.includes("--neu");
const arg = args.find((a) => !a.startsWith("--"));
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
try {
  await checkDb(db);
} catch (e) {
  console.error(`Datenbank nicht nutzbar: ${describeDbError(e)}`);
  await db.$client.end();
  process.exit(1);
}
let imported = 0;

for (const file of files.toSorted()) {
  const name = basename(file);
  try {
    const result = await importFile(db, file, { reimport });
    if (result.status === "imported") imported++;
    console.log(`${result.message}: ${name}`);
  } catch (e) {
    console.error(`Fehler bei ${name}: ${describeDbError(e)}`);
  }
}

console.log(`${imported} neu importiert. * = von LMU nicht gewertet`);
await db.$client.end();
