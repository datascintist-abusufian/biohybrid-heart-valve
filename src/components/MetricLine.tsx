import React from "react";
import type { SensorData } from "../types/valve";

type Props = {
  title: string;
  history: SensorData[];
  accessor: (d: SensorData) => number;
  colorClass?: string; // tailwind stroke color
};

export default function MetricLine({ title, history, accessor, colorClass = "stroke-sky-500" }: Props) {
  const data = history.slice(-60); // last minute
  const values = data.map(accessor);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);

  const w = 320, h = 120, pad = 10;
  const toX = (i: number) => pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2);
  const toY = (v: number) => {
    if (max === min) return h / 2;
    return h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  };

  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(v)}`)
    .join(" ");

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
      <p className="text-sm font-medium mb-2">{title}</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <rect x="0" y="0" width={w} height={h} className="fill-transparent" />
        {/* baseline */}
        <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} className="stroke-slate-200 dark:stroke-slate-700" />
        <path d={path} className={`${colorClass} fill-none`} strokeWidth={2} />
      </svg>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        min {min.toFixed(1)} — max {max.toFixed(1)}
      </div>
    </div>
  );
}