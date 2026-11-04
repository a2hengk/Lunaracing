"use client";

import { useCallback, useState } from "react";
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
/** Was in der Vergleichsrunde in dieser Kurve anders war, als Satz. */
export function cornerCauses(row: Row): string {
  const { ref, cmp } = row;
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
  return `${what.charAt(0).toUpperCase()}${what.slice(1)}.`;
}

/** Ein Satz zur Kurve mit dem größten Zeitverlust: was in der Vergleichsrunde anders war. */
export function lossSummary(row: Row, labels: { reference: string; compare: string }): string {
  const { corner, dt } = row;
  return `Kurve ${corner.n}${corner.name ? ` (${corner.name})` : ""}: ${labels.compare} ${dt > 0 ? "verliert" : "gewinnt"} ${de(Math.abs(dt), 2)} s gegenüber ${labels.reference}. ${cornerCauses(row)}`;
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
  const hasGap = hasGapCols(rows);
  const worstN = rows.filter((r) => r.dt > 0.05).toSorted((a, b) => b.dt - a.dt).at(0)?.corner.n;
  // Balken: 100 px je Seite entsprechen dem größten Delta der Runde
  const maxDt = Math.max(0.05, ...rows.map((r) => Math.abs(r.dt)));

  return (
    <section className="flex flex-wrap gap-x-10 gap-y-6 border-t border-line py-10">
      <div className="flex-[0_1_220px]">
        <h2 className="font-display text-[30px] leading-tight font-semibold">Kurven</h2>
        <p className="mt-2 text-sm text-muted">
          {labels.compare} gegen {labels.reference}, in Streckenreihenfolge. Aufklappen zeigt die Telemetrie der Kurve.
        </p>
      </div>
      <ol className="flex min-w-0 flex-[999_1_640px] flex-col">
        {rows.map((r) => {
          const isOpen = open.has(r.corner.n);
          const loss = r.dt > 0;
          const w = Math.max(2, Math.round((Math.abs(r.dt) / maxDt) * 100));
          const dv = r.cmp.minSpeed - r.ref.minSpeed;
          return (
            <li key={r.corner.n} className={`border-b border-line ${activeCorner === r.corner.n ? "bg-panel" : ""}`}>
              <button
                onClick={() => toggle(r.corner.n)}
                aria-expanded={isOpen}
                className="flex min-h-16 w-full flex-wrap items-center gap-x-6 gap-y-2 px-1 py-3.5 text-left transition hover:bg-panel/60"
              >
                <span className="flex flex-[0_0_210px] items-baseline gap-2.5">
                  <span
                    className={`inline-grid h-6 w-6 shrink-0 place-items-center self-center rounded-full font-display text-sm font-bold ${
                      r.corner.n === worstN ? "bg-loss text-bg" : "border border-muted"
                    }`}
                  >
                    {r.corner.n}
                  </span>
                  <span className="font-display text-xl font-semibold">{r.corner.name ?? `Kurve ${r.corner.n}`}</span>
                  <span className="text-[13px] text-muted">{de(r.corner.apex / 1000, 1)} km</span>
                </span>
                <span aria-hidden className="relative h-3 flex-[0_0_200px]">
                  <span className="absolute top-[-4px] left-[100px] h-5 w-px bg-same" />
                  <span
                    className={`absolute top-0 h-3 rounded-sm ${loss ? "bg-loss" : "bg-accent"}`}
                    style={{ width: w, left: loss ? 101 : 100 - w }}
                  />
                </span>
                <span className={`flex-[0_0_72px] text-right font-display text-xl font-semibold ${loss ? "text-loss" : "text-accent"}`}>
                  {loss ? "+" : "−"}
                  {de(Math.abs(r.dt), 2)} s
                </span>
                <span className="min-w-0 flex-[999_1_280px] text-soft">{cornerCauses(r)}</span>
                <span aria-hidden className={`text-muted transition ${isOpen ? "rotate-90" : ""}`}>›</span>
              </button>
              {isOpen && (
                <div className="flex flex-col gap-4 px-1 pt-1 pb-6">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                    <Fact label="Bremspunkt">
                      {r.ref.brakeAt === null && r.cmp.brakeAt === null
                        ? "ohne Bremse"
                        : (shift(r.ref.brakeAt, r.cmp.brakeAt) ?? "nur eine Runde bremst")}
                    </Fact>
                    <Fact label="Min-Speed">
                      <span className="text-ref">{de(r.ref.minSpeed)}</span> → <span className="text-accent">{de(r.cmp.minSpeed)}</span>
                      {Math.abs(dv) >= 1 && (
                        <span className={`ml-1.5 text-xs ${dv < 0 ? "text-loss" : "text-accent"}`}>
                          {dv > 0 ? "+" : "−"}
                          {de(Math.abs(dv))}
                        </span>
                      )}
                    </Fact>
                    <Fact label="Gas wieder an">{shift(r.ref.throttleAt, r.cmp.throttleAt) ?? "–"}</Fact>
                    <Fact label="Trail-Braking">
                      <span className="text-ref">{r.ref.trailBrakeM}</span> / <span className="text-accent">{r.cmp.trailBrakeM}</span> m
                    </Fact>
                    <Fact label="Rollen">
                      <span className="text-ref">{r.ref.coastM}</span> / <span className="text-accent">{r.cmp.coastM}</span> m
                    </Fact>
                    {hasGap && (
                      <Fact label="Vordermann">
                        <GapValue g={r.ref.gapAhead} color="text-ref" /> / <GapValue g={r.cmp.gapAhead} color="text-accent" />
                        {(r.ref.alongsideM >= ALONGSIDE_MIN_M || r.cmp.alongsideM >= ALONGSIDE_MIN_M) && (
                          <span className="ml-1.5 text-xs text-[hsl(320_90%_70%)]">Rad an Rad</span>
                        )}
                      </Fact>
                    )}
                  </dl>
                  <div className="rounded-lg bg-panel p-3">
                    <CornerChart corner={r.corner} traces={traces} labels={labels} />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="w-full text-xs text-muted">
        Kurven werden aus dem Speed-Verlauf der Bestrunde erkannt: jede Stelle, an der du mindestens 12 km/h abbaust.
        Schnelle Kurven ohne Speed-Verlust tauchen nicht auf. Trail-Braking = Meter, in denen gleichzeitig gebremst und
        gelenkt wird. Werte jeweils <span className="text-ref">{labels.reference}</span> /{" "}
        <span className="text-accent">{labels.compare}</span>.
        {hasGap && " Vordermann = mittlerer Abstand zum Auto vor dir in der Kurve, fett unter 1 s. „Rad an Rad“ = mindestens 10 m weniger als eine Wagenlänge Abstand."}
      </p>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-display text-base">{children}</dd>
    </div>
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
