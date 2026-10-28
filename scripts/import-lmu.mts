/**
 * Importiert eine Telemetrie-Datei von LMU (.duckdb) als Session-JSON nach src/data/sessions/.
 *
 * Aufruf:
 *   npm run import -- "<pfad>\UserData\Telemetry\<datei>.duckdb"
 *   npm run import -- "<pfad>\UserData\Telemetry"      (alle Dateien im Ordner)
 *
 * Bereits importierte Dateien werden übersprungen. Dateien ohne eine ganze gefahrene
 * Runde (nur Out-Lap, abgebrochen) werden gemeldet und ausgelassen.
 */
import { DuckDBInstance } from "@duckdb/node-api";
import { copyFile, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { convertRecording, REQUIRED_CHANNELS, type RawRecording } from "../src/lib/lmu/convert";

const OUT_DIR = "src/data/sessions";
const EXTRA_CHANNELS = [
  "Ambient Temperature",
  "Track Temperature",
  "Fuel Level",
  "Virtual Energy",
  "Tyres Wear",
  "TC",
  "Path Lateral",
  "Track Edge",
  "TyresTempLeft",
  "TyresTempCentre",
  "TyresTempRight",
  "TyresPressure",
];
const EVENTS = [
  "Lap",
  "Lap Time",
  "Gear",
  "Current Sector",
  "Last Sector1",
  "Last Sector2",
  "ABS",
  "TCLevel",
  "ABSLevel",
  "FuelMixtureMap",
  "Brake Bias Rear",
  "In Pits",
];

const arg = process.argv[2];
if (!arg) {
  console.error('Pfad fehlt. Beispiel: npm run import -- "C:\\...\\UserData\\Telemetry"');
  process.exit(1);
}

const files = (await stat(arg)).isDirectory()
  ? (await readdir(arg)).filter((f) => f.endsWith(".duckdb")).map((f) => join(arg, f))
  : [arg];

await mkdir(OUT_DIR, { recursive: true });
let imported = 0;

for (const file of files.toSorted()) {
  const id = slug(basename(file, ".duckdb"));
  const target = join(OUT_DIR, `${id}.json`);
  if (existsSync(target)) {
    console.log(`übersprungen (schon importiert): ${basename(file)}`);
    continue;
  }
  try {
    const raw = await readRecording(file);
    const session = convertRecording(raw, id);
    if (session.laps.length === 0) {
      console.log(`übersprungen (keine ganze Runde): ${basename(file)}`);
      continue;
    }
    await writeFile(target, JSON.stringify(session));
    imported++;
    const laps = session.laps.map((l) => `${l.lap}${l.valid ? "" : "*"}`).join(", ");
    console.log(`importiert: ${basename(file)} → ${session.laps.length} Runden (${laps})`);
  } catch (e) {
    console.error(`Fehler bei ${basename(file)}: ${e instanceof Error ? e.message : e}`);
  }
}

await writeIndex();
console.log(`${imported} neu importiert. * = von LMU nicht gewertet`);

async function readRecording(file: string): Promise<RawRecording> {
  // Kopie öffnen: LMU kann die Datei noch offen haben, und eine .wal daneben
  // (Datei nicht sauber geschlossen) wird beim Öffnen der Kopie eingespielt.
  const dir = await mkdtemp(join(tmpdir(), "lunaracing-"));
  const copy = join(dir, "copy.duckdb");
  await copyFile(file, copy);
  if (existsSync(`${file}.wal`)) await copyFile(`${file}.wal`, `${copy}.wal`);

  const instance = await DuckDBInstance.create(copy);
  const con = await instance.connect();
  const rows = async (sql: string) => (await con.runAndReadAll(sql)).getRowObjectsJS();
  const q = (name: string) => `"${name.replaceAll('"', '""')}"`;

  try {
    const meta = Object.fromEntries(
      (await rows("select key, value from metadata")).map((r) => [String(r.key), String(r.value)]),
    );
    const list = new Map(
      (await rows(`select "channelName" as name, frequency from "channelsList"`)).map((r) => [
        String(r.name),
        Number(r.frequency),
      ]),
    );

    const channels: RawRecording["channels"] = {};
    for (const name of [...REQUIRED_CHANNELS, ...EXTRA_CHANNELS]) {
      const hz = list.get(name);
      if (!hz) continue;
      const cols = (
        await rows(`select column_name from information_schema.columns where table_name = '${name.replaceAll("'", "''")}'`)
      ).map((r) => String(r.column_name));
      if (cols.includes("value")) {
        const vals = await rows(`select value from ${q(name)}`);
        channels[name] = { hz, values: vals.map((r) => Number(r.value)) };
      } else {
        // Kanäle mit einem Wert pro Rad: value1..value4 → "<Name>.1" .. "<Name>.4"
        for (const col of cols.filter((c) => /^value\d$/.test(c))) {
          const vals = await rows(`select ${col} as v from ${q(name)}`);
          channels[`${name}.${col.slice(5)}`] = { hz, values: vals.map((r) => Number(r.v)) };
        }
      }
    }

    const events: RawRecording["events"] = {};
    for (const name of EVENTS) {
      try {
        events[name] = (await rows(`select ts, value from ${q(name)} order by ts`)).map((r) => ({
          ts: Number(r.ts),
          value: Number(r.value),
        }));
      } catch {
        events[name] = [];
      }
    }

    const [first] = await rows(`select value from "GPS Time" limit 1`);
    if (!first) throw new Error("GPS Time ist leer");
    return { meta, t0: Number(first.value), channels, events };
  } finally {
    con.closeSync();
    instance.closeSync();
    await rm(dir, { recursive: true, force: true });
  }
}

/** Erzeugt src/data/sessions/index.ts, das alle Session-Dateien importiert. */
async function writeIndex() {
  const jsons = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".json")).toSorted();
  const lines = [
    "// Wird von scripts/import-lmu.mts erzeugt. Nicht von Hand bearbeiten.",
    'import type { SessionFile } from "@/lib/lmu/session";',
    ...jsons.map((f, i) => `import s${i} from "./${f}";`),
    "",
    `export const sessions = [${jsons.map((_, i) => `s${i}`).join(", ")}] as SessionFile[];`,
    "",
  ];
  await writeFile(join(OUT_DIR, "index.ts"), lines.join("\n"));
}

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
