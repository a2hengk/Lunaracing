import type { CornerRow } from "@/components/corner-table";
import { formatLapTime } from "@/lib/telemetry/laps";

const de = (v: number, digits: number) =>
  v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (s: number, digits = 3) => `${s > 0 ? "+" : s < 0 ? "−" : "±"}${de(Math.abs(s), digits)}`;

/**
 * Überblick links oben: Strecke, wie die Vergleichsrunde gegen die Referenz liegt, ein Satz
 * dazu, das Delta pro Sektor und die Eckdaten der Session.
 */
export function SessionHero({
  track,
  subtitle,
  labels,
  refIsBest,
  deltaS,
  sectorsS,
  times,
  corners,
  facts,
  onChangeLaps,
}: {
  /** Handy: öffnet die Rundenliste, um Vergleich oder Referenz zu wechseln */
  onChangeLaps?: () => void;
  track: string;
  subtitle: string;
  labels: { reference: string; compare: string };
  refIsBest: boolean;
  /** Delta der ganzen Runde in s, positiv = Vergleich langsamer */
  deltaS: number;
  /** Delta pro Sektor in s, null wenn eine Runde keine Sektorzeit hat */
  sectorsS: (number | null)[];
  times: { compareMs: number; referenceMs: number };
  corners: CornerRow[];
  facts: [string, string][];
}) {
  const worst = corners.toSorted((a, b) => b.dt - a.dt).at(0);
  const gainSector = sectorsS
    .map((d, i) => ({ d, i }))
    .filter((x): x is { d: number; i: number } => x.d !== null && x.d < -0.05)
    .toSorted((a, b) => a.d - b.d)
    .at(0);
  const cornerName = (r: CornerRow) => r.corner.name ?? `Kurve ${r.corner.n}`;
  const summary = [
    worst && worst.dt > 0.05 ? `Verloren vor allem in ${cornerName(worst)}` : null,
    gainSector ? `in Sektor ${gainSector.i + 1} ${de(-gainSector.d, 2)} s wieder geholt` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="font-display text-[56px] leading-[0.95] font-bold tracking-[-0.01em] sm:text-[72px]">{track}</h1>
        <p className="mt-2 text-muted">{subtitle}</p>
      </div>

      <div>
        <p className="text-muted">
          {labels.compare} gegen {refIsBest ? `deine Bestrunde ${labels.reference.replace("Runde ", "")}` : labels.reference}
        </p>
        <p
          className={`mt-1 font-display text-[clamp(64px,6.2vw,112px)] leading-[0.9] font-bold tracking-[-0.02em] whitespace-nowrap ${
            deltaS > 0 ? "text-loss" : "text-accent"
          }`}
        >
          {signed(deltaS)} s
        </p>
        {summary && <p className="mt-3 max-w-[34ch]">{summary}.</p>}
      </div>

      <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-lg bg-line">
        {sectorsS.map((d, i) => (
          <div key={i} className="bg-bg px-3 py-2.5">
            <div className="text-[13px] text-muted">Sektor {i + 1}</div>
            <div
              className={`font-display text-[26px] font-semibold ${d === null ? "text-muted" : d > 0 ? "text-loss" : "text-accent"}`}
            >
              {d === null ? "–" : signed(d)}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline gap-3">
          <i aria-hidden className="h-1 w-3.5 self-center rounded-sm bg-accent" />
          <span className="flex-1">{labels.compare}, Vergleich</span>
          <span className="font-display text-2xl font-semibold">{formatLapTime(times.compareMs).replace(".", ",")}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <i aria-hidden className="h-0.5 w-3.5 self-center bg-ref" />
          <span className="flex-1">{labels.reference}, Referenz</span>
          <span className={`font-display text-2xl font-semibold ${refIsBest ? "text-best" : ""}`}>
            {formatLapTime(times.referenceMs).replace(".", ",")}
          </span>
        </div>
      </div>

      {onChangeLaps && (
        <div className="grid grid-cols-2 gap-2 lg:hidden">
          <button
            onClick={onChangeLaps}
            className="flex min-h-16 flex-col items-start gap-0.5 rounded-xl border border-accent bg-accent/10 px-3 py-2.5 text-left"
          >
            <span className="text-xs text-muted">Vergleich ändern</span>
            <span className="font-display text-xl font-semibold">{labels.compare}</span>
          </button>
          <button
            onClick={onChangeLaps}
            className="flex min-h-16 flex-col items-start gap-0.5 rounded-xl border border-same bg-fg/5 px-3 py-2.5 text-left"
          >
            <span className="text-xs text-muted">Referenz ändern</span>
            <span className="font-display text-xl font-semibold">{labels.reference}</span>
          </button>
        </div>
      )}

      {facts.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-line pt-5 text-sm">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
