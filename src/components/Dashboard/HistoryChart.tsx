import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { SensorData } from "../../types/valve";

export const HistoryChart: React.FC = () => {
  const [history, setHistory] = useState<SensorData[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setHistory((prev) => {
        const newEntry: SensorData = {
          timestamp: Date.now(),
          status: {
            wear: Math.random() * 100,
            damage: Math.random() * 100,
            flowRate: Math.random() * 100,
            pressure: 100 + Math.random() * 40,
          },
        };
        // keep last 20 records
        return [...prev.slice(-19), newEntry];
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // transform for Recharts
  const chartData = history.map((d) => ({
    time: new Date(d.timestamp).toLocaleTimeString("en-GB", {
      minute: "2-digit",
      second: "2-digit",
    }),
    FlowRate: Math.round(d.status.flowRate),
    Pressure: Math.round(d.status.pressure),
  }));

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
        Historical Data (Live)
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="FlowRate" fill="#3b82f6" animationDuration={800} />
          <Bar dataKey="Pressure" fill="#22c55e" animationDuration={800} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
