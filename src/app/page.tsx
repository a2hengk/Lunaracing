import Link from "next/link";
import { sessions } from "@/data/sessions";
import { bestLap } from "@/lib/lmu/session";
import { formatDate, sessionTypeDe, shortLayout, shortTrack } from "@/lib/format";
import { formatLapTime } from "@/lib/telemetry/laps";

export default function Home() {
  const list = sessions.toSorted((a, b) => b.recordedAt.localeCompare(a.recordedAt));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <p className="text-xs tracking-[0.2em] text-accent uppercase">lunaracing</p>
        <h1 className="mt-1 text-2xl font-semibold">Sessions</h1>
        <p className="mt-1 text-sm text-muted">
          Importiert mit <code className="font-mono text-fg">npm run import</code> aus dem Telemetry-Ordner von LMU.
        </p>
      </header>

      {list.length === 0 ? (
        <p className="rounded-xl border border-line bg-panel p-6 text-sm text-muted">
          Noch keine Session importiert. Bis dahin gibt es die{" "}
          <Link href="/demo" className="text-accent underline-offset-4 hover:underline">
            Demo mit erfundenen Daten
          </Link>
          .
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((s) => {
            const best = bestLap(s);
            return (
              <li key={s.id}>
                <Link
                  href={`/sessions/${s.id}`}
                  className="block rounded-xl border border-line bg-panel p-4 transition hover:border-accent/60"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-semibold">{shortTrack(s.track)}</h2>
                    <span className="text-xs text-muted">{formatDate(s.recordedAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {shortLayout(s.track, s.layout)} · {s.car} · {s.carClass} · {sessionTypeDe(s.sessionType)}
                  </p>
                  <div className="mt-3 flex gap-4 text-sm">
                    <span>
                      <span className="text-muted">Bestzeit </span>
                      <span className="font-mono tabular-nums">{best ? formatLapTime(best.timeMs) : "–"}</span>
                    </span>
                    <span className="text-muted">{s.laps.length} Runden</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-8 text-xs text-muted">
        <Link href="/demo" className="hover:text-fg">
          Demo ansehen
        </Link>
      </p>
    </main>
  );
}
