import type { DrivingStyle } from "@/lib/analysis/style";
import type { StoredLap } from "@/lib/lmu/session";

const de = (v: number | undefined, digits = 0) =>
  v === undefined
    ? "–"
    : v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function LapStats({ laps, styles }: { laps: StoredLap[]; styles: Map<number, DrivingStyle> }) {
  const first = laps.at(0)?.aids;
  const settingsChanged = laps.some(
    (l) =>
      l.aids?.tcLevel !== first?.tcLevel ||
      l.aids?.absLevel !== first?.absLevel ||
      l.aids?.engineMap !== first?.engineMap ||
      l.aids?.brakeBiasFront !== first?.brakeBiasFront,
  );

  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Fahrstil & Verbrauch</h2>
        {first && (
          <span className="text-xs text-muted">
            TC {first.tcLevel ?? "–"} · ABS {first.absLevel ?? "–"} · Map {first.engineMap ?? "–"} · Bremsbalance{" "}
            {de(first.brakeBiasFront, 1)} % vorne
            {settingsChanged && " · in einzelnen Runden verstellt"}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-medium">Runde</th>
              <th className="py-2 pr-3 font-medium" title="Anteil der Strecke mit mindestens 98 % Gas">Vollgas</th>
              <th className="py-2 pr-3 font-medium" title="Anteil der Strecke auf der Bremse">Bremse</th>
              <th className="py-2 pr-3 font-medium" title="Anteil der Bremsstrecke, auf der gleichzeitig gelenkt wird">Trail-Braking</th>
              <th className="py-2 pr-3 font-medium" title="Meter ohne Gas und ohne Bremse">Rollen</th>
              <th className="py-2 pr-3 font-medium" title="Gas kurz zurückgenommen, ohne zu bremsen">Lupfer</th>
              <th className="py-2 pr-3 font-medium">ABS</th>
              <th className="py-2 pr-3 font-medium">TC</th>
              <th className="py-2 pr-3 font-medium">Sprit</th>
              <th className="py-2 pr-3 font-medium">VE</th>
              <th className="py-2 pr-3 font-medium" title="Verschleiß in der Runde, Durchschnitt der vier Reifen">Reifen</th>
              <th className="py-2 font-medium" title="Meter mit allen vier Rädern neben der Strecke, geschätzt">Neben Strecke</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {laps.map((l) => {
              const s = styles.get(l.lap);
              const wear = l.usage?.tyreWearPct;
              const off = (l.offTrack ?? []).reduce((a, o) => a + (o.to - o.from), 0);
              return (
                <tr key={l.lap} className={`border-b border-line last:border-0 ${l.valid ? "" : "text-muted"}`}>
                  <td className="py-2 pr-3 font-sans">{l.lap}</td>
                  <td className="py-2 pr-3">{de(s?.fullThrottlePct)} %</td>
                  <td className="py-2 pr-3">{de(s?.brakingPct)} %</td>
                  <td className="py-2 pr-3">{de(s?.trailBrakePct)} %</td>
                  <td className="py-2 pr-3">{de(s?.coastM)} m</td>
                  <td className="py-2 pr-3">{s?.throttleLifts ?? "–"}</td>
                  <td className="py-2 pr-3">{de(l.aids?.absSeconds, 1)} s</td>
                  <td className="py-2 pr-3">{de(l.aids?.tcSeconds, 1)} s</td>
                  <td className="py-2 pr-3">{de(l.usage?.fuelL, 2)} L</td>
                  <td className="py-2 pr-3">{de(l.usage?.vePct, 2)} %</td>
                  <td className="py-2 pr-3">{wear ? `${de(wear.reduce((a, b) => a + b, 0) / 4, 2)} %` : "–"}</td>
                  <td className={`py-2 ${off > 0 ? "text-[hsl(30_95%_58%)]" : ""}`}>{off > 0 ? `${de(off)} m` : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
