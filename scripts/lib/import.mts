import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { convertRecording } from "../../src/lib/lmu/convert";
import { readRecording } from "./read-lmu.mjs";
import { deleteSession, saveSession, sessionExists, type Db } from "./save.mjs";

export type ImportResult = { status: "imported" | "skipped"; message: string };

/** Session-ID aus dem Dateinamen, z. B. circuit-de-spa-francorchamps-p-2026-10-27t21-05-01z */
export function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Importiert eine .duckdb-Datei. Schon importierte Dateien werden übersprungen, außer mit
 * reimport: dann wird die alte Session gelöscht und neu eingelesen.
 */
export async function importFile(db: Db, file: string, { reimport = false } = {}): Promise<ImportResult> {
  const id = slug(basename(file, ".duckdb"));
  const hash = createHash("sha256").update(await readFile(file)).digest("hex");
  if (await sessionExists(db, id, hash)) {
    if (!reimport) return { status: "skipped", message: "übersprungen (schon importiert)" };
    await deleteSession(db, id);
  }

  const session = convertRecording(await readRecording(file), id);
  if (session.laps.length === 0) return { status: "skipped", message: "übersprungen (keine ganze Runde)" };

  await saveSession(db, session, basename(file), hash);
  const laps = session.laps.map((l) => `${l.start ? "Start" : l.lap}${l.valid ? "" : "*"}`).join(", ");
  return { status: "imported", message: `importiert, ${session.laps.length} Runden (${laps})` };
}
