# lunaracing Live-Agent (Phase 3)

Läuft auf dem Gaming-PC neben LMU, liest das Shared Memory des Spiels und zeigt die Daten live im Browser: auf dem Handy, einem Tablet oder einem zweiten Bildschirm im selben WLAN.

Die Live-Seite kommt vom Agent selbst und nicht von Vercel. Eine HTTPS-Seite darf nicht einfach eine unverschlüsselte Verbindung zu einem Gerät im Heimnetz aufmachen.

## Starten

Braucht ein .NET SDK ab Version 8 (`winget install Microsoft.DotNet.SDK.8`). Neuere Versionen wie .NET 10 gehen auch, der Agent läuft dann auf der installierten Version.

```powershell
cd agent
dotnet run
```

Der Agent zeigt dann die Adresse fürs Handy an, z. B. `http://192.168.178.27:5180`. Beim ersten Start fragt die Windows-Firewall: für **private Netzwerke** erlauben.

LMU kann vor oder nach dem Agent starten. Läuft das Spiel noch nicht, versucht er es alle 2 Sekunden neu.

```powershell
dotnet run -- --demo        # erfundene Daten, zum Ausprobieren ohne LMU
dotnet run -- --port 5200   # anderer Port
dotnet run -- --selftest    # prüft, ob Parser und Offsets zusammenpassen
```

Als einzelne `.exe` ohne `dotnet run`:

```powershell
dotnet publish -c Release -r win-x64 --self-contained false -o publish
.\publish\LunaAgent.exe
```

## Was die Live-Seite zeigt

Gedacht für einen zweiten Bildschirm mit 1920×1080 neben dem Rad (drei Spalten, nichts scrollt). Auf dem Tablet zwei Spalten, auf dem Handy eine.

- **Kopfzeile:** Platz, Session und Restzeit, „Runde 2 von etwa 31“ (Restzeit geteilt durch deine letzte Runde), Flagge, Strecke und Temperaturen
- **Feld:**
  - Wertung mit Platz, Startnummer, Fahrer, Abstand zum Führenden, Reifenmischung (S/M/H) und Energie
  - Autos unter 1 s zu dir sind orange
  - bei mehreren Klassen ein farbiger Strich pro Klasse und der Abstand innerhalb der Klasse
  - Karte mit allen Autos und Platznummer, Sektorgrenzen da, wo du den Sektor wechselst
- **Du:**
  - 15 Schaltlichter, Gang, Speed, Drehzahl
  - Delta zur Bestzeit, aktuelle, letzte und beste Runde
  - drei Sektoren: der laufende mit Live-Delta, die anderen lila/grün/gelb gegen deine beste in dieser Session
  - „Hinter dir“ und „Vor dir“ mit Trend pro Runde, Abstandsband ±3 s
- **Auto:**
  - Reifen mit Druck, drei Temperaturen (innen immer zur Fahrzeugmitte), Zustand und Bremse
  - „Box spätestens Ende Runde N“ aus VE oder Sprit, was knapper ist
  - Batterie bei Hybrid
  - TC, TC Cut, ABS, Map, Bremsbalance, Wasser, Öl, Bremsmigration

Die Schriften (Saira, Saira Condensed, OFL) liegen in `wwwroot/fonts`, damit die Seite im Heimnetz ohne Google Fonts läuft.

Steam-IDs der anderen Fahrer stehen zwar im Shared Memory, werden aber nie gelesen.

## Wie er LMU liest

LMU (ab 1.2) legt das Shared Memory `LMU_Data` an und meldet jeden neuen Frame über die Events `LMU_Data_HoldEvent` und `LMU_Data_DataEvent`. Der Agent wartet auf beide und kopiert den Block dann unter LMUs eigenem Lock (`LMU_SharedMemoryLockData`), genau wie im Beispiel im SDK-Header.

Die Byte-Offsets in `Lmu/Layout.cs` stammen aus den SDK-Headern (`SharedMemoryInterface.hpp`, `InternalsPlugin.hpp`). Ausgerechnet hat sie clang mit `-target x86_64-pc-windows-msvc -fdump-record-layouts`, also mit genau dem Layout, das MSVC unter Windows x64 erzeugt. Die Header selbst liegen nicht im Repo, weil ihre Lizenz die Weitergabe verbietet.

Ändert ein LMU-Update das Layout, stimmen die Offsets nicht mehr. Der Agent merkt das an unplausiblen Werten (z. B. mehr als 104 Autos) und schreibt es auf die Seite. Dann die neuen Header aus `Le Mans Ultimate\Support\SharedMemoryInterface` nehmen und die Offsets neu erzeugen.

## Noch am PC zu prüfen

Getestet habe ich bisher nur den Parser gegen einen künstlichen Speicherblock (`--selftest`) und die Live-Seite im Demo-Modus. Mit laufendem LMU noch ansehen:

- Stimmen Speed, Gang, Sprit und Abstände mit dem Spiel überein?
- **Reifenzustand:** LMU beschreibt `mWear` nur als „0.0–1.0, Anteil vom Maximum“. Die Seite zeigt den Wert als Prozent. Fällt er im Stint, ist es der Restzustand. Steigt er, ist es der Verschleiß, und die Anzeige muss umgedreht werden.
- **Reifenmischung** (`mFrontTireCompoundName`): Die Seite macht aus „Soft“, „Medium“, „Hard“ und „Wet“ die Buchstaben S/M/H/W. Heißt die Mischung bei LMU anders, steht ihr erster Buchstabe in grau da.
- **Energie pro Auto** (`mVirtualEnergy` aus der Telemetrie jedes Autos): Wahrscheinlich füllt LMU den Wert nur für dein Auto, dann bleibt die Spalte bei den anderen leer.
- **Startnummer:** Ein eigenes Feld gibt es nicht. Sie kommt aus dem Fahrzeugnamen („#32“).
- **Sektorzeiten** (`mCurSector1/2`, `mLastSector1/2`, kumuliert): Prüfen, ob „S2 letzte Runde“ zu den Zeiten im Spiel passt.
- **Sektorgrenzen auf der Karte** kommen aus dem Wechsel von `mSector`. Liegen sie an der falschen Stelle, ist die Reihenfolge 1, 2, 0 anders als gedacht.
- **TC Cut, Bremsmigration** (`mTCCut`, `mMigration`): Die Seite zeigt die Stufe, nicht den Wert. Bremsmigration nur bei Hybrid oder wenn `mMigrationMax` über 0 liegt.
- **Batterie** (`mBatteryChargeFraction`) und „lädt“/„Boost“ aus `mElectricBoostMotorState`: nur bei Hybrid sichtbar.
- **Flagge:** Aus `mGamePhase`, `mYellowFlagState` und `mSectorFlag`. Bei `mSectorFlag` sagt selbst der Header, dass die Zuordnung zu den Sektoren unsicher ist. Den Wert 11 aus den Aufnahmen werte ich nicht als Gelb.
- **Schaltlichter:** fangen bei 70 % der Maximaldrehzahl an. Passt das nicht zum Auto, in `renderDrive` anpassen.
- **Virtual Energy:** Ich nehme an, `mVirtualEnergy` ist ein Anteil von 0 bis 1. Zeigt die Seite Unsinn wie 9500 %, ist es eine andere Einheit.
