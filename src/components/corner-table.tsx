"use client";

import { Fragment, useCallback, useState } from "react";
import { TelemetryChart } from "@/components/lap-analysis";
import { CLOSE_GAP_S, type Corner, type CornerStats } from "@/lib/analysis/corners";
import type { DeltaPoint, DistPoint } from "@/lib/telemetry/compare";

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

/** Ab so vielen Metern Überlappung gilt eine Kurve als Rad an Rad gefahren (2 Messpunkte) */
const ALONGSIDE_MIN_M = 10;

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
  const close = (g: number | null) => g !== null && g < CLOSE_GAP_S;
  if (cmp.alongsideM >= ALONGSIDE_MIN_M) {
    parts.push(`${de(cmp.alongsideM)} m Rad an Rad mit einem Auto${ref.alongsideM >= ALONGSIDE_MIN_M ? " (in der Referenz auch)" : ""}`);
  } else if (ref.alongsideM >= ALONGSIDE_MIN_M) {
    parts.push(`in der Referenz ${de(ref.alongsideM)} m Rad an Rad, hier nicht`);
  } else if (close(cmp.gapAhead) && !close(ref.gapAhead)) {
    parts.push(`dabei ${de(cmp.gapAhead!, 1)} s hinter einem Auto, in der Referenz frei`);
  } else if (close(ref.gapAhead) && !close(cmp.gapAhead)) {
    parts.push(`in der Referenz ${de(ref.gapAhead!, 1)} s hinter einem Auto (Windschatten?), hier frei`);
  } else if (close(cmp.gapAhead) && close(ref.gapAhead)) {
    parts.push("in beiden Runden dicht hinter einem Auto");
  }
  const what = parts.length ? parts.join(", ") : "keine klare Ursache in Bremse, Speed oder Gas";
  return `Kurve ${corner.n}${corner.name ? ` (${corner.name})` : ""}: ${labels.compare} ${dt > 0 ? "verliert" : "gewinnt"} ${de(Math.abs(dt), 2)} s gegenüber ${labels.reference}. ${what.charAt(0).toUpperCase()}${what.slice(1)}.`;
}

export type CornerTraces = {
  reference: DistPoint[];
  compare: DistPoint[];
  delta: DeltaPoint[];
  stepM: number;
};

export function CornerTable({
  rows,
  labels,
  activeCorner,
  traces,
}: {
  rows: Row[];
  labels: { reference: string; compare: string };
  /** auf der Karte angeklickte Kurve, wird hervorgehoben */
  activeCorner: number | null;
  traces: CornerTraces;
}) {
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const toggle = (n: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  const cols = hasGapCols(rows) ? 8 : 7;
  const worst = rows.toSorted((a, b) => b.dt - a.dt).at(0);
  const best = rows.toSorted((a, b) => a.dt - b.dt).at(0);
  const hasGap = hasGapCols(rows);

  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Kurven</h2>
        <span className="text-xs text-muted">
          {labels.compare} gegen {labels.reference} · Klick auf eine Kurve klappt ihre Telemetrie auf
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
              {hasGap && (
                <th className="py-2 pr-3 font-medium" title="Durchschnittlicher Abstand zum Auto vor dir in der Kurve">
                  Vordermann (s)
                </th>
              )}
              <th className="py-2 text-right font-medium">Zeit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dv = r.cmp.minSpeed - r.ref.minSpeed;
              const isOpen = open.has(r.corner.n);
              return (
                <Fragment key={r.corner.n}>
                <tr
                  onClick={() => toggle(r.corner.n)}
                  aria-expanded={isOpen}
                  className={`cursor-pointer border-b border-line transition hover:bg-bg ${activeCorner === r.corner.n || isOpen ? "bg-bg" : ""}`}
                >
                  <td className="py-2 pr-3">
                    <span aria-hidden className={`mr-2 inline-block text-muted transition ${isOpen ? "rotate-90" : ""}`}>›</span>
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
                  {hasGap && (
                    <td className="py-2 pr-3 font-mono tabular-nums">
                      <GapValue g={r.ref.gapAhead} color="text-ref" />
                      <span className="text-muted"> / </span>
                      <GapValue g={r.cmp.gapAhead} color="text-accent" />
                      {(r.ref.alongsideM >= ALONGSIDE_MIN_M || r.cmp.alongsideM >= ALONGSIDE_MIN_M) && (
                        <span className="ml-2 rounded bg-[hsl(320_90%_62%/0.15)] px-1.5 py-0.5 font-sans text-[11px] text-[hsl(320_90%_70%)]">
                          Rad an Rad
                        </span>
                      )}
                    </td>
                  )}
                  <td
                    className={`py-2 text-right font-mono tabular-nums ${r.dt > 0.05 ? "text-loss" : r.dt < -0.05 ? "text-good" : "text-muted"}`}
                  >
                    {r.dt >= 0 ? "+" : "−"}
                    {de(Math.abs(r.dt), 2)} s
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-line bg-bg/40">
                    <td colSpan={cols} className="px-1 py-3">
                      <CornerChart corner={r.corner} traces={traces} labels={labels} />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Kurven werden aus dem Speed-Verlauf der Bestrunde erkannt: jede Stelle, an der du mindestens 12 km/h abbaust.
        Schnelle Kurven ohne Speed-Verlust (z. B. voll gefahren) tauchen nicht auf. Trail-Braking = Meter, in denen
        gleichzeitig gebremst und gelenkt wird.
        {hasGap &&
          " Vordermann = mittlerer Abstand zum Auto vor dir in der Kurve, fett unter 1 s (Windschatten, schmutzige Luft oder Verkehr). „frei“ = meist kein Auto in Reichweite. „Rad an Rad“ = mindestens 10 m weniger als eine Wagenlänge Abstand."}
      </p>
    </section>
  );
}

function GapValue({ g, color }: { g: number | null; color: string }) {
  if (g === null) return <span className="text-muted">frei</span>;
  return <span className={`${color} ${g < CLOSE_GAP_S ? "font-bold" : ""}`}>{de(g, 1)}</span>;
}

function hasGapCols(rows: Row[]) {
  return rows.some((r) => r.ref.gapAhead !== null || r.cmp.gapAhead !== null);
}

const noZoom = () => {};

/** Telemetrie einer einzelnen Kurve, von der Bremszone bis zum Ausgang. */
function CornerChart({
  corner,
  traces,
  labels,
}: {
  corner: Corner;
  traces: CornerTraces;
  labels: { reference: string; compare: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const onHover = useCallback((d: number | null) => setHover(d), []);
  const [view] = useState(() => ({ from: corner.from, to: corner.to }));
  return (
    <TelemetryChart
      compact
      reference={traces.reference}
      compare={traces.compare}
      delta={traces.delta}
      stepM={traces.stepM}
      labels={labels}
      length={traces.reference.at(-1)?.dist ?? corner.to}
      view={view}
      zoomed
      onZoom={noZoom}
      hover={hover}
      onHover={onHover}
    />
  );
}
