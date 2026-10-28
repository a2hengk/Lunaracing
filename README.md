# lunaracing

Telemetrie-Tracker für Le Mans Ultimate. Runden aufnehmen, speichern und danach vergleichen: Delta, Speed, Brems- und Gaspunkte, direkt auf der Streckenkarte.

Stand: Phase 2 fertig. Echte Sessions aus LMU lassen sich importieren und mit Streckenkarte, Telemetrie (Speed, Gas, Bremse, Delta), Kurven-Analyse, Fahrstil-Kennzahlen, Stint-Report und Sprit-/VE-Rechner ansehen. Sessions liegen in Neon (Postgres), die Messwerte pro Runde als JSON im öffentlichen Vercel-Blob-Speicher.

## Einrichten

```bash
npm install
npx vercel link                                          # einmal, mit dem Vercel-Projekt verbinden
npx vercel env pull .env.local --environment=production  # DATABASE_URL und BLOB_READ_WRITE_TOKEN holen
npm run dev     # http://localhost:3000
npm test
```

`--environment=production` ist wichtig: Sonst kann `DATABASE_URL` auf einen Entwicklungs-Branch von Neon zeigen, und importierte Sessions tauchen auf der Live-Seite nicht auf.

## Sessions importieren

1. In LMU unter Einstellungen › Gameplay die automatische Telemetrie-Aufnahme anschalten.
2. Fahren. Nach der Session zurück ins Menü, damit die Datei fertig geschrieben ist.
3. Im Projekt:

   ```bash
   npm run import -- "C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Telemetry"
   ```

   Liest alle `.duckdb`-Dateien im Ordner, lädt die Runden in den Blob-Speicher und schreibt alles andere in die Datenbank. Schon importierte Dateien und Aufnahmen ohne ganze Runde werden übersprungen. Die Session ist danach sofort auf der Seite, ohne Commit oder Deploy.

Die `.duckdb`-Dateien selbst landen nie im Blob oder im Repo, nur die daraus berechneten Runden. In den Dateien stehen auch Steam-ID und Setup.

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
| LMU-Datei lesen und importieren | `scripts/import-lmu.mts`, `scripts/lib/read-lmu.mts` |
| Session speichern (Neon + Blob) | `scripts/lib/save.mts`, `src/lib/lmu/store.ts` |
| Sessions für die App laden | `src/lib/data.ts` |
| Kanäle/Events in Runden umrechnen | `src/lib/lmu/convert.ts` |
| Runden aufs Distanz-Raster bringen, Delta | `src/lib/telemetry/compare.ts` |
| Strecken-Outline, SVG-Projektion | `src/lib/track/outline.ts` |
| Rundentabelle mit Referenz/Vergleich | `src/components/session-view.tsx` |
| Kurven erkennen, Kennzahlen pro Kurve | `src/lib/analysis/corners.ts`, `src/components/corner-table.tsx` |
| Fahrstil pro Runde (Vollgas, Trail-Braking, Rollen, Lupfer) | `src/lib/analysis/style.ts`, `src/components/lap-stats.tsx` |
| Kurvennamen pro Strecke (von Hand gepflegt) | `src/data/tracks.ts` |
| Stints: Pace, Konstanz, Trend, Verbrauch, Reifen | `src/lib/analysis/stints.ts`, `src/components/stint-report.tsx` |
| Sprit- und VE-Rechner fürs Rennen | `src/lib/analysis/strategy.ts`, `src/components/strategy-calc.tsx` |
| Karte + Vergleichsgraph | `src/components/lap-analysis.tsx` |
| Datenbankschema und Migrationen | `src/db/schema.ts`, `drizzle/`, `scripts/migrate.mjs` |
| Demo mit erfundenen Daten (`/demo`) | `src/lib/demo.ts` |

## Datenbank

- Migrationen laufen beim Build auf Vercel automatisch, aber nur für Production. Lokal: `npm run db:migrate`.
- Schema ändern: `src/db/schema.ts` anpassen, `npm run db:generate`, Migration committen.
- In Postgres stehen Strecken, Autos, Sessions und Runden mit Sektoren, Verbrauch, Fahrhilfen, Reifen und Track Limits. Die Messwerte pro Runde (Speed, Gas, Bremse, Lenkung, Gang, Position) liegen als JSON im Blob, der Verweis in `lap_traces`.
- Eine importierte Session wird in der App dauerhaft gecacht (`getSession`), weil sie sich nicht mehr ändert.
