"use client";

import type { SessionListItem } from "@/lib/data-types";
import { formatDate, sessionTypeDe, shortTrack } from "@/lib/format";
import { formatLapTime } from "@/lib/telemetry/laps";

/**
 * Alle Sessions auf derselben Strecke: Bestzeit-Verlauf mit dem Auto dieser Session und
 * die Möglichkeit, die Bestrunde einer anderen Session als Referenz zu nehmen.
 */
export function TrackHistory({
  sessions,
  current,
  car,
  track,
  activeRef,
  loadingRef,
  onPick,
}: {
  /** Sessions auf dieser Strecke und diesem Layout, inklusive der aktuellen */
  sessions: SessionListItem[];
  current: string;
  car: string;
  track: string;
  /** Session, deren Bestrunde gerade Referenz ist */
  activeRef: string | null;
  loadingRef: string | null;
  onPick: (s: SessionListItem) => void;
}) {
  const timed = sessions.filter((s) => s.bestMs !== null);
  const sameCar = timed.filter((s) => s.car === car).toSorted((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  // Bestzeit pro Auto, für die Abstände in der Liste
  const pbByCar = new Map<string, number>();
  for (const s of timed) pbByCar.set(s.car, Math.min(pbByCar.get(s.car) ?? Infinity, s.bestMs!));
  const pb = pbByCar.get(car);
  const pbSession = sameCar.find((s) => s.bestMs === pb);

  if (timed.length <= 1) {
    return (
      <section className="rounded-xl bg-panel p-4 text-sm text-muted">
        <h2 className="mb-2 font-display text-[22px] font-semibold text-fg">Bestzeiten auf {shortTrack(track)}</h2>
        Noch keine andere Session auf dieser Strecke. Sobald du hier wieder fährst, siehst du deinen Verlauf und kannst
        gegen ältere Runden vergleichen.
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[22px] font-semibold">Bestzeiten auf {shortTrack(track)}</h2>
        {pb !== undefined && pbSession && (
          <span className="text-xs text-muted">
            PB mit {car}: <span className="font-mono text-best">{formatLapTime(pb)}</span> ·{" "}
            {sessionTypeDe(pbSession.sessionType)} {formatDate(pbSession.recordedAt)}
          </span>
        )}
      </div>

      {sameCar.length >= 2 && <PbChart sessions={sameCar} current={current} />}

      <ul className="mt-2 divide-y divide-line text-sm">
        {timed
          .toSorted((a, b) => b.recordedAt.localeCompare(a.recordedAt))
          .map((s) => {
            const gap = s.bestMs! - (pbByCar.get(s.car) ?? s.bestMs!);
            const isCurrent = s.slug === current;
            return (
              <li key={s.slug} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="w-20 shrink-0 text-xs text-muted">{sessionTypeDe(s.sessionType)}</span>
                <span className="text-xs text-muted">{formatDate(s.recordedAt)}</span>
                {s.car !== car && <span className="text-xs text-muted">{s.car}</span>}
                <span className="ml-auto font-mono tabular-nums">{formatLapTime(s.bestMs!)}</span>
                <span className={`w-16 text-right font-mono text-xs tabular-nums ${gap === 0 ? "text-best" : "text-muted"}`}>
                  {gap === 0 ? "PB" : `+${(gap / 1000).toFixed(3)}`}
                </span>
                {isCurrent ? (
                  <span className="w-24 text-right text-xs text-muted">diese Session</span>
                ) : (
                  <button
                    onClick={() => onPick(s)}
                    disabled={loadingRef !== null}
                    aria-pressed={activeRef === s.slug}
                    className={`w-24 rounded-md px-2 py-1 text-xs transition ${
                      activeRef === s.slug ? "bg-ref/20 text-fg" : "text-muted hover:bg-bg hover:text-fg"
                    }`}
                  >
                    {loadingRef === s.slug ? "lädt …" : activeRef === s.slug ? "ist Referenz" : "als Referenz"}
                  </button>
                )}
              </li>
            );
          })}
      </ul>
      <p className="mt-2 text-[11px] text-muted">
        „als Referenz“ legt die Bestrunde dieser Session unter deine Runde: Telemetrie, Delta und Kurven vergleichen dann
        gegen sie.
      </p>
    </section>
  );
}

/** Bestzeit pro Session über die Zeit, mit der laufenden PB als Stufenlinie. */
function PbChart({ sessions, current }: { sessions: SessionListItem[]; current: string }) {
  const W = 400;
  const H = 110;
  const pad = { l: 8, r: 8, t: 10, b: 18 };
  const times = sessions.map((s) => s.bestMs!);
  const lo = Math.min(...times);
  const hi = Math.max(...times);
  const span = Math.max(500, hi - lo);
  const x = (i: number) => pad.l + (i / Math.max(1, sessions.length - 1)) * (W - pad.l - pad.r);
  // schneller = weiter oben
  const y = (ms: number) => pad.t + ((ms - lo) / span) * (H - pad.t - pad.b);

  let running = Infinity;
  const step: string[] = [];
  sessions.forEach((s, i) => {
    const before = running;
    running = Math.min(running, s.bestMs!);
    if (i > 0 && running !== before) step.push(`${x(i).toFixed(1)},${y(before).toFixed(1)}`);
    step.push(`${x(i).toFixed(1)},${y(running).toFixed(1)}`);
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" role="img" aria-label="Bestzeit pro Session über die Zeit">
      <polyline points={step.join(" ")} fill="none" stroke="var(--color-best)" strokeWidth={1.5} strokeDasharray="4 3" />
      {sessions.map((s, i) => (
        <g key={s.slug}>
          <title>
            {`${sessionTypeDe(s.sessionType)} ${formatDate(s.recordedAt)}: ${formatLapTime(s.bestMs!)}`}
          </title>
          <circle
            cx={x(i)}
            cy={y(s.bestMs!)}
            r={s.slug === current ? 5 : 3.5}
            fill={s.slug === current ? "var(--color-accent)" : "var(--color-ref)"}
            stroke="var(--color-panel)"
            strokeWidth={2}
          />
        </g>
      ))}
      <text x={pad.l} y={H - 4} fontSize={10} fill="var(--color-muted)">
        {formatDate(sessions.at(0)!.recordedAt)}
      </text>
      <text x={W - pad.r} y={H - 4} fontSize={10} fill="var(--color-muted)" textAnchor="end">
        {formatDate(sessions.at(-1)!.recordedAt)}
      </text>
    </svg>
  );
}
