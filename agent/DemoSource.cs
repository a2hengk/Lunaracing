using LunaAgent.Lmu;

namespace LunaAgent;

/// <summary>Erfundene Daten: 8 Autos auf einer ovalen Strecke. Zum Testen der Live-Seite ohne LMU.</summary>
public sealed class DemoSource
{
    const double Length = 5800;
    readonly DateTime _start = DateTime.UtcNow;
    readonly double[] _pace = [112.3, 112.1, 112.4, 112.0, 112.9, 113.3, 113.0, 114.2];
    readonly string[] _names = ["Kevin Heng", "A. Rossi", "M. Laurent", "J. Becker", "S. Okafor", "L. Moreau", "T. Nakamura", "P. Silva"];

    public LiveFrame Next()
    {
        double t = (DateTime.UtcNow - _start).TotalSeconds;
        var cars = new List<CarInfo>();
        for (int i = 0; i < _pace.Length; i++)
        {
            // jeder startet etwas weiter hinten, das eigene Auto (0) fährt knapp hinter Platz 1
            double dist = t / _pace[i] * Length - i * 40 + (i == 0 ? -55 : 0);
            int laps = (int)Math.Floor(dist / Length);
            double lapDist = ((dist % Length) + Length) % Length;
            var (x, z) = Pos(lapDist);
            cars.Add(new CarInfo(i, 0, _names[i], i == 0 ? "Team WRT 2026 #32" : $"GT3 #{10 + i}", "GT3", i == 0, Math.Max(0, laps), lapDist,
                _pace[i] - 0.4, _pace[i] + Math.Sin(laps + i) * 0.3, 36.9, 37.9, 0, 0, 0, 0, false, 0, (int)(lapDist / Length * 3 + 1) % 3, x, z));
        }
        // Reihenfolge nach gefahrener Distanz
        var order = cars.OrderByDescending(c => c.Laps * Length + c.LapDist).ToList();
        var placed = new List<CarInfo>();
        for (int i = 0; i < order.Count; i++)
        {
            var c = order[i];
            double ahead = i == 0 ? 0 : ((order[i - 1].Laps * Length + order[i - 1].LapDist) - (c.Laps * Length + c.LapDist)) / (Length / 112);
            double leader = i == 0 ? 0 : ((order[0].Laps * Length + order[0].LapDist) - (c.Laps * Length + c.LapDist)) / (Length / 112);
            placed.Add(c with { Place = i + 1, BehindNextS = ahead, BehindLeaderS = leader });
        }
        var me = placed.First(c => c.IsPlayer);
        int myIdx = placed.IndexOf(me);
        double gapAhead = myIdx > 0 ? me.BehindNextS : 0;
        double gapBehind = myIdx < placed.Count - 1 ? placed[myIdx + 1].BehindNextS : 0;

        double phase = me.LapDist / Length * Math.PI * 8;
        double throttle = Math.Clamp(0.5 + Math.Sin(phase) * 0.8, 0, 1);
        double brake = Math.Clamp(-Math.Sin(phase) * 1.2 - 0.3, 0, 1);
        double speed = 160 + 110 * Math.Sin(phase - 0.6);
        double fuel = 90 - t / 112 * 3.35;
        double ve = Math.Max(0, 1 - t / 112 * 0.04);
        var tyres = Enumerable.Range(0, 4).Select(w => new TyreInfo(
            [78 + w + Math.Sin(t / 10) * 3, 84 + w, 88 + w - Math.Cos(t / 9) * 2], 170 - w * 2, 1 - t / 3000 - w * 0.002, 420 + 120 * brake + w * 15, 80, false)).ToList();

        return new LiveFrame
        {
            Session = new SessionInfo("Autodromo Nazionale Monza", "Rennen", Length, Math.Max(0, 3600 - t), 0, 18, 33, 0, 5, 0, [0, 0, 0]),
            Player = new PlayerInfo(0, "Team WRT 2026 #32", Math.Max(60, speed), Math.Clamp((int)(speed / 45) + 1, 1, 6), 4500 + speed * 18, 8500,
                throttle, brake, Math.Sin(phase) * 0.3, me.Laps + 1, (t % 112.3), Math.Sin(t / 7) * 0.4, false, Math.Max(0, fuel), 110, ve,
                51.2, 7, 11, 6, 11, 1, brake > 0.6, brake > 0.8, false, 88, 101, gapAhead, gapBehind, gapAhead, gapBehind, tyres),
            Cars = placed,
        };
    }

    static (double X, double Z) Pos(double d)
    {
        double a = d / Length * Math.PI * 2;
        return (Math.Cos(a) * 900, Math.Sin(a) * 450 + Math.Sin(a * 3) * 80);
    }
}
