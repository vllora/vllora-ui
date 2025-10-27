export const formatMoney = (money?: number, precision: number = 3) => {
  if (!money) {
    return '$0';
  }
  if (money === 0) {
    return '$0';
  }
  // if money is less than input precision, return < precision
  if (money < Math.pow(10, -precision)) {
    return `<$${Math.pow(10, -precision)}`;
  }
  return `$${parseFloat(money.toFixed(precision))}`;
};

export const formatTokenPrice = (price?: number, type?: string, moneyOnly?: boolean) => {
  if (type === "image generation" || type === 'image_generation') {
      return price ? `${formatMoney(price, 2)} / image` : "";
  }
  return price ? `${formatMoney(price, 2)}${moneyOnly ? "" : " / 1M tokens"}` : "_";
};

export const formatContextSize = (contextSize: number, hideTokenAffix?: boolean) => {
  if (contextSize === 0) {
    return ``;
  }

  // Round to nearest million if close to a million value (within 5%)
  const millions = contextSize / 1000000;
  if (millions >= 0.95 && millions <= 10) {
    const roundedMillions = Math.round(millions);
    return `${roundedMillions}${hideTokenAffix ? "M" : "M tokens"}`;
  }

  // Use exact millions if it's a clean multiple
  if (contextSize % 1000000 === 0) {
    const exactMillions = contextSize / 1000000;
    return `${exactMillions}${hideTokenAffix ? "M" : "M tokens"}`;
  }

  // Use K for thousands
  if (contextSize >= 1000) {
    const thousands = contextSize / 1000;
    return `${Math.round(thousands)}${hideTokenAffix ? "K" : "K tokens"}`;
  }

  return `${contextSize}${hideTokenAffix ? "" : " tokens"}`;
};
export const formatMicroSecondsToSeconds = (microseconds: number) => {
  const seconds = microseconds / 1000000;
  return seconds < 1 ? `${seconds.toFixed(2)}s` : `${seconds.toFixed(1)}s`;
};
export const formatMiliSecondsToSeconds = (milliseconds: number) => {
  const seconds = milliseconds / 1000;
  return seconds < 1 ? `${seconds.toFixed(2)}s` : `${seconds.toFixed(1)}s`;
};
  