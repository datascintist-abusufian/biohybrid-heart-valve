import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { SensorData } from "../../types/valve";
import { calculateRiskScore } from "../../utils/valveAnalytics";

type Props = { history: SensorData[] };

// Simple tooltip formatter
const valueFmt = (v: number, name: string) => {
  const unit =
    name === "Wear" || name === "Damage" || name === "Risk"
      ? "%"
      : name === "Flow"
      ? "mL/s"
      : name === "Pressure"
      ? "mmHg"
      : "";
  return [`${v.toFixed(1)} ${unit}`, name];
};

const CombinedHistory: React.FC<Props> = ({ history }) => {
  // keep last 120 points (~2 min at 1 Hz)
  const data = useMemo(() => {
    return history.slice(-120).map((d) => ({
      t: new Date(d.timestamp).toLocaleTimeString("en-GB", {
        minute: "2-digit",
        second: "2-digit",
      }),
      Wear: d.status.wear,
      Damage: d.status.damage,
      Risk: calculateRiskScore(d.status),
      Flow: d.status.flowRate,
      Pressure: d.status.pressure,
    }));
  }, [history]);

  return (
    <div className="h-[360px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          {/* Left Y: percent metrics */}
          <YAxis
            yAxisId="pct"
            domain={[0, 100]}
            tick={{ fontSize: 12 }}
            label={{ value: "%", angle: -90, position: "insideLeft" }}
          />
          {/* Right Y: physical metrics */}
          <YAxis
            yAxisId="phys"
            orientation="right"
            tick={{ fontSize: 12 }}
            label={{ value: "mL/s | mmHg", angle: 90, position: "insideRight" }}
          />
          <XAxis dataKey="t" tick={{ fontSize: 12 }} />
          <Tooltip formatter={valueFmt as any} />
          <Legend />

          {/* Risk thresholds */}
          <ReferenceLine
            yAxisId="pct"
            y={50}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{ value: "Warn 50", position: "insideTopLeft", fill: "#f59e0b" }}
          />
          <ReferenceLine
            yAxisId="pct"
            y={70}
            stroke="#ef4444"
            strokeDasharray="4 4"
            label={{ value: "Crit 70", position: "insideTopLeft", fill: "#ef4444" }}
          />

          {/* Percent metrics */}
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="Wear"
            stroke="#10b981"
            dot={false}
            strokeWidth={2}
            animationDuration={600}
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="Damage"
            stroke="#f43f5e"
            dot={false}
            strokeWidth={2}
            animationDuration={600}
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="Risk"
            stroke="#f59e0b"
            dot={false}
            strokeWidth={2}
            animationDuration={600}
          />

          {/* Physical metrics */}
          <Line
            yAxisId="phys"
            type="monotone"
            dataKey="Flow"
            stroke="#6366f1"
            dot={false}
            strokeWidth={2}
            animationDuration={600}
          />
          <Line
            yAxisId="phys"
            type="monotone"
            dataKey="Pressure"
            stroke="#0ea5e9"
            dot={false}
            strokeWidth={2}
            animationDuration={600}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CombinedHistory;