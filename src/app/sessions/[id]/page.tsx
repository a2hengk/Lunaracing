import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SessionView } from "@/components/session-view";
import { getSession } from "@/lib/data";
import { formatDate, sessionTypeDe, shortLayout, shortTrack } from "@/lib/format";

type Params = PageProps<"/sessions/[id]">["params"];

// Die Seite selbst greift nicht auf params zu: So steht der Rahmen beim Navigieren
// sofort, und der Inhalt der Session kommt innerhalb der Suspense-Grenze dazu.
export default function SessionPage({ params }: PageProps<"/sessions/[id]">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-xs tracking-[0.2em] text-accent uppercase">
        lunaracing
      </Link>
      <Suspense fallback={<SessionSkeleton />}>
        <SessionContent params={params} />
      </Suspense>
    </main>
  );
}

async function SessionContent({ params }: { params: Params }) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) notFound();

  const w = session.weather;
  return (
    <>
      <header className="mb-6">
        <h1 className="mt-1 text-2xl font-semibold">
          {shortTrack(session.track)} · {session.carClass}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {shortLayout(session.track, session.layout)} · {session.car} · {sessionTypeDe(session.sessionType)} ·{" "}
          {formatDate(session.recordedAt)}
          {w.ambientC !== undefined && ` · Luft ${w.ambientC} °C`}
          {w.trackC !== undefined && ` · Strecke ${w.trackC} °C`}
        </p>
      </header>
      <SessionView session={session} />
    </>
  );
}

function SessionSkeleton() {
  return (
    <div className="animate-pulse" aria-label="Session wird geladen">
      <div className="mt-2 h-8 w-64 rounded bg-panel" />
      <div className="mt-2 mb-6 h-4 w-96 max-w-full rounded bg-panel" />
      <div className="h-40 rounded-xl border border-line bg-panel" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="h-[520px] rounded-xl border border-line bg-panel" />
        <div className="h-[520px] rounded-xl border border-line bg-panel" />
      </div>
    </div>
  );
}
