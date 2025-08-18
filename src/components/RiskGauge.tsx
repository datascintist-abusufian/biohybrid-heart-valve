import React from "react";

/** Simple semicircular gauge 0..100 using SVG */
export default function RiskGauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const pct = v / 100;
  const r = 90;
  const cx = 100, cy = 110;

  // angle from 180° (left) to 0° (right)
  const angle = Math.PI * (1 - pct);
  const x = cx + r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);

  const color =
    v > 70 ? "#ef4444" : v > 50 ? "#f59e0b" : "#10b981";

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 200 120" className="w-full max-w-sm">
        {/* track */}
        <path
          d="M10 110 A90 90 0 0 1 190 110"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="16"
        />
        {/* indicator */}
        <path
          d="M10 110 A90 90 0 0 1 190 110"
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeDasharray="282.6"
          strokeDashoffset={282.6 * (1 - pct)}
          strokeLinecap="round"
        />
        {/* needle */}
        <line
          x1={cx}
          y1={cy}
          x2={x}
          y2={y}
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
        />
        <text x="100" y="105" textAnchor="middle" className="fill-slate-600 dark:fill-slate-300" fontSize="12">
          0
        </text>
        <text x="10" y="105" textAnchor="start" className="fill-slate-600 dark:fill-slate-300" fontSize="12">
          Risk
        </text>
        <text x="190" y="105" textAnchor="end" className="fill-slate-600 dark:fill-slate-300" fontSize="12">
          100
        </text>
      </svg>
      <div className="min-w-[100px]">
        <p className="text-sm text-slate-500 dark:text-slate-400">Risk</p>
        <p className="text-3xl font-bold">{v.toFixed(1)}</p>
      </div>
    </div>
  );
}