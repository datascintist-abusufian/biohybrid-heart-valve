import React, { useMemo } from "react";
import { useValveData } from "../../hooks/useValveData";
import StatusCard from "../StatusCard";
import RiskGauge from "../RiskGauge";
import CombinedHistory from "./CombinedHistory"; // keep your existing combined chart
import KpiHeader from "../KpiHeader";
import AlertsPanel from "../AlertsPanel";
import WorkOrdersPanel from "../WorkOrdersPanel";
import TrendForecast from "./TrendForecast";
import { deriveAlerts } from "../../utils/alerts";

const Dashboard: React.FC = () => {
  const { current, history, resetHistory, exporting } = useValveData();

  const prev = history.length > 1 ? history[history.length - 2].status : undefined;
  const alerts = useMemo(() => deriveAlerts(current.status, prev), [current, prev]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-10 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Valve Repair Dashboard</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Real-time monitoring • Forecasting • Maintenance</p>
          </div>
          <button
            onClick={() => {
              const root = document.documentElement;
              root.classList.toggle("dark");
              localStorage.setItem("theme", root.classList.contains("dark") ? "dark" : "light");
            }}
            className="rounded-xl px-3 py-2 text-sm font-medium bg-slate-900 text-white dark:bg-white dark:text-slate-900"
            title="Toggle theme"
          >
            Toggle Theme
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <KpiHeader status={current.status} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column (8/12) */}
          <section className="lg:col-span-8 space-y-6">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5">
              <h2 className="text-lg font-semibold mb-4">Valve status</h2>
              <StatusCard status={current.status} />
              <div className="mt-4 flex items-center gap-3">
                <button onClick={resetHistory} className="rounded-xl px-3 py-2 text-sm font-medium bg-slate-900 text-white dark:bg-white dark:text-slate-900">Reset History</button>
                <button onClick={exporting.downloadCSV} className="rounded-xl px-3 py-2 text-sm font-medium bg-slate-200 dark:bg-slate-800">Download CSV</button>
              </div>
            </div>

            <TrendForecast history={history} threshold={70} />

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5">
              <h2 className="text-lg font-semibold mb-4">Historical data (combined)</h2>
              <CombinedHistory history={history} />
              <p className="mt-3 text-xs text-slate-500">
                Left axis: % (wear, damage, risk). Right axis: flow (mL/s), pressure (mmHg). Risk thresholds at 50 and 70.
              </p>
            </div>
          </section>

          {/* Right column (4/12) */}
          <aside className="lg:col-span-4 space-y-6">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5">
              <h2 className="text-lg font-semibold mb-4">Risk score</h2>
              <RiskGauge value={exporting.riskScore(current.status)} />
            </div>

            <AlertsPanel alerts={alerts} />
            <WorkOrdersPanel />
          </aside>
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
        <div className="flex items-center justify-between">
          <p>© {new Date().getFullYear()} Md Abu Sufian • MIT License</p>
          <a href="https://github.com/datascintist-abusufian/biohybrid-heart-valve" className="hover:underline">GitHub</a>
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;
