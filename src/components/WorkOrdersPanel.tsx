import React, { useState } from "react";

type WO = { id: string; title: string; due: string; status: "Open"|"Scheduled"|"Done" };

const WorkOrdersPanel: React.FC = () => {
  const [items, setItems] = useState<WO[]>([
    { id: "wo-101", title: "Inspect leaflet wear", due: "2025-08-25", status: "Scheduled" },
    { id: "wo-102", title: "Replace sealing ring", due: "2025-09-02", status: "Open" },
  ]);

  const add = () => {
    setItems(prev => [{ id: `wo-${Date.now()}`, title: "New repair task", due: new Date(Date.now()+86400000).toISOString().slice(0,10), status: "Open" }, ...prev]);
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Work orders</h3>
        <button onClick={add} className="text-xs px-2 py-1 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900">Add</button>
      </div>
      <div className="space-y-2 max-h-56 overflow-auto pr-1">
        {items.map(i => (
          <div key={i.id} className="text-sm flex items-center justify-between gap-2">
            <div>
              <div className="font-medium">{i.title}</div>
              <div className="text-slate-500 text-xs">Due {i.due}</div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${i.status==="Done"?"bg-emerald-50 border-emerald-300 text-emerald-700":i.status==="Scheduled"?"bg-amber-50 border-amber-300 text-amber-700":"bg-slate-50 border-slate-300 text-slate-700"}`}>{i.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WorkOrdersPanel;