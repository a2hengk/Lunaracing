"use client";

import { useMemo, useState } from "react";
import { LapAnalysis } from "@/components/lap-analysis";
import { formatSector } from "@/lib/format";
import { bestLap, lapSamples, type SessionFile } from "@/lib/lmu/session";
import { deltaTrace, resampleByDistance } from "@/lib/telemetry/compare";
import { formatLapTime } from "@/lib/telemetry/laps";
import { buildOutline } from "@/lib/track/outline";

const STEP_M = 5;

export function SessionView({ session }: { session: SessionFile }) {
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

  const reference = byLap.get(refLap)!;
  const compare = byLap.get(cmpLap)!;
  const delta = useMemo(() => deltaTrace(reference, compare), [reference, compare]);

  // Beste Sektorzeiten aus gewerteten Runden, für die Markierung in der Tabelle
  const bestSectors = [0, 1, 2].map((i) =>
    Math.min(...session.laps.filter((l) => l.valid).map((l) => l.sectorsMs.at(i)!).filter((v) => v > 0)),
  );

  return (
    <div className="grid gap-6">
      <section className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 font-medium">Runde</th>
              <th className="px-4 py-2.5 font-medium">Zeit</th>
              <th className="px-4 py-2.5 font-medium">S1</th>
              <th className="px-4 py-2.5 font-medium">S2</th>
              <th className="px-4 py-2.5 font-medium">S3</th>
              <th className="px-4 py-2.5 text-right font-medium">Vergleich</th>
            </tr>
          </thead>
          <tbody>
            {session.laps.map((l) => (
              <tr key={l.lap} className={`border-b border-line last:border-0 ${l.valid ? "" : "text-muted"}`}>
                <td className="px-4 py-2.5">
                  {l.lap}
                  {l === best && <span className="ml-2 text-xs text-accent">Bestzeit</span>}
                  {!l.valid && <span className="ml-2 text-xs">nicht gewertet</span>}
                </td>
                <td className="px-4 py-2.5 font-mono tabular-nums">{formatLapTime(l.timeMs)}</td>
                {l.sectorsMs.map((s, i) => (
                  <td
                    key={i}
                    className={`px-4 py-2.5 font-mono tabular-nums ${s > 0 && s === bestSectors.at(i) ? "text-good" : ""}`}
                  >
                    {formatSector(s)}
                  </td>
                ))}
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1 text-xs">
                    <Pick active={refLap === l.lap} onClick={() => setRefLap(l.lap)} tone="ref">
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
        </table>
      </section>

      <LapAnalysis
        outline={outline}
        reference={reference}
        compare={compare}
        delta={delta}
        stepM={STEP_M}
        labels={{ reference: `Runde ${refLap}`, compare: `Runde ${cmpLap}` }}
      />
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
