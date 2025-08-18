import React from "react";
import type { ValveStatus } from "../types/valve";
import { analyzeValveHealth } from "../utils/valveAnalytics";

export default function StatusCard({ status }: { status: ValveStatus }) {
  const msg = analyzeValveHealth(status);
  return (
    <div className="grid gap-2 text-sm">
      <p title="Material degradation over time">Wear: {status.wear.toFixed(1)}%</p>
      <p title="Cumulative structural compromise">Damage: {status.damage.toFixed(1)}%</p>
      <p className="mt-2" title="Approximate volumetric flow">
        Flow Rate: {status.flowRate.toFixed(1)} mL/s
      </p>
      <p title="Upstream pressure proxy">
        Pressure: {status.pressure.toFixed(3)} mmHg
      </p>
      <p className="mt-2 font-semibold">
        Health Status:{" "}
        <span className="font-bold">
          {msg}
        </span>
      </p>
      <p className="text-slate-500 dark:text-slate-400">
        Risk Score: {((status.wear * 0.3) + (status.damage * 0.7)).toFixed(1)}
      </p>
    </div>
  );
}