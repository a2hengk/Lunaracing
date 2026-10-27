import Link from "next/link";
import { notFound } from "next/navigation";
import { SessionView } from "@/components/session-view";
import { sessions } from "@/data/sessions";
import { formatDate, sessionTypeDe, shortLayout, shortTrack } from "@/lib/format";

export function generateStaticParams() {
  return sessions.map((s) => ({ id: s.id }));
}

export default async function SessionPage({ params }: PageProps<"/sessions/[id]">) {
  const { id } = await params;
  const session = sessions.find((s) => s.id === id);
  if (!session) notFound();

  const w = session.weather;
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <Link href="/" className="text-xs tracking-[0.2em] text-accent uppercase">
          lunaracing
        </Link>
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
    </main>
  );
}
