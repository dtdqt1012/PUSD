/**
 * Calculate Collateral Ratio
 * Formula: (POL trong Vault × POL Price) / (PUSD users đang cầm + Pool Reserves) × 100
 * 
 * @param polInVault - POL amount in MintingVault (wei, 18 decimals)
 * @param polInSwapPool - POL amount in SwapPool (wei, 18 decimals) - dùng để tính Pool Reserves
 * @param polPrice - POL price in USD (8 decimals from oracle)
 * @param pusdSupply - PUSD users đang cầm + Pool Reserves (USD) (wei, 18 decimals)
 * @returns Collateral ratio as percentage (e.g., 110 = 110%)
 */
export function calculateCollateralRatio(
  polInVault: bigint,
  _polInSwapPool: bigint,
  polPrice: bigint,
  pusdSupply: bigint
): number {
  if (pusdSupply === 0n) {
    return 0;
  }

  // Chỉ tính POL trong Vault (không bao gồm Swap Pool và Staking Pool)
  // Convert POL to USD value
  // polPrice is 8 decimals, polInVault is 18 decimals
  // Result: (polInVault * polPrice) / 1e8 = POL value in USD (18 decimals)
  const polValueUSD = (polInVault * polPrice) / BigInt(1e8);

  // Calculate ratio: (POL trong Vault × POL Price) / (PUSD users đang cầm + Pool Reserves) × 100
  // Formula: (polValueUSD / pusdSupply) × 100
  // pusdSupply = PUSD users đang cầm + Pool Reserves (USD)
  // 
  // Step-by-step calculation:
  // 1. polValueUSD = (polInVault * polPrice) / 1e8  [18 decimals]
  // 2. ratio = (polValueUSD / pusdSupply) × 100
  // 3. To avoid precision loss, multiply by 10000 first (basis points), then divide by 100
  //    ratioBPS = (polValueUSD * 10000) / pusdSupply
  //    ratioPercent = ratioBPS / 100
  // 
  // This is equivalent to: (polValueUSD / pusdSupply) × 100
  const ratioBPS = (polValueUSD * BigInt(10000)) / pusdSupply;
  const ratioPercent = Number(ratioBPS) / 100;

  return ratioPercent;
}

/**
 * Calculate Collateral Ratio from formatted values
 * Formula: (POL trong Vault × POL Price) / (PUSD users đang cầm + Pool Reserves) × 100
 * 
 * @param vaultPol - POL in Vault (formatted string, e.g., "1000.5")
 * @param swapPoolPol - POL in SwapPool (formatted string) - dùng để tính Pool Reserves
 * @param polPrice - POL price in USD (formatted string, e.g., "0.5")
 * @param pusdSupply - PUSD users đang cầm + Pool Reserves (USD) (formatted string)
 * @returns Collateral ratio as percentage
 */
export function calculateCollateralRatioFromFormatted(
  vaultPol: string,
  _swapPoolPol: string,
  polPrice: string,
  pusdSupply: string
): number {
  const vaultPolNum = parseFloat(vaultPol) || 0;
  const polPriceNum = parseFloat(polPrice) || 0;
  const pusdSupplyNum = parseFloat(pusdSupply) || 0;

  if (pusdSupplyNum === 0) {
    return 0;
  }

  // Chỉ tính POL trong Vault (không bao gồm Swap Pool và Staking Pool)
  // POL value in USD
  const polValueUSD = vaultPolNum * polPriceNum;

  // Collateral ratio: (POL trong Vault × POL Price) / (PUSD users đang cầm + Pool Reserves) × 100
  // Formula: (polValueUSD / pusdSupply) × 100
  // pusdSupply = PUSD users đang cầm + Pool Reserves (USD)
  const ratio = (polValueUSD / pusdSupplyNum) * 100;

  return ratio;
}

/**
 * Get Collateral Ratio status
 * 
 * @param ratio - Collateral ratio percentage
 * @returns Status object with level, color, and message
 */
export function getCollateralRatioStatus(ratio: number) {
  if (ratio >= 150) {
    return {
      level: 'excellent',
      color: '#00ff00',
      message: 'Excellent',
      description: 'Highly over-collateralized',
    };
  } else if (ratio >= 120) {
    return {
      level: 'good',
      color: '#90ee90',
      message: 'Good',
      description: 'Well collateralized',
    };
  } else if (ratio >= 110) {
    return {
      level: 'safe',
      color: '#ffff00',
      message: 'Safe',
      description: 'Adequately collateralized',
    };
  } else if (ratio >= 100) {
    return {
      level: 'warning',
      color: '#ffa500',
      message: 'Warning',
      description: 'Minimal collateralization',
    };
  } else {
    return {
      level: 'danger',
      color: '#ff0000',
      message: 'Danger',
      description: 'Under-collateralized',
    };
  }
}

