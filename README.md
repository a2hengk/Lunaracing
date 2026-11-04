# lunaracing

Telemetrie-Tracker für Le Mans Ultimate. Runden aufnehmen, speichern und danach vergleichen: Delta, Speed, Brems- und Gaspunkte, direkt auf der Streckenkarte.

Läuft auf [lunaracing.vercel.app](https://lunaracing.vercel.app). Sessions liegen in Neon (Postgres), die Messwerte pro Runde als JSON im öffentlichen Vercel-Blob-Speicher.

## Was es kann

- **Startseite:** Sessions nach Strecke gruppiert, Filter für Rennen, Quali und Training
- **Session-Seite** im Racing-Design:
  - **Überblick:** Delta der Vergleichsrunde, größter Verlust nach Kurvenname, Delta pro Sektor
  - **Karte:** eingefärbt nach Delta, Speed, Gas und Bremse oder Verkehr. Darauf fahren Punkte für dich, das Auto vor dir und die Referenz, als Wiedergabe oder dort, wo die Maus gerade ist.
  - **Rundentabelle:** Sektoren lila/grün/gelb, theoretische Bestzeit, Startrunde im Rennen
  - **Bestzeiten auf der Strecke:** PB-Verlauf über alle Sessions, die Bestrunde einer anderen Session als Referenz
  - **Telemetrie:** Speed, Gas, Bremse und Delta, mit Sektorgrenzen, Kurvennamen und Hover-Box
  - **Kurven:** Bremspunkt, Min-Speed, Gas, Trail-Braking, Rollen, Vordermann und Rad an Rad. Jede Kurve lässt sich mit ihrer eigenen Telemetrie aufklappen.
  - **Stint, Fahrstil & Verbrauch:** Pace, Konstanz, Trend, Reifen von oben, Sprit- und VE-Rechner
- **Import** von Hand oder automatisch mit dem Watcher
- **Live-Agent** für den zweiten Bildschirm oder das Handy, während du fährst (siehe unten)

## Jedes Mal vor dem Fahren

Zwei Terminals im Projektordner:

```powershell
# 1. Watcher: importiert jede Session nach dem Fahren automatisch
npm run watch -- "C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Telemetry"

# 2. Live-Agent: zeigt die Adresse fürs Handy/den zweiten Bildschirm an
cd agent
dotnet run
```

Danach LMU starten. Die Reihenfolge ist egal. Die Auswertung kommt von Vercel, dafür muss lokal nichts laufen.

## Einrichten

```bash
npm install
cp .env.example .env.local   # dann die drei Werte eintragen, siehe unten
npm run dev                  # http://localhost:3000
npm test
```

Die Werte für `.env.local` gibt es im Vercel-Dashboard des Projekts unter **Storage**:

- `DATABASE_URL`, `DATABASE_URL_UNPOOLED`: Neon-Datenbank → Tab „.env.local“ → „Show secret“ (oder Neon Console → Connect, mit und ohne Connection Pooling)
- `BLOB_READ_WRITE_TOKEN`: Blob Store → Tab „.env.local“ → „Show secret“

`npx vercel env pull` hilft hier nicht: Geheime Production-Werte schreibt es nur als Platzhalter `"[SENSITIVE]"`. Import und Migration erkennen das und sagen Bescheid.

## Sessions importieren

1. In LMU unter Einstellungen › Gameplay die automatische Telemetrie-Aufnahme anschalten.
2. Fahren. Nach der Session zurück ins Menü, damit die Datei fertig geschrieben ist.
3. Im Projekt:

   ```bash
   npm run import -- "C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Telemetry"
   ```

   Liest alle `.duckdb`-Dateien im Ordner, lädt die Runden in den Blob-Speicher und schreibt alles andere in die Datenbank. Schon importierte Dateien und Aufnahmen ohne ganze Runde werden übersprungen. Die Session ist danach sofort auf der Seite, ohne Commit oder Deploy.

   Kennt der Import neue Werte (z. B. Startrunde und Abstand zum Vordermann), liest `--neu` schon importierte Dateien noch einmal ein:

   ```bash
   npm run import -- --neu "C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Telemetry"
   ```

### Automatisch importieren (Watcher)

Statt nach jeder Session `npm run import` zu tippen, kann der Watcher neben dem Spiel laufen:

```bash
npm run watch -- "C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Telemetry"
```

Er holt beim Start alles nach, was noch nicht importiert ist, und importiert danach jede neue Aufnahme, sobald LMU sie fertig geschrieben hat (keine `.wal` mehr daneben und 15 s keine Änderung). Ohne Commit, ohne Deploy: die Session ist danach direkt auf der Seite.

Damit er beim Hochfahren von Windows startet: eine `.cmd`-Datei mit `cd /d C:\Local_Setups\Lunaracing && npm run watch -- "<Telemetry-Ordner>"` in den Autostart-Ordner legen (`Win+R` → `shell:startup`).

Der Watcher ersetzt `npm run import` nicht ganz. Wenn der Import neue Werte kennt, braucht es trotzdem einmal `npm run import -- --neu …`.

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
| LMU-Datei lesen und importieren | `scripts/import-lmu.mts`, `scripts/lib/import.mts`, `scripts/lib/read-lmu.mts` |
| Ordner beobachten und automatisch importieren | `scripts/watch-lmu.mts` |
| Session speichern (Neon + Blob) | `scripts/lib/save.mts`, `src/lib/lmu/store.ts` |
| Sessions für die App laden | `src/lib/data.ts` |
| Kanäle/Events in Runden umrechnen | `src/lib/lmu/convert.ts` |
| Runden aufs Distanz-Raster bringen, Delta | `src/lib/telemetry/compare.ts` |
| Strecken-Outline, SVG-Projektion | `src/lib/track/outline.ts` |
| Session-Seite: Aufbau, Rundentabelle, Referenz/Vergleich | `src/components/session-view.tsx` |
| Überblick oben links (Delta, Sektoren, Eckdaten) | `src/components/session-hero.tsx` |
| Theoretische Bestzeit | `src/lib/analysis/best.ts` |
| Bestzeiten über Sessions, Referenz aus anderer Session | `src/components/track-history.tsx`, `src/app/api/sessions/[id]/best-lap/route.ts` |
| Verkehr: Abstand zum Vordermann, Rad an Rad | `src/lib/analysis/traffic.ts` |
| Wiedergabe auf der Karte, Position des Vordermanns | `src/lib/analysis/replay.ts` |
| Farben, Schriften (Racing-Design) | `src/app/globals.css`, `src/components/site-header.tsx` |
| Kurven erkennen, Kennzahlen pro Kurve | `src/lib/analysis/corners.ts`, `src/components/corner-table.tsx` |
| Fahrstil pro Runde (Vollgas, Trail-Braking, Rollen, Lupfer) | `src/lib/analysis/style.ts`, `src/components/lap-stats.tsx` |
| Kurvennamen pro Strecke (von Hand gepflegt) | `src/data/tracks.ts` |
| Stints: Pace, Konstanz, Trend, Verbrauch, Reifen | `src/lib/analysis/stints.ts`, `src/components/stint-report.tsx` |
| Sprit- und VE-Rechner fürs Rennen | `src/lib/analysis/strategy.ts`, `src/components/strategy-calc.tsx` |
| Karte, Telemetrie-Graph, Kurven-Telemetrie | `src/components/lap-analysis.tsx` |
| Live-Agent (C#) und Live-Seite | `agent/`, `agent/wwwroot/index.html` |
| Datenbankschema und Migrationen | `src/db/schema.ts`, `drizzle/`, `scripts/migrate.mjs` |
| Demo mit erfundenen Daten (`/demo`) | `src/lib/demo.ts` |

## Datenbank

- Migrationen laufen beim Build auf Vercel automatisch, aber nur für Production. Lokal: `npm run db:migrate`.
- Schema ändern: `src/db/schema.ts` anpassen, `npm run db:generate`, Migration committen.
- In Postgres stehen Strecken, Autos, Sessions und Runden mit Sektoren, Verbrauch, Fahrhilfen, Reifen und Track Limits. Die Messwerte pro Runde (Speed, Gas, Bremse, Lenkung, Gang, Position) liegen als JSON im Blob, der Verweis in `lap_traces`.
- Eine importierte Session wird in der App dauerhaft gecacht (`getSession`), weil sie sich nicht mehr ändert.
- **Preview-Deployments und Neon-Branches:** Die Neon-Integration legt für jedes Preview-Deployment einen eigenen Datenbank-Branch an. Im kostenlosen Plan sind die Branches begrenzt. Ist das Limit voll, bricht der Vercel-Build nach einer Sekunde mit „Resource provisioning failed“ bzw. „Branch limit reached“ ab, ohne Build-Log. Dann in der Neon-Konsole die alten `preview/...`-Branches löschen (Vercel → Storage → Datenbank → Open in Neon → Branches), `main` stehen lassen. Oder das Anlegen der Branches für Preview in den Einstellungen der Integration ausschalten.

## Live während der Fahrt (Phase 3)

Der Live-Agent in [`agent/`](agent/README.md) läuft auf dem Gaming-PC neben LMU. Er liest das Shared Memory des Spiels und liefert eine eigene Live-Seite aus, fürs Handy, das Tablet oder einen zweiten Bildschirm mit 1920×1080 im selben WLAN. Darauf stehen:

- Wertung mit Reifen und Energie, Karte mit allen Autos
- Schaltlichter, Gang, Speed, Delta und Sektoren
- Abstände mit Trend
- Reifen und Bremsen, Box-Runde aus VE oder Sprit, Einstellungen

```powershell
cd agent
dotnet run            # wartet auf LMU, zeigt die Adresse fürs Handy
dotnet run -- --demo  # erfundene Daten, zum Ausprobieren ohne Spiel
```

Braucht ein .NET SDK ab Version 8, neuere wie .NET 10 gehen auch. Beim ersten Start fragt die Windows-Firewall: für private Netzwerke erlauben.

