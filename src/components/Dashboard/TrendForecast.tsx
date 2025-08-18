import React, { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend } from "recharts";
import type { SensorData } from "../../types/valve";
import { forecastSeries, etaToThreshold } from "../../utils/predict";

const TrendForecast: React.FC<{ history: SensorData[]; threshold?: number }> = ({ history, threshold = 70 }) => {
  const data = useMemo(() => {
    const last120 = history.slice(-120);
    const xs = last120.map((_, i) => i + 1);
    const risk = last120.map(d => d.status.risk);
    const { xs: fx, ys: fy } = forecastSeries(xs, risk, 14);

    const base = last120.map((d, i) => ({
      t: new Date(d.timestamp).toLocaleTimeString("en-GB", { minute: "2-digit", second: "2-digit" }),
      Risk: Number.isFinite(d.status.risk) ? +d.status.risk.toFixed(2) : 0,
    }));

    const lastLabel = base[base.length - 1]?.t ?? "t";
    const frows = fx.map((k, idx) => ({
      t: `${lastLabel}+${idx + 1}`,
      RiskForecast: Number.isFinite(fy[idx]) ? +fy[idx].toFixed(2) : 0
    }));

    return [...base, ...frows];
  }, [history]);

  const eta = useMemo(() => {
    const xs = history.slice(-120).map((_, i) => i + 1);
    const ys = history.slice(-120).map(d => d.status.risk);
    return etaToThreshold(xs, ys, threshold);
  }, [history, threshold]);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Risk trend & forecast</h3>
        <div className="text-xs text-slate-500">
          {eta.steps === Infinity ? "Stable" : `ETA to ${threshold}% ≈ ${eta.steps} samples`}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
            <XAxis dataKey="t" tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <ReferenceLine y={threshold} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `Threshold ${threshold}%`, fill: "#ef4444", position: "insideTopLeft" }} />
            <Line type="monotone" dataKey="Risk" stroke="#f59e0b" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="RiskForecast" stroke="#0ea5e9" dot={false} strokeDasharray="6 4" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TrendForecast;