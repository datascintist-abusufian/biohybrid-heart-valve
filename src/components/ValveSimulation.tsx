import React, { useState, useEffect } from 'react';
import { ValveStatus as ValveStatusType } from '../types/valve';
import { ValveStatus } from './ValveStatus';

export const ValveSimulation: React.FC = () => {
  const [status, setStatus] = useState<ValveStatusType>({
    wear: 0,
    damage: 0,
    flowRate: 100,
    pressure: 120
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(prev => ({
        wear: Math.min(prev.wear + 0.1, 100),
        damage: Math.min(prev.damage + (Math.random() * 0.2), 100),
        flowRate: 100 - (prev.wear * 0.5),
        pressure: 120 + (prev.damage * 0.3)
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">AI-Controlled Biohybrid Heart Valve</h1>
      <ValveStatus status={status} />
    </div>
  );
};