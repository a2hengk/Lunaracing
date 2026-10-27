import { LapAnalysis } from "@/components/lap-analysis";
import { demoSamples } from "@/lib/demo";
import { deltaTrace, resampleByDistance } from "@/lib/telemetry/compare";
import { fastestLap, formatLapTime, splitLaps } from "@/lib/telemetry/laps";
import { buildOutline } from "@/lib/track/outline";

const STEP_M = 5;

// Solange der Import echter LMU-Dateien noch nicht steht, läuft die Seite mit Demo-Daten.
export default function Home() {
  const laps = splitLaps(demoSamples());
  const best = fastestLap(laps)!;
  const other = laps.find((l) => l.complete && l !== best)!;

  const reference = resampleByDistance(best.samples, STEP_M);
  const compare = resampleByDistance(other.samples, STEP_M);
  const delta = deltaTrace(reference, compare);
  const outline = buildOutline(best.samples, 10);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.2em] text-accent uppercase">lunaracing</p>
          <h1 className="mt-1 text-2xl font-semibold">Demo-Strecke · GT3</h1>
          <p className="mt-1 text-sm text-muted">
            Erfundene Daten, bis der Import echter LMU-Dateien steht.
          </p>
        </div>
        <ul className="flex gap-3 text-sm">
          {laps.map((l) => (
            <li key={l.lap} className="rounded-lg border border-line bg-panel px-3 py-2">
              <span className="text-muted">Runde {l.lap}</span>{" "}
              <span className="font-mono tabular-nums">{formatLapTime(l.timeMs)}</span>
              {l === best && <span className="ml-2 text-xs text-accent">Bestzeit</span>}
            </li>
          ))}
        </ul>
      </header>

      <LapAnalysis
        outline={outline}
        reference={reference}
        compare={compare}
        delta={delta}
        stepM={STEP_M}
        labels={{ reference: `Runde ${best.lap}`, compare: `Runde ${other.lap}` }}
      />
    </main>
  );
}
