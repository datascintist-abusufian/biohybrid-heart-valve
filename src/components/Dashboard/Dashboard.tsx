import React from 'react';
import { ValveSimulation } from '../ValveSimulation';
import { HistoryChart } from './HistoryChart';

export const Dashboard: React.FC = () => {
  return (
    <div className="container mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">AI-Controlled Biohybrid Heart Valve</h1>
        <p className="text-gray-600 mt-2">Real-time monitoring and analysis system</p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ValveSimulation />
        <HistoryChart />
      </div>
    </div>
  );
};