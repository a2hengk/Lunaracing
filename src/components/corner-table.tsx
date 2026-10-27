"use client";

import type { Corner, CornerStats } from "@/lib/analysis/corners";

export type CornerRow = {
  corner: Corner;
  ref: CornerStats;
  cmp: CornerStats;
  dt: number;
  /** Meter neben der Strecke in dieser Kurve, Vergleichsrunde */
  cmpOffM: number;
};
type Row = CornerRow;

const de = (v: number, digits = 0) =>
  v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * Unterschied als Wort: positiv = Vergleichsrunde später/mehr.
 * Unter 10 m gilt als gleich: die Runden liegen auf einem 5-m-Raster, ein Schritt ist Messrauschen.
 */
function shift(ref: number | null, cmp: number | null, later = "später", earlier = "früher") {
  if (ref === null || cmp === null) return null;
  const d = cmp - ref;
  if (Math.abs(d) < 10) return "gleich";
  return `${de(Math.abs(d))} m ${d > 0 ? later : earlier}`;
}

/** Ein Satz zur Kurve mit dem größten Zeitverlust: was in der Vergleichsrunde anders war. */
export function lossSummary(row: Row, labels: { reference: string; compare: string }): string {
  const { ref, cmp, corner, dt } = row;
  const parts: string[] = [];
  const brake = shift(ref.brakeAt, cmp.brakeAt);
  if (brake && brake !== "gleich") parts.push(`${brake} gebremst`);
  const dv = cmp.minSpeed - ref.minSpeed;
  if (Math.abs(dv) >= 3) parts.push(`${de(Math.abs(dv))} km/h ${dv < 0 ? "langsamer" : "schneller"} am Scheitel`);
  const gas = shift(ref.throttleAt, cmp.throttleAt);
  if (gas && gas !== "gleich") parts.push(`${gas} am Gas`);
  if (cmp.coastM - ref.coastM >= 20) parts.push(`${de(cmp.coastM - ref.coastM)} m mehr gerollt`);
  if (row.cmpOffM > 0) parts.push(`${de(row.cmpOffM)} m neben der Strecke`);
  const what = parts.length ? parts.join(", ") : "keine klare Ursache in Bremse, Speed oder Gas";
  return `Kurve ${corner.n}${corner.name ? ` (${corner.name})` : ""}: ${labels.compare} ${dt > 0 ? "verliert" : "gewinnt"} ${de(Math.abs(dt), 2)} s gegenüber ${labels.reference}. ${what.charAt(0).toUpperCase()}${what.slice(1)}.`;
}

export function CornerTable({
  rows,
  labels,
  activeCorner,
  onSelect,
}: {
  rows: Row[];
  labels: { reference: string; compare: string };
  activeCorner: number | null;
  onSelect: (c: Corner) => void;
}) {
  const worst = rows.toSorted((a, b) => b.dt - a.dt).at(0);
  const best = rows.toSorted((a, b) => a.dt - b.dt).at(0);

  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Kurven</h2>
        <span className="text-xs text-muted">
          {labels.compare} gegen {labels.reference} · Klick auf eine Zeile zoomt auf die Kurve
        </span>
      </div>

      {worst && worst.dt > 0.05 && (
        <p className="mb-2 rounded-lg bg-bg px-3 py-2 text-sm">
          <span className="text-loss">Größter Verlust · </span>
          {lossSummary(worst, labels)}
        </p>
      )}
      {best && best.dt < -0.05 && (
        <p className="mb-3 rounded-lg bg-bg px-3 py-2 text-sm">
          <span className="text-good">Größter Gewinn · </span>
          {lossSummary(best, labels)}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-medium">Kurve</th>
              <th className="py-2 pr-3 font-medium">Bremspunkt</th>
              <th className="py-2 pr-3 font-medium">Min-Speed (km/h)</th>
              <th className="py-2 pr-3 font-medium">Gas wieder an</th>
              <th className="py-2 pr-3 font-medium">Trail-Braking (m)</th>
              <th className="py-2 pr-3 font-medium">Rollen (m)</th>
              <th className="py-2 text-right font-medium">Zeit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dv = r.cmp.minSpeed - r.ref.minSpeed;
              return (
                <tr
                  key={r.corner.n}
                  onClick={() => onSelect(r.corner)}
                  className={`cursor-pointer border-b border-line transition last:border-0 hover:bg-bg ${activeCorner === r.corner.n ? "bg-bg" : ""}`}
                >
                  <td className="py-2 pr-3">
                    <span className="font-semibold">{r.corner.n}</span>
                    {r.corner.name && <span className="ml-2">{r.corner.name}</span>}
                    <span className="ml-2 text-xs text-muted">bei {de(r.corner.apex / 1000, 1)} km</span>
                  </td>
                  <td className="py-2 pr-3">
                    {r.ref.brakeAt === null && r.cmp.brakeAt === null ? (
                      <span className="text-muted">ohne Bremse</span>
                    ) : (
                      shift(r.ref.brakeAt, r.cmp.brakeAt) ?? <span className="text-muted">nur eine Runde bremst</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono tabular-nums">
                    <span className="text-ref">{de(r.ref.minSpeed)}</span>
                    <span className="text-muted"> → </span>
                    <span className="text-accent">{de(r.cmp.minSpeed)}</span>
                    {Math.abs(dv) >= 1 && (
                      <span className={`ml-2 text-xs ${dv < 0 ? "text-loss" : "text-good"}`}>
                        {dv > 0 ? "+" : "−"}
                        {de(Math.abs(dv))}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{shift(r.ref.throttleAt, r.cmp.throttleAt) ?? "–"}</td>
                  <td className="py-2 pr-3 font-mono tabular-nums">
                    <span className="text-ref">{r.ref.trailBrakeM}</span>
                    <span className="text-muted"> / </span>
                    <span className="text-accent">{r.cmp.trailBrakeM}</span>
                  </td>
                  <td className="py-2 pr-3 font-mono tabular-nums">
                    <span className="text-ref">{r.ref.coastM}</span>
                    <span className="text-muted"> / </span>
                    <span className="text-accent">{r.cmp.coastM}</span>
                  </td>
                  <td
                    className={`py-2 text-right font-mono tabular-nums ${r.dt > 0.05 ? "text-loss" : r.dt < -0.05 ? "text-good" : "text-muted"}`}
                  >
                    {r.dt >= 0 ? "+" : "−"}
                    {de(Math.abs(r.dt), 2)} s
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Kurven werden aus dem Speed-Verlauf der Bestrunde erkannt: jede Stelle, an der du mindestens 12 km/h abbaust.
        Schnelle Kurven ohne Speed-Verlust (z. B. voll gefahren) tauchen nicht auf. Trail-Braking = Meter, in denen
        gleichzeitig gebremst und gelenkt wird.
      </p>
    </section>
  );
}
