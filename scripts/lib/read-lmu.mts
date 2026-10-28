/**
 * Liest eine Telemetrie-Datei von LMU (.duckdb) in Rohdaten (Kanäle, Events, Metadaten).
 * Wird vom Import und später vom Watcher benutzt. Nur unter Node, nicht in der App.
 */
import { DuckDBInstance } from "@duckdb/node-api";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REQUIRED_CHANNELS, type RawRecording } from "../../src/lib/lmu/convert";

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

export async function readRecording(file: string): Promise<RawRecording> {
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

