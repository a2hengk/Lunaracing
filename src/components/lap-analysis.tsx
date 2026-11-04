"use client";

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DeltaPoint, DistPoint } from "@/lib/telemetry/compare";
import type { Corner } from "@/lib/analysis/corners";
import { aheadDist, distAtTime, timeAtDist } from "@/lib/analysis/replay";
import { traffic, trafficText, type Traffic } from "@/lib/analysis/traffic";
import { fitToBox, pointAtDistance, type OutlinePoint } from "@/lib/track/outline";

type Mode = "delta" | "speed" | "inputs" | "gap";

type Props = {
  outline: OutlinePoint[];
  /** Referenzrunde (meist die Bestrunde) */
  reference: DistPoint[];
  /** Runde, die mit der Referenz verglichen wird */
  compare: DistPoint[];
  delta: DeltaPoint[];
  stepM: number;
  labels: { reference: string; compare: string };
  /** erkannte Kurven, als Nummern auf der Karte */
  corners?: Corner[];
  /** wo die Vergleichsrunde neben der Strecke war */
  offTrack?: { from: number; to: number }[];
  /** sichtbarer Ausschnitt im Telemetrie-Graph, null = ganze Runde. Ohne Angabe verwaltet die Komponente ihn selbst. */
  range?: Range | null;
  onRange?: (r: Range | null) => void;
  /** Inhalt neben der Karte (z. B. die Rundentabelle). Dann steht die Telemetrie darunter über die ganze Breite. */
  aside?: ReactNode;
  /** Inhalt links vor der Karte (Session-Überblick), nur zusammen mit aside */
  lead?: ReactNode;
  /** Distanzen, an denen Sektor 1 und 2 enden, für die Linien in der Telemetrie */
  sectorEnds?: number[];
};

export type Range = { from: number; to: number };

export function LapAnalysis({
  outline,
  reference,
  compare,
  delta,
  stepM,
  labels,
  corners = [],
  offTrack = [],
  range: rangeProp,
  onRange,
  aside,
  lead,
  sectorEnds = [],
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [ownRange, setOwnRange] = useState<Range | null>(null);
  const range = rangeProp === undefined ? ownRange : rangeProp;
  const setRange = onRange ?? setOwnRange;

  const length = reference.at(-1)?.dist ?? 1;
  const view = useMemo(() => range ?? { from: 0, to: length }, [range, length]);

  const map = (
    <TrackMap
      // neue Vergleichsrunde: Wiedergabe startet von vorne
      key={`${labels.compare}-${compare.length}`}
      outline={outline}
      reference={reference}
      compare={compare}
      delta={delta}
      stepM={stepM}
      labels={labels}
      corners={corners}
      offTrack={offTrack}
      range={range}
      view={view}
      length={length}
      onRange={setRange}
      hover={hover}
      onHover={setHover}
    />
  );
  const chart = (
    <TelemetryChart
      reference={reference}
      compare={compare}
      delta={delta}
      stepM={stepM}
      labels={labels}
      length={length}
      view={view}
      zoomed={range !== null}
      onZoom={setRange}
      hover={hover}
      onHover={setHover}
      corners={corners}
      sectorEnds={sectorEnds}
    />
  );

  if (!aside) {
    return (
      <div id="analyse" className="grid scroll-mt-6 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {map}
        {chart}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-start gap-10 pt-2 pb-6">
        {lead && <div className="min-w-0 flex-[1_1_300px]">{lead}</div>}
        <div className="min-w-0 flex-[1_1_440px]">{map}</div>
        <div className="min-w-0 flex-[1_1_420px]">{aside}</div>
      </div>
      <div id="analyse" className="scroll-mt-6">
        {chart}
      </div>
    </div>
  );
}

/** Wiedergabe-Tempo: so viel schneller als echt */
const SPEEDS = [1, 5, 10] as const;

function TrackMap({
  outline,
  reference,
  compare,
  delta,
  stepM,
  labels,
  corners,
  offTrack,
  range,
  view,
  length,
  onRange: setRange,
  hover,
  onHover: setHover,
}: {
  outline: OutlinePoint[];
  reference: DistPoint[];
  compare: DistPoint[];
  delta: DeltaPoint[];
  stepM: number;
  labels: { reference: string; compare: string };
  corners: Corner[];
  offTrack: { from: number; to: number }[];
  range: Range | null;
  view: Range;
  length: number;
  onRange: (r: Range | null) => void;
  hover: number | null;
  onHover: (d: number | null) => void;
}) {
  const [mode, setMode] = useState<Mode>("delta");

  // Rand groß genug für die Kurvennummern neben der Strecke
  const proj = useMemo(() => fitToBox(outline, 640, 640, { x: 104, y: 44 }), [outline]);

  // Wie viel Zeit pro Meter verloren oder gewonnen wird: die Steigung des Deltas über ca. 40 m
  const lossRate = useMemo(
    () =>
      delta.map((p, i) => {
        const prev = delta.at(Math.max(0, i - 8))!;
        const span = p.dist - prev.dist;
        return span > 0 ? (p.delta - prev.delta) / span : 0;
      }),
    [delta],
  );

  // Nur wenn wirklich mal ein Auto vor dir war: Im Training schreibt LMU durchgehend 0
  const hasGap = compare.some((p) => (p.gap ?? 0) > 0) || reference.some((p) => (p.gap ?? 0) > 0);
  // Wechsel auf eine Session ohne Abstandsdaten: zurück auf Delta
  const shown: Mode = mode === "gap" && !hasGap ? "delta" : mode;

  const segments = useMemo(
    () =>
      outline.slice(0, -1).map((p, i) => {
        const q = outline.at(i + 1)!;
        const mid = (p.d + q.d) / 2;
        const k = Math.min(delta.length - 1, Math.round(mid / stepM));
        let color: string;
        if (shown === "delta") color = deltaColor(lossRate.at(k) ?? 0);
        else if (shown === "speed") color = speedColor(atDistance(compare, mid, stepM)?.speed ?? 0);
        else if (shown === "gap") color = trafficColor(traffic(atDistance(compare, mid, stepM)));
        else color = inputColor(atDistance(compare, mid, stepM));
        const [x1, y1] = proj.project(p);
        const [x2, y2] = proj.project(q);
        return { key: p.d, mid, x1, y1, x2, y2, color };
      }),
    [outline, shown, proj, lossRate, compare, delta.length, stepM],
  );
  // Die Strecke ändert sich während der Wiedergabe nicht: einmal bauen, nicht in jedem Frame
  const segmentEls = useMemo(
    () =>
      segments.map((s) => (
        <line
          key={s.key}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={s.color}
          strokeWidth={5}
          strokeLinecap="round"
          opacity={range && (s.mid < view.from || s.mid > view.to) ? 0.2 : 1}
        />
      )),
    [segments, range, view],
  );

  // dunkler Rand unter der farbigen Linie, wie im Design
  const outlinePts = useMemo(() => outline.map((p) => proj.project(p).map(r2).join(",")).join(" "), [outline, proj]);

  // Zeit pro Kurve aus dem Delta: die schlechteste bekommt auf der Karte ihr Delta dazu
  const cornerDt = useMemo(() => {
    const at = (d: number) => delta.at(Math.min(delta.length - 1, Math.max(0, Math.round(d / stepM))))?.delta ?? 0;
    return new Map(corners.map((c) => [c.n, at(c.to) - at(c.from)]));
  }, [corners, delta, stepM]);
  const worstCorner = [...cornerDt.entries()].filter(([, dt]) => dt > 0.05).toSorted((a, b) => b[1] - a[1]).at(0)?.[0];

  // Kurvennummern neben die Strecke setzen, auf die Seite weg vom Streckenmittelpunkt
  const cornerLabels = useMemo(() => {
    const pts = outline.map((p) => proj.project(p));
    const cx = pts.reduce((a, p) => a + p[0], 0) / (pts.length || 1);
    const cy = pts.reduce((a, p) => a + p[1], 0) / (pts.length || 1);
    return corners.map((c) => {
      const a = pointAtDistance(outline, c.apex - 10);
      const b = pointAtDistance(outline, c.apex + 10);
      const m = pointAtDistance(outline, c.apex);
      if (!a || !b || !m) return null;
      const [ax, ay] = proj.project(a);
      const [bx, by] = proj.project(b);
      const [mx, my] = proj.project(m);
      const len = Math.hypot(bx - ax, by - ay) || 1;
      let nx = -(by - ay) / len;
      let ny = (bx - ax) / len;
      if (nx * (mx - cx) + ny * (my - cy) < 0) {
        nx = -nx;
        ny = -ny;
      }
      return { c, x: r2(mx + nx * 26), y: r2(my + ny * 26), mx: r2(mx), my: r2(my), right: nx >= 0 };
    });
  }, [corners, outline, proj]);

  const offTrackLines = useMemo(
    () =>
      offTrack.map((o) => {
        const pts: string[] = [];
        for (let d = o.from; d <= o.to; d += 5) {
          const p = pointAtDistance(outline, d);
          if (p) pts.push(proj.project(p).join(","));
        }
        return { key: o.from, points: pts.join(" ") };
      }),
    [offTrack, outline, proj],
  );

  // Wiedergabe: einmal eine Runde abspielen, dann stehen bleiben
  const lapTime = compare.at(-1)?.time ?? 0;
  const [playT, setPlayT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(5);
  const tRef = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Wer reduzierte Bewegung eingestellt hat, sieht gleich das Ende
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      tRef.current = reduce ? lapTime : tRef.current + ((now - last) / 1000) * speed;
      last = now;
      if (tRef.current >= lapTime) {
        tRef.current = lapTime;
        setPlayT(lapTime);
        setPlaying(false);
        return;
      }
      setPlayT(tRef.current);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, speed, lapTime]);
  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (tRef.current >= lapTime) {
      tRef.current = 0;
      setPlayT(0);
    }
    setPlaying(true);
  };

  // Punkte: Maus über Karte oder Telemetrie hat Vorrang vor der Wiedergabe
  const byHover = hover !== null;
  const myD = byHover ? hover : distAtTime(compare, playT);
  const myT = byHover ? timeAtDist(compare, hover) : playT;
  const here = atDistance(compare, myD, stepM);
  const aheadD = aheadDist(compare, myT, here?.gap);
  const refD = byHover ? null : distAtTime(reference, playT);
  const at = (d: number | null) => {
    if (d === null) return null;
    const p = pointAtDistance(outline, d);
    return p ? proj.project(p) : null;
  };
  const me = at(myD);
  const ahead = at(aheadD);
  const ghost = at(refD);
  const t = traffic(here);
  const aheadColor = t === "alongside" ? trafficColor("alongside") : trafficColor("close");

  const nearestOnMap = (e: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    // Die Karte wird mittig eingepasst (Seitenverhältnis bleibt), daher Rand links/oben abziehen
    const box = e.currentTarget.getBoundingClientRect();
    const k = Math.min(box.width / proj.width, box.height / proj.height);
    const sx = (e.clientX - box.left - (box.width - proj.width * k) / 2) / k;
    const sy = (e.clientY - box.top - (box.height - proj.height * k) / 2) / k;
    let best = outline.at(0)!;
    let bestDist = Infinity;
    for (const p of outline) {
      const [px, py] = proj.project(p);
      const dd = (px - sx) ** 2 + (py - sy) ** 2;
      if (dd < bestDist) {
        bestDist = dd;
        best = p;
      }
    }
    return bestDist < 900 ? best.d : null;
  };

  // Klick auf die Karte: auf die Stelle zoomen, mit Anlauf davor für die Bremszone
  const zoomTo = (d: number) =>
    setRange({ from: Math.max(0, d - 300), to: Math.min(length, d + 200) });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="sr-only">Strecke</h2>
        <div role="group" aria-label="Strecke einfärben nach" className="flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-panel p-[3px] text-sm">
          {(
            [
              ["delta", "Delta"],
              ["speed", "Speed"],
              ["inputs", "Gas und Bremse"],
              ...(hasGap ? ([["gap", "Verkehr"]] as const) : []),
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={shown === m}
              className={`min-h-9 shrink-0 rounded-md px-3.5 transition ${shown === m ? "bg-line text-fg" : "text-muted hover:text-fg"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${proj.width} ${proj.height}`}
        className="block max-h-[640px] w-full cursor-zoom-in touch-none font-display"
        onPointerMove={(e) => setHover(nearestOnMap(e))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const d = nearestOnMap(e);
          if (d !== null) zoomTo(d);
        }}
        role="img"
        aria-label="Streckenkarte"
      >
        <polyline points={outlinePts} fill="none" stroke="var(--color-deep)" strokeWidth={11} strokeLinejoin="round" strokeLinecap="round" />
        {segmentEls}
        {offTrackLines.map((o) => (
          <g key={o.key}>
            <polyline points={o.points} fill="none" stroke="var(--color-fg)" strokeWidth={13} />
            <polyline points={o.points} fill="none" stroke="var(--color-offtrack)" strokeWidth={13} strokeDasharray="3 3" />
          </g>
        ))}
        <StartFinish outline={outline} project={proj.project} />
        {cornerLabels.map(
          (l) =>
            l && (
              <g
                key={l.c.n}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setRange({ from: l.c.from, to: l.c.to });
                }}
              >
                <title>{l.c.name ? `Kurve ${l.c.n}: ${l.c.name}` : `Kurve ${l.c.n}`}</title>
                <line x1={l.mx} y1={l.my} x2={l.x} y2={l.y} stroke="var(--color-same)" strokeWidth={1} />
                <circle
                  cx={l.x}
                  cy={l.y}
                  r={12}
                  fill={l.c.n === worstCorner ? "var(--color-loss)" : "var(--color-bg)"}
                  stroke={l.c.n === worstCorner ? "var(--color-loss)" : "var(--color-muted)"}
                  strokeWidth={1}
                />
                <text x={l.x} y={l.y + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill={l.c.n === worstCorner ? "var(--color-bg)" : "var(--color-fg)"}>
                  {l.c.n}
                </text>
                {(l.c.name || l.c.n === worstCorner) && (
                  <text
                    x={l.right ? l.x + 17 : l.x - 17}
                    y={l.y + 5}
                    textAnchor={l.right ? "start" : "end"}
                    fontSize={16}
                    fontWeight={600}
                    fill="var(--color-fg)"
                    stroke="var(--color-bg)"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {l.c.name ?? ""}
                    {l.c.n === worstCorner && (
                      <tspan fill="var(--color-loss)">
                        {l.c.name ? " " : ""}+{(cornerDt.get(l.c.n) ?? 0).toFixed(2).replace(".", ",")}
                      </tspan>
                    )}
                  </text>
                )}
              </g>
            ),
        )}
        {ghost && <circle cx={ghost[0]} cy={ghost[1]} r={5.5} fill="var(--color-panel)" stroke="var(--color-ref)" strokeWidth={2} />}
        {ahead && (
          <g>
            <circle cx={ahead[0]} cy={ahead[1]} r={6} fill={aheadColor} stroke="var(--color-bg)" strokeWidth={2.5} />
            <text x={ahead[0] + 12} y={ahead[1] - 10} fontSize={14} fontWeight={600} fill={aheadColor} stroke="var(--color-panel)" strokeWidth={3} paintOrder="stroke">
              {trafficText(here)}
            </text>
          </g>
        )}
        {me && <circle cx={me[0]} cy={me[1]} r={7} fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth={3} />}
      </svg>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        <button
          onClick={togglePlay}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 font-semibold text-deep transition hover:brightness-110"
        >
          {playing ? (
            <svg aria-hidden width="12" height="14" viewBox="0 0 12 14"><path d="M1 1h3.5v12H1zM7.5 1H11v12H7.5z" fill="currentColor" /></svg>
          ) : (
            <svg aria-hidden width="12" height="14" viewBox="0 0 12 14"><path d="M1 1 L11 7 L1 13 Z" fill="currentColor" /></svg>
          )}
          {playing ? "Pause" : playT >= lapTime ? "Nochmal abspielen" : "Weiter"}
        </button>
        <div role="group" aria-label="Tempo" className="flex gap-0.5 rounded-lg bg-panel p-[3px]">
          {SPEEDS.map((v) => (
            <button
              key={v}
              onClick={() => setSpeed(v)}
              aria-pressed={speed === v}
              className={`min-h-[38px] min-w-10 rounded-md transition ${speed === v ? "bg-line text-fg" : "text-muted hover:text-fg"}`}
            >
              {v}×
            </button>
          ))}
        </div>
        <span className="font-display text-lg">
          {byHover ? (
            `bei ${Math.round(hover).toLocaleString("de-DE")} m`
          ) : (
            <>
              {clock(playT)} <span className="text-muted">von {clock(lapTime)}</span>
            </>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted">
        <span className="flex items-center gap-1.5 text-muted">
          <i className="h-2.5 w-2.5 rounded-full bg-accent" />
          {labels.compare}
        </span>
        {hasGap && (
          <span className="flex items-center gap-1.5 text-muted">
            <i className="h-2.5 w-2.5 rounded-full" style={{ background: trafficColor("close") }} />
            Auto vor dir
          </span>
        )}
        {!byHover && (
          <span className="flex items-center gap-1.5 text-muted">
            <i className="h-2.5 w-2.5 rounded-full border-2 border-ref" />
            {labels.reference}
          </span>
        )}
      </div>

      <Legend mode={shown} compare={labels.compare} offTrack={offTrack.length > 0} />
      {shown === "gap" && (
        <p className="text-xs text-muted">
          Abstand von {labels.compare} zum Auto vor dir. Rad an Rad = weniger als eine Wagenlänge (5 m), gerechnet aus
          Abstand und Speed.
        </p>
      )}
      {hasGap && (
        <p className="text-xs text-muted">
          Wo das Auto vor dir ist, ist geschätzt: LMU speichert nur den Abstand in Sekunden, die Position kommt aus deiner
          eigenen Runde.
        </p>
      )}
      <p className="text-xs text-muted">
        Klick auf die Strecke oder eine Kurvennummer zoomt die Telemetrie auf diese Stelle.
        {offTrack.length > 0 && " Neben der Strecke ist geschätzt aus Path Lateral und Track Edge."}
      </p>
    </section>
  );
}

/**
 * Auf 1/100 runden. Math.hypot & Co. liefern in Node und im Browser nicht bitgenau dasselbe,
 * ungerundet passt das Server-HTML dann nicht zum Client (Hydration-Warnung).
 */
const r2 = (v: number) => Math.round(v * 100) / 100;

const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(3)} s`;

/** 83,4 s → 1:23,4 */
function clock(s: number) {
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(1).replace(".", ",");
  return `${m}:${rest.padStart(4, "0")}`;
}

const W = 1000;
// Spuren übereinander, in viewBox-Einheiten: [oben, Höhe]
const LANES = {
  speed: [0, 150],
  throttle: [166, 62],
  brake: [244, 62],
  delta: [322, 62],
} as const;
const H = 384;

/**
 * Speed, Gas, Bremse und Delta über die Distanz. compact = kleine Variante für eine einzelne
 * Kurve: ohne eigenen Rahmen, ohne Zoom.
 */
export const TelemetryChart = memo(function TelemetryChart({
  compact = false,
  corners = [],
  sectorEnds = [],
  reference,
  compare,
  delta,
  stepM,
  labels,
  length,
  view,
  zoomed,
  onZoom,
  hover,
  onHover,
}: {
  reference: DistPoint[];
  compare: DistPoint[];
  delta: DeltaPoint[];
  stepM: number;
  labels: { reference: string; compare: string };
  length: number;
  view: Range;
  zoomed: boolean;
  onZoom: (r: Range | null) => void;
  hover: number | null;
  onHover: (d: number | null) => void;
  compact?: boolean;
  corners?: Corner[];
  sectorEnds?: number[];
}) {
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);

  const inView = <T extends { dist: number }>(list: T[]) =>
    list.filter((p) => p.dist >= view.from - stepM && p.dist <= view.to + stepM);
  const ref = inView(reference);
  const cmp = inView(compare);
  const del = inView(delta);

  const span = view.to - view.from || 1;
  const X = (d: number) => ((d - view.from) / span) * W;

  // Speed und Delta passen sich beim Zoomen an den sichtbaren Bereich an
  const speeds = [...ref, ...cmp].map((p) => p.speed);
  const sMin = zoomed ? Math.max(0, Math.min(...speeds) - 10) : 0;
  const sMax = Math.max(...speeds) + 5;
  // In der Kurven-Ansicht zählt das Delta ab Kurvenbeginn, nicht ab Rundenbeginn
  const base = compact ? (del.at(0)?.delta ?? 0) : 0;
  const dVals = del.map((p) => p.delta - base);
  const dMin = Math.min(0, ...dVals);
  const dMax = Math.max(0.05, ...dVals);

  const lane = (key: keyof typeof LANES, f: number) => {
    const [top, h] = LANES[key];
    return top + h - Math.max(0, Math.min(1, f)) * h;
  };
  const path = <T extends { dist: number }>(pts: T[], y: (p: T) => number) =>
    pts.map((p) => `${X(p.dist).toFixed(1)},${y(p).toFixed(1)}`).join(" ");

  const toDist = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - box.left) / box.width;
    return Math.min(length, Math.max(0, view.from + f * span));
  };

  const hRef = hover !== null ? atDistance(reference, hover, stepM) : undefined;
  const hCmp = hover !== null ? atDistance(compare, hover, stepM) : undefined;
  const hDelta = hover !== null ? atDistance(delta, hover, stepM) : undefined;
  const pct = (v: number | undefined) => (v === undefined ? "–" : `${Math.round(v * 100)} %`);
  const hasGap = reference.some((p) => (p.gap ?? 0) > 0) || compare.some((p) => (p.gap ?? 0) > 0);

  const yPct = (y: number) => `${(y / H) * 100}%`;
  const xPct = (d: number) => `${((d - view.from) / span) * 100}%`;
  const visible = (d: number) => d >= view.from && d <= view.to;
  const laneLabel = (key: keyof typeof LANES, text: string) => {
    const [top, h] = LANES[key];
    return (
      <span className="absolute right-2 text-xs text-muted" style={{ top: yPct(top + h / 2), transform: "translateY(-50%)" }}>
        {text}
      </span>
    );
  };

  // Gitter für km/h alle 50, beschriftet links
  const ticks: number[] = [];
  for (let v = Math.ceil((sMin + 20) / 50) * 50; v <= sMax; v += 50) ticks.push(v);
  const sY = (v: number) => lane("speed", (v - sMin) / (sMax - sMin));
  const zeroY = lane("delta", (0 - dMin) / (dMax - dMin));
  const deltaPts = path(del, (p: DeltaPoint) => lane("delta", (p.delta - base - dMin) / (dMax - dMin)));
  const deltaArea =
    del.length > 0 ? `${X(del.at(0)!.dist).toFixed(1)},${zeroY} ${deltaPts} ${X(del.at(-1)!.dist).toFixed(1)},${zeroY}` : "";
  const [dTop, dH] = LANES.delta;

  // Zeit pro Kurve aus dem Delta, die schlechteste wird orange beschriftet
  const dAt = (d: number) => atDistance(delta, d, stepM)?.delta ?? 0;
  const worst = corners
    .map((c) => ({ c, dt: dAt(c.to) - dAt(c.from) }))
    .filter((x) => x.dt > 0.05)
    .toSorted((a, b) => b.dt - a.dt)
    .at(0)?.c.n;
  const hoverCorner = hover !== null ? corners.find((c) => hover >= c.from && hover < c.to) : undefined;
  const sectorStarts = [0, ...sectorEnds];
  const de = (v: number, d = 0) => v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

  const chart = (
    <div className="min-w-0 flex-[999_1_640px]">
      <div className="flex gap-2">
        <div className="relative w-14 shrink-0">
          {ticks.map((v) => (
            <span key={v} className="absolute right-2 text-xs text-muted" style={{ top: yPct(sY(v)), transform: "translateY(-50%)" }}>
              {v}
            </span>
          ))}
          {laneLabel("throttle", "Gas")}
          {laneLabel("brake", "Bremse")}
          {laneLabel("delta", "Delta")}
        </div>
        <div className="relative min-w-0 flex-1">
          {!compact && sectorEnds.length > 0 && (
            <div className="relative h-5 font-display text-[15px] font-semibold text-muted">
              {sectorStarts.map((from, i) => {
                const to = sectorStarts.at(i + 1) ?? length;
                const mid = (Math.max(from, view.from) + Math.min(to, view.to)) / 2;
                if (to < view.from || from > view.to) return null;
                return (
                  <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: xPct(mid) }}>
                    Sektor {i + 1}
                  </span>
                );
              })}
            </div>
          )}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className={`${compact ? "h-[300px]" : "h-[440px]"} w-full cursor-crosshair touch-none select-none`}
            preserveAspectRatio="none"
            onPointerDown={(e) => {
              if (compact) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const d = toDist(e);
              setDrag({ start: d, end: d });
            }}
            onPointerMove={(e) => {
              const d = toDist(e);
              onHover(d);
              if (drag) setDrag({ ...drag, end: d });
            }}
            onPointerUp={() => {
              if (drag && Math.abs(drag.end - drag.start) > 20) {
                onZoom({ from: Math.min(drag.start, drag.end), to: Math.max(drag.start, drag.end) });
              }
              setDrag(null);
            }}
            onPointerLeave={() => !drag && onHover(null)}
            role="img"
            aria-label={`Speed, Gas, Bremse und Delta von ${labels.compare} und ${labels.reference} über die Distanz`}
          >
            <defs>
              <clipPath id={`above-${compact ? "c" : "m"}`}>
                <rect x={0} y={dTop} width={W} height={Math.max(0, zeroY - dTop)} />
              </clipPath>
              <clipPath id={`below-${compact ? "c" : "m"}`}>
                <rect x={0} y={zeroY} width={W} height={Math.max(0, dTop + dH - zeroY)} />
              </clipPath>
            </defs>
            {(["throttle", "brake", "delta"] as const).map((k) => (
              <rect key={k} x={0} y={LANES[k][0]} width={W} height={LANES[k][1]} fill="var(--color-panel)" />
            ))}
            {ticks.map((v) => (
              <line key={v} x1={0} x2={W} y1={sY(v)} y2={sY(v)} stroke="var(--color-line)" vectorEffect="non-scaling-stroke" />
            ))}
            {corners.filter((c) => visible(c.apex)).map((c) => (
              <line key={c.n} x1={X(c.apex)} x2={X(c.apex)} y1={0} y2={H} stroke="var(--color-line)" vectorEffect="non-scaling-stroke" />
            ))}
            {sectorEnds.filter(visible).map((d) => (
              <line key={d} x1={X(d)} x2={X(d)} y1={0} y2={H} stroke="var(--color-muted)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            ))}

            <polyline points={path(ref, (p: DistPoint) => sY(p.speed))} fill="none" stroke="var(--color-ref)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <polyline points={path(cmp, (p: DistPoint) => sY(p.speed))} fill="none" stroke="var(--color-accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />

            <polyline points={path(ref, (p: DistPoint) => lane("throttle", p.throttle))} fill="none" stroke="var(--color-ref)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
            <polyline points={path(cmp, (p: DistPoint) => lane("throttle", p.throttle))} fill="none" stroke="var(--color-accent)" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />

            <polyline points={path(ref, (p: DistPoint) => lane("brake", p.brake))} fill="none" stroke="var(--color-ref)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
            <polyline points={path(cmp, (p: DistPoint) => lane("brake", p.brake))} fill="none" stroke="var(--color-accent)" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />

            <polygon points={deltaArea} fill="var(--color-loss)" fillOpacity={0.45} clipPath={`url(#above-${compact ? "c" : "m"})`} />
            <polygon points={deltaArea} fill="var(--color-accent)" fillOpacity={0.5} clipPath={`url(#below-${compact ? "c" : "m"})`} />
            <line x1={0} x2={W} y1={zeroY} y2={zeroY} stroke="var(--color-muted)" vectorEffect="non-scaling-stroke" />
            <polyline points={deltaPts} fill="none" stroke="var(--color-loss)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />

            {drag && (
              <rect x={Math.min(X(drag.start), X(drag.end))} y={0} width={Math.abs(X(drag.end) - X(drag.start))} height={H} fill="var(--color-accent)" opacity={0.12} />
            )}
            {hover !== null && visible(hover) && (
              <line x1={X(hover)} x2={X(hover)} y1={0} y2={H} stroke="var(--color-fg)" strokeOpacity={0.7} vectorEffect="non-scaling-stroke" />
            )}
          </svg>

          {hover !== null && visible(hover) && (
            <div
              className="pointer-events-none absolute z-10 w-[210px] rounded-lg border border-line bg-deep px-3.5 py-2.5 text-[13px] shadow-lg"
              style={{
                top: compact ? "8px" : "28%",
                ...(X(hover) / W > 0.62 ? { right: `calc(${(1 - X(hover) / W) * 100}% + 12px)` } : { left: `calc(${(X(hover) / W) * 100}% + 12px)` }),
              }}
            >
              <div className="mb-1 font-display text-base font-semibold">
                {hoverCorner?.name ?? (hoverCorner ? `Kurve ${hoverCorner.n}` : "Gerade")}, {de(Math.round(hover))} m
              </div>
              <div className="flex justify-between text-accent">
                <span>{labels.compare}</span>
                <span>{hCmp ? `${de(hCmp.speed)} km/h` : "–"}</span>
              </div>
              <div className="flex justify-between">
                <span>{labels.reference}</span>
                <span>{hRef ? `${de(hRef.speed)} km/h` : "–"}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Gas / Bremse</span>
                <span>
                  {pct(hCmp?.throttle)} / {pct(hCmp?.brake)}
                </span>
              </div>
              {hasGap && (
                <div className="flex justify-between text-muted">
                  <span>Vordermann</span>
                  <span>{trafficText(hCmp)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted">Delta</span>
                <span className={(hDelta?.delta ?? 0) - base > 0 ? "text-loss" : "text-accent"}>
                  {signed((hDelta?.delta ?? 0) - base)}
                </span>
              </div>
            </div>
          )}

          {!compact && (
            <div className="relative mt-2 h-6 font-display text-sm font-semibold">
              {corners.filter((c) => visible(c.apex)).map((c) => (
                <span
                  key={c.n}
                  className={`absolute -translate-x-1/2 whitespace-nowrap ${c.n === worst ? "text-loss" : ""}`}
                  style={{ left: xPct(c.apex) }}
                >
                  {c.name ?? c.n}
                </span>
              ))}
            </div>
          )}
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>{de(Math.round(view.from))} m</span>
            <span>{compact ? "" : zoomed ? "Ziehen zoomt weiter" : "Ziehen zoomt auf einen Abschnitt"}</span>
            <span>{de(Math.round(view.to))} m</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (compact) return chart;
  return (
    <section className="flex flex-wrap gap-x-10 gap-y-6 border-t border-line py-10">
      <div className="flex-[0_1_220px]">
        <h2 className="font-display text-[30px] leading-tight font-semibold">Telemetrie</h2>
        <p className="mt-2 text-sm text-muted">
          Ziehen zoomt auf einen Abschnitt. Klick auf die Karte oder eine Kurvennummer springt zur Kurve.
        </p>
        <div className="mt-5 flex flex-col gap-2 text-sm">
          <span className="inline-flex items-center gap-2.5">
            <i aria-hidden className="h-[3px] w-[22px] bg-accent" />
            {labels.compare}
          </span>
          <span className="inline-flex items-center gap-2.5">
            <i aria-hidden className="h-0.5 w-[22px] bg-ref" />
            {labels.reference}
          </span>
          <span className="inline-flex items-center gap-2.5 text-muted">
            <i aria-hidden className="h-2.5 w-[22px] bg-loss/45" />
            Delta: {labels.compare} langsamer
          </span>
          <span className="inline-flex items-center gap-2.5 text-muted">
            <i aria-hidden className="h-2.5 w-[22px] bg-accent/50" />
            Delta: {labels.compare} schneller
          </span>
        </div>
        {zoomed && (
          <button onClick={() => onZoom(null)} className="mt-5 min-h-11 rounded-lg bg-panel px-4 text-sm transition hover:bg-line">
            Ganze Runde zeigen
          </button>
        )}
      </div>
      {chart}
    </section>
  );
});

/** Wert auf dem Distanz-Raster: Index = Distanz / Schrittweite */
function atDistance<T>(list: T[], d: number, stepM: number): T | undefined {
  return list.at(Math.min(list.length - 1, Math.max(0, Math.round(d / stepM))));
}

function StartFinish({ outline, project }: { outline: OutlinePoint[]; project: (p: OutlinePoint) => [number, number] }) {
  const a = outline.at(0);
  const b = outline.at(1);
  if (!a || !b) return null;
  const [x1, y1] = project(a);
  const [x2, y2] = project(b);
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / len) * 10;
  const ny = ((x2 - x1) / len) * 10;
  // Text auf die Seite, auf der das linke Ende der Linie liegt
  const left = x1 - nx < x1 + nx ? [x1 - nx, y1 - ny] : [x1 + nx, y1 + ny];
  return (
    <g>
      <line x1={r2(x1 - nx)} y1={r2(y1 - ny)} x2={r2(x1 + nx)} y2={r2(y1 + ny)} stroke="var(--color-fg)" strokeWidth={5} />
      <line x1={r2(x1 - nx)} y1={r2(y1 - ny)} x2={r2(x1 + nx)} y2={r2(y1 + ny)} stroke="var(--color-deep)" strokeWidth={5} strokeDasharray="2.5 2.5" />
      <text x={r2(left[0]! - 8)} y={r2(left[1]! + 5)} textAnchor="end" fontSize={14} fill="var(--color-muted)">
        Start
      </text>
    </g>
  );
}

function Legend({ mode, compare, offTrack }: { mode: Mode; compare: string; offTrack: boolean }) {
  const items: [string, string][] =
    mode === "delta"
      ? [
          [deltaColor(-0.004), `${compare} schneller`],
          [deltaColor(0), "gleich"],
          [deltaColor(0.004), `${compare} langsamer`],
        ]
      : mode === "speed"
        ? [
            [speedColor(80), "langsam"],
            [speedColor(170), ""],
            [speedColor(260), "schnell"],
          ]
        : mode === "gap"
          ? [
              [trafficColor("alongside"), "Rad an Rad"],
              [trafficColor("close"), "unter 1 s"],
              [trafficColor("near"), "1–3 s"],
              [trafficColor("free"), "frei"],
            ]
          : [
            [inputColor({ throttle: 1, brake: 0 }), "Vollgas"],
            [inputColor({ throttle: 0.3, brake: 0 }), "Teilgas / Rollen"],
            [inputColor({ throttle: 0, brake: 1 }), "Bremse"],
          ];
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
      {items.map(([c, l], i) => (
        <span key={i} className="flex items-center gap-2">
          <i aria-hidden className="h-1.5 w-[22px] rounded-full" style={{ background: c }} />
          {l}
        </span>
      ))}
      {offTrack && (
        <span className="flex items-center gap-2">
          <i
            aria-hidden
            className="h-1.5 w-[22px]"
            style={{ background: "repeating-linear-gradient(90deg, var(--color-offtrack) 0 4px, var(--color-fg) 4px 8px)" }}
          />
          neben der Strecke
        </span>
      )}
    </div>
  );
}

/** Blau = schneller, grau = gleich, orange = langsamer. Wert = Sekunden pro Meter. */
function deltaColor(rate: number) {
  const f = Math.max(-1, Math.min(1, rate / 0.003));
  if (Math.abs(f) < 0.08) return "#4a525e";
  // Racing-Design: orange = langsamer, blau = schneller, je kräftiger desto mehr
  return f > 0 ? `hsl(24 ${60 + 40 * f}% ${38 + 24 * f}%)` : `hsl(207 ${50 - 50 * f}% ${40 - 28 * f}%)`;
}

function speedColor(kmh: number) {
  const f = Math.max(0, Math.min(1, (kmh - 60) / 220));
  return `hsl(${220 - f * 220} 80% 55%)`;
}

function trafficColor(t: Traffic | null) {
  if (t === "alongside") return "hsl(320 90% 62%)";
  if (t === "close") return "hsl(270 80% 66%)";
  if (t === "near") return "hsl(265 35% 48%)";
  return "hsl(215 12% 35%)";
}

function inputColor(p: { throttle: number; brake: number } | undefined) {
  if (!p) return "hsl(215 12% 45%)";
  if (p.brake > 0.05) return "hsl(2 80% 58%)";
  if (p.throttle > 0.95) return "hsl(150 60% 48%)";
  return "hsl(45 90% 55%)";
}
