import { useState, useEffect, useRef } from 'react';
import { Contract } from 'ethers';
import { useWeb3 } from './useWeb3';
import { CONTRACTS } from '../config/contracts';
import { calculateCollateralRatio } from '../utils/calculateCollateralRatio';
import { formatBalance, formatPrice } from '../utils/format';

const loadWithTimeout = <T,>(promise: Promise<T>, timeout: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]);
};

interface CollateralRatioData {
  ratio: number;
  polInVault: bigint;
  polInSwapPool: bigint;
  polPrice: bigint;
  pusdSupply: bigint;
  polValueUSD: bigint;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to calculate Collateral Ratio from blockchain data
 * Reads data directly from contracts and calculates ratio in frontend
 */
export function useCollateralRatio(refreshInterval: number = 30000) {
  const { provider } = useWeb3();
  const [data, setData] = useState<CollateralRatioData>({
    ratio: 0,
    polInVault: 0n,
    polInSwapPool: 0n,
    polPrice: 0n,
    pusdSupply: 0n,
    polValueUSD: 0n,
    loading: true,
    error: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!provider) {
      setData(prev => ({ ...prev, loading: false }));
      return;
    }

    const loadCollateralRatio = async () => {
      try {
        // Create contract instances
        const [oracleContract, pusdContract, vaultContract, stakingContract, swapContract, pgoldVaultContract] = await Promise.all([
          new Contract(CONTRACTS.OraclePriceFeed.address, CONTRACTS.OraclePriceFeed.abi, provider),
          new Contract(CONTRACTS.PUSDToken.address, CONTRACTS.PUSDToken.abi, provider),
          new Contract(CONTRACTS.MintingVault.address, CONTRACTS.MintingVault.abi, provider),
          new Contract(CONTRACTS.StakingPool.address, CONTRACTS.StakingPool.abi, provider),
          new Contract(CONTRACTS.SwapPool.address, CONTRACTS.SwapPool.abi, provider),
          CONTRACTS.PGOLDVault ? new Contract(CONTRACTS.PGOLDVault.address, CONTRACTS.PGOLDVault.abi, provider) : null,
        ]);

        // Fetch all required data
        const results = await Promise.allSettled([
          loadWithTimeout(oracleContract.getPOLPrice(), 5000).catch(() => null),
          loadWithTimeout(pusdContract.totalSupply(), 5000).catch(() => null),
          loadWithTimeout(vaultContract.getBalance(), 5000).catch(() => null),
          loadWithTimeout(swapContract.totalPOLReserves(), 5000).catch(() => null),
          // PUSD trong contracts để tính PUSD users đang cầm
          loadWithTimeout(pusdContract.balanceOf(CONTRACTS.MintingVault.address), 5000).catch(() => null),
          loadWithTimeout(stakingContract.totalPUSDStaked(), 5000).catch(() => null),
          loadWithTimeout(pusdContract.balanceOf(CONTRACTS.SwapPool.address), 5000).catch(() => null),
          pgoldVaultContract ? loadWithTimeout(pusdContract.balanceOf(CONTRACTS.PGOLDVault.address), 5000).catch(() => null) : Promise.resolve(null),
        ]);

        if (!mountedRef.current) return;

        const polPrice = results[0].status === 'fulfilled' && results[0].value 
          ? BigInt(results[0].value.toString()) 
          : 0n;
        const totalPusdSupply = results[1].status === 'fulfilled' && results[1].value 
          ? BigInt(results[1].value.toString()) 
          : 0n;
        const polInVault = results[2].status === 'fulfilled' && results[2].value 
          ? BigInt(results[2].value.toString()) 
          : 0n;
        const polInSwapPool = results[3].status === 'fulfilled' && results[3].value 
          ? BigInt(results[3].value.toString()) 
          : 0n;
        
        // Tính PUSD trong contracts
        const pusdInVault = results[4].status === 'fulfilled' && results[4].value 
          ? BigInt(results[4].value.toString()) 
          : 0n;
        const pusdInStaking = results[5].status === 'fulfilled' && results[5].value 
          ? BigInt(results[5].value.toString()) 
          : 0n;
        const pusdInSwap = results[6].status === 'fulfilled' && results[6].value 
          ? BigInt(results[6].value.toString()) 
          : 0n;
        const pusdInPgoldVault = results[7].status === 'fulfilled' && results[7].value 
          ? BigInt(results[7].value.toString()) 
          : 0n;
        
        // Collateral Ratio = (POL trong Vault × POL Price) / (PUSD users đang cầm + Pool Reserves) × 100
        // PUSD users đang cầm = Total Supply - PUSD trong contracts
        // Pool Reserves = POL trong Swap Pool × POL Price (chuyển sang USD)

        // PUSD mà users đang cầm = Total Supply - PUSD trong contracts
        const pusdUsersHold = totalPusdSupply - pusdInVault - pusdInStaking - pusdInSwap - pusdInPgoldVault;

        // Pool Reserves (POL trong Swap Pool) chuyển sang USD
        // polInSwapPool: 18 decimals, polPrice: 8 decimals
        // poolReservesUSD = (polInSwapPool * polPrice) / 1e8 [18 decimals]
        const poolReservesUSD = (polInSwapPool * polPrice) / BigInt(1e8);

        // Calculate POL value in USD - chỉ tính POL trong Vault
        // polPrice: 8 decimals, polInVault: 18 decimals
        // polValueUSD = (polInVault * polPrice) / 1e8 [18 decimals]
        const polValueUSD = (polInVault * polPrice) / BigInt(1e8);

        // Calculate collateral ratio
        // Formula: (POL trong Vault × POL Price) / (PUSD users đang cầm + Pool Reserves) × 100
        // Denominator = PUSD users đang cầm + Pool Reserves (USD)
        const denominator = pusdUsersHold + poolReservesUSD;
        const finalPusdSupply = denominator > 0n ? denominator : totalPusdSupply; // Fallback về total supply nếu tính sai
        const ratio = calculateCollateralRatio(
          polInVault,
          polInSwapPool,
          polPrice,
          finalPusdSupply
        );
        
        setData({
          ratio,
          polInVault,
          polInSwapPool,
          polPrice,
          pusdSupply: finalPusdSupply, // PUSD users đang cầm + Pool Reserves (USD)
          polValueUSD,
          loading: false,
          error: null,
        });
      } catch (error) {
        // Failed to load collateral ratio
        setData(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    };

    loadCollateralRatio();
    const interval = setInterval(loadCollateralRatio, refreshInterval);
    return () => clearInterval(interval);
  }, [provider, refreshInterval]);

  // Formatted values for display
  const formatted = {
    ratio: isNaN(data.ratio) || !isFinite(data.ratio) ? '0.00' : data.ratio.toFixed(2),
    polInVault: formatBalance(data.polInVault),
    polInSwapPool: formatBalance(data.polInSwapPool),
    polPrice: formatPrice(data.polPrice),
    pusdSupply: formatBalance(data.pusdSupply),
    polValueUSD: formatBalance(data.polValueUSD),
  };

  return {
    ...data,
    formatted,
  };
}

