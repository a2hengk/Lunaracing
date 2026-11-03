namespace LunaAgent.Lmu;

/// <summary>
/// Merkt sich Sprit und Virtual Energy am Anfang jeder Runde und rechnet daraus den
/// Verbrauch pro Runde und wie viele Runden es noch reicht. Runden mit Boxenstopp
/// (Sprit steigt) zählen nicht.
/// </summary>
public sealed class Consumption
{
    int _lap = -1;
    double _fuelAtStart;
    double _veAtStart;
    readonly Queue<(double Fuel, double Ve)> _recent = new();
    const int Keep = 5;

    public record Result(double? FuelPerLap, double? VePerLap, double? LapsLeftFuel, double? LapsLeftVe, int LapsCounted);

    public Result Update(PlayerInfo p)
    {
        if (p.Lap != _lap)
        {
            if (_lap >= 0 && p.Lap == _lap + 1)
            {
                double fuel = _fuelAtStart - p.FuelL;
                double ve = _veAtStart - p.VirtualEnergy;
                // Tanken oder Reset: ignorieren
                if (fuel > 0 && ve >= 0)
                {
                    _recent.Enqueue((fuel, ve));
                    while (_recent.Count > Keep) _recent.Dequeue();
                }
            }
            else if (p.Lap < _lap)
            {
                _recent.Clear(); // neue Session
            }
            _lap = p.Lap;
            _fuelAtStart = p.FuelL;
            _veAtStart = p.VirtualEnergy;
        }

        if (_recent.Count == 0) return new Result(null, null, null, null, 0);
        double fpl = _recent.Average(r => r.Fuel);
        double vpl = _recent.Average(r => r.Ve);
        return new Result(
            fpl,
            vpl > 0 ? vpl : null,
            fpl > 0 ? p.FuelL / fpl : null,
            vpl > 0 ? p.VirtualEnergy / vpl : null,
            _recent.Count);
    }
}
