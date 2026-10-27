"use client";

import { useMemo, useState } from "react";
import type { DeltaPoint, DistPoint } from "@/lib/telemetry/compare";
import { fitToBox, pointAtDistance, type OutlinePoint } from "@/lib/track/outline";

type Mode = "delta" | "speed" | "inputs";

type Props = {
  outline: OutlinePoint[];
  /** Referenzrunde (meist die Bestrunde) */
  reference: DistPoint[];
  /** Runde, die mit der Referenz verglichen wird */
  compare: DistPoint[];
  delta: DeltaPoint[];
  stepM: number;
  labels: { reference: string; compare: string };
};

type Range = { from: number; to: number };

export function LapAnalysis({ outline, reference, compare, delta, stepM, labels }: Props) {
  const [mode, setMode] = useState<Mode>("delta");
  const [hover, setHover] = useState<number | null>(null);
  const [range, setRange] = useState<Range | null>(null);

  const length = reference.at(-1)?.dist ?? 1;
  const view = range ?? { from: 0, to: length };

  const proj = useMemo(() => fitToBox(outline, 560, 440), [outline]);

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

  const segments = useMemo(
    () =>
      outline.slice(0, -1).map((p, i) => {
        const q = outline.at(i + 1)!;
        const mid = (p.d + q.d) / 2;
        const k = Math.min(delta.length - 1, Math.round(mid / stepM));
        let color: string;
        if (mode === "delta") color = deltaColor(lossRate.at(k) ?? 0);
        else if (mode === "speed") color = speedColor(atDistance(compare, mid, stepM)?.speed ?? 0);
        else color = inputColor(atDistance(compare, mid, stepM));
        const [x1, y1] = proj.project(p);
        const [x2, y2] = proj.project(q);
        return { key: p.d, mid, x1, y1, x2, y2, color };
      }),
    [outline, mode, proj, lossRate, compare, delta.length, stepM],
  );

  const marker = hover !== null ? pointAtDistance(outline, hover) : undefined;

  const nearestOnMap = (e: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - box.left) / box.width) * proj.width;
    const sy = ((e.clientY - box.top) / box.height) * proj.height;
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <section className="rounded-xl border border-line bg-panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Strecke</h2>
          <div className="flex gap-1 rounded-lg bg-bg p-1 text-xs">
            {(
              [
                ["delta", "Delta"],
                ["speed", "Speed"],
                ["inputs", "Gas/Bremse"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-2.5 py-1 transition ${mode === m ? "bg-accent/20 text-accent" : "text-muted hover:text-fg"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <svg
          viewBox={`0 0 ${proj.width} ${proj.height}`}
          className="w-full cursor-zoom-in touch-none"
          onPointerMove={(e) => setHover(nearestOnMap(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const d = nearestOnMap(e);
            if (d !== null) zoomTo(d);
          }}
          role="img"
          aria-label="Streckenkarte"
        >
          {segments.map((s) => (
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
          ))}
          <StartFinish outline={outline} project={proj.project} />
          {marker && (
            <circle cx={proj.project(marker)[0]} cy={proj.project(marker)[1]} r={7} fill="var(--color-fg)" stroke="var(--color-bg)" strokeWidth={3} />
          )}
        </svg>
        <Legend mode={mode} />
        <p className="mt-2 text-[11px] text-muted">Klick auf die Strecke zoomt die Telemetrie auf diese Stelle.</p>
      </section>

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
    </div>
  );
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

function TelemetryChart({
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
  const dVals = del.map((p) => p.delta);
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

  const laneLabel = (key: keyof typeof LANES, text: string) => {
    const [top, h] = LANES[key];
    return (
      <span className="absolute left-0 text-[11px] text-muted" style={{ top: `${((top + h / 2) / H) * 100}%`, transform: "translateY(-50%)" }}>
        {text}
      </span>
    );
  };

  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Telemetrie</h2>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 bg-ref" />{labels.reference}</span>
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 bg-accent" />{labels.compare}</span>
          {zoomed && (
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
          className="h-[420px] w-full cursor-crosshair touch-none select-none"
          preserveAspectRatio="none"
          onPointerDown={(e) => {
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
          <polyline points={path(del, (p: DeltaPoint) => lane("delta", (p.delta - dMin) / (dMax - dMin)))} fill="none" stroke="var(--color-loss)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />

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
        <span>{zoomed ? "Ziehen zum weiteren Zoomen" : "Ziehen zum Zoomen"}</span>
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
              <th className="py-1 font-normal">Delta</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            <tr>
              <td className="py-1 pr-3 font-sans text-ref">{labels.reference}</td>
              <td className="py-1 pr-3">{hRef ? `${hRef.speed.toFixed(0)} km/h` : "–"}</td>
              <td className="py-1 pr-3">{pct(hRef?.throttle)}</td>
              <td className="py-1 pr-3">{pct(hRef?.brake)}</td>
              <td className="py-1" rowSpan={2}>
                {hDelta
                  ? `${hDelta.delta >= 0 ? "+" : ""}${hDelta.delta.toFixed(3)} s`
                  : `${(delta.at(-1)?.delta ?? 0) >= 0 ? "+" : ""}${delta.at(-1)?.delta.toFixed(3)} s`}
              </td>
            </tr>
            <tr>
              <td className="py-1 pr-3 font-sans text-accent">{labels.compare}</td>
              <td className="py-1 pr-3">{hCmp ? `${hCmp.speed.toFixed(0)} km/h` : "–"}</td>
              <td className="py-1 pr-3">{pct(hCmp?.throttle)}</td>
              <td className="py-1 pr-3">{pct(hCmp?.brake)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

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
  return <line x1={x1 - nx} y1={y1 - ny} x2={x1 + nx} y2={y1 + ny} stroke="var(--color-fg)" strokeWidth={3} />;
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

function inputColor(p: { throttle: number; brake: number } | undefined) {
  if (!p) return "hsl(215 12% 45%)";
  if (p.brake > 0.05) return "hsl(2 80% 58%)";
  if (p.throttle > 0.95) return "hsl(150 60% 48%)";
  return "hsl(45 90% 55%)";
}
