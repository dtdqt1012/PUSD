import { useEffect, useState } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Contract } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { CONTRACTS } from '../config/contracts';
import { formatBalance, formatPrice } from '../utils/format';
import { loadWithTimeout } from '../utils/loadWithTimeout';

interface TVLPoint {
  day: string;
  tvl: number;
  timestamp: number;
}

export default function TVLChart({ height = 300 }: { height?: number }) {
  const { provider } = useWeb3();
  const [tvlData, setTvlData] = useState<TVLPoint[]>([]);
  const [currentTVL, setCurrentTVL] = useState<string>('0');
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<string>('');

  useEffect(() => {
    if (!provider) return;

    loadTVLData();
    const interval = setInterval(loadTVLData, 300000); // Refresh every 5 minutes

    return () => clearInterval(interval);
  }, [provider]);

  const loadTVLData = async () => {
    if (!provider) return;

    setLoading(true);
    try {
      const [oracleContract, vaultContract, stakingContract, swapContract] = await Promise.all([
        new Contract(CONTRACTS.OraclePriceFeed.address, CONTRACTS.OraclePriceFeed.abi, provider),
        new Contract(CONTRACTS.MintingVault.address, CONTRACTS.MintingVault.abi, provider),
        new Contract(CONTRACTS.StakingPool.address, CONTRACTS.StakingPool.abi, provider),
        new Contract(CONTRACTS.SwapPool.address, CONTRACTS.SwapPool.abi, provider),
      ]);

      const currentBlock = await provider.getBlockNumber();
      const currentBlockData = await provider.getBlock(currentBlock);
      if (!currentBlockData) return;

      // Find deployment block - query from block 0 to ensure we get all data
      // Try to find first event from StakingPool from multiple ranges
      let deploymentBlock = 0;
      let deploymentBlockData = null;
      
      try {
        // Try multiple search ranges to find first event
        const searchRanges = [
          { from: 0, to: Math.min(currentBlock, 1000000) }, // 1M blocks
          { from: 0, to: Math.min(currentBlock, 2000000) }, // 2M blocks
          { from: 0, to: currentBlock }, // All blocks
        ];
        
        for (const range of searchRanges) {
          try {
            const stakingEvents = await loadWithTimeout(
              stakingContract.queryFilter(stakingContract.filters.Staked(), range.from, range.to),
              15000
            ).catch(() => []);

            if (stakingEvents.length > 0) {
              const earliestBlock = Math.min(...stakingEvents.map(e => e.blockNumber));
              deploymentBlock = Math.max(0, earliestBlock - 50); // Start a bit before first event
              break; // Found, stop searching
            }
          } catch (error) {
            // Continue to next range
          }
        }
        
        // If no events found, use block 0 to ensure we get all data
        if (deploymentBlock === 0 && currentBlock > 0) {
          // Try to find contract creation block by checking contract code
          try {
            const code = await provider.getCode(CONTRACTS.StakingPool.address, 0);
            if (code && code !== '0x') {
              // Contract exists, but no events found - use a reasonable default
              // Try to find from MintingVault or other contracts
              const vaultEvents = await loadWithTimeout(
                vaultContract.queryFilter(vaultContract.filters.Deposited(), 0, Math.min(currentBlock, 1000000)),
                10000
              ).catch(() => []);
              
              if (vaultEvents.length > 0) {
                const earliestBlock = Math.min(...vaultEvents.map(e => e.blockNumber));
                deploymentBlock = Math.max(0, earliestBlock - 50);
              }
            }
          } catch (error) {
            // Use block 0
            deploymentBlock = 0;
          }
        }
      } catch (error) {
        // Fallback: use block 0 to ensure we get all data
        deploymentBlock = 0;
      }

      // Get deployment block timestamp
      deploymentBlockData = await loadWithTimeout(
        provider.getBlock(deploymentBlock),
        5000
      ).catch(() => null);
      
      if (!deploymentBlockData) {
        // Fallback: use current block if deployment block not found
        deploymentBlock = currentBlock;
        deploymentBlockData = currentBlockData;
      }

      const deploymentTimestamp = deploymentBlockData.timestamp;
      const now = currentBlockData.timestamp;

      // Get current TVL
      const [polPrice, vaultPol, totalStaked, swapPoolReserves] = await Promise.all([
        loadWithTimeout(oracleContract.getPOLPrice(), 5000).catch(() => null),
        loadWithTimeout(vaultContract.getBalance(), 5000).catch(() => null),
        loadWithTimeout(stakingContract.totalStaked(), 5000).catch(() => null),
        loadWithTimeout(swapContract.getBalance(), 5000).catch(() => null),
      ]);

      if (polPrice && vaultPol !== null && totalStaked !== null && swapPoolReserves !== null) {
        const polPriceNum = parseFloat(formatPrice(polPrice));
        const vaultPolNum = parseFloat(formatBalance(vaultPol));
        const stakedNum = parseFloat(formatBalance(totalStaked));
        const swapNum = parseFloat(formatBalance(swapPoolReserves));
        
        // TVL = (Vault POL + Staked POL + Swap Pool POL) * POL Price
        const totalPol = vaultPolNum + stakedNum + swapNum;
        const tvl = totalPol * polPriceNum;
        setCurrentTVL(tvl.toFixed(2));
      }

      // Query TVL at key change points - simplified approach for faster loading
      const blocksPerDay = Math.floor((24 * 60 * 60) / 2); // ~2 seconds per block on Polygon
      const oneDayInSeconds = 24 * 60 * 60;
      
      // Calculate days from deployment to now
      const totalSeconds = Number(now) - Number(deploymentTimestamp);
      const totalDays = Math.max(1, Math.ceil(totalSeconds / oneDayInSeconds));
      
      // Use all days from deployment (no limit) to show full history
      const daysToQuery = totalDays;
      
      const tvlDataPoints: TVLPoint[] = [];
      const startBlock = deploymentBlock;
      
      // Use daily samples from deployment to current
      // Limit to max 60 data points for reasonable loading time while showing full history
      const eventBlocks = new Set<number>();
      const maxDataPoints = Math.min(daysToQuery + 1, 60);
      const step = Math.max(1, Math.floor((daysToQuery + 1) / maxDataPoints));
      
      // Always include deployment block (first day)
      eventBlocks.add(startBlock);
      
      // Add daily samples
      for (let i = 1; i < maxDataPoints; i++) {
        const targetBlock = startBlock + (i * step * blocksPerDay);
        if (targetBlock <= currentBlock) {
          eventBlocks.add(targetBlock);
        }
      }
      
      // Always include current block
      eventBlocks.add(currentBlock);
      
      // Convert to sorted array
      const blocksToQuery = Array.from(eventBlocks).sort((a, b) => a - b);
      
      // Query all blocks in parallel for faster loading
      const allPromises = blocksToQuery.map(async (blockNumber): Promise<TVLPoint | null> => {
        if (blockNumber < 0 || blockNumber > currentBlock) return null;
        
        try {
          const block = await loadWithTimeout(provider.getBlock(blockNumber), 2000).catch(() => null);
          if (!block) return null;

          const [historicalPolPrice, historicalVaultPol, historicalStaked, historicalSwap] = await Promise.all([
            loadWithTimeout(oracleContract.getPOLPrice({ blockTag: blockNumber }), 3000).catch(() => null),
            loadWithTimeout(vaultContract.getBalance({ blockTag: blockNumber }), 3000).catch(() => null),
            loadWithTimeout(stakingContract.totalStaked({ blockTag: blockNumber }), 3000).catch(() => null),
            loadWithTimeout(swapContract.getBalance({ blockTag: blockNumber }), 3000).catch(() => null),
          ]);

              if (historicalPolPrice && historicalVaultPol !== null && historicalStaked !== null && historicalSwap !== null) {
                const polPriceNum = parseFloat(formatPrice(historicalPolPrice));
                const vaultPolNum = parseFloat(formatBalance(historicalVaultPol));
                const stakedNum = parseFloat(formatBalance(historicalStaked));
                const swapNum = parseFloat(formatBalance(historicalSwap));
                
                // TVL = (Vault POL + Staked POL + Swap Pool POL) * POL Price
                const totalPol = vaultPolNum + stakedNum + swapNum;
                const tvl = totalPol * polPriceNum;

                // Save all points with TVL > 0 (or if any POL exists)
                if (tvl > 0 || totalPol > 0) {
                  const date = new Date(Number(block.timestamp) * 1000);
                  const dayLabel = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;

                  return {
                    day: dayLabel,
                    tvl: tvl > 0 ? tvl : 0,
                    timestamp: Number(block.timestamp) * 1000,
                  };
                }
              }
              return null;
            } catch (error) {
              return null;
            }
          });

      // Execute all queries in parallel
      const allResults = await Promise.all(allPromises);
      const validResults = allResults.filter((result): result is TVLPoint => result !== null);
      tvlDataPoints.push(...validResults);
      
      // Sort by timestamp
      tvlDataPoints.sort((a, b) => a.timestamp - b.timestamp);
      
      // Remove duplicates: same timestamp and same TVL (rounded to 2 decimals)
      const uniqueData: TVLPoint[] = [];
      const seen = new Map<number, number>(); // timestamp -> tvl
      
      for (const point of tvlDataPoints) {
        const roundedTVL = Math.round(point.tvl * 100) / 100;
        const existing = seen.get(point.timestamp);
        
        // Keep if different timestamp or different TVL
        if (existing === undefined || Math.abs(existing - roundedTVL) > 0.01) {
          seen.set(point.timestamp, roundedTVL);
          uniqueData.push(point);
        }
      }
      
      // Always ensure current TVL is included as the last point
      if (polPrice && vaultPol !== null && totalStaked !== null && swapPoolReserves !== null) {
        const polPriceNum = parseFloat(formatPrice(polPrice));
        const vaultPolNum = parseFloat(formatBalance(vaultPol));
        const stakedNum = parseFloat(formatBalance(totalStaked));
        const swapNum = parseFloat(formatBalance(swapPoolReserves));
        
        // TVL = (Vault POL + Staked POL + Swap Pool POL) * POL Price
        const totalPol = vaultPolNum + stakedNum + swapNum;
        const currentTVL = totalPol * polPriceNum;
        
        if (currentTVL > 0) {
          const date = new Date(now * 1000);
          const dayLabel = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
          
          const lastPoint = uniqueData[uniqueData.length - 1];
          
          // Add or update current point
          if (!lastPoint || lastPoint.timestamp < now * 1000 - 3600000) { // 1 hour ago
            uniqueData.push({
              day: dayLabel,
              tvl: currentTVL,
              timestamp: now * 1000,
            });
          } else {
            // Update last point
            lastPoint.tvl = currentTVL;
            lastPoint.day = dayLabel;
            lastPoint.timestamp = now * 1000;
          }
        }
      }
      
      // Final sort
      const uniqueDailyData = uniqueData.sort((a, b) => a.timestamp - b.timestamp);
      
      // Ensure we have at least 2 points for proper chart display
      if (uniqueDailyData.length === 1) {
        const singlePoint = uniqueDailyData[0];
        // Add a point 1 day before with same TVL (for visualization)
        const oneDayBefore = singlePoint.timestamp - (oneDayInSeconds * 1000);
        const date = new Date(oneDayBefore);
        const dayLabel = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
        uniqueDailyData.unshift({
          day: dayLabel,
          tvl: singlePoint.tvl,
          timestamp: oneDayBefore,
        });
      }

      setTvlData(uniqueDailyData);
    } catch (error) {
      // Error loading TVL data
    } finally {
      setLoading(false);
    }
  };

  const formatTVL = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    } else {
      return `$${value.toFixed(2)}`;
    }
  };

  if (loading && tvlData.length === 0) {
    return (
      <div style={{ 
        backgroundColor: '#0a0a0a', 
        border: '1px solid #333',
        borderLeft: '2px solid #00ff00',
        borderRadius: '0 4px 4px 0',
        padding: '1rem',
        fontFamily: 'Courier New, monospace',
        height: height
      }}>
        <div style={{ fontSize: '0.75rem', color: '#888' }}>
          <span style={{ color: '#00ff00' }}>&gt;</span> {loadingProgress || 'Loading TVL chart...'}
        </div>
      </div>
    );
  }

  if (tvlData.length === 0) {
    return (
      <div style={{ 
        backgroundColor: '#0a0a0a', 
        border: '1px solid #333',
        borderLeft: '2px solid #00ff00',
        borderRadius: '0 4px 4px 0',
        padding: '1rem',
        fontFamily: 'Courier New, monospace',
        height: height
      }}>
        <div style={{ fontSize: '0.75rem', color: '#888' }}>
          <span style={{ color: '#00ff00' }}>&gt;</span> No TVL data available yet
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      backgroundColor: '#0a0a0a', 
      border: '1px solid #333',
      borderLeft: '2px solid #00ff00',
      borderRadius: '0 4px 4px 0',
      padding: '1rem',
      fontFamily: 'Courier New, monospace'
    }}>
      <div style={{ 
        marginBottom: '1rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderBottom: '1px solid #333',
        paddingBottom: '0.75rem'
      }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>
            <span style={{ color: '#00ff00' }}>&gt;</span> Total Value Locked
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00ff00' }}>
            ${currentTVL}
          </div>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={height - 80}>
        <AreaChart 
          data={tvlData} 
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <defs>
            <linearGradient id="tvlGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00ff00" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#00ff00" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid 
            strokeDasharray="2 2" 
            stroke="#1a1a1a" 
            strokeWidth={1}
            vertical={false}
          />
          <XAxis 
            dataKey="day" 
            stroke="#00ff00"
            tick={{ fill: '#888', fontSize: 10, fontFamily: 'Courier New, monospace' }}
            axisLine={{ stroke: '#333' }}
            tickLine={{ stroke: '#333' }}
            interval="preserveStartEnd"
            allowDuplicatedCategory={false}
          />
          <YAxis 
            tickFormatter={formatTVL}
            stroke="#00ff00"
            tick={{ fill: '#888', fontSize: 11, fontFamily: 'Courier New, monospace' }}
            axisLine={{ stroke: '#333' }}
            tickLine={{ stroke: '#333' }}
            width={80}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{ 
              backgroundColor: '#0a0a0a', 
              border: '1px solid #00ff00',
              borderRadius: '2px',
              color: '#00ff00',
              fontFamily: 'Courier New, monospace',
              fontSize: '0.85rem',
              padding: '0.5rem 0.75rem',
              boxShadow: '0 0 10px rgba(0, 255, 0, 0.3)'
            }}
            labelStyle={{ color: '#888', marginBottom: '0.25rem' }}
            labelFormatter={(value, payload) => {
              if (payload && payload[0] && payload[0].payload) {
                const point = payload[0].payload as TVLPoint;
                const date = new Date(point.timestamp);
                return `> ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
              }
              return `> ${value}`;
            }}
            formatter={(value: number) => [formatTVL(value), 'TVL']}
            cursor={{ stroke: '#00ff00', strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          <Area 
            type="monotone" 
            dataKey="tvl" 
            stroke="#00ff00" 
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#tvlGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#00ff00', stroke: '#0a0a0a', strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={true}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

