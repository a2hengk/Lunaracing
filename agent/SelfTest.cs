using System.Buffers.Binary;
using System.Text;
using LunaAgent.Lmu;

namespace LunaAgent;

/// <summary>
/// Schreibt bekannte Werte an die Offsets aus <see cref="Layout"/> und prüft, ob der Parser
/// sie wieder herausliest. Prüft nicht, ob die Offsets zu LMU passen (das geht nur am PC mit
/// laufendem Spiel), sondern dass Parser und Layout zueinander passen.
/// </summary>
public static class SelfTest
{
    public static int Run()
    {
        var m = new byte[Layout.TotalSize];
        int info = Layout.Scoring + Layout.ScoringData.Info;
        Str(m, info + Layout.Info.TrackName, "Autodromo Nazionale Monza");
        I32(m, info + Layout.Info.Session, 10);
        I32(m, info + Layout.Info.NumVehicles, 2);
        m[info + Layout.Info.InRealtime] = 1;
        F64(m, info + Layout.Info.LapDist, 5793);
        F64(m, info + Layout.Info.TrackTemp, 33.3);
        F32(m, info + Layout.Info.SessionTimeRemaining, 1800);

        int veh = Layout.Scoring + Layout.ScoringData.VehScoring;
        for (int i = 0; i < 2; i++)
        {
            int v = veh + i * Layout.Veh.Size;
            I32(m, v + Layout.Veh.Id, 100 + i);
            Str(m, v + Layout.Veh.DriverName, i == 0 ? "Kevin" : "Rossi");
            m[v + Layout.Veh.Place] = (byte)(2 - i); // Kevin auf P2, Rossi auf P1
            m[v + Layout.Veh.IsPlayer] = (byte)(i == 0 ? 1 : 0);
            F64(m, v + Layout.Veh.BestLapTime, 111.873 + i);
            F64(m, v + Layout.Veh.TimeBehindNext, i == 0 ? 0.4 : 0);
            F64(m, v + Layout.Veh.PosX, 12.5);
            F64(m, v + Layout.Veh.PosZ, -40);
            Str(m, v + Layout.Veh.VehicleClass, "GT3");
            Str(m, v + Layout.Veh.VehicleName, i == 0 ? "Team WRT 2026 #32:WEC" : "Ohne Nummer");
            F64(m, v + Layout.Veh.LastSector1, 36.9);
            F64(m, v + Layout.Veh.LastSector2, 74.8);
            F64(m, v + Layout.Veh.CurSector1, 37.1);
        }

        int tel = Layout.Telemetry;
        m[tel + Layout.TelemData.ActiveVehicles] = 2;
        m[tel + Layout.TelemData.PlayerVehicleIdx] = 1;
        m[tel + Layout.TelemData.PlayerHasVehicle] = 1;
        int p = tel + Layout.TelemData.TelemInfo + 1 * Layout.Tel.Size;
        I32(m, p + Layout.Tel.Id, 100);
        Str(m, p + Layout.Tel.FrontCompoundName, "Medium");
        m[p + Layout.Tel.TcCut] = 3;
        m[p + Layout.Tel.Migration] = 2;
        m[p + Layout.Tel.BoostMotorState] = 3;
        F64(m, p + Layout.Tel.BatteryCharge, 0.64);
        // Telemetrie von Rossi (Index 0): ohne Energie
        int o = tel + Layout.TelemData.TelemInfo;
        I32(m, o + Layout.Tel.Id, 101);
        Str(m, o + Layout.Tel.FrontCompoundName, "Soft");
        F64(m, p + Layout.Tel.LocalVelX + 16, -70); // 70 m/s nach vorne = 252 km/h
        I32(m, p + Layout.Tel.Gear, 6);
        F64(m, p + Layout.Tel.Fuel, 42.5);
        F64(m, p + Layout.Tel.RearBrakeBias, 0.488);
        F32(m, p + Layout.Tel.TimeGapCarAhead, 0.35f);
        F32(m, p + Layout.Tel.VirtualEnergy, 0.62f);
        m[p + Layout.Tel.Tc] = 7;
        F64(m, p + Layout.Tel.ElapsedTime, 100);
        F64(m, p + Layout.Tel.LapStartET, 60);
        int w3 = p + Layout.Tel.Wheels + 3 * Layout.Wheel.Size;
        F64(m, w3 + Layout.Wheel.Temperature + 8, 273.15 + 85);
        F64(m, w3 + Layout.Wheel.Pressure, 165.4);

        var f = Parser.Parse(m);
        var errors = new List<string>();
        void Check(bool ok, string what) { if (!ok) errors.Add(what); }
        Check(f.Status == "ok", $"Status {f.Status} {f.Message}");
        Check(f.Session?.Track == "Autodromo Nazionale Monza", "Streckenname");
        Check(f.Session?.Type == "Rennen", "Sessiontyp");
        Check(f.Session?.TimeLeftS == 1800, "Restzeit");
        Check(f.Cars.Count == 2 && f.Cars[0].Driver == "Rossi" && f.Cars[1].IsPlayer, "Autos nach Platz sortiert");
        Check(Math.Abs(f.Cars[1].BehindNextS - 0.4) < 1e-9, "Abstand Vordermann");
        Check(f.Cars[1].Number == "32" && f.Cars[0].Number is null, "Startnummer aus dem Fahrzeugnamen");
        Check(f.Cars[1].Compound == "Medium" && f.Cars[0].Compound == "Soft", "Reifenmischung pro Auto");
        Check(f.Cars[1].Energy is { } en && Math.Abs(en - 0.62) < 1e-6 && f.Cars[0].Energy is null, "Energie pro Auto");
        Check(f.Cars[1].LastS1 == 36.9 && f.Cars[1].LastS2 == 74.8 && f.Cars[1].CurS1 == 37.1, "Sektorzeiten");
        Check(f.Player is not null, "Spieler");
        if (f.Player is { } pl)
        {
            Check(Math.Abs(pl.SpeedKmh - 252) < 1e-6, $"Speed {pl.SpeedKmh}");
            Check(pl.Gear == 6, "Gang");
            Check(Math.Abs(pl.FuelL - 42.5) < 1e-9, "Sprit");
            Check(Math.Abs(pl.BrakeBiasFrontPct - 51.2) < 1e-9, "Bremsbalance");
            Check(Math.Abs(pl.GapAheadS - 0.35) < 1e-6, "Abstand auf der Strecke");
            Check(pl.Tc == 7, "TC");
            Check(pl.TcCut == 3 && pl.Migration == 2, "TC Cut und Bremsmigration");
            Check(pl.Hybrid && pl.BoostState == 3 && Math.Abs(pl.Battery - 0.64) < 1e-9, "Hybrid und Batterie");
            Check(Math.Abs(pl.LapTimeS - 40) < 1e-9, "Rundenzeit");
            Check(Math.Abs(pl.Tyres[3].TempC[1] - 85) < 1e-9 && Math.Abs(pl.Tyres[3].PressureKpa - 165.4) < 1e-9, "Reifen HR");
        }

        // Kaputte Werte (anderes Layout) werden erkannt
        I32(m, info + Layout.Info.NumVehicles, 5000);
        Check(Parser.Parse(m).Status == "error", "falsches Layout erkannt");

        // Verbrauch: zwei Runden mit je 3,3 L
        var c = new Consumption();
        var basePl = f.Player!;
        c.Update(basePl with { Lap = 1, FuelL = 50, VirtualEnergy = 0.9 });
        c.Update(basePl with { Lap = 2, FuelL = 46.7, VirtualEnergy = 0.86 });
        var r = c.Update(basePl with { Lap = 3, FuelL = 43.4, VirtualEnergy = 0.82 });
        Check(r.FuelPerLap is { } fpl && Math.Abs(fpl - 3.3) < 1e-9, "Sprit pro Runde");
        Check(r.LapsLeftVe is { } lv && Math.Abs(lv - 20.5) < 1e-6, $"VE reicht noch {r.LapsLeftVe}");

        foreach (var e in errors) Console.WriteLine($"FEHLER: {e}");
        Console.WriteLine(errors.Count == 0 ? "Selbsttest ok" : $"{errors.Count} Fehler");
        return errors.Count == 0 ? 0 : 1;
    }

    static void I32(byte[] m, int o, int v) => BinaryPrimitives.WriteInt32LittleEndian(m.AsSpan(o), v);
    static void F64(byte[] m, int o, double v) => BinaryPrimitives.WriteDoubleLittleEndian(m.AsSpan(o), v);
    static void F32(byte[] m, int o, float v) => BinaryPrimitives.WriteSingleLittleEndian(m.AsSpan(o), v);
    static void Str(byte[] m, int o, string s) => Encoding.UTF8.GetBytes(s).CopyTo(m, o);
}
