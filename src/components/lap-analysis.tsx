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
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {map}
        {aside}
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
  const proj = useMemo(() => fitToBox(outline, 560, 440, 34), [outline]);

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
      return { c, x: r2(mx + nx * 18), y: r2(my + ny * 18), mx: r2(mx), my: r2(my) };
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
    <section className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Strecke</h2>
        <div className="flex flex-wrap gap-1 rounded-lg bg-bg p-1 text-xs">
          {(
            [
              ["delta", "Delta"],
              ["speed", "Speed"],
              ["inputs", "Gas/Bremse"],
              ...(hasGap ? ([["gap", "Vordermann"]] as const) : []),
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 transition ${shown === m ? "bg-accent/20 text-accent" : "text-muted hover:text-fg"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${proj.width} ${proj.height}`}
        className="block max-h-[560px] w-full cursor-zoom-in touch-none"
        onPointerMove={(e) => setHover(nearestOnMap(e))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const d = nearestOnMap(e);
          if (d !== null) zoomTo(d);
        }}
        role="img"
        aria-label="Streckenkarte"
      >
        {segmentEls}
        {offTrackLines.map((o) => (
          <polyline key={o.key} points={o.points} fill="none" stroke="hsl(30 95% 58%)" strokeWidth={11} strokeOpacity={0.45} strokeLinecap="round" />
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
                <line x1={l.mx} y1={l.my} x2={l.x} y2={l.y} stroke="var(--color-muted)" strokeWidth={1} />
                <circle cx={l.x} cy={l.y} r={9} fill="var(--color-panel)" stroke="var(--color-muted)" strokeWidth={1} />
                <text x={l.x} y={l.y + 3.5} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-fg)">
                  {l.c.n}
                </text>
              </g>
            ),
        )}
        {ghost && <circle cx={ghost[0]} cy={ghost[1]} r={5.5} fill="var(--color-panel)" stroke="var(--color-ref)" strokeWidth={2} />}
        {ahead && (
          <g>
            <circle cx={ahead[0]} cy={ahead[1]} r={6} fill={aheadColor} stroke="var(--color-bg)" strokeWidth={2.5} />
            <text x={ahead[0] + 10} y={ahead[1] - 8} fontSize={10} fontWeight={600} fill={aheadColor} stroke="var(--color-panel)" strokeWidth={3} paintOrder="stroke">
              {trafficText(here)}
            </text>
          </g>
        )}
        {me && <circle cx={me[0]} cy={me[1]} r={7} fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth={3} />}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <button
          onClick={togglePlay}
          className="rounded-md bg-accent/15 px-2.5 py-1 text-accent transition hover:bg-accent/25"
          aria-label={playing ? "Wiedergabe anhalten" : "Runde abspielen"}
        >
          {playing ? "❚❚ Pause" : playT >= lapTime ? "↻ Nochmal" : "▶ Weiter"}
        </button>
        <div className="flex gap-1 rounded-lg bg-bg p-0.5">
          {SPEEDS.map((v) => (
            <button
              key={v}
              onClick={() => setSpeed(v)}
              className={`rounded-md px-2 py-0.5 transition ${speed === v ? "bg-accent/20 text-accent" : "text-muted hover:text-fg"}`}
            >
              {v}×
            </button>
          ))}
        </div>
        <span className="font-mono text-muted tabular-nums">
          {byHover ? `bei ${Math.round(hover)} m` : `${clock(playT)} / ${clock(lapTime)}`}
        </span>
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

      <Legend mode={shown} />
      {shown === "gap" && (
        <p className="mt-2 text-[11px] text-muted">
          Abstand von {labels.compare} zum Auto vor dir. Rad an Rad = weniger als eine Wagenlänge (5 m), gerechnet aus
          Abstand und Speed.
        </p>
      )}
      {hasGap && (
        <p className="mt-2 text-[11px] text-muted">
          Wo das Auto vor dir ist, ist geschätzt: LMU speichert nur den Abstand in Sekunden, die Position kommt aus deiner
          eigenen Runde.
        </p>
      )}
      {offTrack.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          <i className="h-2 w-5 rounded-full" style={{ background: "hsl(30 95% 58% / 0.6)" }} />
          {labels.compare} neben der Strecke (geschätzt aus Path Lateral und Track Edge)
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted">Klick auf die Strecke oder eine Kurvennummer zoomt die Telemetrie auf diese Stelle.</p>
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
  const area = (pts: DistPoint[], key: "throttle" | "brake") => {
    const [top, h] = LANES[key];
    if (pts.length === 0) return "";
    return `${X(pts.at(0)!.dist)},${top + h} ${path(pts, (p: DistPoint) => lane(key, p[key]))} ${X(pts.at(-1)!.dist)},${top + h}`;
  };

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

  const laneLabel = (key: keyof typeof LANES, text: string) => {
    const [top, h] = LANES[key];
    return (
      <span className="absolute left-0 text-[11px] text-muted" style={{ top: `${((top + h / 2) / H) * 100}%`, transform: "translateY(-50%)" }}>
        {text}
      </span>
    );
  };

  const Box = compact ? "div" : "section";
  return (
    <Box className={compact ? "" : "rounded-xl border border-line bg-panel p-4"}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {!compact && <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Telemetrie</h2>}
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 bg-ref" />{labels.reference}</span>
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 bg-accent" />{labels.compare}</span>
          {zoomed && !compact && (
            <button onClick={() => onZoom(null)} className="rounded-md bg-bg px-2.5 py-1 text-muted transition hover:text-fg">
              Ganze Runde
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative w-12 shrink-0">
          {laneLabel("speed", "km/h")}
          {laneLabel("throttle", "Gas")}
          {laneLabel("brake", "Bremse")}
          {laneLabel("delta", "Delta")}
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={`${compact ? "h-[300px]" : "h-[420px]"} w-full cursor-crosshair touch-none select-none`}
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
          aria-label="Speed, Gas, Bremse und Delta über die Streckendistanz"
        >
          {(["throttle", "brake", "delta"] as const).map((k) => (
            <rect key={k} x={0} y={LANES[k][0]} width={W} height={LANES[k][1]} fill="var(--color-bg)" opacity={0.5} />
          ))}

          <polyline points={path(ref, (p: DistPoint) => lane("speed", (p.speed - sMin) / (sMax - sMin)))} fill="none" stroke="var(--color-ref)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <polyline points={path(cmp, (p: DistPoint) => lane("speed", (p.speed - sMin) / (sMax - sMin)))} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />

          <polygon points={area(cmp, "throttle")} fill="var(--color-good)" opacity={0.15} />
          <polyline points={path(ref, (p: DistPoint) => lane("throttle", p.throttle))} fill="none" stroke="var(--color-ref)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
          <polyline points={path(cmp, (p: DistPoint) => lane("throttle", p.throttle))} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />

          <polygon points={area(cmp, "brake")} fill="var(--color-loss)" opacity={0.15} />
          <polyline points={path(ref, (p: DistPoint) => lane("brake", p.brake))} fill="none" stroke="var(--color-ref)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
          <polyline points={path(cmp, (p: DistPoint) => lane("brake", p.brake))} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />

          <line x1={0} x2={W} y1={lane("delta", (0 - dMin) / (dMax - dMin))} y2={lane("delta", (0 - dMin) / (dMax - dMin))} stroke="var(--color-line)" vectorEffect="non-scaling-stroke" />
          <polyline points={path(del, (p: DeltaPoint) => lane("delta", (p.delta - base - dMin) / (dMax - dMin)))} fill="none" stroke="var(--color-loss)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />

          {drag && (
            <rect x={Math.min(X(drag.start), X(drag.end))} y={0} width={Math.abs(X(drag.end) - X(drag.start))} height={H} fill="var(--color-accent)" opacity={0.12} />
          )}
          {hover !== null && hover >= view.from && hover <= view.to && (
            <line x1={X(hover)} x2={X(hover)} y1={0} y2={H} stroke="var(--color-fg)" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      </div>
      <div className="mt-1 flex justify-between pl-14 text-[11px] text-muted">
        <span>{Math.round(view.from)} m</span>
        <span>{compact ? "" : zoomed ? "Ziehen zum weiteren Zoomen" : "Ziehen zum Zoomen"}</span>
        <span>{Math.round(view.to)} m</span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] text-muted">
            <tr>
              <th className="py-1 pr-3 font-normal">{hover !== null ? `bei ${Math.round(hover)} m` : "Maus über den Graph"}</th>
              <th className="py-1 pr-3 font-normal">Speed</th>
              <th className="py-1 pr-3 font-normal">Gas</th>
              <th className="py-1 pr-3 font-normal">Bremse</th>
              {hasGap && <th className="py-1 pr-3 font-normal">Vordermann</th>}
              <th className="py-1 font-normal">Delta</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            <tr>
              <td className="py-1 pr-3 font-sans text-ref">{labels.reference}</td>
              <td className="py-1 pr-3">{hRef ? `${hRef.speed.toFixed(0)} km/h` : "–"}</td>
              <td className="py-1 pr-3">{pct(hRef?.throttle)}</td>
              <td className="py-1 pr-3">{pct(hRef?.brake)}</td>
              {hasGap && <td className="py-1 pr-3">{trafficText(hRef)}</td>}
              <td className="py-1" rowSpan={2}>
                {signed(hDelta ? hDelta.delta - base : (compact ? (del.at(-1)?.delta ?? 0) : (delta.at(-1)?.delta ?? 0)) - base)}
              </td>
            </tr>
            <tr>
              <td className="py-1 pr-3 font-sans text-accent">{labels.compare}</td>
              <td className="py-1 pr-3">{hCmp ? `${hCmp.speed.toFixed(0)} km/h` : "–"}</td>
              <td className="py-1 pr-3">{pct(hCmp?.throttle)}</td>
              <td className="py-1 pr-3">{pct(hCmp?.brake)}</td>
              {hasGap && <td className="py-1 pr-3">{trafficText(hCmp)}</td>}
            </tr>
          </tbody>
        </table>
      </div>
    </Box>
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
  return <line x1={r2(x1 - nx)} y1={r2(y1 - ny)} x2={r2(x1 + nx)} y2={r2(y1 + ny)} stroke="var(--color-fg)" strokeWidth={3} />;
}

function Legend({ mode }: { mode: Mode }) {
  const items: [string, string][] =
    mode === "delta"
      ? [
          [deltaColor(-0.004), "Zeit gewonnen"],
          [deltaColor(0), "gleich"],
          [deltaColor(0.004), "Zeit verloren"],
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
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
      {items.map(([c, l], i) => (
        <span key={i} className="flex items-center gap-1.5">
          <i className="h-2 w-5 rounded-full" style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  );
}

/** Grün = Zeit gewonnen, grau = gleich, rot = Zeit verloren. Wert = Sekunden pro Meter. */
function deltaColor(rate: number) {
  const f = Math.max(-1, Math.min(1, rate / 0.003));
  if (Math.abs(f) < 0.08) return "hsl(215 12% 45%)";
  return f > 0 ? `hsl(2 ${55 + 30 * f}% ${45 + 12 * f}%)` : `hsl(150 ${55 - 30 * f}% ${42 - 10 * f}%)`;
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
