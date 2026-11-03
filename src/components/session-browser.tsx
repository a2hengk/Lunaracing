"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SessionListItem } from "@/lib/data-types";
import { formatDate, joinParts, shortLayout, shortTrack } from "@/lib/format";
import { groupByTrack, KIND_LABEL, KIND_ORDER, type SessionKind } from "@/lib/group";
import { formatLapTime } from "@/lib/telemetry/laps";

type Filter = "alle" | SessionKind;

const KIND_STYLE: Record<SessionKind, string> = {
  rennen: "bg-accent/15 text-accent",
  quali: "bg-[hsl(45_90%_55%/0.15)] text-[hsl(45_90%_65%)]",
  training: "bg-ref/15 text-ref",
  sonstige: "bg-ref/10 text-muted",
};

/** Startseite: Sessions nach Strecke gruppiert, filterbar nach Art. */
export function SessionBrowser({ sessions }: { sessions: SessionListItem[] }) {
  const groups = useMemo(() => groupByTrack(sessions), [sessions]);
  const [filter, setFilter] = useState<Filter>("alle");

  const counts = useMemo(() => {
    const c: Partial<Record<Filter, number>> = { alle: 0 };
    for (const g of groups)
      for (const s of g.sessions) {
        c.alle = (c.alle ?? 0) + 1;
        c[s.kind] = (c[s.kind] ?? 0) + 1;
      }
    return c;
  }, [groups]);

  const visible = groups
    .map((g) => ({ ...g, shown: g.sessions.filter((s) => filter === "alle" || s.kind === filter) }))
    .filter((g) => g.shown.length > 0);

  const chips: Filter[] = ["alle", ...KIND_ORDER.filter((k) => counts[k])];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1 text-sm" role="tablist" aria-label="Nach Art filtern">
        {chips.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 transition ${filter === f ? "bg-accent/20 text-accent" : "bg-panel text-muted hover:text-fg"}`}
          >
            {f === "alle" ? "Alle" : KIND_LABEL[f]}
            <span className="ml-1.5 text-xs opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>

      {visible.map((g, i) => {
        const layout = shortLayout(g.track, g.layout);
        const bestRace = g.bestMs.rennen;
        const bestAny = Math.min(...Object.values(g.bestMs));
        return (
          <details key={g.key} open={i === 0} className="group rounded-xl border border-line bg-panel">
            <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 [&::-webkit-details-marker]:hidden">
              <div className="flex items-baseline gap-2">
                <span className="text-muted transition group-open:rotate-90" aria-hidden>
                  ›
                </span>
                <h2 className="font-semibold">{shortTrack(g.track)}</h2>
                {layout && <span className="text-sm text-muted">{layout}</span>}
              </div>
              <div className="flex flex-wrap gap-x-4 text-sm text-muted">
                <span>
                  {g.shown.length} {g.shown.length === 1 ? "Session" : "Sessions"}
                </span>
                {Number.isFinite(bestAny) && (
                  <span>
                    Bestzeit <span className="font-mono text-fg tabular-nums">{formatLapTime(bestAny)}</span>
                    {bestRace !== undefined && bestRace !== bestAny && (
                      <span className="ml-2">
                        im Rennen <span className="font-mono text-fg tabular-nums">{formatLapTime(bestRace)}</span>
                      </span>
                    )}
                  </span>
                )}
                <span>zuletzt {formatDate(g.latest)}</span>
              </div>
            </summary>

            <ul className="border-t border-line">
              {g.shown.map((s) => (
                <li key={s.slug} className="border-b border-line last:border-0">
                  <Link
                    href={`/sessions/${s.slug}`}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-bg sm:grid-cols-[7rem_minmax(0,1fr)_auto_auto]"
                  >
                    <span className={`w-fit rounded-md px-2 py-0.5 text-xs ${KIND_STYLE[s.kind]}`}>{KIND_LABEL[s.kind]}</span>
                    <span className="truncate text-sm">
                      {formatDate(s.recordedAt)}
                      <span className="ml-2 text-muted">{joinParts(s.car, s.carClass)}</span>
                    </span>
                    <span className="hidden text-sm text-muted sm:block">{s.laps} {s.laps === 1 ? "Runde" : "Runden"}</span>
                    <span className="font-mono text-sm tabular-nums">{s.bestMs ? formatLapTime(s.bestMs) : "–"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
