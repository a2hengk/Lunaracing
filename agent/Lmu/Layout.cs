namespace LunaAgent.Lmu;

/// <summary>
/// Byte-Offsets im Shared Memory "LMU_Data", so wie MSVC die Structs aus dem LMU-SDK
/// (SharedMemoryInterface.hpp / InternalsPlugin.hpp, Stand LMU 1.2) unter Windows x64 anlegt.
/// Die rF-Structs sind mit #pragma pack(4) gepackt, die äußeren SharedMemory-Structs nicht.
///
/// Ermittelt mit clang (-target x86_64-pc-windows-msvc -fdump-record-layouts) aus den Headern.
/// Die Header selbst dürfen laut Lizenz nicht weitergegeben werden und liegen nicht im Repo.
/// Ändert LMU das Layout, passen diese Zahlen nicht mehr: dann meldet der Agent das.
/// </summary>
public static class Layout
{
    public const string MapName = "LMU_Data";
    public const string HoldEvent = "LMU_Data_HoldEvent";
    public const string DataEvent = "LMU_Data_DataEvent";
    public const string LockMapName = "LMU_SharedMemoryLockData";
    public const string LockEvent = "LMU_SharedMemoryLockEvent";

    public const int TotalSize = 324824;
    public const int MaxVehicles = 104;

    // SharedMemoryObjectOut
    public const int Generic = 0;
    public const int Paths = 332;
    public const int Scoring = 1632;
    public const int Telemetry = 128464;

    public static class GenericOff
    {
        public const int GameVersion = 64; // long (4 Byte)
    }

    // SharedMemoryScoringData
    public static class ScoringData
    {
        public const int Info = 0;
        public const int VehScoring = 560;
    }

    // ScoringInfoV01
    public static class Info
    {
        public const int TrackName = 0;        // char[64]
        public const int Session = 64;         // long: 0 Testtag, 1-4 Training, 5-8 Quali, 9 Warmup, 10-13 Rennen
        public const int CurrentET = 68;       // double
        public const int EndET = 76;           // double
        public const int MaxLaps = 84;         // long
        public const int LapDist = 88;         // double, Streckenlänge
        public const int NumVehicles = 104;    // long
        public const int GamePhase = 108;      // byte
        public const int YellowFlagState = 109;// sbyte
        public const int SectorFlag = 110;     // sbyte[3]
        public const int InRealtime = 115;     // bool
        public const int PlayerName = 116;     // char[32]
        public const int Raining = 220;        // double
        public const int AmbientTemp = 228;    // double °C
        public const int TrackTemp = 236;      // double °C
        public const int SessionTimeRemaining = 340; // float
    }

    // VehicleScoringInfoV01, 584 Byte
    public static class Veh
    {
        public const int Size = 584;
        public const int Id = 0;               // long
        public const int DriverName = 4;       // char[32]
        public const int VehicleName = 36;     // char[64]
        public const int TotalLaps = 100;      // short
        public const int Sector = 102;         // sbyte: 0 = Sektor 3, 1 = S1, 2 = S2
        public const int FinishStatus = 103;   // sbyte
        public const int LapDist = 104;        // double
        public const int BestSector1 = 128;    // double
        public const int BestSector2 = 136;
        public const int BestLapTime = 144;
        public const int LastSector1 = 152;
        public const int LastSector2 = 160;
        public const int LastLapTime = 168;
        public const int CurSector1 = 176;
        public const int CurSector2 = 184;
        public const int NumPitstops = 192;    // short
        public const int IsPlayer = 196;       // bool
        public const int InPits = 198;         // bool
        public const int Place = 199;          // byte
        public const int VehicleClass = 200;   // char[32]
        public const int TimeBehindNext = 232; // double
        public const int LapsBehindNext = 240; // long
        public const int TimeBehindLeader = 244;// double
        public const int LapsBehindLeader = 252;// long
        public const int PosX = 264;           // TelemVect3 mPos: x, y, z als double
        public const int PosZ = 280;
        public const int PitState = 457;       // byte
        public const int TimeIntoLap = 464;    // double
        public const int EstimatedLapTime = 472;// double
        public const int Flag = 504;           // byte
        public const int UnderYellow = 505;    // bool
        // 536: mSteamID, wird bewusst nie gelesen
    }

    // SharedMemoryTelemetryData
    public static class TelemData
    {
        public const int ActiveVehicles = 0;   // uint8
        public const int PlayerVehicleIdx = 1; // uint8
        public const int PlayerHasVehicle = 2; // bool
        public const int TelemInfo = 4;        // TelemInfoV01[104]
    }

    // TelemInfoV01, 1888 Byte
    public static class Tel
    {
        public const int Size = 1888;
        public const int Id = 0;
        public const int ElapsedTime = 12;     // double
        public const int LapNumber = 20;       // long
        public const int LapStartET = 24;      // double
        public const int VehicleName = 32;     // char[64]
        public const int PosX = 160;
        public const int PosZ = 176;
        public const int LocalVelX = 184;      // TelemVect3, m/s
        public const int Gear = 352;           // long: -1 R, 0 N
        public const int EngineRPM = 356;
        public const int WaterTemp = 364;
        public const int OilTemp = 372;
        public const int Throttle = 388;       // mUnfilteredThrottle 0..1
        public const int Brake = 396;
        public const int Steering = 404;       // -1..1
        public const int Fuel = 524;           // Liter
        public const int EngineMaxRPM = 532;
        public const int CurrentSector = 600;  // long
        public const int SpeedLimiter = 604;   // byte
        public const int FuelCapacity = 608;
        public const int RearBrakeBias = 664;  // double, Anteil hinten
        public const int DeltaBest = 696;      // double, s
        public const int BatteryCharge = 704;  // double 0..1
        public const int FrontCompoundName = 620; // char[18]
        public const int BoostMotorState = 744; // byte: 0 kein Hybrid, 1 aus, 2 Antrieb, 3 Rekuperation
        public const int LapInvalidated = 745; // bool
        public const int AbsActive = 746;
        public const int TcActive = 747;
        public const int Tc = 750;             // uint8
        public const int TcMax = 751;
        public const int Abs = 756;
        public const int AbsMax = 757;
        public const int MotorMap = 758;
        public const int TcCut = 754;
        public const int TcCutMax = 755;
        public const int Migration = 760;      // Bremsmigration, Stufe
        public const int MigrationMax = 761;
        public const int VirtualEnergy = 776;  // float
        public const int TimeGapCarAhead = 780;   // float, Auto vor dir auf der Strecke
        public const int TimeGapCarBehind = 784;
        public const int TimeGapPlaceAhead = 788; // float, eine Position vor dir in der Wertung
        public const int TimeGapPlaceBehind = 792;
        public const int Wheels = 848;         // TelemWheelV01[4]: VL, VR, HL, HR
    }

    // TelemWheelV01, 260 Byte
    public static class Wheel
    {
        public const int Size = 260;
        public const int BrakeTemp = 24;       // double, Kelvin
        public const int Pressure = 120;       // double, kPa
        public const int Temperature = 128;    // double[3], Kelvin, links/Mitte/rechts
        public const int Wear = 152;           // double, 0..1
        public const int Flat = 177;           // bool
        public const int CarcassTemp = 204;    // double, Kelvin
    }
}
