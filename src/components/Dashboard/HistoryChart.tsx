import React, { useState, useEffect } from 'react';
import { SensorData } from '../../types/valve';

export const HistoryChart: React.FC = () => {
  const [history, setHistory] = useState<SensorData[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setHistory(prev => {
        if (prev.length > 20) prev.shift();
        return [...prev, {
          timestamp: Date.now(),
          status: {
            wear: Math.random() * 100,
            damage: Math.random() * 100,
            flowRate: Math.random() * 100,
            pressure: 100 + Math.random() * 40
          }
        }];
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <h2 className="text-xl font-bold mb-4">Historical Data</h2>
      <div className="h-64 flex items-end space-x-2">
        {history.map((data, index) => (
          <div
            key={data.timestamp}
            className="bg-blue-500 w-4"
            style={{
              height: `${data.status.flowRate}%`,
              opacity: 0.3 + (index / history.length) * 0.7
            }}
          />
        ))}
      </div>
    </div>
  );
};