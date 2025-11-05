import { formatUnits, parseUnits } from 'ethers';

export const formatBalance = (balance: bigint, decimals: number = 18): string => {
  try {
    return formatUnits(balance, decimals);
  } catch {
    return '0';
  }
};

export const parseAmount = (amount: string, decimals: number = 18): bigint => {
  try {
    return parseUnits(amount || '0', decimals);
  } catch {
    return 0n;
  }
};

export const formatAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export const formatPrice = (price: bigint, decimals: number = 8): string => {
  try {
    const formatted = formatUnits(price, decimals);
    // Show full precision (up to decimals places), remove trailing zeros
    const num = parseFloat(formatted);
    // Convert to string with full precision, then remove trailing zeros
    return num.toFixed(decimals).replace(/\.?0+$/, '');
  } catch {
    return '0';
  }
};

