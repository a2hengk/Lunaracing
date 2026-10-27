"use client";

import { useState } from "react";
import { planRace } from "@/lib/analysis/strategy";
import { formatLapTime } from "@/lib/telemetry/laps";

const de = (v: number, digits = 0) =>
  v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Zahl aus einem Eingabefeld, Komma oder Punkt als Dezimaltrenner. */
const num = (s: string) => {
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};

/**
 * Rechner für ein Rennen auf Basis der Werte aus dieser Session. Die Startwerte sind
 * Durchschnitte der gefahrenen Runden und lassen sich überschreiben.
 */
export function StrategyCalc({
  lapTimeS,
  fuelPerLapL,
  vePerLapPct,
}: {
  lapTimeS: number;
  fuelPerLapL: number;
  vePerLapPct: number;
}) {
  const [mode, setMode] = useState<"minutes" | "laps">("minutes");
  const [value, setValue] = useState("60");
  const [reserve, setReserve] = useState("1");
  const [lap, setLap] = useState(de(lapTimeS, 3));
  const [fuel, setFuel] = useState(de(fuelPerLapL, 2));
  const [ve, setVe] = useState(de(vePerLapPct, 2));

  const r = planRace({
    mode,
    value: num(value),
    lapTimeS: num(lap),
    fuelPerLapL: num(fuel),
    vePerLapPct: num(ve),
    reserveLaps: num(reserve),
  });

  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Sprit- und VE-Rechner</h2>
        <span className="text-xs text-muted">Startwerte: Durchschnitt deiner Runden ohne Box</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="grid gap-3 text-sm">
          <div className="flex items-end gap-2">
            <Field label={mode === "minutes" ? "Renndauer (min)" : "Rundenzahl"} value={value} onChange={setValue} />
            <div className="flex gap-1 rounded-lg bg-bg p-1 text-xs">
              {(
                [
                  ["minutes", "Zeit"],
                  ["laps", "Runden"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-2.5 py-1.5 transition ${mode === m ? "bg-accent/20 text-accent" : "text-muted hover:text-fg"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Rundenzeit (s)" value={lap} onChange={setLap} />
            <Field label="Reserve (Runden)" value={reserve} onChange={setReserve} />
            <Field label="Sprit pro Runde (L)" value={fuel} onChange={setFuel} />
            <Field label="VE pro Runde (%)" value={ve} onChange={setVe} />
          </div>
        </div>

        <dl className="grid grid-cols-2 content-start gap-3 text-sm sm:grid-cols-3">
          <Out label="Runden im Rennen" value={de(r.raceLaps)} sub={`${de(r.plannedLaps)} mit Reserve · ${formatLapTime(Math.round(num(lap) * 1000))}`} />
          <Out label="Sprit gesamt" value={`${de(r.fuelTotalL, 1)} L`} />
          <Out label="VE gesamt" value={`${de(r.veTotalPct, 0)} %`} />
          <Out
            label="Runden pro Stint"
            value={r.lapsPerStint !== null ? de(r.lapsPerStint) : "ohne VE"}
            sub={r.lapsPerStint !== null ? "bis 100 % VE verbraucht sind" : undefined}
          />
          <Out
            label="Boxenstopps"
            value={de(r.stops)}
            sub={r.stops > 0 ? `${de(r.stints)} Stints, letzter mit ${de(r.lastStintLaps)} Runden` : "ohne Stopp durch"}
            strong
          />
          <Out label="Sprit pro vollem Stint" value={`${de(r.fuelPerStintL, 1)} L`} />
        </dl>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Grobe Planung: Gelbphasen, Safety Car und Reifenwechsel sind nicht eingerechnet. Bei VE begrenzt die Energie den
        Stint, nicht der Tank.
      </p>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid flex-1 gap-1">
      <span className="text-[11px] text-muted">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line bg-bg px-2.5 py-1.5 font-mono tabular-nums outline-none focus:border-accent"
      />
    </label>
  );
}

function Out({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-bg px-3 py-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`font-mono tabular-nums ${strong ? "text-lg text-accent" : ""}`}>{value}</dd>
      {sub && <dd className="text-[11px] text-muted">{sub}</dd>}
    </div>
  );
}
