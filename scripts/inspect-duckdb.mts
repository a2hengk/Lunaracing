/**
 * Schaut in eine Telemetrie-Datei von LMU (.duckdb) und schreibt auf, was drin ist:
 * Tabellen, Spalten, Anzahl Zeilen und ein paar Beispielzeilen.
 *
 * Die Struktur der Dateien ist nirgends öffentlich dokumentiert. Dieser Bericht ist
 * die Grundlage für den eigentlichen Import.
 *
 * Aufruf:  npm run inspect -- "C:\...\Le Mans Ultimate\UserData\Telemetry\<datei>.duckdb"
 * Ergebnis: inspect-<datei>.md im Projektordner
 */
import { DuckDBInstance } from "@duckdb/node-api";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const file = process.argv[2];
if (!file) {
  console.error('Pfad zur .duckdb-Datei fehlt. Beispiel: npm run inspect -- "C:\\...\\datei.duckdb"');
  process.exit(1);
}

// Kopie öffnen, damit eine Datei, die LMU gerade schreibt, nicht blockiert wird
const dir = await mkdtemp(join(tmpdir(), "lunaracing-"));
const copy = join(dir, "copy.duckdb");
await copyFile(file, copy);

const instance = await DuckDBInstance.create(copy, { access_mode: "READ_ONLY" });
const con = await instance.connect();

const rows = async (sql: string) => (await con.runAndReadAll(sql)).getRowObjectsJson();
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

const tables = await rows(
  `select table_schema, table_name, table_type from information_schema.tables
   where table_schema not in ('information_schema', 'pg_catalog')
   order by table_schema, table_name`,
);

const out: string[] = [`# ${basename(file)}`, "", `${tables.length} Tabellen/Views`, ""];

for (const t of tables) {
  const schema = String(t.table_schema);
  const name = String(t.table_name);
  const full = `${quote(schema)}.${quote(name)}`;
  const cols = await rows(
    `select column_name, data_type from information_schema.columns
     where table_schema = '${schema}' and table_name = '${name.replaceAll("'", "''")}'
     order by ordinal_position`,
  );
  const [{ n }] = (await rows(`select count(*) as n from ${full}`)) as [{ n: string }];
  const sample = await rows(`select * from ${full} limit 3`);

  out.push(`## ${schema}.${name} (${t.table_type}, ${n} Zeilen)`, "");
  out.push("| Spalte | Typ |", "| --- | --- |");
  for (const c of cols) out.push(`| ${c.column_name} | ${c.data_type} |`);
  out.push("", "```json", JSON.stringify(sample, null, 2).slice(0, 3000), "```", "");
}

const target = `inspect-${basename(file, ".duckdb")}.md`;
await writeFile(target, out.join("\n"));
con.closeSync();
instance.closeSync();
await rm(dir, { recursive: true, force: true });
console.log(`${tables.length} Tabellen gefunden, Bericht: ${target}`);
