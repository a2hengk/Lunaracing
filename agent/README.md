# lunaracing Live-Agent (Phase 3)

Läuft auf dem Gaming-PC neben LMU, liest das Shared Memory des Spiels und zeigt die Daten live im Browser: auf dem Handy, einem Tablet oder einem zweiten Bildschirm im selben WLAN.

Die Live-Seite kommt vom Agent selbst und nicht von Vercel. Eine HTTPS-Seite darf nicht einfach eine unverschlüsselte Verbindung zu einem Gerät im Heimnetz aufmachen.

## Starten

Braucht das .NET 8 SDK (`winget install Microsoft.DotNet.SDK.8`).

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

- **Fahren:** Gang, Speed, Drehzahl, Gas und Bremse, TC, ABS, Map, Bremsbalance, ob TC oder ABS gerade eingreifen
- **Runde:** laufende Rundenzeit, Delta zur Bestzeit (rechnet LMU), Platz, letzte und beste Runde
- **Abstände:** zum Auto direkt vor und hinter dir **auf der Strecke** (`mTimeGapCarAhead/Behind`), zusätzlich zum Platz davor und dahinter in der Wertung
- **Sprit und Energie:** Stand, Verbrauch pro Runde (Schnitt der letzten 5 Runden ohne Tanken), wie viele Runden es noch reicht und was knapper ist, Sprit oder VE
- **Reifen und Bremsen:** Temperatur links, Mitte, rechts, Druck, Zustand und Bremstemperatur pro Rad
- **Strecke:** alle Autos als Punkte. Die Streckenlinie entsteht in deiner ersten Runde aus deinen eigenen Positionen.
- **Wertung:** alle Autos mit Abstand zur Spitze und zum Vordermann, letzter und bester Runde und Boxenstopps

Steam-IDs der anderen Fahrer stehen zwar im Shared Memory, werden aber nie gelesen.

## Wie er LMU liest

LMU (ab 1.2) legt das Shared Memory `LMU_Data` an und meldet jeden neuen Frame über die Events `LMU_Data_HoldEvent` und `LMU_Data_DataEvent`. Der Agent wartet auf beide und kopiert den Block dann unter LMUs eigenem Lock (`LMU_SharedMemoryLockData`), genau wie im Beispiel im SDK-Header.

Die Byte-Offsets in `Lmu/Layout.cs` stammen aus den SDK-Headern (`SharedMemoryInterface.hpp`, `InternalsPlugin.hpp`). Ausgerechnet hat sie clang mit `-target x86_64-pc-windows-msvc -fdump-record-layouts`, also mit genau dem Layout, das MSVC unter Windows x64 erzeugt. Die Header selbst liegen nicht im Repo, weil ihre Lizenz die Weitergabe verbietet.

Ändert ein LMU-Update das Layout, stimmen die Offsets nicht mehr. Der Agent merkt das an unplausiblen Werten (z. B. mehr als 104 Autos) und schreibt es auf die Seite. Dann die neuen Header aus `Le Mans Ultimate\Support\SharedMemoryInterface` nehmen und die Offsets neu erzeugen.

## Noch am PC zu prüfen

Getestet habe ich bisher nur den Parser gegen einen künstlichen Speicherblock (`--selftest`) und die Live-Seite im Demo-Modus. Mit laufendem LMU noch ansehen:

- Stimmen Speed, Gang, Sprit und Abstände mit dem Spiel überein?
- **Reifenzustand:** LMU beschreibt `mWear` nur als „0.0–1.0, Anteil vom Maximum“. Die Seite zeigt den Wert als Prozent. Fällt er im Stint, ist es der Restzustand. Steigt er, ist es der Verschleiß, und die Anzeige muss umgedreht werden.
- **Virtual Energy:** Ich nehme an, `mVirtualEnergy` ist ein Anteil von 0 bis 1. Zeigt die Seite Unsinn wie 9500 %, ist es eine andere Einheit.
