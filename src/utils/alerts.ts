import type { SensorStatus } from "../types/valve";

export type Alert = {
  id: string;
  ts: number;
  title: string;
  detail?: string;
  severity: "low" | "med" | "high";
};

export function deriveAlerts(status: SensorStatus, prev?: SensorStatus): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();

  if (status.risk > 70) alerts.push({
    id: `risk-${now}`, ts: now, severity: "high",
    title: "Critical risk level",
    detail: `Risk ${status.risk.toFixed(1)}% exceeds 70%.`
  });
  else if (status.risk > 50) alerts.push({
    id: `risk-${now}`, ts: now, severity: "med",
    title: "Elevated risk",
    detail: `Risk ${status.risk.toFixed(1)}% > 50%.`
  });

  if (status.pressure > 140)
    alerts.push({ id: `p-${now}`, ts: now, severity: "med",
      title: "High pressure", detail: `${status.pressure.toFixed(0)} mmHg` });

  if (prev) {
    const dWear = status.wear - prev.wear;
    const dDamage = status.damage - prev.damage;
    if (dWear > 4) alerts.push({
      id: `wear-${now}`, ts: now, severity: "low",
      title: "Wear accelerating", detail: `Δwear +${dWear.toFixed(1)}%`
    });
    if (dDamage > 3) alerts.push({
      id: `dam-${now}`, ts: now, severity: "low",
      title: "Damage increasing", detail: `Δdamage +${dDamage.toFixed(1)}%`
    });
  }

  return alerts;
}