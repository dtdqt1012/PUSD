import { useState, useEffect, useRef } from 'react';
import { useWeb3 } from '../../hooks/useWeb3';
import { CONTRACTS } from '../../config/contracts';
import { ethers } from 'ethers';
import { loadWithTimeout } from '../../utils/loadWithTimeout';
import { cache } from '../../utils/cache';
import { callWithRpcFallback, createFallbackProvider } from '../../utils/rpcProvider';
// API client removed - using direct RPC queries only
interface LotteryStats {
  totalTicketsSold: number;
  totalPrizesDistributed: string;
  totalBurned: string;
  biggestWin: string;
}

interface LotteryStatsProps {
  isActive?: boolean;
}

export default function LotteryStats({ isActive = false }: LotteryStatsProps) {
  const { provider } = useWeb3();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  // WebSocket removed - using direct RPC queries only

  // Only load when tab is active (with prefetch on hover)
  // Add small delay to avoid blocking initial page load
  useEffect(() => {
    if (isActive && !hasLoaded && provider && CONTRACTS.PUSDLottery) {
      // Small delay to let page render first
      const timeoutId = setTimeout(() => {
        loadStats().catch((error) => {
          console.error('Failed to load lottery stats:', error);
          setLoading(false);
          setStats({
            totalTicketsSold: 0,
            totalPrizesDistributed: '0',
            totalBurned: '0',
            biggestWin: '0',
          });
        });
        setHasLoaded(true);
      }, 500);
      
      return () => clearTimeout(timeoutId);
    } else if (isActive && !provider) {
      // If provider is not available, show default stats
      setLoading(false);
      setStats({
        totalTicketsSold: 0,
        totalPrizesDistributed: '0',
        totalBurned: '0',
        biggestWin: '0',
      });
    }
  }, [isActive, hasLoaded, provider]);

  // Listen for prefetch event
  useEffect(() => {
    const handlePrefetch = () => {
      if (!hasLoaded && provider && CONTRACTS.PUSDLottery) {
        loadStats(true).catch(() => {}); // Silent prefetch
      }
    };
    window.addEventListener('lottery-prefetch-stats', handlePrefetch);
    return () => window.removeEventListener('lottery-prefetch-stats', handlePrefetch);
  }, [hasLoaded, provider]);

  // WebSocket removed - using direct RPC queries only

  const loadStats = async (silent = false) => {
    // Query directly from RPC (no API)
    if (!provider || !CONTRACTS.PUSDLottery) {
      if (!silent) {
        setLoading(false);
        setStats({
          totalTicketsSold: 0,
          totalPrizesDistributed: '0',
          totalBurned: '0',
          biggestWin: '0',
        });
      }
      return;
    }
    
    // Check cache first (cache for 30 minutes - significantly reduce RPC calls for multiple users)
    // This is a read-only stats page, so longer cache is acceptable
    const cacheKey = 'lottery-stats';
    const cached = cache.get<any>(cacheKey);
    if (cached !== null) {
      setStats(cached);
      if (!silent) setLoading(false);
      
      // Only refresh in background if cache is older than 20 minutes
      // This means most users will use cached data, reducing RPC load
      const cacheAge = cache.getAge(cacheKey) || 0;
      if (cacheAge > 1200000) { // 20 minutes
        // Only one user needs to refresh, others will use cache
        // Use a random delay to avoid all users refreshing at once
        const randomDelay = Math.random() * 60000; // 0-60 seconds
        setTimeout(() => {
          loadStats(true).catch(() => {}); // Silent refresh
        }, randomDelay);
      }
      return;
    }
    
    if (!silent) setLoading(true);
    
    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (!silent) {
        setLoading(false);
        setStats({
          totalTicketsSold: 0,
          totalPrizesDistributed: '0',
          totalBurned: '0',
          biggestWin: '0',
        });
        console.warn('Lottery stats loading timeout');
      }
    }, 60000); // 60 second timeout
    
    try {
      // Use fallback provider for read operations
      const fallbackProvider = createFallbackProvider();
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        fallbackProvider
      );

      const currentBlock = await callWithRpcFallback(async (rpcProvider) => {
        return await rpcProvider.getBlockNumber();
      });
      
      // Try to get contract creation block from cache or query it
      const contractCreationBlockKey = `lottery-creation-block-${CONTRACTS.PUSDLottery.address}`;
      let fromBlock = cache.get<number>(contractCreationBlockKey);
      
      if (fromBlock === null) {
        // Use a more conservative starting point: last 50k blocks (~1 week)
        // This reduces the chance of hitting 413 errors
        const blocksToQuery = 50000; // ~1 week of blocks
        fromBlock = Math.max(0, currentBlock - blocksToQuery);
        
        // Cache the starting block
        cache.set(contractCreationBlockKey, fromBlock, 86400000); // Cache for 24 hours
      }
      
      // Ensure fromBlock is not negative
      fromBlock = Math.max(0, fromBlock);

      // Helper function to query events using getLogs (more efficient than queryFilter)
      const queryEventsWithGetLogs = async (topics: any[], from: number, to: number): Promise<any[]> => {
        try {
          return await callWithRpcFallback(async (rpcProvider) => {
            return await rpcProvider.getLogs({
              address: CONTRACTS.PUSDLottery.address,
              topics: topics,
              fromBlock: from,
              toBlock: to,
            });
          }, 1, 60000);
        } catch (error: any) {
          // If getLogs fails, fall back to queryFilter
          if (error?.message?.includes('413') || error?.message?.includes('Content Too Large')) {
            throw error; // Will be handled by pagination
          }
          return [];
        }
      };

      // Helper function to query events with pagination (optimized)
      // RPC providers limit block range and request size
      const queryEventsWithPagination = async (filter: any, from: number, to: number, depth = 0): Promise<any[]> => {
        // Prevent infinite recursion
        if (depth > 8) {
          console.warn(`Max recursion depth reached for range ${from}-${to}, skipping`);
          return [];
        }
        
        // Start with 1k blocks per query to avoid 413 errors
        // If still too large, will split further
        const maxRangePerQuery = 1000; // Very conservative to avoid 413 errors
        const totalRange = to - from;
        
        // If range is too small, just return empty
        if (totalRange <= 0) {
          return [];
        }
        
        // If range is very small (< 10 blocks), skip to avoid issues
        if (totalRange < 10 && depth > 0) {
          console.warn(`Skipping very small range ${from}-${to} (depth ${depth})`);
          return [];
        }
        
        if (totalRange <= maxRangePerQuery) {
          try {
            // Try using getLogs first (more efficient)
            const topics = filter.topics || [];
            try {
              const logs = await queryEventsWithGetLogs(topics, from, to);
              // Convert logs to event format
              const contract = new ethers.Contract(
                CONTRACTS.PUSDLottery.address,
                CONTRACTS.PUSDLottery.abi,
                createFallbackProvider()
              );
              return logs.map((log: any) => {
                try {
                  return contract.interface.parseLog(log);
                } catch {
                  return null;
                }
              }).filter((e: any) => e !== null);
            } catch (getLogsError: any) {
              // Fall back to queryFilter if getLogs fails
              if (getLogsError?.message?.includes('413') || getLogsError?.message?.includes('Content Too Large')) {
                throw getLogsError; // Will be handled below
              }
              
              // Use queryFilter as fallback
              return await callWithRpcFallback(async (rpcProvider) => {
                const contract = new ethers.Contract(
                  CONTRACTS.PUSDLottery.address,
                  CONTRACTS.PUSDLottery.abi,
                  rpcProvider
                );
                return await contract.queryFilter(filter, from, to);
              }, 1, 60000);
            }
          } catch (error: any) {
            // Handle 413 errors by splitting the query
            if (error?.message?.includes('413') || error?.message?.includes('Content Too Large')) {
              if (depth >= 10) {
                console.warn(`Max depth reached for ${from}-${to}, skipping to avoid infinite recursion`);
                return [];
              }
              
              // If range is already very small, skip it
              if (totalRange <= 50) {
                console.warn(`Skipping small range ${from}-${to} due to 413 (too many events in range)`);
                return [];
              }
              
              console.warn(`413 error for range ${from}-${to}, splitting further (depth ${depth}, size: ${totalRange})`);
              
              // Split into 8 smaller chunks for better granularity
              const numChunks = 8;
              const chunkSize = Math.max(1, Math.floor(totalRange / numChunks));
              
              if (chunkSize >= 1) {
                // Query chunks sequentially to avoid rate limits
                const results: any[] = [];
                for (let i = from; i < to; i += chunkSize) {
                  const chunkEnd = Math.min(i + chunkSize - 1, to);
                  
                  // Skip if chunk is too small
                  if (chunkEnd - i < 1) break;
                  
                  try {
                    const chunkResults = await queryEventsWithPagination(filter, i, chunkEnd, depth + 1);
                    results.push(...chunkResults);
                  } catch (chunkError: any) {
                    // If chunk also fails with 413, skip it
                    if (chunkError?.message?.includes('413') || chunkError?.message?.includes('Content Too Large')) {
                      console.warn(`Skipping chunk ${i}-${chunkEnd} due to 413`);
                      continue;
                    }
                    // For other errors, log and continue
                    console.warn(`Error in chunk ${i}-${chunkEnd}:`, chunkError);
                  }
                  
                  // Delay between chunks to avoid rate limits
                  if (i + chunkSize < to) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                  }
                }
                return results;
              }
              return [];
            }
            console.warn('Error querying events (single batch):', error);
            return [];
          }
        }
        
        const allEvents: any[] = [];
        let batchFrom = from;
        let consecutiveErrors = 0;
        const maxConsecutiveErrors = 5;
        let rateLimitCount = 0;
        
        while (batchFrom < to) {
          const batchTo = Math.min(batchFrom + maxRangePerQuery, to);
          try {
            // Use longer timeout for event queries (60 seconds)
            const batchEvents = await callWithRpcFallback(async (rpcProvider) => {
              const contract = new ethers.Contract(
                CONTRACTS.PUSDLottery.address,
                CONTRACTS.PUSDLottery.abi,
                rpcProvider
              );
              return await contract.queryFilter(filter, batchFrom, batchTo);
            }, 1, 60000).catch((error) => {
              // Handle 413 errors by returning empty and will retry with smaller range
              if (error?.message?.includes('413') || error?.message?.includes('Content Too Large')) {
                console.warn(`413 error for batch ${batchFrom}-${batchTo}, will split`);
                throw error; // Re-throw to trigger split logic
              }
              // Handle 429 rate limit errors
              if (error?.message?.includes('429') || error?.message?.includes('Too Many Requests') || error?.message?.includes('rate limit')) {
                throw error; // Re-throw to trigger rate limit handling
              }
              return [];
            });
            
            allEvents.push(...batchEvents);
            consecutiveErrors = 0; // Reset error counter on success
            rateLimitCount = 0; // Reset rate limit counter on success
            batchFrom = batchTo + 1;
            
            // Delay between batches to avoid rate limiting (increased delay)
            // Exponential backoff based on number of batches processed
            const baseDelay = 2000; // 2 seconds base delay
            const delay = baseDelay + (rateLimitCount * 1000); // Add extra delay if we've hit rate limits
            if (batchFrom < to) {
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          } catch (error: any) {
            // Handle 429 rate limit errors
            if (error?.message?.includes('429') || error?.message?.includes('Too Many Requests') || error?.message?.includes('rate limit')) {
              rateLimitCount++;
              consecutiveErrors++;
              console.warn(`Rate limit (429) for batch ${batchFrom}-${batchTo}, waiting longer... (count: ${rateLimitCount})`);
              
              // Exponential backoff for rate limits: 5s, 10s, 20s, 40s...
              const backoffDelay = Math.min(60000, 5000 * Math.pow(2, rateLimitCount - 1));
              await new Promise(resolve => setTimeout(resolve, backoffDelay));
              
              // If too many rate limits, skip this batch and continue
              if (rateLimitCount >= 10) {
                console.warn(`Too many rate limits, skipping batch ${batchFrom}-${batchTo}`);
                batchFrom = batchTo + 1;
                rateLimitCount = Math.max(0, rateLimitCount - 2); // Reduce counter slightly
                continue;
              }
              
              // Retry the same batch
              continue;
            }
            
            // Handle 413 errors by splitting the batch
            if (error?.message?.includes('413') || error?.message?.includes('Content Too Large')) {
              console.warn(`413 error for batch ${batchFrom}-${batchTo}, splitting into smaller chunks`);
              const batchSize = batchTo - batchFrom;
              
              // If batch is already small, skip it (too many events in this range)
              if (batchSize <= 50) {
                console.warn(`Skipping batch ${batchFrom}-${batchTo} due to 413 (too many events, range too small)`);
                batchFrom = batchTo + 1;
                continue;
              }
              
              // Split into 8 smaller chunks for better granularity
              const numChunks = 8;
              const chunkSize = Math.max(1, Math.floor(batchSize / numChunks));
              
              if (chunkSize >= 1) {
                try {
                  const splitResults: any[] = [];
                  for (let i = batchFrom; i <= batchTo; i += chunkSize) {
                    const chunkEnd = Math.min(i + chunkSize - 1, batchTo);
                    
                    // Skip if chunk is too small
                    if (chunkEnd - i < 1) break;
                    
                    try {
                      // Query chunks sequentially with delay
                      const chunkResult = await queryEventsWithPagination(filter, i, chunkEnd, 0);
                      splitResults.push(...chunkResult);
                    } catch (chunkError: any) {
                      // If chunk also fails with 413, skip it
                      if (chunkError?.message?.includes('413') || chunkError?.message?.includes('Content Too Large')) {
                        console.warn(`Skipping chunk ${i}-${chunkEnd} due to 413`);
                        continue;
                      }
                      console.warn(`Error in chunk ${i}-${chunkEnd}:`, chunkError);
                    }
                    
                    // Delay between chunks
                    if (i + chunkSize <= batchTo) {
                      await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                  }
                  allEvents.push(...splitResults);
                  consecutiveErrors = 0;
                  batchFrom = batchTo + 1;
                  continue;
                } catch (splitError) {
                  console.warn('Error splitting batch:', splitError);
                  // If split also fails, skip this batch
                  batchFrom = batchTo + 1;
                  continue;
                }
              } else {
                // Already very small, skip this batch
                console.warn(`Skipping batch ${batchFrom}-${batchTo} due to 413 error (too small to split further)`);
                batchFrom = batchTo + 1;
                continue;
              }
            }
            
            consecutiveErrors++;
            console.warn(`Error querying events batch ${batchFrom}-${batchTo}:`, error);
            
            // If too many consecutive errors, give up
            if (consecutiveErrors >= maxConsecutiveErrors) {
              console.error('Too many consecutive errors, stopping event query');
              break;
            }
            
            // Wait longer before retrying after error
            await new Promise(resolve => setTimeout(resolve, 3000 * consecutiveErrors));
            batchFrom = batchTo + 1;
          }
        }
        
        return allEvents;
      };

      // Get event signatures for getLogs
      const ticketsPurchasedTopic = ethers.id("TicketsPurchased(address,uint256[],uint256)");
      const rewardClaimedTopic = ethers.id("RewardClaimed(address,uint256,uint256,uint8)");
      
      // Query events sequentially to avoid rate limits
      // Start with tickets events using getLogs (more efficient)
      let ticketsEvents: any[] = [];
      try {
        const ticketsPurchasedFilter = lotteryContract.filters.TicketsPurchased();
        // Try getLogs first
        try {
          const logs = await queryEventsWithGetLogs([ticketsPurchasedTopic], fromBlock, currentBlock);
          ticketsEvents = logs.map((log: any) => {
            try {
              return lotteryContract.interface.parseLog(log);
            } catch {
              return null;
            }
          }).filter((e: any) => e !== null);
        } catch {
          // Fall back to queryFilter with pagination
          ticketsEvents = await queryEventsWithPagination(
            ticketsPurchasedFilter,
            fromBlock,
            currentBlock
          );
        }
      } catch (error) {
        console.warn('Error querying tickets events:', error);
        ticketsEvents = [];
      }
      
      // Wait before querying reward events to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Then query reward events using getLogs
      let rewardEvents: any[] = [];
      try {
        const rewardClaimedFilter = lotteryContract.filters.RewardClaimed();
        // Try getLogs first
        try {
          const logs = await queryEventsWithGetLogs([rewardClaimedTopic], fromBlock, currentBlock);
          rewardEvents = logs.map((log: any) => {
            try {
              return lotteryContract.interface.parseLog(log);
            } catch {
              return null;
            }
          }).filter((e: any) => e !== null);
        } catch {
          // Fall back to queryFilter with pagination
          rewardEvents = await queryEventsWithPagination(
            rewardClaimedFilter,
            fromBlock,
            currentBlock
          );
        }
      } catch (error) {
        console.warn('Error querying reward events:', error);
        rewardEvents = [];
      }

      // 1. Calculate total tickets sold
      let totalTicketsSold = 0;
      for (const event of ticketsEvents) {
        try {
          if (event && event.args) {
            // Handle both ethers v5 and v6 event formats
            const ticketIds = event.args.ticketIds || event.args[1]; // ticketIds is second arg
            if (Array.isArray(ticketIds)) {
              totalTicketsSold += ticketIds.length;
            } else if (ticketIds && typeof ticketIds === 'object' && 'length' in ticketIds) {
              // Handle BigNumber array or similar
              totalTicketsSold += ticketIds.length;
            }
          }
        } catch (e) {
          // Skip invalid events
          console.warn('Error parsing ticket event:', e);
        }
      }

      // 2. Calculate total prizes distributed and biggest win
      let totalPrizesDistributed = BigInt(0);
      let biggestWin = BigInt(0);
      for (const event of rewardEvents) {
        try {
          if (event && event.args) {
            // Handle both ethers v5 and v6 event formats
            // RewardClaimed event: (address indexed user, uint256 ticketId, uint256 amount, uint8 tier)
            const amount = event.args.amount || event.args[2] || event.args[1];
            if (amount) {
              const amountBigInt = typeof amount === 'bigint' 
                ? amount 
                : BigInt(amount.toString());
              totalPrizesDistributed += amountBigInt;
              if (amountBigInt > biggestWin) {
                biggestWin = amountBigInt;
              }
            }
          }
        } catch (e) {
          // Skip invalid events - but log for debugging
          if (!silent) {
            console.warn('Error parsing reward event:', e, event);
          }
        }
      }

      // 3. Calculate total burned (5% of ticket sales)
      // Each ticket costs 0.1 PUSD, 5% is burned
      const ticketPrice = BigInt('100000000000000000'); // 0.1 PUSD in wei
      const burnRate = BigInt(500); // 5% = 500/10000
      const totalSales = BigInt(totalTicketsSold) * ticketPrice;
      const totalBurned = (totalSales * burnRate) / BigInt(10000);

      const statsData = {
        totalTicketsSold,
        totalPrizesDistributed: ethers.formatEther(totalPrizesDistributed.toString()),
        totalBurned: ethers.formatEther(totalBurned.toString()),
        biggestWin: ethers.formatEther(biggestWin.toString()),
      };
      
      // Debug logging (only in non-silent mode)
      if (!silent) {
        console.log('Lottery Stats:', {
          ticketsEvents: ticketsEvents.length,
          rewardEvents: rewardEvents.length,
          totalTicketsSold,
          totalPrizesDistributed: statsData.totalPrizesDistributed,
          totalBurned: statsData.totalBurned,
          biggestWin: statsData.biggestWin,
        });
      }
      
      setStats(statsData);
      // Cache for 30 minutes to significantly reduce RPC calls when multiple users access
      // Stats don't change frequently, so longer cache is acceptable
      cache.set(cacheKey, statsData, 1800000); // 30 minutes
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Error loading lottery stats:', error);
      // Silent errors for background refresh
      if (!silent) {
        // Set default values on error
        setStats({
          totalTicketsSold: 0,
          totalPrizesDistributed: '0',
          totalBurned: '0',
          biggestWin: '0',
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="lottery-stats-container">
        <div className="loading-state">
          <span className="terminal-prompt">&gt;</span> Loading statistics...
        </div>
      </div>
    );
  }

  return (
    <div className="lottery-stats-container">
      <h2>
        <span className="terminal-prompt">&gt;</span> Lottery Statistics
      </h2>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Tickets Sold</div>
          <div className="stat-value">
            {stats?.totalTicketsSold?.toLocaleString() || '0'}
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Total Prizes Distributed</div>
          <div className="stat-value">
            {stats?.totalPrizesDistributed 
              ? parseFloat(stats.totalPrizesDistributed).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '0.00'} PUSD
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Total PUSD Burned</div>
          <div className="stat-value">
            {stats?.totalBurned
              ? parseFloat(stats.totalBurned).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '0.00'} PUSD
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Biggest Win</div>
          <div className="stat-value">
            {stats?.biggestWin
              ? parseFloat(stats.biggestWin).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '0.00'} PUSD
          </div>
        </div>
      </div>
    </div>
  );
}

