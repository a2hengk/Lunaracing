"use client";

import { useMemo, useState } from "react";
import { CornerTable } from "@/components/corner-table";
import { LapAnalysis, type Range } from "@/components/lap-analysis";
import { LapStats } from "@/components/lap-stats";
import { StintReport } from "@/components/stint-report";
import { StrategyCalc } from "@/components/strategy-calc";
import { TrackHistory } from "@/components/track-history";
import type { SessionListItem } from "@/lib/data-types";
import { formatDate, formatSector, sessionTypeDe } from "@/lib/format";
import { theoreticalBest } from "@/lib/analysis/best";
import { splitStints } from "@/lib/analysis/stints";
import { cornerStats, detectCorners } from "@/lib/analysis/corners";
import { drivingStyle } from "@/lib/analysis/style";
import { cornerName } from "@/data/tracks";
import { sessionKind } from "@/lib/group";
import { bestLap, lapSamples, type SessionFile, type StoredLap } from "@/lib/lmu/session";
import { deltaTrace, resampleByDistance } from "@/lib/telemetry/compare";
import { formatLapTime } from "@/lib/telemetry/laps";
import { buildOutline } from "@/lib/track/outline";

const STEP_M = 5;

export function SessionView({
  session: input,
  related = [],
}: {
  session: SessionFile;
  /** Sessions auf derselben Strecke (inklusive dieser), für Bestzeit-Verlauf und Vergleich */
  related?: SessionListItem[];
}) {
  // Der Abstand zum Vordermann meint das Auto eine Position vor dir in der Wertung. Im Rennen
  // ist das das Auto vor dir auf der Strecke, im Training und in der Quali (Wertung nach
  // Bestzeit) irgendein Auto. Deshalb nur im Rennen auswerten.
  const session = useMemo(
    () =>
      sessionKind(input.sessionType) === "rennen"
        ? input
        : { ...input, laps: input.laps.map((l) => ({ ...l, data: { ...l.data, gap: undefined } })) },
    [input],
  );
  const best = bestLap(session) ?? session.laps.at(0)!;
  const [refLap, setRefLap] = useState(best.lap);
  const [cmpLap, setCmpLap] = useState(
    () => session.laps.find((l) => l.lap !== best.lap)?.lap ?? best.lap,
  );

  const byLap = useMemo(
    () => new Map(session.laps.map((l) => [l.lap, resampleByDistance(lapSamples(l), STEP_M)])),
    [session],
  );
  const outline = useMemo(() => buildOutline(lapSamples(best), 10), [best]);

  // Referenz aus einer anderen Session (deren Bestrunde), null = Runde aus dieser Session
  const [ext, setExt] = useState<{ slug: string; label: string; points: ReturnType<typeof resampleByDistance> } | null>(null);
  const [loadingRef, setLoadingRef] = useState<string | null>(null);
  const [refError, setRefError] = useState<string | null>(null);
  const pickExternal = async (s: SessionListItem) => {
    setLoadingRef(s.slug);
    setRefError(null);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(s.slug)}/best-lap`);
      if (!res.ok) throw new Error(`${res.status}`);
      const body = (await res.json()) as { lap: StoredLap };
      setExt({
        slug: s.slug,
        label: `${sessionTypeDe(s.sessionType)} ${formatDate(s.recordedAt).split(",")[0]} R${body.lap.lap}`,
        points: resampleByDistance(lapSamples(body.lap), STEP_M),
      });
    } catch {
      setRefError("Die Runde ließ sich nicht laden.");
    } finally {
      setLoadingRef(null);
    }
  };

  const reference = ext?.points ?? byLap.get(refLap)!;
  const compare = byLap.get(cmpLap)!;
  const delta = useMemo(() => deltaTrace(reference, compare), [reference, compare]);

  const [range, setRange] = useState<Range | null>(null);
  const [activeCorner, setActiveCorner] = useState<number | null>(null);

  // Kurven einmal aus der Bestrunde, damit die Nummern für alle Vergleiche gleich bleiben
  const corners = useMemo(
    () =>
      detectCorners(byLap.get(best.lap)!, STEP_M).map((c) => ({
        ...c,
        name: cornerName(session.track, session.layout, c.apex),
      })),
    [byLap, best, session],
  );
  const cornerRows = useMemo(
    () =>
      corners.map((c) => {
        const ref = cornerStats(reference, c, STEP_M);
        const cmp = cornerStats(compare, c, STEP_M);
        const off = (session.laps.find((l) => l.lap === cmpLap)?.offTrack ?? []).reduce(
          (sum, o) => sum + Math.max(0, Math.min(o.to, c.to) - Math.max(o.from, c.from)),
          0,
        );
        return { corner: c, ref, cmp, dt: cmp.time - ref.time, cmpOffM: off };
      }),
    [corners, reference, compare, session, cmpLap],
  );
  const styles = useMemo(
    () => new Map(session.laps.map((l) => [l.lap, drivingStyle(byLap.get(l.lap)!)])),
    [session, byLap],
  );
  const lapName = (n: number) => (session.laps.find((l) => l.lap === n)?.start ? "Startrunde" : `Runde ${n}`);
  const labels = { reference: ext?.label ?? lapName(refLap), compare: lapName(cmpLap) };

  const stints = useMemo(() => splitStints(session.laps), [session]);
  // Startwerte für den Rechner: Durchschnitt aller Runden ohne Boxengasse und ohne Startrunde
  const raceBase = useMemo(() => {
    const laps = session.laps.filter((l) => !l.pit && !l.start);
    const avg = (pick: (l: (typeof laps)[number]) => number | undefined) => {
      const vals = laps.map(pick).filter((v): v is number => v !== undefined);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    return {
      lapTimeS: avg((l) => l.timeMs) / 1000,
      fuelPerLapL: avg((l) => l.usage?.fuelL),
      vePerLapPct: avg((l) => l.usage?.vePct),
    };
  }, [session]);

  // Beste Sektorzeiten aus gewerteten Runden, für die Markierung in der Tabelle
  const bestSectors = [0, 1, 2].map((i) =>
    Math.min(...session.laps.filter((l) => l.valid).map((l) => l.sectorsMs.at(i)!).filter((v) => v > 0)),
  );

  const ideal = theoreticalBest(session.laps);

  const lapTable = (
    <section className="overflow-x-auto rounded-xl border border-line bg-panel">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-left text-xs text-muted">
          <tr className="border-b border-line">
            <th className="px-3 py-2.5 font-medium">Runde</th>
            <th className="px-3 py-2.5 font-medium">Zeit</th>
            <th className="px-3 py-2.5 font-medium">S1</th>
            <th className="px-3 py-2.5 font-medium">S2</th>
            <th className="px-3 py-2.5 font-medium">S3</th>
            <th className="px-3 py-2.5 text-right font-medium">Vergleich</th>
          </tr>
        </thead>
        <tbody>
          {session.laps.map((l) => (
            <tr key={l.lap} className={`border-b border-line last:border-0 ${l.valid ? "" : "text-muted"}`}>
              <td className="px-3 py-2.5">
                {l.lap}
                {l.start && (
                  <span className="ml-2 text-xs text-muted" title="Erste Rennrunde ab dem Start, ohne Einführungsrunde">
                    Start
                  </span>
                )}
                {l === best && <span className="ml-2 text-xs text-accent">Bestzeit</span>}
                {!l.valid && <span className="ml-2 text-xs">nicht gewertet</span>}
              </td>
              <td className="px-3 py-2.5 font-mono tabular-nums">{formatLapTime(l.timeMs)}</td>
              {l.sectorsMs.map((s, i) => (
                <td
                  key={i}
                  className={`px-3 py-2.5 font-mono tabular-nums ${s > 0 && s === bestSectors.at(i) ? "text-good" : ""}`}
                >
                  {formatSector(s)}
                </td>
              ))}
              <td className="px-3 py-2 text-right">
                <div className="inline-flex gap-1 text-xs">
                  <Pick
                    active={!ext && refLap === l.lap}
                    onClick={() => {
                      setExt(null);
                      setRefLap(l.lap);
                    }}
                    tone="ref"
                  >
                    Referenz
                  </Pick>
                  <Pick active={cmpLap === l.lap} onClick={() => setCmpLap(l.lap)} tone="accent">
                    Vergleich
                  </Pick>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        {ideal && (
          <tfoot className="border-t border-line bg-bg/40 text-xs">
            <tr>
              <td className="px-3 py-2.5 text-muted" title="Summe der besten Sektoren aus gewerteten Runden">
                Theoretisch
              </td>
              <td className="px-3 py-2.5 font-mono text-sm text-good tabular-nums">{formatLapTime(ideal.timeMs)}</td>
              {ideal.sectors.map((sec, i) => (
                <td key={i} className="px-3 py-2.5 text-muted">
                  aus Runde {sec.lap}
                  {ideal.bestLapLossMs.at(i)! > 0 && (
                    <span className="ml-1.5 font-mono text-loss tabular-nums">+{(ideal.bestLapLossMs.at(i)! / 1000).toFixed(3)}</span>
                  )}
                </td>
              ))}
              <td className="px-3 py-2.5 text-right text-muted">
                Bestzeit {(ideal.bestLapMs - ideal.timeMs) / 1000 > 0 ? "verliert " : ""}
                <span className="font-mono text-fg tabular-nums">{((ideal.bestLapMs - ideal.timeMs) / 1000).toFixed(3)} s</span>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <LapAnalysis
        outline={outline}
        reference={reference}
        compare={compare}
        delta={delta}
        stepM={STEP_M}
        labels={labels}
        corners={corners}
        offTrack={session.laps.find((l) => l.lap === cmpLap)?.offTrack}
        range={range}
        onRange={(r) => {
          setRange(r);
          setActiveCorner(r ? (corners.find((c) => c.from === r.from && c.to === r.to)?.n ?? null) : null);
        }}
        aside={
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
            {lapTable}
            {ext && (
              <p className="-mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                Referenz ist gerade die Bestrunde aus einer anderen Session: <span className="text-fg">{ext.label}</span>
                <button onClick={() => setExt(null)} className="rounded-md bg-bg px-2 py-0.5 hover:text-fg">
                  zurück zu Runde {refLap}
                </button>
              </p>
            )}
            {refError && <p className="-mt-3 text-xs text-loss">{refError}</p>}
            <TrackHistory
              sessions={related}
              current={session.id}
              car={session.car}
              track={session.track}
              activeRef={ext?.slug ?? null}
              loadingRef={loadingRef}
              onPick={pickExternal}
            />
          </div>
        }
      />

      <CornerTable
        rows={cornerRows}
        labels={labels}
        activeCorner={activeCorner}
        traces={{ reference, compare, delta, stepM: STEP_M }}
      />

      <StintReport stints={stints} />

      <LapStats laps={session.laps} styles={styles}>
        <StrategyCalc {...raceBase} />
      </LapStats>
    </div>
  );
}

function Pick({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: "ref" | "accent";
  children: React.ReactNode;
}) {
  const on = tone === "ref" ? "bg-ref/20 text-fg" : "bg-accent/20 text-accent";
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md px-2.5 py-1 transition ${active ? on : "text-muted hover:bg-bg hover:text-fg"}`}
    >
      {children}
    </button>
  );
}
