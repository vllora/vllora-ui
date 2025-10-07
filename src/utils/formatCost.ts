export const formatCost = (cost: number, decimals: number = 4): string => {
  // Handle zero cost
  if (cost === 0) return '$0.00';

  // Handle negative costs (shouldn't happen but good to handle)
  if (cost < 0) return `-$${Math.abs(cost).toFixed(decimals)}`;

  // Calculate threshold based on decimals parameter
  // For decimals=4, threshold is 0.0001; for decimals=2, threshold is 0.01
  const threshold = Math.pow(10, -decimals);

  // Handle very small costs below the threshold
  if (cost < threshold) {
    return `<$${threshold.toFixed(decimals)}`;
  }

  // Format with specified decimals
  const formatted = cost.toFixed(decimals);
  const roundedValue = parseFloat(formatted);

  // Check if rounding increased the value (lost precision)
  // If the rounded value is greater than the original, show "<" prefix
  if (roundedValue > cost) {
    const withoutTrailingZeros = roundedValue.toString();
    const parts = withoutTrailingZeros.split('.');
    if (parts.length === 1) {
      return `<$${parts[0]}.00`;
    }
    if (parts[1].length === 1) {
      return `<$${parts[0]}.${parts[1]}0`;
    }
    return `<$${withoutTrailingZeros}`;
  }

  // Remove trailing zeros for exact values
  const withoutTrailingZeros = roundedValue.toString();

  // Ensure at least 2 decimal places for currency
  const parts = withoutTrailingZeros.split('.');
  if (parts.length === 1) {
    return `$${parts[0]}.00`;
  }
  if (parts[1].length === 1) {
    return `$${parts[0]}.${parts[1]}0`;
  }

  return `$${withoutTrailingZeros}`;
};
