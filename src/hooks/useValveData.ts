import { useState, useEffect } from 'react';
import { ValveStatus } from '../types/valve';

export const useValveData = () => {
  const [status, setStatus] = useState<ValveStatus>({
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

  return status;
};