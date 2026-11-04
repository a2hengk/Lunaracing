import Link from "next/link";

/** Kopfzeile wie im Racing-Design: Logo kursiv, rechts die Navigation. */
export function SiteHeader() {
  return (
    <header className="mb-8 flex h-[72px] items-center justify-between gap-4 border-b border-line">
      <Link href="/" className="font-display text-2xl font-bold tracking-[0.01em] italic">
        lunaracing
      </Link>
      <nav className="flex gap-6 text-sm text-muted">
        <Link href="/" className="inline-flex min-h-11 items-center hover:text-fg">
          Alle Sessions
        </Link>
        <Link href="/demo" className="inline-flex min-h-11 items-center hover:text-fg">
          Demo
        </Link>
      </nav>
    </header>
  );
}
