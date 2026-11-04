"use client";

import { useMemo, useState } from "react";
import { CornerTable } from "@/components/corner-table";
import { LapAnalysis, type Range } from "@/components/lap-analysis";
import { LapStats } from "@/components/lap-stats";
import { StintReport } from "@/components/stint-report";
import { StrategyCalc } from "@/components/strategy-calc";
import { TrackHistory } from "@/components/track-history";
import type { SessionListItem } from "@/lib/data-types";
import { formatDate, formatSector, joinParts, sessionTypeDe, shortLayout, shortTrack } from "@/lib/format";
import { SessionHero } from "@/components/session-hero";
import { theoreticalBest } from "@/lib/analysis/best";
import { distAtTime } from "@/lib/analysis/replay";
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
  const [ext, setExt] = useState<{
    slug: string;
    label: string;
    lap: StoredLap;
    points: ReturnType<typeof resampleByDistance>;
  } | null>(null);
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
        lap: body.lap,
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
  const [lapsOpen, setLapsOpen] = useState(false);
  const openLaps = () => {
    setLapsOpen(true);
    requestAnimationFrame(() => document.getElementById("runden")?.scrollIntoView({ behavior: "smooth" }));
  };
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

  // Wo Sektor 1 und 2 der Referenzrunde enden, für die Linien in der Telemetrie
  const sectorEnds = useMemo(() => {
    const ref = ext?.lap ?? session.laps.find((l) => l.lap === refLap);
    const [s1 = 0, s2 = 0] = ref?.sectorsMs ?? [];
    if (!(s1 > 0 && s2 > 0)) return [];
    return [distAtTime(reference, s1 / 1000), distAtTime(reference, (s1 + s2) / 1000)];
  }, [ext, session, refLap, reference]);

  // Für den Überblick oben links
  const refStored = ext?.lap ?? session.laps.find((l) => l.lap === refLap)!;
  const cmpStored = session.laps.find((l) => l.lap === cmpLap)!;
  const aids = session.laps.at(0)?.aids;
  const w = session.weather;
  const hero = (
    <SessionHero
      track={shortTrack(session.track)}
      subtitle={`${sessionTypeDe(session.sessionType)} am ${longDate(session.recordedAt)}`}
      labels={labels}
      refIsBest={!ext && refLap === best.lap}
      deltaS={(cmpStored.timeMs - refStored.timeMs) / 1000}
      sectorsS={[0, 1, 2].map((i) => {
        const c = cmpStored.sectorsMs.at(i) ?? 0;
        const r = refStored.sectorsMs.at(i) ?? 0;
        return c > 0 && r > 0 ? (c - r) / 1000 : null;
      })}
      times={{ compareMs: cmpStored.timeMs, referenceMs: refStored.timeMs }}
      corners={cornerRows}
      onChangeLaps={openLaps}
      facts={(
        [
          ["Auto", joinParts(session.car, session.carClass)],
          ["Strecke", joinParts(shortLayout(session.track, session.layout), w.trackC !== undefined && `${w.trackC} °C`)],
          ["Luft", w.ambientC !== undefined ? `${w.ambientC} °C` : ""],
          [
            "Fahrhilfen",
            aids
              ? joinParts(
                  aids.tcLevel !== undefined && `TC ${aids.tcLevel}`,
                  aids.absLevel !== undefined && `ABS ${aids.absLevel}`,
                  aids.engineMap !== undefined && `Map ${aids.engineMap}`,
                  aids.brakeBiasFront !== undefined &&
                    `Bremsbalance ${aids.brakeBiasFront.toLocaleString("de-DE", { maximumFractionDigits: 1 })} % vorne`,
                )
              : "",
          ],
        ] as [string, string][]
      ).filter(([, v]) => v)}
    />
  );

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

  // Sektorfarben wie im Design: lila = Session-Bestzeit, grün = höchstens 0,2 s dahinter, gelb = mehr
  const sectorTone = (ms: number, i: number) => {
    const bestMs = bestSectors.at(i)!;
    if (!(ms > 0) || !Number.isFinite(bestMs)) return "border-transparent text-muted";
    if (ms === bestMs) return "border-best font-bold text-best";
    return ms - bestMs <= 200 ? "border-near text-near" : "border-far text-far";
  };

  const lapTable = (
    <section id="runden" className="scroll-mt-4 rounded-xl bg-panel px-2 pt-2 pb-4">
      {/* Handy: Runden zugeklappt wie im Design, ab lg immer offen */}
      <button
        onClick={() => setLapsOpen((v) => !v)}
        aria-expanded={lapsOpen}
        className="flex min-h-14 w-full items-center justify-between px-2 lg:hidden"
      >
        <span className="font-display text-xl font-semibold">Alle {session.laps.length} Runden</span>
        <span className="text-sm text-muted">Bestzeit {formatLapTime(best.timeMs).replace(".", ",")}</span>
      </button>
      <div className={lapsOpen ? "" : "hidden lg:block"}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[380px] border-collapse">
          <caption className="px-2 pt-2.5 pb-3.5 text-left font-display text-[22px] font-semibold">Runden</caption>
          <thead>
            <tr className="text-left text-[13px] text-muted">
              <th scope="col" className="px-2 pb-2 font-medium">Runde</th>
              <th scope="col" className="px-2 pb-2 font-medium">Zeit</th>
              <th scope="col" className="px-2 pb-2 font-medium">S1</th>
              <th scope="col" className="px-2 pb-2 font-medium">S2</th>
              <th scope="col" className="px-2 pb-2 font-medium">S3</th>
              <th scope="col" className="px-2 pb-2 text-right font-medium">Vergleichen</th>
            </tr>
          </thead>
          <tbody>
            {session.laps.map((l) => {
              const isRef = !ext && refLap === l.lap;
              const isCmp = cmpLap === l.lap;
              return (
                <tr
                  key={l.lap}
                  className={`border-t border-line ${isCmp ? "bg-accent/10" : isRef ? "bg-fg/[0.06]" : ""} ${l.valid ? "" : "text-muted"}`}
                >
                  <td className="h-[46px] px-2 whitespace-nowrap">
                    <span className="font-display text-lg font-semibold">{l.lap}</span>
                    {l.start && (
                      <span className="ml-2 text-xs text-muted" title="Erste Rennrunde ab dem Start, ohne Einführungsrunde">
                        Start
                      </span>
                    )}
                    {!l.valid && <span className="ml-2 text-xs">nicht gewertet</span>}
                  </td>
                  <td
                    className={`px-2 font-display text-[19px] font-semibold ${l === best ? "text-best" : l.start ? "text-muted" : ""}`}
                  >
                    {formatLapTime(l.timeMs).replace(".", ",")}
                  </td>
                  {l.sectorsMs.map((ms, i) => (
                    <td key={i} className="px-2 font-display text-[17px]">
                      <span className={`border-b-2 pb-px ${l.start ? "border-transparent text-muted" : sectorTone(ms, i)}`}>
                        {formatSector(ms).replace(".", ",")}
                      </span>
                    </td>
                  ))}
                  <td className="px-1.5 text-right whitespace-nowrap">
                    <Pick
                      active={isRef}
                      onClick={() => {
                        setExt(null);
                        setRefLap(l.lap);
                      }}
                      tone="ref"
                      label={`Runde ${l.lap} als Referenz`}
                    >
                      Ref
                    </Pick>
                    <Pick active={isCmp} onClick={() => setCmpLap(l.lap)} tone="accent" label={`Runde ${l.lap} vergleichen`}>
                      Vgl
                    </Pick>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {ideal && (
            <tfoot className="border-t border-line text-[13px]">
              <tr>
                <td className="px-2 pt-3 text-muted" title="Theoretische Bestzeit: Summe der besten Sektoren aus gewerteten Runden">
                  Ideal
                </td>
                <td className="px-2 pt-3 font-display text-[19px] font-semibold text-best">
                  {formatLapTime(ideal.timeMs).replace(".", ",")}
                </td>
                {ideal.sectors.map((sec, i) => (
                  <td key={i} className="px-2 pt-3 text-muted">
                    R{sec.lap}
                    {ideal.bestLapLossMs.at(i)! > 0 && (
                      <span className="ml-1 font-display text-loss">+{(ideal.bestLapLossMs.at(i)! / 1000).toFixed(3).replace(".", ",")}</span>
                    )}
                  </td>
                ))}
                <td className="px-2 pt-3 text-right text-muted">
                  −{((ideal.bestLapMs - ideal.timeMs) / 1000).toFixed(3).replace(".", ",")} s
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="flex flex-wrap gap-x-[18px] gap-y-1.5 px-2 pt-3.5 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="h-2.5 w-2.5 rounded-sm bg-best" />
          Bestzeit der Session
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="h-2.5 w-2.5 rounded-sm bg-near" />
          höchstens 0,2 s dahinter
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="h-2.5 w-2.5 rounded-sm bg-far" />
          mehr als 0,2 s dahinter
        </span>
      </div>
      </div>
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
        lead={hero}
        sectorEnds={sectorEnds}
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

      <StintReport stints={stints} sessionBestMs={best.timeMs} />

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
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: "ref" | "accent";
  label: string;
  children: React.ReactNode;
}) {
  const on = tone === "ref" ? "border-fg bg-fg text-deep" : "border-accent bg-accent text-deep";
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`ml-1 min-h-9 min-w-11 rounded-md border text-[13px] font-semibold transition ${
        active ? on : "border-line text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

/** 2026-11-03T19:57:59Z → „3. November 2026, 20:57“ */
function longDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(d);
  const time = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(d);
  return `${day}, ${time}`;
}
