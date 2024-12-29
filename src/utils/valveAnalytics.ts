import { ValveStatus } from '../types/valve';

export const analyzeValveHealth = (status: ValveStatus): string => {
  if (status.damage > 70) return 'Critical - Immediate intervention required';
  if (status.damage > 50) return 'Warning - Schedule maintenance';
  if (status.wear > 80) return 'Caution - Monitor closely';
  return 'Normal operation';
};

export const calculateRiskScore = (status: ValveStatus): number => {
  return (status.wear * 0.3) + (status.damage * 0.7);
};