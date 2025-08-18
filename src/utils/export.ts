import type { SensorData } from "../types/valve";

export function downloadCSV(rows: SensorData[], name: string) {
  if (!rows.length) return;
  const header = ["timestamp", "wear", "damage", "flowRate", "pressure"];
  const body = rows
    .map((r) => [
      new Date(r.timestamp).toISOString(),
      r.status.wear.toFixed(3),
      r.status.damage.toFixed(3),
      r.status.flowRate.toFixed(3),
      r.status.pressure.toFixed(3),
    ].join(","))
    .join("\n");
  const csv = header.join(",") + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}