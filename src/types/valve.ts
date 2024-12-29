export interface ValveStatus {
  wear: number; // 0-100%
  damage: number; // 0-100%
  flowRate: number; // mL/s
  pressure: number; // mmHg
}

export interface SensorData {
  timestamp: number;
  status: ValveStatus;
}