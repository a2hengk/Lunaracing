using LunaAgent.Lmu;

namespace LunaAgent;

/// <summary>
/// Erfundene Daten: 8 GT3 auf einer ovalen Strecke. Zum Testen der Live-Seite ohne LMU.
/// Du führst, Platz 2 klebt 0,1 s hinter dir, damit der orange Zustand sichtbar ist.
/// </summary>
public sealed class DemoSource
{
    const double Length = 5800;
    const double S1End = Length / 3;
    const double S2End = Length * 2 / 3;
    readonly DateTime _start = DateTime.UtcNow;
    // Rundenzeit pro Auto. Platz 2 ist minimal schneller und kommt langsam näher.
    readonly double[] _pace = [112.0, 111.99, 112.3, 112.4, 112.6, 112.9, 113.0, 113.6];
    readonly double[] _offset = [0, -5.6, -66, -84, -185, -250, -275, -400];
    readonly string[] _names = ["Kevin Heng", "A. Rossi", "M. Laurent", "J. Becker", "S. Okafor", "L. Moreau", "T. Nakamura", "P. Silva"];
    readonly string[] _numbers = ["32", "46", "92", "77", "61", "27", "85", "54"];
    readonly string[] _compounds = ["Medium", "Medium", "Soft", "Medium", "Medium", "Soft", "Medium", "Hard"];

    public LiveFrame Next()
    {
        double t = (DateTime.UtcNow - _start).TotalSeconds + 125; // gleich in Runde 2
        var cars = new List<CarInfo>();
        for (int i = 0; i < _pace.Length; i++)
        {
            double dist = t / _pace[i] * Length + _offset[i];
            int laps = (int)Math.Floor(dist / Length);
            double lapDist = ((dist % Length) + Length) % Length;
            var (x, z) = Pos(lapDist);
            double sec = _pace[i] / 3;
            double into = lapDist / Length * _pace[i];
            double wobble = Math.Sin(laps * 1.7 + i) * 0.25;
            cars.Add(new CarInfo(i, 0, _names[i], $"Team #{_numbers[i]}", "GT3", i == 0, Math.Max(0, laps), lapDist,
                _pace[i] - 0.5, _pace[i] + wobble, sec - 0.2, 2 * sec - 0.3, 0, 0, 0, 0, false, 0,
                lapDist < S1End ? 1 : lapDist < S2End ? 2 : 0, x, z)
            {
                Number = _numbers[i],
                Compound = _compounds[i],
                // LMU liefert die Energie vermutlich nur fürs eigene Auto, in der Demo für alle
                Energy = Math.Max(0, 0.97 - (t / _pace[i]) * 0.04 - i * 0.003),
                LastS1 = laps > 0 ? sec - 0.1 + wobble / 3 : 0,
                LastS2 = laps > 0 ? 2 * sec + 0.15 + wobble / 2 : 0,
                CurS1 = lapDist >= S1End ? sec - 0.15 : 0,
                CurS2 = lapDist >= S2End ? 2 * sec - 0.2 : 0,
            });
            _ = into;
        }

        // Reihenfolge nach gefahrener Distanz, Abstände aus der Distanz
        double Total(CarInfo c) => c.Laps * Length + c.LapDist;
        var order = cars.OrderByDescending(Total).ToList();
        var placed = new List<CarInfo>();
        for (int i = 0; i < order.Count; i++)
        {
            var c = order[i];
            double ahead = i == 0 ? 0 : (Total(order[i - 1]) - Total(c)) / (Length / 112);
            double leader = i == 0 ? 0 : (Total(order[0]) - Total(c)) / (Length / 112);
            placed.Add(c with { Place = i + 1, BehindNextS = ahead, BehindLeaderS = leader });
        }
        var me = placed.First(c => c.IsPlayer);
        int myIdx = placed.IndexOf(me);
        double gapAhead = myIdx > 0 ? me.BehindNextS : 0;
        double gapBehind = myIdx < placed.Count - 1 ? placed[myIdx + 1].BehindNextS : 0;

        double phase = me.LapDist / Length * Math.PI * 8;
        double brake = Math.Clamp(-Math.Sin(phase) * 1.2 - 0.3, 0, 1);
        double speed = 160 + 110 * Math.Sin(phase - 0.6);
        double rpm = 5200 + 2300 * (0.5 + 0.5 * Math.Sin(phase * 3));
        double fuel = 90 - t / 112 * 3.38;
        double ve = Math.Max(0, 1 - t / 112 * 0.0403);
        var tyres = Enumerable.Range(0, 4).Select(w =>
        {
            bool left = w % 2 == 0;
            double outer = 79 + w * 1.5, mid = 85 + w * 0.7, inner = 88 + w * 0.8 + Math.Sin(t / 9) * 1.5;
            // LMU: links, Mitte, rechts aus Sicht des Autos. Innen ist bei linken Rädern rechts.
            double[] lmr = left ? [outer, mid, inner] : [inner, mid, outer];
            return new TyreInfo(lmr, 170 - w * 2, 0.96 - t / 4000 - w * 0.003, 464 + w * 15 + 120 * brake, 80, false);
        }).ToList();

        return new LiveFrame
        {
            Session = new SessionInfo("Autodromo Nazionale Monza", "Rennen", Length, Math.Max(0, 3600 - t), 0, 18, 33, 0, 5, 0, [0, 0, 0]),
            Player = new PlayerInfo(0, "Team WRT 2026 #32", Math.Max(60, speed), Math.Clamp((int)(speed / 45) + 1, 1, 6), rpm, 7600,
                0.8, brake, Math.Sin(phase) * 0.3, me.Laps + 1, me.LapDist / Length * 112, -0.14 + Math.Sin(t / 7) * 0.12, false,
                Math.Max(0, fuel), 110, ve, 51.2, 7, 11, 6, 11, 1,
                TcCut: 3, TcCutMax: 10, Migration: 2, MigrationMax: 5, Hybrid: true, Battery: 0.55 + 0.1 * Math.Sin(t / 5),
                BoostState: brake > 0.3 ? 3 : 2,
                TcActive: brake > 0.6, AbsActive: brake > 0.8, Limiter: false, WaterC: 76, OilC: 98,
                GapAheadS: gapAhead, GapBehindS: gapBehind, GapPlaceAheadS: gapAhead, GapPlaceBehindS: gapBehind, Tyres: tyres),
            Cars = placed,
        };
    }

    static (double X, double Z) Pos(double d)
    {
        double a = d / Length * Math.PI * 2;
        return (Math.Cos(a) * 900, Math.Sin(a) * 450 + Math.Sin(a * 3) * 80);
    }
}
