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
      // Try to find first event from StakingPool, but if not found, use block 0
      let deploymentBlock = 0;
      let deploymentBlockData = null;
      
      try {
        // Query first Staked event (most common event) from a reasonable range
        // If contract is old, we'll query from block 0 anyway
        const searchRange = Math.min(currentBlock, 500000); // Search up to 500k blocks back
        const stakingEvents = await loadWithTimeout(
          stakingContract.queryFilter(stakingContract.filters.Staked(), 0, searchRange),
          20000
        ).catch(() => []);

        if (stakingEvents.length > 0) {
          const earliestBlock = Math.min(...stakingEvents.map(e => e.blockNumber));
          deploymentBlock = Math.max(0, earliestBlock - 50); // Start a bit before first event
        } else {
          // If no events found, query from block 0 to ensure we get all data
          deploymentBlock = 0;
        }
      } catch (error) {
        console.warn('Failed to find deployment block, using block 0:', error);
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

      // Query TVL at key change points (from events) + daily samples
      const blocksPerDay = Math.floor((24 * 60 * 60) / 2); // ~2 seconds per block on Polygon
      const oneDayInSeconds = 24 * 60 * 60;
      
      // Calculate days from deployment to now
      const totalSeconds = Number(now) - Number(deploymentTimestamp);
      const totalDays = Math.max(1, Math.ceil(totalSeconds / oneDayInSeconds));
      
      // Limit to max 90 days for fast loading
      const maxDays = Math.min(totalDays, 90);
      const daysToQuery = maxDays;
      
      const tvlDataPoints: TVLPoint[] = [];
      const startBlock = deploymentBlock;
      
      // First, get all events that change TVL from StakingPool
      const eventBlocks = new Set<number>();
      
      try {
        // Query StakingPool events that affect TVL
        const [stakedEvents, unstakedEvents, pusdStakedEvents, pusdUnstakedEvents, lockExtendedEvents] = await Promise.all([
          stakingContract.queryFilter(stakingContract.filters.Staked(), startBlock, currentBlock).catch(() => []),
          stakingContract.queryFilter(stakingContract.filters.Unstaked(), startBlock, currentBlock).catch(() => []),
          stakingContract.queryFilter(stakingContract.filters.PUSDStaked(), startBlock, currentBlock).catch(() => []),
          stakingContract.queryFilter(stakingContract.filters.PUSDUnstaked(), startBlock, currentBlock).catch(() => []),
          stakingContract.queryFilter(stakingContract.filters.LockExtended(), startBlock, currentBlock).catch(() => []),
        ]);
        
        // Collect unique block numbers from events
        [...stakedEvents, ...unstakedEvents, ...pusdStakedEvents, ...pusdUnstakedEvents, ...lockExtendedEvents].forEach(event => {
          eventBlocks.add(event.blockNumber);
        });
        
        // Also add daily samples to ensure we have data points even if no events
        const totalPoints = daysToQuery + 1;
        for (let i = 0; i < totalPoints; i++) {
          const targetBlock = startBlock + (i * blocksPerDay);
          if (targetBlock <= currentBlock) {
            eventBlocks.add(targetBlock);
          }
        }
        
        // Always include current block
        eventBlocks.add(currentBlock);
      } catch (error) {
        console.warn('Failed to query events, falling back to daily sampling:', error);
        // Fallback: just use daily sampling
        const totalPoints = daysToQuery + 1;
        for (let i = 0; i < totalPoints; i++) {
          const targetBlock = startBlock + (i * blocksPerDay);
          if (targetBlock <= currentBlock) {
            eventBlocks.add(targetBlock);
          }
        }
        eventBlocks.add(currentBlock);
      }
      
      // Convert to sorted array
      const blocksToQuery = Array.from(eventBlocks).sort((a, b) => a - b);
      const batchSize = 20; // Process 20 blocks at a time
      
      for (let pointIndex = 0; pointIndex < blocksToQuery.length; pointIndex += batchSize) {
        const batchEnd = Math.min(pointIndex + batchSize, blocksToQuery.length);
        const batchPromises: Promise<TVLPoint | null>[] = [];

        const progress = Math.min(100, Math.round((pointIndex / blocksToQuery.length) * 100));
        setLoadingProgress(`Loading TVL... ${progress}%`);

        for (let i = pointIndex; i < batchEnd; i++) {
          const blockNumber = blocksToQuery[i];
          
          if (blockNumber < 0 || blockNumber > currentBlock) continue;
          
          const promise = (async (): Promise<TVLPoint | null> => {
            try {
              const block = await loadWithTimeout(provider.getBlock(blockNumber), 3000).catch(() => null);
              if (!block) return null;

              const [historicalPolPrice, historicalVaultPol, historicalStaked, historicalSwap] = await Promise.all([
                loadWithTimeout(oracleContract.getPOLPrice({ blockTag: blockNumber }), 5000).catch(() => null),
                loadWithTimeout(vaultContract.getBalance({ blockTag: blockNumber }), 5000).catch(() => null),
                loadWithTimeout(stakingContract.totalStaked({ blockTag: blockNumber }), 5000).catch(() => null),
                loadWithTimeout(swapContract.getBalance({ blockTag: blockNumber }), 5000).catch(() => null),
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
          })();

          batchPromises.push(promise);
        }

        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter((result): result is TVLPoint => result !== null);
        tvlDataPoints.push(...validResults);

        // Update state with current progress (progressive loading)
        if (tvlDataPoints.length > 0) {
          const sortedData = [...tvlDataPoints].sort((a, b) => a.timestamp - b.timestamp);
          setTvlData(sortedData);
        }
      }
      
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
      console.error('Failed to load TVL data:', error);
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

