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

/**
 * Format PGOLD amount without rounding
 * Removes trailing zeros but keeps full precision
 */
export const formatPGOLD = (amount: string | bigint, decimals: number = 18): string => {
  try {
    let formatted: string;
    if (typeof amount === 'bigint') {
      formatted = formatUnits(amount, decimals);
    } else {
      formatted = amount;
    }
    
    // Remove trailing zeros but keep all significant digits
    // Split by decimal point
    const parts = formatted.split('.');
    if (parts.length === 1) {
      return parts[0];
    }
    
    // Remove trailing zeros from decimal part
    const integerPart = parts[0];
    const decimalPart = parts[1].replace(/0+$/, '');
    
    // If decimal part is empty after removing zeros, return integer only
    if (decimalPart === '') {
      return integerPart;
    }
    
    return `${integerPart}.${decimalPart}`;
  } catch {
    return '0';
  }
};

