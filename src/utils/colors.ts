export const getHealthColor = (value: number): string => {
  if (value > 70) return '#EF4444'; // red
  if (value > 50) return '#F59E0B'; // yellow
  return '#10B981'; // green
};