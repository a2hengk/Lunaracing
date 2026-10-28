import type { Stint } from "@/lib/analysis/stints";
import { formatLapTime } from "@/lib/telemetry/laps";

const de = (v: number | undefined, digits = 0) =>
  v === undefined
    ? "–"
    : v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const WHEELS = ["VL", "VR", "HL", "HR"];

/** Farbe für eine Reifentemperatur: blau = kalt, grün = mittig, rot = heiß. Nur zur Orientierung. */
function tempColor(c: number) {
  const f = Math.max(0, Math.min(1, (c - 55) / 45));
  return `hsl(${220 - f * 220} 70% 45% / 0.55)`;
}

export function StintReport({ stints }: { stints: Stint[] }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Stints</h2>
        <span className="text-xs text-muted">
          {stints.length === 1 ? "1 Stint" : `${stints.length} Stints`} · Stint endet mit einer Runde durch die Box
        </span>
      </div>
      <div className="grid gap-4">
        {stints.map((s) => (
          <article key={s.n} className="grid gap-4 rounded-lg bg-bg p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <h3 className="text-sm font-semibold">
                Stint {s.n}
                <span className="ml-2 font-normal text-muted">
                  Runde {s.laps.at(0)?.lap}–{s.laps.at(-1)?.lap} · {s.laps.length} Runden
                </span>
              </h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <Item label="Ø Rundenzeit" value={s.avgMs ? formatLapTime(Math.round(s.avgMs)) : "–"} />
                <Item label="Bestzeit" value={s.bestMs ? formatLapTime(s.bestMs) : "–"} />
                <Item
                  label="Konstanz (σ)"
                  value={s.paceLaps.length > 1 ? `${de(s.stdevMs / 1000, 3)} s` : "–"}
                  hint="Streuung der Rundenzeiten, kleiner ist konstanter"
                />
                <Item
                  label="Trend"
                  value={s.paceLaps.length > 1 ? `${s.trendMsPerLap >= 0 ? "+" : "−"}${de(Math.abs(s.trendMsPerLap) / 1000, 3)} s/Runde` : "–"}
                  hint="positiv = du wirst im Stint langsamer"
                  tone={s.paceLaps.length > 1 ? (s.trendMsPerLap > 100 ? "loss" : s.trendMsPerLap < -100 ? "good" : undefined) : undefined}
                />
                <Item label="Sprit" value={`${de(s.fuelL, 1)} L`} sub={s.fuelL ? `${de(s.fuelL / s.laps.length, 2)} L/Runde` : undefined} />
                <Item label="Virtual Energy" value={`${de(s.vePct, 1)} %`} sub={s.vePct ? `${de(s.vePct / s.laps.length, 2)} %/Runde` : undefined} />
                <Item
                  label="Reifen (Ø Verschleiß)"
                  value={s.tyreWearPct ? `${de(s.tyreWearPct.reduce((a, b) => a + b, 0) / 4, 1)} %` : "–"}
                  sub={s.tyreWearPct ? `meist ${WHEELS.at(s.tyreWearPct.indexOf(Math.max(...s.tyreWearPct)))}` : undefined}
                />
                {s.paceLaps.length < 3 && (
                  <p className="col-span-2 self-end text-[11px] text-muted sm:col-span-1">
                    Trend und Konstanz sind bei {s.paceLaps.length} Runden noch wenig aussagekräftig.
                  </p>
                )}
              </dl>
            </div>

            {s.tyreTempC && (
              <div>
                <p className="mb-2 text-[11px] text-muted">Reifen im Schnitt: innen · Mitte · außen (°C), Druck</p>
                <div className="grid grid-cols-2 gap-2">
                  {s.tyreTempC.map((t, w) => {
                    const left = w % 2 === 0;
                    // Anzeige wie von oben aufs Auto: linke Räder außen links, rechte außen rechts
                    const cells = left ? [t[2], t[1], t[0]] : [t[0], t[1], t[2]];
                    return (
                      <div key={w} className="rounded-md border border-line p-2">
                        <div className="mb-1 flex justify-between text-[11px] text-muted">
                          <span>{WHEELS.at(w)}</span>
                          <span className="font-mono">{de(s.tyrePressureKpa?.at(w), 1)} kPa</span>
                        </div>
                        <div className="grid grid-cols-3 gap-0.5 font-mono text-xs tabular-nums">
                          {cells.map((c, k) => (
                            <span key={k} className="rounded-sm py-1 text-center" style={{ background: tempColor(c) }}>
                              {de(c)}
                            </span>
                          ))}
                        </div>
                        <p className="mt-1 text-[10px] text-muted">
                          innen − außen {de(t[0] - t[2], 1)} °C
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function Item({
  label,
  value,
  sub,
  hint,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  tone?: "loss" | "good";
}) {
  return (
    <div title={hint}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`font-mono tabular-nums ${tone === "loss" ? "text-loss" : tone === "good" ? "text-good" : ""}`}>{value}</dd>
      {sub && <dd className="text-[11px] text-muted">{sub}</dd>}
    </div>
  );
}
