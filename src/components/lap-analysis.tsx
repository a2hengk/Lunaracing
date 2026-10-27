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

const CHART_W = 1000;
const SPEED_H = 180;
const DELTA_TOP = 206;
const DELTA_H = 90;

export function LapAnalysis({ outline, reference, compare, delta, stepM, labels }: Props) {
  const [mode, setMode] = useState<Mode>("delta");
  const [hover, setHover] = useState<number | null>(null);

  const length = reference.at(-1)?.dist ?? 1;
  const at = <T,>(list: T[], d: number) => atDistance(list, d, stepM);

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
        return { key: p.d, x1, y1, x2, y2, color };
      }),
    [outline, mode, proj, lossRate, compare, delta.length, stepM],
  );

  const maxSpeed = Math.max(...reference.map((p) => p.speed), ...compare.map((p) => p.speed));
  const maxDelta = Math.max(0.05, ...delta.map((p) => Math.abs(p.delta)));
  const X = (d: number) => (d / length) * CHART_W;
  const Ys = (v: number) => SPEED_H - (v / maxSpeed) * (SPEED_H - 10);
  const Yd = (v: number) => DELTA_TOP + DELTA_H / 2 - (v / maxDelta) * (DELTA_H / 2);
  const line = (pts: DistPoint[]) => pts.map((p) => `${X(p.dist).toFixed(1)},${Ys(p.speed).toFixed(1)}`).join(" ");

  const marker = hover !== null ? pointAtDistance(outline, hover) : undefined;
  const hoverRef = hover !== null ? at(reference, hover) : undefined;
  const hoverCmp = hover !== null ? at(compare, hover) : undefined;
  const hoverDelta = hover !== null ? at(delta, hover) : undefined;

  const onChartMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - box.left) / box.width;
    setHover(Math.min(length, Math.max(0, f * length)));
  };

  const onMapMove = (e: React.PointerEvent<SVGSVGElement>) => {
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
    setHover(bestDist < 900 ? best.d : null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
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
          className="w-full touch-none"
          onPointerMove={onMapMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label="Streckenkarte"
        >
          {segments.map((s) => (
            <line key={s.key} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth={5} strokeLinecap="round" />
          ))}
          <StartFinish outline={outline} project={proj.project} />
          {marker && (
            <circle cx={proj.project(marker)[0]} cy={proj.project(marker)[1]} r={7} fill="var(--color-fg)" stroke="var(--color-bg)" strokeWidth={3} />
          )}
        </svg>
        <Legend mode={mode} />
      </section>

      <section className="rounded-xl border border-line bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Rundenvergleich</h2>
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 bg-ref" />{labels.reference}</span>
            <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 bg-accent" />{labels.compare}</span>
          </div>
        </div>
        <svg
          viewBox={`0 0 ${CHART_W} ${DELTA_TOP + DELTA_H}`}
          className="h-72 w-full touch-none sm:h-96"
          preserveAspectRatio="none"
          onPointerMove={onChartMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label="Speed und Delta über die Streckendistanz"
        >
          <polyline points={line(reference)} fill="none" stroke="var(--color-ref)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <polyline points={line(compare)} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={CHART_W} y1={Yd(0)} y2={Yd(0)} stroke="var(--color-line)" vectorEffect="non-scaling-stroke" />
          <polyline
            points={delta.map((p) => `${X(p.dist).toFixed(1)},${Yd(p.delta).toFixed(1)}`).join(" ")}
            fill="none"
            stroke="var(--color-loss)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          {hover !== null && (
            <line x1={X(hover)} x2={X(hover)} y1={0} y2={DELTA_TOP + DELTA_H} stroke="var(--color-fg)" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span>Speed (km/h) oben, Delta (s) unten</span>
          <span>{Math.round(length)} m</span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Distanz" value={hover !== null ? `${Math.round(hover)} m` : "–"} />
          <Stat label={labels.reference} value={hoverRef ? `${hoverRef.speed.toFixed(0)} km/h` : "–"} />
          <Stat label={labels.compare} value={hoverCmp ? `${hoverCmp.speed.toFixed(0)} km/h` : "–"} />
          <Stat
            label="Delta"
            value={hoverDelta ? `${hoverDelta.delta >= 0 ? "+" : ""}${hoverDelta.delta.toFixed(3)} s` : `+${delta.at(-1)?.delta.toFixed(3)} s`}
          />
        </dl>
      </section>
    </div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg px-3 py-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
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
