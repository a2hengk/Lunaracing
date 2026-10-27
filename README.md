# lunaracing

Telemetrie-Tracker für Le Mans Ultimate. Runden aufnehmen, speichern und danach vergleichen: Delta, Speed, Brems- und Gaspunkte, direkt auf der Streckenkarte.

Stand: Phase 1. Echte Sessions aus LMU lassen sich importieren und mit Streckenkarte und Rundenvergleich ansehen. Die Datenbank ist noch nicht angebunden, importierte Sessions liegen als JSON in `src/data/sessions/`.

## Starten

```bash
npm install
npm run dev     # http://localhost:3000
npm test
```

## Sessions importieren

1. In LMU unter Einstellungen › Gameplay die automatische Telemetrie-Aufnahme anschalten.
2. Fahren. Nach der Session zurück ins Menü, damit die Datei fertig geschrieben ist.
3. Im Projekt:

   ```bash
   npm run import -- "C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Telemetry"
   ```

   Liest alle `.duckdb`-Dateien im Ordner. Schon importierte Dateien und Aufnahmen ohne ganze Runde werden übersprungen.

Telemetrie-Dateien selbst werden nie committet (`.gitignore`), nur die JSON-Dateien daraus.

## Aufbau der LMU-Dateien

LMU (1.2, Format-Version 1) schreibt pro Aufnahme eine DuckDB-Datei:

- **Kanäle:** eine Tabelle pro Kanal ohne Zeitstempel. Zeile i gehört zur Zeit t0 + i / Frequenz, t0 ist der erste Wert von `GPS Time`. Frequenz und Einheit stehen in `channelsList`.
- **Events:** eine Tabelle pro Event mit `ts` und `value`, nur bei Änderungen. Liste in `eventsList`.
- **metadata:** Strecke, Layout, Auto, Klasse, Sessiontyp, Wetter, komplettes Setup als JSON.
- Runden über das Event `Lap`, offizielle Zeit über `Lap Time` am Rundenende. `Lap Time = 0` heißt: Runde nicht gewertet.
- Position als Pseudo-GPS (`GPS Latitude/Longitude`), reicht für die Streckenkarte.

`npm run inspect -- <datei>` listet Tabellen, Spalten und Beispielzeilen einer Datei auf.

## Was wo liegt

| Teil | Datei |
| --- | --- |
| LMU-Datei lesen und importieren | `scripts/import-lmu.mts` |
| Kanäle/Events in Runden umrechnen | `src/lib/lmu/convert.ts` |
| Runden aufs Distanz-Raster bringen, Delta | `src/lib/telemetry/compare.ts` |
| Strecken-Outline, SVG-Projektion | `src/lib/track/outline.ts` |
| Rundentabelle mit Referenz/Vergleich | `src/components/session-view.tsx` |
| Karte + Vergleichsgraph | `src/components/lap-analysis.tsx` |
| Datenbankschema (noch nicht benutzt) | `src/db/schema.ts`, `drizzle/` |
| Demo mit erfundenen Daten (`/demo`) | `src/lib/demo.ts` |

## Datenbank

```bash
cp .env.example .env   # DATABASE_URL eintragen (Neon)
npm run db:migrate
```

Rohdaten pro Runde gehören nicht als Zeilen in Postgres, sondern als Datei in einen Blob-Speicher. In Postgres stehen Runden, Sektoren und Kennzahlen.

## Konzept

Das ganze Konzept mit Datenquellen, Feature-Liste und Roadmap liegt als Doc in claude.ai (Projekt PrivateCodeProjekte, „lunaracing – Konzept“).
