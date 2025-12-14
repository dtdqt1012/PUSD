import { useEffect, useState, useRef } from 'react';
import { Contract, formatUnits } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { CONTRACTS } from '../config/contracts';
import { callWithRpcFallback } from '../utils/rpcProvider';
// API client removed - using direct RPC queries only
import { cache } from '../utils/cache';

export default function TVLChart() {
  const { provider } = useWeb3();
  const [currentTVL, setCurrentTVL] = useState<string>('0');
  const [loading, setLoading] = useState(true);
  // WebSocket removed - using direct RPC queries only

  useEffect(() => {
    if (!provider) return;

    // Load immediately - only current TVL, no historical data
    loadTVLData();

    // Refresh every 5 minutes
    const interval = setInterval(loadTVLData, 300000);

    return () => {
      clearInterval(interval);
    };
  }, [provider]);

  // WebSocket removed - using direct RPC queries only

  const loadTVLData = async () => {
    // Check cache first
    const cacheKey = 'tvl-current';
    const cached = cache.get<{ currentTVL: string }>(cacheKey);
    if (cached !== null) {
      setCurrentTVL(cached.currentTVL);
      setLoading(false);
      return;
    }

    // Query directly from RPC (no API)
    if (!provider) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Only get current TVL - no historical data
      const [oracleContract, vaultContract, stakingContract, swapContract] = [
        new Contract(CONTRACTS.OraclePriceFeed.address, CONTRACTS.OraclePriceFeed.abi, provider),
        new Contract(CONTRACTS.MintingVault.address, CONTRACTS.MintingVault.abi, provider),
        new Contract(CONTRACTS.StakingPool.address, CONTRACTS.StakingPool.abi, provider),
        new Contract(CONTRACTS.SwapPool.address, CONTRACTS.SwapPool.abi, provider),
      ];

      // Get current TVL with RPC fallback
      const [polPrice, vaultPol, totalStaked, swapPoolReserves] = await Promise.all([
        callWithRpcFallback(async (rpcProvider) => {
          const contract = new Contract(CONTRACTS.OraclePriceFeed.address, CONTRACTS.OraclePriceFeed.abi, rpcProvider);
          return await contract.getPOLPrice();
        }).catch(() => null),
        callWithRpcFallback(async (rpcProvider) => {
          const contract = new Contract(CONTRACTS.MintingVault.address, CONTRACTS.MintingVault.abi, rpcProvider);
          return await contract.getBalance();
        }).catch(() => null),
        callWithRpcFallback(async (rpcProvider) => {
          const contract = new Contract(CONTRACTS.StakingPool.address, CONTRACTS.StakingPool.abi, rpcProvider);
          return await contract.totalLocked();
        }).catch(() => null),
        callWithRpcFallback(async (rpcProvider) => {
          const contract = new Contract(CONTRACTS.SwapPool.address, CONTRACTS.SwapPool.abi, rpcProvider);
          return await contract.getBalance();
        }).catch(() => null),
      ]);

      if (polPrice && vaultPol !== null && totalStaked !== null && swapPoolReserves !== null) {
        // POL price uses 8 decimals (Chainlink format)
        const polPriceNum = parseFloat(formatUnits(polPrice, 8));
        // Balances use 18 decimals
        const vaultPolNum = parseFloat(formatUnits(vaultPol, 18));
        const stakedNum = parseFloat(formatUnits(totalStaked, 18));
        const swapNum = parseFloat(formatUnits(swapPoolReserves, 18));
        
        // TVL = (Vault POL + Staked POL + Swap Pool POL) * POL Price
        const totalPolNum = vaultPolNum + stakedNum + swapNum;
        const tvl = totalPolNum * polPriceNum;
        
        // Format with 2 decimal places, but show more precision if needed
        let tvlStr: string;
        if (tvl >= 1000000) {
          tvlStr = (tvl / 1000000).toFixed(2) + 'M';
        } else if (tvl >= 1000) {
          tvlStr = (tvl / 1000).toFixed(2) + 'K';
        } else if (tvl >= 1) {
          tvlStr = tvl.toFixed(2);
        } else if (tvl >= 0.01) {
          tvlStr = tvl.toFixed(2);
        } else {
          tvlStr = tvl.toFixed(4);
        }
        
        setCurrentTVL(tvlStr);
        
        // Cache only current TVL
        cache.set(cacheKey, { currentTVL: tvlStr }, 300000); // 5 minutes
      } else {
        console.warn('⚠️ Missing data for TVL:', {
          polPrice: !!polPrice,
          vaultPol: vaultPol !== null,
          totalStaked: totalStaked !== null,
          swapPoolReserves: swapPoolReserves !== null,
        });
      }
    } catch (error: any) {
      // Suppress rate limit and RPC errors
    } finally {
      setLoading(false);
    }
  };

  const formatTVL = (value: string) => {
    // Value might already be formatted (e.g., "5.01M" or "123.45K")
    if (value.includes('M') || value.includes('K')) {
      return `$${value}`;
    }
    
    const num = parseFloat(value);
    if (isNaN(num) || num === 0) return '$0.00';
    
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `$${(num / 1000).toFixed(2)}K`;
    } else if (num >= 1) {
      return `$${num.toFixed(2)}`;
    } else {
      return `$${num.toFixed(4)}`;
    }
  };

  return (
    <div style={{ 
      backgroundColor: '#0a0a0a', 
      border: '1px solid #333',
      borderLeft: '2px solid #00ff00',
      borderRadius: '0 4px 4px 0',
      padding: '0.75rem',
      fontFamily: 'Courier New, monospace'
    }}>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '0.7rem', color: '#888' }}>
          <span style={{ color: '#00ff00' }}>&gt;</span> Total Value Locked
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#00ff00' }}>
          {loading ? (
            <span style={{ fontSize: '0.75rem', color: '#888' }}>Loading...</span>
          ) : (
            formatTVL(currentTVL)
          )}
        </div>
      </div>
    </div>
  );
}

