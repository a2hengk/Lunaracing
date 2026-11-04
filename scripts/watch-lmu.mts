/**
 * Beobachtet den Telemetry-Ordner von LMU und importiert jede neue Aufnahme automatisch,
 * sobald LMU sie fertig geschrieben hat. Einfach neben dem Spiel laufen lassen.
 *
 * Aufruf:
 *   npm run watch -- "<pfad>\UserData\Telemetry"
 *
 * Fertig heißt: Neben der .duckdb liegt keine .wal-Datei mehr (LMU schreibt sie beim
 * Beenden der Session in die Datenbank) und die Datei hat sich 15 Sekunden nicht verändert.
 * Bleibt eine .wal liegen (Spiel abgestürzt), wird nach 5 Minuten Ruhe trotzdem importiert.
 *
 * Beim Start werden auch Dateien nachgeholt, die noch nicht importiert sind.
 */
import { config } from "dotenv";
import { watch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { importFile } from "./lib/import.mjs";
import { checkDb, connect, describeDbError } from "./lib/save.mjs";

config({ path: [".env.local", ".env"], quiet: true });

const QUIET_MS = 15_000;
const WAL_GIVE_UP_MS = 5 * 60_000;
const CHECK_EVERY_MS = 5_000;

const dir = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!dir) {
  console.error('Pfad fehlt. Beispiel: npm run watch -- "C:\\...\\UserData\\Telemetry"');
  process.exit(1);
}

let db: ReturnType<typeof connect>;
try {
  db = connect();
  await checkDb(db);
} catch (e) {
  console.error(`Datenbank nicht nutzbar: ${describeDbError(e)}`);
  process.exit(1);
}

/** Dateien, die auf den Import warten, mit dem Zeitpunkt der letzten Änderung */
const pending = new Map<string, number>();
const done = new Set<string>();
let busy = false;

const time = () => new Date().toLocaleTimeString("de-DE");
const log = (msg: string) => console.log(`[${time()}] ${msg}`);

async function mtime(file: string) {
  try {
    return (await stat(file)).mtimeMs;
  } catch {
    return null;
  }
}

function track(name: string) {
  const file = join(dir!, name.replace(/\.wal$/, ""));
  if (!file.endsWith(".duckdb") || done.has(file)) return;
  if (!pending.has(file)) log(`neue Aufnahme: ${basename(file)}`);
  pending.set(file, Date.now());
}

async function check() {
  if (busy) return;
  busy = true;
  try {
    for (const [file, changed] of pending) {
      const m = await mtime(file);
      if (m === null) {
        pending.delete(file);
        continue;
      }
      const last = Math.max(changed, m);
      const quiet = Date.now() - last;
      const walOpen = (await mtime(`${file}.wal`)) !== null;
      if (quiet < QUIET_MS || (walOpen && quiet < WAL_GIVE_UP_MS)) continue;

      pending.delete(file);
      try {
        const r = await importFile(db, file);
        const already = r.message.includes("schon importiert");
        if (r.status === "imported" || already) done.add(file);
        // Beim Nachholen am Start (changed = 0) nicht jede alte Datei melden
        if (!already || changed > 0) log(`${r.message}: ${basename(file)}`);
      } catch (e) {
        log(`Fehler bei ${basename(file)}: ${describeDbError(e)}`);
      }
    }
  } finally {
    busy = false;
  }
}

// Beim Start: alles nachholen, was noch nicht in der Datenbank ist
for (const name of (await readdir(dir)).filter((f) => f.endsWith(".duckdb"))) {
  pending.set(join(dir, name), 0);
}
await check();

watch(dir, (_event, name) => {
  if (name) track(name.toString());
});
setInterval(check, CHECK_EVERY_MS);
log(`beobachte ${dir}. Neue Sessions werden nach dem Beenden automatisch importiert. Strg+C zum Stoppen.`);

process.on("SIGINT", async () => {
  await db.$client.end();
  process.exit(0);
});
