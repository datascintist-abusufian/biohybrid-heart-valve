import React from "react";
import { useValveData } from "./hooks/useValveData";
import StatusCard from "./components/StatusCard";
import RiskGauge from "./components/RiskGauge";
import HistoryBars from "./components/HistoryBars";
import MetricLine from "./components/MetricLine";
import DarkModeToggle from "./components/DarkModeToggle";

export default function App() {
  const { current, history, resetHistory, exporting } = useValveData();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-10 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              AI-Controlled Biohybrid Heart Valve
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Real-time monitoring and analysis
            </p>
          </div>
          <DarkModeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 grid gap-6 md:grid-cols-2">
        {/* Left column: live status + gauge */}
        <section className="grid gap-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Valve Status</h2>
            <StatusCard status={current.status} />
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={resetHistory}
                className="rounded-xl px-3 py-2 text-sm font-medium bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90"
                title="Clear in-memory history and start simulation fresh"
              >
                Reset History
              </button>
              <button
                onClick={exporting.downloadCSV}
                className="rounded-xl px-3 py-2 text-sm font-medium bg-slate-200 dark:bg-slate-800 hover:opacity-90"
                title="Download the current session history as CSV"
              >
                Download CSV
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Risk Score</h2>
            <RiskGauge value={exporting.riskScore(current.status)} />
          </div>
        </section>

        {/* Right column: charts */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Historical Data</h2>
          <HistoryBars history={history} />
          <div className="grid md:grid-cols-3 gap-4 mt-6">
            <MetricLine
              title="Wear (%)"
              history={history}
              accessor={(d) => d.status.wear}
              colorClass="stroke-emerald-500"
            />
            <MetricLine
              title="Damage (%)"
              history={history}
              accessor={(d) => d.status.damage}
              colorClass="stroke-rose-500"
            />
            <MetricLine
              title="Flow (mL/s)"
              history={history}
              accessor={(d) => d.status.flowRate}
              colorClass="stroke-indigo-500"
            />
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <MetricLine
              title="Pressure (mmHg)"
              history={history}
              accessor={(d) => d.status.pressure}
              colorClass="stroke-sky-500"
            />
            <MetricLine
              title="Risk"
              history={history}
              accessor={(d) => exporting.riskScore(d.status)}
              colorClass="stroke-amber-500"
            />
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-sm text-slate-500 dark:text-slate-400">
              <p className="font-medium text-slate-700 dark:text-slate-200 mb-1">
                Notes
              </p>
              <ul className="list-disc ms-4 space-y-1">
                <li>Risk = 0.3 × wear + 0.7 × damage.</li>
                <li>Flow decreases slightly with wear.</li>
                <li>Pressure rises gradually with damage.</li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-7xl px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
        <div className="flex items-center justify-between">
          <p>© {new Date().getFullYear()} Md Abu Sufian — MIT License</p>
          <a
            href="https://github.com/datascintist-abusufian/biohybrid-heart-valve"
            className="hover:underline"
          >
            View source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
