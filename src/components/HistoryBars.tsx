import React from "react";
import type { SensorData } from "../types/valve";
import { calculateRiskScore } from "../utils/valveAnalytics";

/** Simple responsive bar chart for risk history (last 20 points) */
export default function HistoryBars({ history }: { history: SensorData[] }) {
  const last = history.slice(-20);
  const scores = last.map((d) => calculateRiskScore(d.status));
  const max = Math.max(100, ...scores);

  return (
    <div className="h-40 flex items-end gap-2">
      {scores.map((s, i) => {
        const h = (s / max) * 100;
        const color = s > 70 ? "bg-rose-400" : s > 50 ? "bg-amber-400" : "bg-emerald-400";
        return (
          <div key={i} className="flex-1">
            <div
              className={`rounded-t ${color}`}
              style={{ height: `${Math.max(4, h)}%` }}
              title={`Risk: ${s.toFixed(1)}`}
            />
          </div>
        );
      })}
    </div>
  );
}