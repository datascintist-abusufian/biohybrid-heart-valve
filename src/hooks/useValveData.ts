import { useEffect, useMemo, useRef, useState } from "react";
import type { SensorData, ValveStatus } from "../types/valve";
import { analyzeValveHealth, calculateRiskScore } from "../utils/valveAnalytics";
import { downloadCSV } from "../utils/export";

/** Simple stochastic simulator: updates once per sec */
function nextStatus(prev: ValveStatus): ValveStatus {
  const wear = Math.min(prev.wear + 0.1, 100);
  const damage = Math.min(prev.damage + Math.random() * 0.2, 100);
  // simple couplings
  const flowRate = Math.max(50, 100 - wear * 0.5);
  const pressure = 120 + damage * 0.05; // mmHg baseline + mild rise
  return { wear, damage, flowRate, pressure };
}

export function useValveData() {
  const [history, setHistory] = useState<SensorData[]>([]);
  const tick = useRef<number>(0);

  // start with a clean initial reading
  const [current, setCurrent] = useState<SensorData>({
    timestamp: Date.now(),
    status: { wear: 0.1, damage: 0.1, flowRate: 100, pressure: 120.02 },
  });

  useEffect(() => {
    const id = setInterval(() => {
      tick.current += 1;
      setCurrent((prev) => {
        const updated: ValveStatus = nextStatus(prev.status);
        const row: SensorData = { timestamp: Date.now(), status: updated };
        setHistory((h) => {
          const arr = [...h, row];
          // keep last 180 points (≈3 mins)
          return arr.length > 180 ? arr.slice(-180) : arr;
        });
        return row;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const resetHistory = () => {
    setHistory([]);
    setCurrent({
      timestamp: Date.now(),
      status: { wear: 0.1, damage: 0.1, flowRate: 100, pressure: 120.02 },
    });
    tick.current = 0;
  };

  const exporting = useMemo(() => {
    return {
      riskScore: (s: ValveStatus) => calculateRiskScore(s),
      downloadCSV: () => downloadCSV(history, "valve_history"),
    };
  }, [history]);

  // attach health message for display (purely computed)
  const healthMsg = analyzeValveHealth(current.status);
  return { current: { ...current, healthMsg }, history, resetHistory, exporting };
}
