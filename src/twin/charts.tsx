import React from "react";

export interface Series {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  color: string;
  label: string;
  dash?: string;
  width?: number;
}

export interface RefLine {
  y?: number;
  x?: number;
  label?: string;
  color?: string;
}

interface PlotProps {
  series: Series[];
  xLabel: string;
  yLabel: string;
  height?: number;
  xDomain?: [number, number];
  yDomain?: [number, number];
  cursorIndex?: number; // index into series[0]..[n] to draw moving markers
  cursorX?: number; // vertical cursor line at x
  refs?: RefLine[];
  closedLoop?: boolean;
}

function niceTicks(lo: number, hi: number, n = 5) {
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

function extent(arrs: ArrayLike<number>[], pad = 0.06): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const a of arrs)
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (Number.isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
  if (!Number.isFinite(lo)) return [0, 1];
  const d = (hi - lo || Math.abs(hi) || 1) * pad;
  return [lo - d, hi + d];
}

/** Lightweight SVG line plot, cheap enough to re-render every animation frame. */
export const Plot: React.FC<PlotProps> = ({
  series,
  xLabel,
  yLabel,
  height = 220,
  xDomain,
  yDomain,
  cursorIndex,
  cursorX,
  refs = [],
  closedLoop,
}) => {
  const W = 560;
  const H = height;
  const m = { l: 48, r: 12, t: 10, b: 34 };
  const [x0, x1] = xDomain ?? extent(series.map((s) => s.x), 0);
  const [y0, y1] = yDomain ?? extent(series.map((s) => s.y));
  const sx = (v: number) => m.l + ((v - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const sy = (v: number) => H - m.b - ((v - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);

  const paths = React.useMemo(
    () =>
      series.map((s) => {
        let d = "";
        const step = Math.max(1, Math.floor(s.x.length / 500));
        for (let i = 0; i < s.x.length; i += step) d += `${i === 0 ? "M" : "L"}${sx(s.x[i]).toFixed(1)},${sy(s.y[i]).toFixed(1)}`;
        if (closedLoop) d += "Z";
        return d;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, x0, x1, y0, y1, H]
  );

  const xt = niceTicks(x0, x1);
  const yt = niceTicks(y0, y1);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label={`${yLabel} vs ${xLabel}`}>
        {yt.map((v) => (
          <g key={`y${v}`}>
            <line x1={m.l} x2={W - m.r} y1={sy(v)} y2={sy(v)} className="stroke-slate-200 dark:stroke-slate-800" />
            <text x={m.l - 6} y={sy(v) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
              {v}
            </text>
          </g>
        ))}
        {xt.map((v) => (
          <text key={`x${v}`} x={sx(v)} y={H - m.b + 16} textAnchor="middle" className="fill-slate-500 text-[11px]">
            {v}
          </text>
        ))}
        <line x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} className="stroke-slate-400 dark:stroke-slate-600" />
        <text x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle" className="fill-slate-500 text-[11px]">
          {xLabel}
        </text>
        <text transform={`translate(12 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle" className="fill-slate-500 text-[11px]">
          {yLabel}
        </text>
        {refs.map((r, i) =>
          r.y !== undefined ? (
            <g key={`r${i}`}>
              <line x1={m.l} x2={W - m.r} y1={sy(r.y)} y2={sy(r.y)} stroke={r.color ?? "#94a3b8"} strokeDasharray="4 4" />
              {r.label && (
                <text x={W - m.r - 4} y={sy(r.y) - 4} textAnchor="end" fill={r.color ?? "#94a3b8"} className="text-[10px]">
                  {r.label}
                </text>
              )}
            </g>
          ) : r.x !== undefined ? (
            <line key={`r${i}`} x1={sx(r.x)} x2={sx(r.x)} y1={m.t} y2={H - m.b} stroke={r.color ?? "#94a3b8"} strokeDasharray="4 4" />
          ) : null
        )}
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={series[i].color}
            strokeWidth={series[i].width ?? 2}
            strokeDasharray={series[i].dash}
            strokeLinejoin="round"
          />
        ))}
        {cursorX !== undefined && (
          <line x1={sx(cursorX)} x2={sx(cursorX)} y1={m.t} y2={H - m.b} className="stroke-slate-500/60" />
        )}
        {cursorIndex !== undefined &&
          series.map((s, i) =>
            cursorIndex < s.x.length ? (
              <circle key={`c${i}`} cx={sx(s.x[cursorIndex])} cy={sy(s.y[cursorIndex])} r={4} fill={s.color} stroke="white" strokeWidth={1.5} />
            ) : null
          )}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-12 text-xs text-slate-600 dark:text-slate-400">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <svg width="18" height="6">
              <line x1="0" x2="18" y1="3" y2="3" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} />
            </svg>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
};

/**
 * En-face view of a trileaflet aortic valve. The dark orifice scales with the
 * instantaneous effective area relative to the annulus; a closed valve with a
 * regurgitant orifice keeps a small central gap.
 */
export const ValveFace: React.FC<{
  area: number; // instantaneous effective area, cm^2
  annulus: number; // reference area, cm^2
  leaflets?: 2 | 3;
  label: string;
  damage?: number; // 0..1 for leaflet tint
}> = ({ area, annulus, leaflets = 3, label, damage = 0 }) => {
  const R = 46;
  const frac = Math.min(1, Math.max(0, Math.sqrt(area / annulus)));
  const r = R * 0.95 * frac;
  const pts: string[] = [];
  const N = 90;
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2 - Math.PI / 2;
    // orifice shape: rounded triangle (3 leaflets) or slit-ellipse (2 leaflets)
    const shape =
      leaflets === 3 ? 1 / (1 + 0.18 * Math.cos(3 * (th + Math.PI / 2))) : 1;
    const rx = leaflets === 3 ? r * shape : r * 1.15;
    const ry = leaflets === 3 ? r * shape : r * 0.55;
    pts.push(`${(60 + rx * Math.cos(th)).toFixed(2)},${(60 + ry * Math.sin(th)).toFixed(2)}`);
  }
  const tissue = `hsl(${Math.round(350 - damage * 310)}, ${Math.round(55 - damage * 25)}%, ${Math.round(78 - damage * 18)}%)`;
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 120 120" className="w-28 h-28">
        <circle cx={60} cy={60} r={R + 6} className="fill-slate-300 dark:fill-slate-700" />
        <circle cx={60} cy={60} r={R} fill={tissue} />
        {leaflets === 3 &&
          [0, 1, 2].map((k) => {
            const th = (k * 2 * Math.PI) / 3 - Math.PI / 2 + Math.PI / 3;
            return (
              <line
                key={k}
                x1={60}
                y1={60}
                x2={60 + R * Math.cos(th)}
                y2={60 + R * Math.sin(th)}
                stroke="rgba(120,40,60,0.45)"
                strokeWidth={1.2}
              />
            );
          })}
        {leaflets === 2 && <line x1={60 - R} x2={60 + R} y1={60} y2={60} stroke="rgba(120,40,60,0.45)" strokeWidth={1.2} />}
        <polygon points={pts.join(" ")} className="fill-slate-900 dark:fill-black" />
      </svg>
      <figcaption className="text-xs text-slate-600 dark:text-slate-400 text-center">
        {label}
        <br />
        <span className="font-mono">{area.toFixed(2)} cm²</span>
      </figcaption>
    </figure>
  );
};
