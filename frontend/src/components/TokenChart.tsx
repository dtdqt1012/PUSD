import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ethers } from 'ethers';
import { CONTRACTS } from '../config/contracts';
import { useWeb3 } from '../hooks/useWeb3';
import { loadWithTimeout } from '../utils/loadWithTimeout';
import { rpcBatchHandler } from '../utils/rpcHandler';
import { cache } from '../utils/cache';

interface PricePoint {
  time: number;
  price: number;
  volume: number;
}

interface TokenChartProps {
  tokenAddress: string;
  height?: number;
  refreshTrigger?: number;
}

export default function TokenChart({ tokenAddress, height = 300, refreshTrigger = 0 }: TokenChartProps) {
  const { provider } = useWeb3();
  const [priceData, setPriceData] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<string>('0');

  useEffect(() => {
    if (!provider || !tokenAddress) {
      return;
    }
    
    // Clear cache when refreshTrigger changes (after buy/sell)
    if (refreshTrigger > 0) {
      const cacheKey = `token-current-price-${tokenAddress}`;
      cache.delete(cacheKey);
    }
    
    // Load price immediately (skip cache if refreshTrigger changed)
    loadCurrentPrice(refreshTrigger > 0);
    
    // Load chart immediately (no delay)
    loadPriceData();
    
        // Update current price every 30 seconds (reduced frequency)
        const priceInterval = setInterval(() => loadCurrentPrice(false), 30000);
        // Update chart every 10 minutes to show new transactions (reduced RPC calls)
        const chartInterval = setInterval(loadPriceData, 600000);
    
    return () => {
      clearInterval(priceInterval);
      clearInterval(chartInterval);
    };
  }, [provider, tokenAddress, refreshTrigger]);

  // Load only current price (with caching to reduce RPC calls)
  const loadCurrentPrice = async (skipCache = false) => {
    if (!provider) return;
    
    try {
      // Check cache first (skip if refreshTrigger changed)
      const cacheKey = `token-current-price-${tokenAddress}`;
      if (!skipCache) {
        const cached = cache.get<string>(cacheKey);
        if (cached) {
          const formattedPrice = formatPriceForDisplay(parseFloat(cached));
          setCurrentPrice(formattedPrice);
          return;
        }
      }
      
      const bondingCurve = new ethers.Contract(
        CONTRACTS.PFUNBondingCurve.address,
        CONTRACTS.PFUNBondingCurve.abi,
        provider
      );

      // Use getCurrentPrice() to show the current price (after all buy/sell events)
      const currentPriceWei = await rpcBatchHandler.add(() => 
        bondingCurve.getCurrentPrice(tokenAddress)
      ).catch(() => 0n);
      
      if (currentPriceWei === 0n) {
        setCurrentPrice('0');
        return;
      }
      
      // Format price to remove unnecessary trailing zeros
      const currentPriceFormatted = ethers.formatEther(currentPriceWei);
      const formattedPrice = formatPriceForDisplay(parseFloat(currentPriceFormatted));
      setCurrentPrice(formattedPrice);
      
      // Cache for 5 seconds (shorter for faster updates)
      cache.set(cacheKey, currentPriceFormatted, 5000);
    } catch (error) {
      // Error loading current price
    }
  };

  const loadPriceData = async () => {
    if (!provider) {
      return;
    }
    
    // Check cache first (increased cache time for faster loading)
    const cacheKey = `token-chart-${tokenAddress}`;
    const cached = cache.get<PricePoint[]>(cacheKey);
    if (cached && cached.length > 0) {
      setPriceData(cached);
      setLoading(false);
      // Update in background without blocking UI (will update cache silently)
      return;
    }
    
    setLoading(true);
    try {
      const bondingCurve = new ethers.Contract(
        CONTRACTS.PFUNBondingCurve.address,
        CONTRACTS.PFUNBondingCurve.abi,
        provider
      );

      // Fetch initial price and curve info in parallel using rpcBatchHandler
      const [initialPriceWei, curve] = await Promise.all([
        rpcBatchHandler.add(() => bondingCurve.getInitialPrice(tokenAddress)).catch(() => 0n),
        rpcBatchHandler.add(() => bondingCurve.curves(tokenAddress)).catch(() => null),
      ]);
      
      if (!curve || !curve.isActive) {
        setLoading(false);
        return;
      }

      // Use current price for display (will be updated by loadCurrentPrice)
      // Don't set current price here, let loadCurrentPrice handle it

      // Fetch buy/sell events to build price history
      try {
        const buyFilter = bondingCurve.filters.TokensBought(tokenAddress);
        const sellFilter = bondingCurve.filters.TokensSold(tokenAddress);
        
        // Get current block number
        const currentBlock = await provider.getBlockNumber();
        
        // Find launch block to query full history from launch
        let fromBlock = 0; // Start from block 0 to find launch
        
        // Try to find launch event to get exact launch block (search from beginning)
        try {
          const launchpad = new ethers.Contract(
            CONTRACTS.PFUNLaunchpad.address,
            CONTRACTS.PFUNLaunchpad.abi,
            provider
          );
          const launchFilter = launchpad.filters.TokenLaunched(tokenAddress);
          
          // Optimized: Try recent blocks first (faster), then expand if needed
          // Start with last 50k blocks (about 1-2 days on Polygon)
          const recentRange = Math.max(0, currentBlock - 50000);
          let launchEvents = await loadWithTimeout(
            () => launchpad.queryFilter(launchFilter, recentRange, currentBlock),
            10000,
            1
          ).catch(() => []);
          
          // If not found in recent range, search from beginning (slower but comprehensive)
          if (launchEvents.length === 0) {
            launchEvents = await loadWithTimeout(
              () => launchpad.queryFilter(launchFilter, 0, currentBlock),
              20000,
              1
            ).catch(() => []);
          }
          
          if (launchEvents.length > 0) {
            const launchBlock = launchEvents[0].blockNumber;
            fromBlock = Math.max(0, launchBlock - 100);
          } else {
            // Fallback: try to find first buy event (optimized search)
            try {
              const firstBuyFilter = bondingCurve.filters.TokensBought(tokenAddress);
              // Try recent range first
              let buyEvents = await loadWithTimeout(
                () => bondingCurve.queryFilter(firstBuyFilter, recentRange, currentBlock),
                10000,
                1
              ).catch(() => []);
              
              // If not found, search from beginning
              if (buyEvents.length === 0) {
                buyEvents = await loadWithTimeout(
                  () => bondingCurve.queryFilter(firstBuyFilter, 0, currentBlock),
                  20000,
                  1
                ).catch(() => []);
              }
              
              if (buyEvents.length > 0) {
                const firstBuyBlock = Math.min(...buyEvents.map(e => e.blockNumber));
                fromBlock = Math.max(0, firstBuyBlock - 100);
              } else {
                // No events found, use recent blocks as fallback
                fromBlock = Math.max(0, currentBlock - 10000);
              }
            } catch (error) {
              // Use recent blocks as fallback
              fromBlock = Math.max(0, currentBlock - 10000);
            }
          }
        } catch (error) {
          // Use recent blocks as fallback
          fromBlock = Math.max(0, currentBlock - 10000);
        }
        
        // Query events with optimized pagination (query full history)
        const queryEvents = async () => {
          const queryWithPagination = async (filter: any, initialFromBlock: number) => {
            const totalRange = currentBlock - initialFromBlock;
            const maxRangePerQuery = 50000; // Increased for better coverage
            
            // If range is small enough, query directly
            if (totalRange <= maxRangePerQuery) {
              try {
                const events = await loadWithTimeout(
                  () => bondingCurve.queryFilter(filter, initialFromBlock, currentBlock),
                  30000,
                  1
                ).catch(() => []);
                
                return events;
              } catch (error: any) {
                // Fall through to batch query
              }
            }
            
            // For large ranges, query in batches (optimized for speed)
            const allEvents: any[] = [];
            let batchFrom = initialFromBlock;
            const maxBatches = 20; // Increased from 5 to 20 to cover full history
            let batchCount = 0;
            
            // Query batches in parallel (up to 3 at a time) for faster loading
            const batchPromises: Promise<any[]>[] = [];
            const batchRanges: Array<{from: number, to: number}> = [];
            
            // Prepare all batch ranges first
            while (batchFrom < currentBlock && batchCount < maxBatches) {
              const batchTo = Math.min(batchFrom + maxRangePerQuery, currentBlock);
              batchRanges.push({ from: batchFrom, to: batchTo });
              batchFrom = batchTo + 1;
              batchCount++;
            }
            
            // Query batches in parallel (3 at a time)
            const parallelBatches = 3;
            for (let i = 0; i < batchRanges.length; i += parallelBatches) {
              const batchGroup = batchRanges.slice(i, i + parallelBatches);
              const groupPromises = batchGroup.map(range => 
                loadWithTimeout(
                  () => bondingCurve.queryFilter(filter, range.from, range.to),
                  30000,
                  1
                ).catch(() => [])
              );
              
              const groupResults = await Promise.all(groupPromises);
              groupResults.forEach(events => allEvents.push(...events));
              
              // Small delay between groups to avoid rate limiting
              if (i + parallelBatches < batchRanges.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
            
            // Remove duplicates
            const uniqueEvents = allEvents.filter((event, index, self) =>
              index === self.findIndex(e => e.transactionHash === event.transactionHash && e.logIndex === event.logIndex)
            );
            
            return uniqueEvents;
          };
          
          try {
            const [buyEvents, sellEvents] = await Promise.all([
              queryWithPagination(buyFilter, fromBlock),
              queryWithPagination(sellFilter, fromBlock),
            ]);
            
            return { buyEvents, sellEvents };
          } catch (error) {
            return { buyEvents: [], sellEvents: [] };
          }
        };
        
        const { buyEvents, sellEvents } = await queryEvents();

        // Combine and sort events by block number
        const allEvents = [
          ...buyEvents.map((e: any) => ({ ...e, type: 'buy' as const })),
          ...sellEvents.map((e: any) => ({ ...e, type: 'sell' as const })),
        ].sort((a, b) => a.blockNumber - b.blockNumber);

        // Use curve info already fetched above (avoid duplicate call)
        
        // Get initial price from curve (use getInitialPrice result from above)
        // Use the initialPriceWei from outer scope, fallback to curve.initialPrice
        const finalInitialPriceWei = initialPriceWei > 0n ? initialPriceWei : (curve.initialPrice > 0n ? curve.initialPrice : 0n);
        const initialPrice = Number(ethers.formatEther(finalInitialPriceWei));
        // priceIncrement is dynamic: initialPrice / 10000 (0.01% of initial price)
        // If initialPrice is too small, fallback to fixed PRICE_INCREMENT (1e12 wei = 0.000001 PUSD)
        let priceIncrementWei = finalInitialPriceWei / 10000n;
        if (priceIncrementWei === 0n) {
          priceIncrementWei = BigInt(1e12);
        }
        const priceIncrement = Number(ethers.formatEther(priceIncrementWei));

        // Build price history
        const history: PricePoint[] = [];
        
        // Get current total values from curve (these are cumulative totals)
        // tokensSold is now always stored as wei in contract (after fix)
        const currentTokensSold = Number(ethers.formatEther(curve.tokensSold));
        const currentPusdRaised = BigInt(curve.pusdRaised);
        
        // Calculate initial values by subtracting all events from current totals
        // This gives us the starting point before any events
        // tokensSold is now always stored as wei in contract (after fix)
        // Convert to actual token count for calculations
        let initialTokensSold = currentTokensSold;
        let initialPusdRaised = currentPusdRaised;
        
        // Subtract all events to get initial state
        // All tokensSold values are now consistently in wei in contract
        for (const event of allEvents) {
          if (event.type === 'buy') {
            // event.args.tokensAmount is in wei, convert to actual token count
            const tokensAmount = Number(ethers.formatEther(event.args.tokensAmount));
            initialTokensSold -= tokensAmount;
            initialPusdRaised -= BigInt(event.args.pusdPaid);
          } else {
            // Sell: add back (reverse the effect)
            const tokensAmount = Number(ethers.formatEther(event.args.tokensAmount));
            initialTokensSold += tokensAmount;
            initialPusdRaised += BigInt(event.args.pusdReceived);
          }
        }
        
        // Ensure initial values are non-negative (safety check)
        if (initialTokensSold < 0) {
          initialTokensSold = 0;
        }
        if (initialPusdRaised < 0n) initialPusdRaised = 0n;
        
        // Track cumulative tokensSold and pusdRaised from events (starting from initial)
        let cumulativeTokensSold = initialTokensSold;
        let cumulativePusdRaised = initialPusdRaised;
        
        // Add initial point (before any events)
        if (allEvents.length > 0) {
          // Use first event's block as launch point
          const firstEventBlock = allEvents[0].blockNumber;
          const launchBlock = await provider.getBlock(firstEventBlock);
          
          if (launchBlock) {
            // Calculate initial price using bonding curve formula
            // Price = initialPrice + (tokensSold * PRICE_INCREMENT)
            // tokensSold is actual token count, PRICE_INCREMENT is in wei
            // So: price = initialPrice + (tokensSold * 1e12) / 1e18 = initialPrice + (tokensSold * 1e-6)
            let initialPriceValue = initialPrice;
            if (initialTokensSold > 0) {
              // tokensSold is actual token count, PRICE_INCREMENT = 1e12 wei = 1e-6 PUSD per token
              initialPriceValue = initialPrice + (initialTokensSold * priceIncrement);
            }
            
            // Ensure price is valid
            if (initialPriceValue <= 0 || initialPriceValue > 1000000) {
              initialPriceValue = initialPrice;
            }
            
            history.push({
              time: launchBlock.timestamp * 1000,
              price: initialPriceValue,
              volume: Number(ethers.formatEther(initialPusdRaised)),
            });
          }
        } else {
          // No events, use current block for initial point
          const currentBlock = await provider.getBlockNumber();
          const block = await provider.getBlock(currentBlock);
          
          if (block) {
            let initialPriceValue = initialPrice;
            if (initialTokensSold > 0) {
              initialPriceValue = initialPrice + (initialTokensSold * priceIncrement);
            }
            
            history.push({
              time: block.timestamp * 1000,
              price: initialPriceValue,
              volume: Number(ethers.formatEther(initialPusdRaised)),
            });
          }
        }

        // Reset cumulative values to initial for chart building
        // tokensSold is actual token count (not wei)
        // IMPORTANT: chartTokensSold should start from initialTokensSold (after subtracting all events)
        let chartTokensSold = initialTokensSold;
        let chartPusdRaised = initialPusdRaised;
        
        // Sample events to reduce chart points (increased max points to show more history)
        const maxPoints = 100; // Increased from 50 to 100 to show more detail
        const sampleRate = allEvents.length > maxPoints ? Math.ceil(allEvents.length / maxPoints) : 1;
        
        // Collect unique block numbers to batch fetch
        const uniqueBlocks = new Set<number>();
        const sampledEvents = allEvents.filter((_, index) => index % sampleRate === 0 || index === allEvents.length - 1);
        
        sampledEvents.forEach(event => {
          uniqueBlocks.add(event.blockNumber);
        });
        
        // Batch fetch blocks (increased batch size and parallel processing)
        const blockMap = new Map<number, any>();
        const blockNumbers = Array.from(uniqueBlocks);
        // Increased batch size from 10 to 20 for faster loading
        for (let i = 0; i < blockNumbers.length; i += 20) {
          const batch = blockNumbers.slice(i, i + 20);
          const blockPromises = batch.map(blockNum => 
            provider.getBlock(blockNum).catch(() => null)
          );
          const blocks = await Promise.all(blockPromises);
          blocks.forEach((block, idx) => {
            if (block) {
              blockMap.set(batch[idx], block);
            }
          });
          
          // Reduced delay between batches
          if (i + 20 < blockNumbers.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        
        // Process sampled events chronologically for chart
        for (const event of sampledEvents) {
          try {
            // Update cumulative values based on event type
            // event.args.tokensAmount is in wei, convert to actual token count
            const tokensAmountBefore = chartTokensSold;
            if (event.type === 'buy') {
              const tokensAmount = Number(ethers.formatEther(event.args.tokensAmount));
              chartTokensSold += tokensAmount;
              chartPusdRaised += BigInt(event.args.pusdPaid);
            } else {
              const tokensAmount = Number(ethers.formatEther(event.args.tokensAmount));
              chartTokensSold -= tokensAmount;
              chartPusdRaised -= BigInt(event.args.pusdReceived);
            }

            // Calculate total tokensSold at this point (after processing this event)
            // tokensSold is actual token count (not wei)
            const totalTokensSold = chartTokensSold < 0 ? 0 : chartTokensSold;

            // Calculate price using bonding curve formula (same as contract getCurrentPrice)
            // Contract formula: price = initialPrice + ((tokensSold_wei * PRICE_INCREMENT) / 1e18)
            // Since tokensSold_wei = totalTokensSold * 1e18, we get:
            // price = initialPrice + ((totalTokensSold * 1e18 * 1e12) / 1e18) / 1e18
            // price = initialPrice + (totalTokensSold * 1e12) / 1e18
            // price = initialPrice + (totalTokensSold * 1e-6) PUSD
            let price = initialPrice;
            if (totalTokensSold > 0) {
              // tokensSold is actual count, PRICE_INCREMENT = 1e12 wei = 1e-6 PUSD per token
              price = initialPrice + (totalTokensSold * priceIncrement);
            }
            
            // Ensure price is valid (should never be negative or unreasonably high)
            if (price <= 0 || price > 1000000) {
              price = initialPrice;
            }

            // Get block from cache
            const block = blockMap.get(event.blockNumber);
            if (!block) {
              continue;
            }
            
            const point = {
              time: block.timestamp * 1000,
              price,
              volume: event.type === 'buy' 
                ? Number(ethers.formatEther(event.args.pusdPaid))
                : Number(ethers.formatEther(event.args.pusdReceived)),
            };
            
            history.push(point);
          } catch (err) {
            continue;
          }
        }

        // Always add current price point at the end (even if there are events)
        // Calculate current price from curve using bonding curve formula
        const latestBlock = await provider.getBlockNumber();
        const block = await provider.getBlock(latestBlock);
        if (block) {
          // Calculate current price using bonding curve formula
          // Price = initialPrice + ((tokensSold_wei * PRICE_INCREMENT) / 1e18)
          // tokensSold is stored as wei in contract
          const currentTokensSold = Number(ethers.formatEther(curve.tokensSold));
          let currentPriceValue = initialPrice;
          if (currentTokensSold > 0) {
            currentPriceValue = initialPrice + (currentTokensSold * priceIncrement);
          }
          
          // Ensure current price is valid
          if (currentPriceValue <= 0 || currentPriceValue > 1000000) {
            currentPriceValue = initialPrice;
          }
          
          // Add current price point (or update last point if it's at the same time)
          const lastPoint = history[history.length - 1];
          if (lastPoint && lastPoint.time === block.timestamp * 1000) {
            // Update last point with current price
            lastPoint.price = currentPriceValue;
          } else {
            // Add new point with current price
            history.push({
              time: block.timestamp * 1000,
              price: currentPriceValue,
              volume: Number(ethers.formatEther(curve.pusdRaised)),
            });
          }
        }

        // Cache the result for 5 minutes (increased for faster subsequent loads)
        cache.set(cacheKey, history, 300000);

        setPriceData(history);
        setLoading(false);
      } catch (eventError) {
        // Fallback: just show current price
        const fallbackBlock = await provider.getBlockNumber();
        const block = await provider.getBlock(fallbackBlock);
        if (block) {
          const finalInitialPriceWei = initialPriceWei > 0n ? initialPriceWei : (curve?.initialPrice || 0n);
          const initialPrice = Number(ethers.formatEther(finalInitialPriceWei));
          const fallbackData = [{
            time: block.timestamp * 1000,
            price: initialPrice,
            volume: 0,
          }];
          cache.set(cacheKey, fallbackData, 300000);
          setPriceData(fallbackData);
        }
        setLoading(false);
      }
    } catch (error) {
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };


  // Format price for display - removes unnecessary trailing zeros and handles very small numbers
  const formatPriceForDisplay = (price: number): string => {
    if (price === 0) return '0';
    
    // Handle very small numbers (scientific notation)
    if (price < 0.000001) {
      // For very small numbers, show up to 12 decimal places
      return price.toFixed(12).replace(/\.?0+$/, '');
    } else if (price < 0.01) {
      // For small numbers, show up to 8 decimal places
      return price.toFixed(8).replace(/\.?0+$/, '');
    } else if (price < 1) {
      // For numbers less than 1, show up to 6 decimal places
      return price.toFixed(6).replace(/\.?0+$/, '');
    } else if (price < 1000) {
      // For numbers less than 1000, show up to 4 decimal places
      return price.toFixed(4).replace(/\.?0+$/, '');
    } else {
      // For large numbers, show up to 2 decimal places
      return price.toFixed(2).replace(/\.?0+$/, '');
    }
  };

  const formatPrice = (price: number) => {
    // Hiển thị đầy đủ, không làm tròn
    // Tối đa 10 chữ số thập phân để đảm bảo độ chính xác
    if (price === 0) return '0';
    // Tìm số chữ số thập phân có nghĩa (loại bỏ trailing zeros)
    const str = price.toString();
    if (str.includes('e')) {
      // Số quá nhỏ, dùng toFixed với nhiều chữ số
      return price.toFixed(10).replace(/\.?0+$/, '');
    }
    // Hiển thị tối đa 10 chữ số thập phân, loại bỏ trailing zeros
    return price.toFixed(10).replace(/\.?0+$/, '');
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading && priceData.length === 0) {
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
              <span style={{ color: '#00ff00' }}>&gt;</span> Current Price
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00ff00' }}>
              {currentPrice} PUSD
            </div>
          </div>
        </div>
        <div style={{ 
          height: height - 80, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: '#888',
          fontSize: '0.85rem',
          fontFamily: 'Courier New, monospace'
        }}>
          <span style={{ color: '#00ff00' }}>&gt;</span> Loading chart data...
        </div>
      </div>
    );
  }

  if (priceData.length === 0) {
    return (
      <div style={{ 
        height, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#0a0a0a',
        border: '1px solid #333',
        borderLeft: '2px solid #00ff00',
        borderRadius: '0 4px 4px 0',
        color: '#888',
        fontFamily: 'Courier New, monospace',
        padding: '1rem'
      }}>
        <div>
          <span style={{ color: '#00ff00' }}>&gt;</span> No trading data available yet
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
            <span style={{ color: '#00ff00' }}>&gt;</span> Current Price
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00ff00' }}>
            {currentPrice} PUSD
          </div>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#888' }}>
          {priceData.length} tx
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={height - 80}>
        <LineChart data={priceData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid 
            strokeDasharray="2 2" 
            stroke="#1a1a1a" 
            strokeWidth={1}
            vertical={false}
          />
          <XAxis 
            dataKey="time" 
            tickFormatter={formatTime}
            stroke="#00ff00"
            tick={{ fill: '#888', fontSize: 11, fontFamily: 'Courier New, monospace' }}
            axisLine={{ stroke: '#333' }}
            tickLine={{ stroke: '#333' }}
          />
          <YAxis 
            tickFormatter={formatPrice}
            stroke="#00ff00"
            tick={{ fill: '#888', fontSize: 11, fontFamily: 'Courier New, monospace' }}
            axisLine={{ stroke: '#333' }}
            tickLine={{ stroke: '#333' }}
            width={80}
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
            labelFormatter={(value) => `> ${new Date(value).toLocaleString()}`}
            formatter={(value: number) => [`${formatPrice(value)} PUSD`, 'Price']}
            cursor={{ stroke: '#00ff00', strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          <Line 
            type="monotone" 
            dataKey="price" 
            stroke="#00ff00" 
            strokeWidth={2.5}
            dot={false}
            activeDot={{ 
              r: 5, 
              fill: '#00ff00',
              stroke: '#0a0a0a',
              strokeWidth: 2,
              filter: 'drop-shadow(0 0 4px #00ff00)'
            }}
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

