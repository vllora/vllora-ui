export const formatCost = (cost: number, decimals: number = 4): string => {
  if (cost === 0) return '$0.00';
  if (cost < 0.0001) return '< $0.0001';

  return `≤ $${cost.toFixed(decimals)}`;
};
