# lunaracing

Telemetrie-Tracker für Le Mans Ultimate. Runden aufnehmen, speichern und danach vergleichen: Delta, Speed, Brems- und Gaspunkte, direkt auf der Streckenkarte.

Stand: Phase 1 angefangen. Die Startseite läuft mit erfundenen Demo-Daten, bis der Import echter LMU-Dateien steht.

## Starten

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # Tests für Runden, Vergleich und Streckenkarte
```

## Was schon da ist

| Teil | Datei |
| --- | --- |
| Runden aus einem Messstrom schneiden, Bestzeit finden | `src/lib/telemetry/laps.ts` |
| Runden auf ein Distanz-Raster bringen, Delta berechnen | `src/lib/telemetry/compare.ts` |
| Strecken-Outline aus einer Runde bauen, in SVG einpassen | `src/lib/track/outline.ts` |
| Karte + Vergleichsgraph mit synchronem Hover | `src/components/lap-analysis.tsx` |
| Datenbankschema Phase 1 (Strecken, Autos, Sessions, Runden, Traces) | `src/db/schema.ts`, `drizzle/` |
| Bericht über den Inhalt einer LMU-Telemetriedatei | `scripts/inspect-duckdb.mts` |
| Demo-Strecke und zwei Demo-Runden | `src/lib/demo.ts` |

## Nächster Schritt: eine echte Datei ansehen

Die Struktur der `.duckdb`-Dateien von LMU ist nicht öffentlich dokumentiert. Bevor der Import geschrieben wird, braucht es einen Blick in eine echte Datei.

1. In LMU unter Einstellungen › Gameplay die automatische Telemetrie-Aufnahme anschalten (oder eine Taste für „Record Telemetry“ belegen).
2. Ein paar saubere Runden fahren.
3. Die Datei liegt unter `...\Le Mans Ultimate\UserData\Telemetry\`.
4. Im Projekt ausführen:

   ```bash
   npm run inspect -- "C:\Pfad\zu\Le Mans Ultimate\UserData\Telemetry\<datei>.duckdb"
   ```

5. Das Ergebnis `inspect-<datei>.md` committen. Daraus entsteht der Import.

Telemetrie-Dateien selbst werden nie committet (`.gitignore`).

## Datenbank

```bash
cp .env.example .env   # DATABASE_URL eintragen (Neon)
npm run db:migrate
```

Rohdaten pro Runde gehören nicht als Zeilen in Postgres, sondern als Datei in einen Blob-Speicher. In Postgres stehen Runden, Sektoren und Kennzahlen.

## Konzept

Das ganze Konzept mit Datenquellen, Feature-Liste und Roadmap liegt als Doc in claude.ai (Projekt PrivateCodeProjekte, „lunaracing – Konzept“).
