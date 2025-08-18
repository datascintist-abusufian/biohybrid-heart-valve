import React from "react";
import type { Alert } from "../utils/alerts";

const Dot = ({ sev }: { sev: Alert["severity"] }) => {
  const cls = sev === "high" ? "bg-red-500"
    : sev === "med" ? "bg-amber-500" : "bg-sky-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${cls} mr-2`} />;
};

const AlertsPanel: React.FC<{ alerts: Alert[] }> = ({ alerts }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-semibold">Alerts</h3>
      <span className="text-xs text-slate-500">{alerts.length}</span>
    </div>
    <div className="space-y-2 max-h-56 overflow-auto pr-1">
      {alerts.length === 0 && (
        <div className="text-sm text-slate-500">No active alerts</div>
      )}
      {alerts.map(a => (
        <div key={a.id} className="flex items-start gap-2 text-sm">
          <Dot sev={a.severity} />
          <div>
            <div className="font-medium">{a.title}</div>
            {a.detail && <div className="text-slate-500">{a.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default AlertsPanel;