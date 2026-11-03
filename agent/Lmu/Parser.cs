using System.Buffers.Binary;
using System.Text;

namespace LunaAgent.Lmu;

/// <summary>Liest einen kopierten Speicherblock von "LMU_Data" an den Offsets aus <see cref="Layout"/>.</summary>
public static class Parser
{
    public static LiveFrame Parse(ReadOnlySpan<byte> m)
    {
        if (m.Length < Layout.TotalSize) return new LiveFrame { Status = "error", Message = "Speicherblock zu klein" };

        var info = m.Slice(Layout.Scoring + Layout.ScoringData.Info);
        int numVehicles = I32(info, Layout.Info.NumVehicles);
        var tel = m.Slice(Layout.Telemetry);
        int active = tel[Layout.TelemData.ActiveVehicles];
        int playerIdx = tel[Layout.TelemData.PlayerVehicleIdx];
        bool hasPlayer = tel[Layout.TelemData.PlayerHasVehicle] != 0;

        // Plausibilität: passt das Layout noch zur LMU-Version?
        if (numVehicles is < 0 or > Layout.MaxVehicles || active > Layout.MaxVehicles)
        {
            return new LiveFrame
            {
                Status = "error",
                Message = $"Unerwartete Werte im Shared Memory (Autos {numVehicles}/{active}). Hat ein LMU-Update das Layout geändert?",
            };
        }

        bool inRealtime = info[Layout.Info.InRealtime] != 0;
        int session = I32(info, Layout.Info.Session);
        double current = F64(info, Layout.Info.CurrentET);
        double end = F64(info, Layout.Info.EndET);
        float remaining = F32(info, Layout.Info.SessionTimeRemaining);
        var sessionInfo = new SessionInfo(
            Track: Str(info, Layout.Info.TrackName, 64),
            Type: SessionType(session),
            TrackLengthM: F64(info, Layout.Info.LapDist),
            TimeLeftS: remaining > 0 ? remaining : end > 0 && end > current ? end - current : null,
            MaxLaps: I32(info, Layout.Info.MaxLaps),
            AmbientC: F64(info, Layout.Info.AmbientTemp),
            TrackC: F64(info, Layout.Info.TrackTemp),
            Rain: F64(info, Layout.Info.Raining),
            GamePhase: info[Layout.Info.GamePhase],
            YellowFlag: (sbyte)info[Layout.Info.YellowFlagState],
            SectorYellow: [(sbyte)info[Layout.Info.SectorFlag], (sbyte)info[Layout.Info.SectorFlag + 1], (sbyte)info[Layout.Info.SectorFlag + 2]]);

        var cars = new List<CarInfo>(numVehicles);
        var veh = m.Slice(Layout.Scoring + Layout.ScoringData.VehScoring);
        for (int i = 0; i < numVehicles; i++)
        {
            var v = veh.Slice(i * Layout.Veh.Size, Layout.Veh.Size);
            cars.Add(new CarInfo(
                Id: I32(v, Layout.Veh.Id),
                Place: v[Layout.Veh.Place],
                Driver: Str(v, Layout.Veh.DriverName, 32),
                Vehicle: Str(v, Layout.Veh.VehicleName, 64),
                Class: Str(v, Layout.Veh.VehicleClass, 32),
                IsPlayer: v[Layout.Veh.IsPlayer] != 0,
                Laps: I16(v, Layout.Veh.TotalLaps),
                LapDist: F64(v, Layout.Veh.LapDist),
                BestLapS: F64(v, Layout.Veh.BestLapTime),
                LastLapS: F64(v, Layout.Veh.LastLapTime),
                BestS1: F64(v, Layout.Veh.BestSector1),
                BestS2: F64(v, Layout.Veh.BestSector2),
                BehindNextS: F64(v, Layout.Veh.TimeBehindNext),
                LapsBehindNext: I32(v, Layout.Veh.LapsBehindNext),
                BehindLeaderS: F64(v, Layout.Veh.TimeBehindLeader),
                LapsBehindLeader: I32(v, Layout.Veh.LapsBehindLeader),
                InPits: v[Layout.Veh.InPits] != 0,
                Pitstops: I16(v, Layout.Veh.NumPitstops),
                Sector: (sbyte)v[Layout.Veh.Sector],
                X: F64(v, Layout.Veh.PosX),
                Z: F64(v, Layout.Veh.PosZ)));
        }
        cars.Sort((a, b) => a.Place.CompareTo(b.Place));

        PlayerInfo? player = null;
        if (hasPlayer && playerIdx < active)
        {
            var p = tel.Slice(Layout.TelemData.TelemInfo + playerIdx * Layout.Tel.Size, Layout.Tel.Size);
            double vx = F64(p, Layout.Tel.LocalVelX), vy = F64(p, Layout.Tel.LocalVelX + 8), vz = F64(p, Layout.Tel.LocalVelX + 16);
            var tyres = new List<TyreInfo>(4);
            for (int w = 0; w < 4; w++)
            {
                var wh = p.Slice(Layout.Tel.Wheels + w * Layout.Wheel.Size, Layout.Wheel.Size);
                tyres.Add(new TyreInfo(
                    TempC: [K(F64(wh, Layout.Wheel.Temperature)), K(F64(wh, Layout.Wheel.Temperature + 8)), K(F64(wh, Layout.Wheel.Temperature + 16))],
                    PressureKpa: F64(wh, Layout.Wheel.Pressure),
                    Wear: F64(wh, Layout.Wheel.Wear),
                    BrakeC: K(F64(wh, Layout.Wheel.BrakeTemp)),
                    CarcassC: K(F64(wh, Layout.Wheel.CarcassTemp)),
                    Flat: wh[Layout.Wheel.Flat] != 0));
            }
            double elapsed = F64(p, Layout.Tel.ElapsedTime);
            player = new PlayerInfo(
                Id: I32(p, Layout.Tel.Id),
                Vehicle: Str(p, Layout.Tel.VehicleName, 64),
                SpeedKmh: Math.Sqrt(vx * vx + vy * vy + vz * vz) * 3.6,
                Gear: I32(p, Layout.Tel.Gear),
                Rpm: F64(p, Layout.Tel.EngineRPM),
                MaxRpm: F64(p, Layout.Tel.EngineMaxRPM),
                Throttle: F64(p, Layout.Tel.Throttle),
                Brake: F64(p, Layout.Tel.Brake),
                Steering: F64(p, Layout.Tel.Steering),
                Lap: I32(p, Layout.Tel.LapNumber),
                LapTimeS: Math.Max(0, elapsed - F64(p, Layout.Tel.LapStartET)),
                DeltaBestS: F64(p, Layout.Tel.DeltaBest),
                LapInvalid: p[Layout.Tel.LapInvalidated] != 0,
                FuelL: F64(p, Layout.Tel.Fuel),
                FuelCapacityL: F64(p, Layout.Tel.FuelCapacity),
                VirtualEnergy: F32(p, Layout.Tel.VirtualEnergy),
                BrakeBiasFrontPct: (1 - F64(p, Layout.Tel.RearBrakeBias)) * 100,
                Tc: p[Layout.Tel.Tc],
                TcMax: p[Layout.Tel.TcMax],
                Abs: p[Layout.Tel.Abs],
                AbsMax: p[Layout.Tel.AbsMax],
                MotorMap: p[Layout.Tel.MotorMap],
                TcActive: p[Layout.Tel.TcActive] != 0,
                AbsActive: p[Layout.Tel.AbsActive] != 0,
                Limiter: p[Layout.Tel.SpeedLimiter] != 0,
                WaterC: F64(p, Layout.Tel.WaterTemp),
                OilC: F64(p, Layout.Tel.OilTemp),
                GapAheadS: F32(p, Layout.Tel.TimeGapCarAhead),
                GapBehindS: F32(p, Layout.Tel.TimeGapCarBehind),
                GapPlaceAheadS: F32(p, Layout.Tel.TimeGapPlaceAhead),
                GapPlaceBehindS: F32(p, Layout.Tel.TimeGapPlaceBehind),
                Tyres: tyres);
        }

        return new LiveFrame
        {
            Status = inRealtime ? "ok" : "menu",
            Message = inRealtime ? null : "LMU läuft, du bist aber nicht auf der Strecke (Menü oder Monitor).",
            Session = sessionInfo,
            Player = player,
            Cars = cars,
        };
    }

    public static string SessionType(int s) => s switch
    {
        0 => "Testtag",
        >= 1 and <= 4 => "Training",
        >= 5 and <= 8 => "Qualifying",
        9 => "Warmup",
        >= 10 and <= 13 => "Rennen",
        _ => "Unbekannt",
    };

    static double K(double kelvin) => kelvin > 0 ? kelvin - 273.15 : 0;
    static int I32(ReadOnlySpan<byte> s, int o) => BinaryPrimitives.ReadInt32LittleEndian(s.Slice(o));
    static short I16(ReadOnlySpan<byte> s, int o) => BinaryPrimitives.ReadInt16LittleEndian(s.Slice(o));
    static double F64(ReadOnlySpan<byte> s, int o) => Clean(BinaryPrimitives.ReadDoubleLittleEndian(s.Slice(o)));
    static float F32(ReadOnlySpan<byte> s, int o) => (float)Clean(BinaryPrimitives.ReadSingleLittleEndian(s.Slice(o)));
    // NaN/Unendlich würden das JSON kaputt machen
    static double Clean(double v) => double.IsFinite(v) ? v : 0;

    static string Str(ReadOnlySpan<byte> s, int o, int len)
    {
        var b = s.Slice(o, len);
        int end = b.IndexOf((byte)0);
        if (end < 0) end = len;
        return Encoding.UTF8.GetString(b.Slice(0, end)).Trim();
    }
}
