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

  if (contextSize % 1000000 === 0) {
    contextSize = contextSize / 1000000;
    return `${contextSize}${hideTokenAffix ? "M" : "M tokens"}`;
  }

  if (contextSize % 1000 === 0) {
    contextSize = contextSize / 1000;
    return `${contextSize}${hideTokenAffix ? "K" : "K tokens"}`;
  }

  return `${contextSize}${hideTokenAffix ? "" : " tokens"}`;
};
