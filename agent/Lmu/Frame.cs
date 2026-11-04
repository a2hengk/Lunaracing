namespace LunaAgent.Lmu;

/// <summary>Was der Agent pro Frame an die Live-Seite schickt. Bewusst ohne Steam-IDs.</summary>
public sealed record LiveFrame
{
    public string Status { get; init; } = "ok";
    public string? Message { get; init; }
    public SessionInfo? Session { get; init; }
    public PlayerInfo? Player { get; init; }
    public IReadOnlyList<CarInfo> Cars { get; init; } = [];
}

public sealed record SessionInfo(
    string Track,
    string Type,
    double TrackLengthM,
    double? TimeLeftS,
    int MaxLaps,
    double AmbientC,
    double TrackC,
    double Rain,
    int GamePhase,
    int YellowFlag,
    int[] SectorYellow);

public sealed record PlayerInfo(
    int Id,
    string Vehicle,
    double SpeedKmh,
    int Gear,
    double Rpm,
    double MaxRpm,
    double Throttle,
    double Brake,
    double Steering,
    int Lap,
    double LapTimeS,
    double DeltaBestS,
    bool LapInvalid,
    double FuelL,
    double FuelCapacityL,
    double VirtualEnergy,
    double BrakeBiasFrontPct,
    int Tc,
    int TcMax,
    int Abs,
    int AbsMax,
    int MotorMap,
    bool TcActive,
    bool AbsActive,
    bool Limiter,
    double WaterC,
    double OilC,
    double GapAheadS,
    double GapBehindS,
    double GapPlaceAheadS,
    double GapPlaceBehindS,
    IReadOnlyList<TyreInfo> Tyres);

/// <summary>Ein Rad, Reihenfolge VL, VR, HL, HR. Temperaturen links/Mitte/rechts aus Sicht des Autos.</summary>
public sealed record TyreInfo(double[] TempC, double PressureKpa, double Wear, double BrakeC, double CarcassC, bool Flat);

public sealed record CarInfo(
    int Id,
    int Place,
    string Driver,
    string Vehicle,
    string Class,
    bool IsPlayer,
    int Laps,
    double LapDist,
    double BestLapS,
    double LastLapS,
    double BestS1,
    double BestS2,
    double BehindNextS,
    int LapsBehindNext,
    double BehindLeaderS,
    int LapsBehindLeader,
    bool InPits,
    int Pitstops,
    int Sector,
    double X,
    double Z);
