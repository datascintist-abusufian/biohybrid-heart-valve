import React from "react";
import type { SensorStatus } from "../types/valve";

const Tile: React.FC<{ label: string; value: string; sub?: string }> = ({label, value, sub}) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-3">
    <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    <div className="text-2xl font-semibold">{value}</div>
    {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
  </div>
);

const KpiHeader: React.FC<{ status: SensorStatus }> = ({ status }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <Tile label="Wear" value={`${status.wear.toFixed(1)} %`} />
    <Tile label="Damage" value={`${status.damage.toFixed(1)} %`} />
    <Tile label="Flow rate" value={`${status.flowRate.toFixed(0)} mL/s`} />
    <Tile label="Pressure" value={`${status.pressure.toFixed(0)} mmHg`} />
  </div>
);

export default KpiHeader;