import type { Stint } from "@/lib/analysis/stints";
import { formatLapTime } from "@/lib/telemetry/laps";

const de = (v: number | undefined, digits = 0) =>
  v === undefined
    ? "–"
    : v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const lapTime = (ms: number) => formatLapTime(ms).replace(".", ",");

const WHEELS = ["VL", "VR", "HL", "HR"];

/** Reifentemperatur wie im Design: unter 72 kalt (blau), 72 bis 84 im Fenster, ab 85 heiß (orange). */
function tempClass(c: number) {
  if (c < 72) return "bg-accent/30";
  if (c < 85) return "bg-fg/10";
  return "bg-loss/40";
}

export function StintReport({ stints, sessionBestMs }: { stints: Stint[]; sessionBestMs?: number }) {
  return (
    <>
      {stints.map((s) => (
        <section key={s.n} className="flex flex-wrap gap-x-10 gap-y-6 border-t border-line py-10">
          <div className="flex-[0_1_220px]">
            <h2 className="font-display text-[30px] leading-tight font-semibold">
              {stints.length > 1 ? `Stint ${s.n}` : "Stint"}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {stints.length === 1 ? "Ein Stint" : `Stint ${s.n} von ${stints.length}`}, Runde {s.laps.at(0)?.lap} bis{" "}
              {s.laps.at(-1)?.lap}
              {s.laps.some((l) => l.pit) ? ", endet mit der Box." : ", ohne Boxenstopp."}
            </p>
            {s.paceLaps.length < 3 && (
              <p className="mt-2 text-xs text-muted">
                Trend und Streuung sind bei {s.paceLaps.length} Runden noch wenig aussagekräftig.
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-[999_1_640px] flex-wrap gap-x-12 gap-y-8">
            <dl className="grid flex-[1_1_340px] grid-cols-2 content-start gap-x-6 gap-y-5">
              <Big label="Ø Rundenzeit" value={s.avgMs ? lapTime(Math.round(s.avgMs)) : "–"} />
              <Big
                label="Bestzeit"
                value={s.bestMs ? lapTime(s.bestMs) : "–"}
                tone={s.bestMs && s.bestMs === sessionBestMs ? "text-best" : undefined}
              />
              <Big
                label="Streuung"
                value={s.paceLaps.length > 1 ? `±${de(s.stdevMs / 1000, 3)} s` : "–"}
                hint="Standardabweichung der Rundenzeiten ohne Start und Box, kleiner ist konstanter"
              />
              <Big
                label="Trend"
                value={
                  s.paceLaps.length > 1
                    ? `${s.trendMsPerLap >= 0 ? "+" : "−"}${de(Math.abs(s.trendMsPerLap) / 1000, 3)} s`
                    : "–"
                }
                unit={s.paceLaps.length > 1 ? "pro Runde" : undefined}
                hint="positiv = du wirst im Stint langsamer"
                tone={s.paceLaps.length > 1 && s.trendMsPerLap > 100 ? "text-loss" : undefined}
              />
              <Big label="Sprit" value={s.fuelL ? `${de(s.fuelL / s.laps.length, 2)} L` : "–"} unit={s.fuelL ? "pro Runde" : undefined} />
              <Big
                label="Virtual Energy"
                value={s.vePct ? `${de(s.vePct / s.laps.length, 2)} %` : "–"}
                unit={s.vePct ? "pro Runde" : undefined}
              />
              {s.tyreWearPct && (
                <Big
                  label="Reifenverschleiß"
                  value={`${de(s.tyreWearPct.reduce((a, b) => a + b, 0) / 4, 1)} %`}
                  unit={`meist ${WHEELS.at(s.tyreWearPct.indexOf(Math.max(...s.tyreWearPct)))}`}
                />
              )}
            </dl>

            {s.tyreTempC && (
              <figure className="m-0 flex-[0_1_360px]">
                <figcaption className="mb-3 text-[13px] text-muted">Reifen von oben, außen bis innen in °C, Druck in kPa</figcaption>
                <div className="grid grid-cols-[1fr_64px_1fr] items-stretch gap-3">
                  {[0, 1, 2, 3].map((w) => {
                    const t = s.tyreTempC!.at(w)!;
                    const left = w % 2 === 0;
                    // t ist innen, Mitte, außen. Von oben gesehen liegt außen links bei den linken Rädern.
                    const cells = left ? [t[2], t[1], t[0]] : [t[0], t[1], t[2]];
                    return (
                      <TyreBox
                        key={w}
                        name={WHEELS.at(w)!}
                        kpa={s.tyrePressureKpa?.at(w)}
                        cells={cells}
                        className={`${left ? "col-start-1" : "col-start-3"} ${w < 2 ? "row-start-1" : "row-start-2 pt-7"}`}
                      />
                    );
                  })}
                  <div aria-hidden className="col-start-2 row-span-2 row-start-1 rounded-[22px_22px_14px_14px] border border-same" />
                </div>
                <div className="mt-3 flex gap-4 text-[13px] text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <i aria-hidden className="h-2.5 w-2.5 rounded-sm bg-accent/60" />
                    unter 72
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <i aria-hidden className="h-2.5 w-2.5 rounded-sm bg-fg/30" />
                    72 bis 84
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <i aria-hidden className="h-2.5 w-2.5 rounded-sm bg-loss/70" />
                    ab 85
                  </span>
                </div>
              </figure>
            )}
          </div>
        </section>
      ))}
    </>
  );
}

function TyreBox({ name, kpa, cells, className }: { name: string; kpa?: number; cells: number[]; className: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex justify-between text-[13px]">
        <span>{name}</span>
        <span className="text-muted">{de(kpa, 1)}</span>
      </div>
      <div className="grid grid-cols-3 gap-0.5 text-center font-display text-lg">
        {cells.map((c, k) => (
          <span key={k} className={`rounded py-2 ${tempClass(c)}`}>
            {de(c)}
          </span>
        ))}
      </div>
    </div>
  );
}

function Big({ label, value, unit, hint, tone }: { label: string; value: string; unit?: string; hint?: string; tone?: string }) {
  return (
    <div title={hint}>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={`font-display text-[28px] font-semibold ${tone ?? ""}`}>
        {value}
        {unit && <span className="ml-1.5 font-sans text-sm font-normal text-muted">{unit}</span>}
      </dd>
    </div>
  );
}
