import React from 'react';
import { ValveStatus as ValveStatusType } from '../types/valve';
import { analyzeValveHealth, calculateRiskScore } from '../utils/valveAnalytics';

interface Props {
  status: ValveStatusType;
}

export const ValveStatus: React.FC<Props> = ({ status }) => {
  const health = analyzeValveHealth(status);
  const riskScore = calculateRiskScore(status);

  return (
    <div className="bg-white p-4 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Valve Status</h2>
      <div className="space-y-2">
        <p>Wear: {status.wear.toFixed(1)}%</p>
        <p>Damage: {status.damage.toFixed(1)}%</p>
        <p>Flow Rate: {status.flowRate.toFixed(1)} mL/s</p>
        <p>Pressure: {status.pressure} mmHg</p>
        <p className="font-semibold">Health Status: {health}</p>
        <p>Risk Score: {riskScore.toFixed(1)}</p>
      </div>
    </div>
  );
};