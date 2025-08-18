import React from 'react';

interface Props {
  label: string;
  value: number;
  unit: string;
  color: string;
}

export const StatusIndicator: React.FC<Props> = ({ label, value, unit, color }) => {
  return (
    <div className="bg-gray-50 p-4 rounded-lg">
      <div className="text-sm text-gray-600">{label}</div>
      <div className="text-xl font-bold" style={{ color }}>
        {value.toFixed(1)} {unit}
      </div>
    </div>
  );
};