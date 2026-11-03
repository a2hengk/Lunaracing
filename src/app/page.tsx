import Link from "next/link";
import { Suspense } from "react";
import { listSessions } from "@/lib/data";
import { SessionBrowser } from "@/components/session-browser";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <p className="text-xs tracking-[0.2em] text-accent uppercase">lunaracing</p>
        <h1 className="mt-1 text-2xl font-semibold">Sessions</h1>
        <p className="mt-1 text-sm text-muted">
          Importiert mit <code className="font-mono text-fg">npm run import</code> aus dem Telemetry-Ordner von LMU.
        </p>
      </header>

      <Suspense fallback={<ListSkeleton />}>
        <SessionList />
      </Suspense>

      <p className="mt-8 text-xs text-muted">
        <Link href="/demo" className="hover:text-fg">
          Demo ansehen
        </Link>
      </p>
    </main>
  );
}

async function SessionList() {
  const list = await listSessions();
  if (list.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-panel p-6 text-sm text-muted">
        Noch keine Session importiert. Bis dahin gibt es die{" "}
        <Link href="/demo" className="text-accent underline-offset-4 hover:underline">
          Demo mit erfundenen Daten
        </Link>
        .
      </p>
    );
  }

  return <SessionBrowser sessions={list} />;
}

function ListSkeleton() {
  return (
    <div className="grid animate-pulse gap-4" aria-label="Sessions werden geladen">
      <div className="h-9 w-72 rounded-lg bg-panel" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[60px] rounded-xl border border-line bg-panel" />
      ))}
    </div>
  );
}
