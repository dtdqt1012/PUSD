import { useState, useEffect, useRef } from 'react';
import { Contract, EventLog } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { CONTRACTS } from '../config/contracts';
import { formatBalance } from '../utils/format';
import { loadWithTimeout } from '../utils/loadWithTimeout';
import { useExpandable } from '../hooks/useExpandable';
import { callWithRpcFallback } from '../utils/rpcProvider';
import { isRateLimitError, isRPCError } from '../utils/rpcHandler';

interface LeaderboardEntry {
  address: string;
  points: string;
  rank: number;
}

export default function Leaderboard() {
  const { provider } = useWeb3();
  const { isExpanded, toggle, headerStyle, toggleIcon } = useExpandable(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!provider) {
      setLoading(false);
      return;
    }

    const loadLeaderboard = async () => {
      if (!mountedRef.current) return;
      setLoading(true);

      try {
        const stakingContract = new Contract(
          CONTRACTS.LockToEarnPool.address,
          CONTRACTS.LockToEarnPool.abi,
          provider
        );

        const currentBlock = await callWithRpcFallback(async (rpcProvider) => {
          return await rpcProvider.getBlockNumber();
        }).catch(() => {
          if (mountedRef.current) {
            setLoading(false);
          }
          return null;
        });
        
        if (!currentBlock) return;
        
        // Find deployment block - use a reasonable default (last 1M blocks) to capture more data
        // This is more efficient and avoids RPC errors
        const maxBlocksToSearch = 1000000; // Last 1M blocks (~24 days on Polygon)
        const fromBlock = Math.max(0, currentBlock - maxBlocksToSearch);

        // Query events with pagination to get all data from deployment
        const queryWithPagination = async (eventName: 'Locked' | 'PUSDLocked' | 'LockExtended'): Promise<EventLog[]> => {
          const totalRange = currentBlock - fromBlock;
          const maxRangePerQuery = 50000; // 50k blocks per query
          
          // If range is small enough, try to query all at once first
          if (totalRange <= maxRangePerQuery) {
            try {
              const events = await callWithRpcFallback(async (rpcProvider) => {
                const contract = new Contract(
                  CONTRACTS.LockToEarnPool.address,
                  CONTRACTS.LockToEarnPool.abi,
                  rpcProvider
                );
                let filter;
                if (eventName === 'Locked') {
                  filter = contract.filters.Locked();
                } else if (eventName === 'PUSDLocked') {
                  filter = contract.filters.PUSDLocked();
                } else {
                  filter = contract.filters.LockExtended();
                }
                return await contract.queryFilter(filter, fromBlock, currentBlock);
              }).catch(() => []);
              
              return events.filter((e): e is EventLog => 'args' in e) as EventLog[];
            } catch (error: any) {
              // Fall through to batch query
            }
          }
          
          // Query in batches from deployment to current
          const allEvents: EventLog[] = [];
          let batchFrom = fromBlock;
          let consecutiveErrors = 0;
          const maxConsecutiveErrors = 5; // Allow more errors before stopping
          
          while (batchFrom < currentBlock && consecutiveErrors < maxConsecutiveErrors) {
            const batchTo = Math.min(batchFrom + maxRangePerQuery, currentBlock);
            try {
              const batchEvents = await callWithRpcFallback(async (rpcProvider) => {
                const contract = new Contract(
                  CONTRACTS.LockToEarnPool.address,
                  CONTRACTS.LockToEarnPool.abi,
                  rpcProvider
                );
                // Create filter from the contract instance
                let filter;
                if (eventName === 'Locked') {
                  filter = contract.filters.Locked();
                } else if (eventName === 'PUSDLocked') {
                  filter = contract.filters.PUSDLocked();
                } else {
                  filter = contract.filters.LockExtended();
                }
                return await contract.queryFilter(filter, batchFrom, batchTo);
              }).catch(() => []);
              
              const filteredEvents = batchEvents.filter((e): e is EventLog => 'args' in e) as EventLog[];
              allEvents.push(...filteredEvents);
              batchFrom = batchTo + 1;
              consecutiveErrors = 0; // Reset error count on success
              
              if (batchFrom < currentBlock) {
                await new Promise(resolve => setTimeout(resolve, 300)); // 300ms delay for RPC stability
              }
            } catch (error: any) {
              consecutiveErrors++;
              // Continue with next batch even if this one failed
              if (isRateLimitError(error) || isRPCError(error)) {
                // If rate limited, wait longer before continuing
                await new Promise(resolve => setTimeout(resolve, 1500));
              }
              batchFrom = batchTo + 1;
              
              // If too many consecutive errors, stop querying
              if (consecutiveErrors >= maxConsecutiveErrors) {
                break;
              }
            }
          }
          
          // Remove duplicates
          const uniqueEvents = allEvents.filter((event, index, self) =>
            index === self.findIndex(e => e.transactionHash === event.transactionHash && e.index === event.index)
          );
          
          return uniqueEvents;
        };

        // Query all events with pagination (sequential to avoid overwhelming RPC)
        const lockedEvents = await queryWithPagination('Locked');
        await new Promise(resolve => setTimeout(resolve, 500)); // Delay between event types
        
        const pusdLockedEvents = await queryWithPagination('PUSDLocked');
        await new Promise(resolve => setTimeout(resolve, 500)); // Delay between event types
        
        const lockExtendedEvents = await queryWithPagination('LockExtended');

        // Get unique users from all event types to ensure we capture all users
        const userSet = new Set<string>();
        
        // Add users from POL lock events
        for (const event of lockedEvents) {
          try {
            const log = event as EventLog;
            if (log && log.args && log.args.length > 0) {
              // Locked event: args[0] = user (indexed)
              const user = log.args[0] || log.args.user;
              if (user) {
                userSet.add(user.toString().toLowerCase());
              }
            }
          } catch (e) {
            // Skip invalid events
          }
        }
        
        // Add users from PUSD lock events
        for (const event of pusdLockedEvents) {
          try {
            const log = event as EventLog;
            if (log && log.args && log.args.length > 0) {
              // PUSDLocked event: args[0] = user (indexed)
              const user = log.args[0] || log.args.user;
              if (user) {
                userSet.add(user.toString().toLowerCase());
              }
            }
          } catch (e) {
            // Skip invalid events
          }
        }

        // Add users from LockExtended events (users who extended their locks)
        for (const event of lockExtendedEvents) {
          try {
            const log = event as EventLog;
            if (log && log.args && log.args.length > 0) {
              // LockExtended event: args[0] = user (indexed)
              const user = log.args[0] || log.args.user;
              if (user) {
                userSet.add(user.toString().toLowerCase());
              }
            }
          } catch (e) {
            // Skip invalid events
          }
        }

        const users = Array.from(userSet);
        
        // If no users found from events, return empty leaderboard
        if (users.length === 0) {
          if (mountedRef.current) {
            setLeaderboard([]);
            setLoading(false);
          }
          return;
        }

        // Batch query points for all users to improve performance
        const entries: LeaderboardEntry[] = [];
        const batchSize = 10; // Reduced to 10 to avoid RPC overload
        
        for (let i = 0; i < users.length; i += batchSize) {
          const batch = users.slice(i, i + batchSize);
          const batchPromises = batch.map(async (user) => {
            try {
              const points = await callWithRpcFallback(async (rpcProvider) => {
                const contract = new Contract(
                  CONTRACTS.LockToEarnPool.address,
                  CONTRACTS.LockToEarnPool.abi,
                  rpcProvider
                );
                return await contract.getUserTotalPoints(user);
              }).catch(() => 0n);

              if (points > 0n) {
                return {
                  address: user,
                  points: formatBalance(points),
                  rank: 0, // Will be set after sorting
                };
              }
              return null;
            } catch (error: any) {
              // Skip if rate limit or RPC error
              if (isRateLimitError(error) || isRPCError(error)) {
                return null;
              }
              return null;
            }
          });

          const batchResults = await Promise.all(batchPromises);
          const validEntries = batchResults.filter((entry): entry is LeaderboardEntry => entry !== null);
          entries.push(...validEntries);

          // Delay between batches to avoid overwhelming the RPC
          if (i + batchSize < users.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }

        // Sort by points (descending)
        entries.sort((a, b) => parseFloat(b.points) - parseFloat(a.points));

        // Assign ranks
        entries.forEach((entry, index) => {
          entry.rank = index + 1;
        });

        // Limit to top 100
        const topEntries = entries.slice(0, 100);

        if (mountedRef.current) {
          setLeaderboard(topEntries);
        }
      } catch (error: any) {
        // Suppress rate limit and RPC errors
        if (!isRateLimitError(error) && !isRPCError(error)) {
          console.error('Error loading leaderboard:', error);
        }
        // Set empty leaderboard on error
        if (mountedRef.current) {
          setLeaderboard([]);
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    loadLeaderboard();
    const interval = setInterval(loadLeaderboard, 180000); // Refresh every 180 seconds (3 minutes) to reduce RPC calls

    return () => clearInterval(interval);
  }, [provider]);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="section leaderboard-section">
      <h2 onClick={toggle} style={headerStyle}>
        Leaderboard {toggleIcon}
      </h2>
      {isExpanded && (
        <>
          {loading ? (
            <div className="leaderboard-loading">
              <div className="skeleton skeleton-large"></div>
              <div className="skeleton skeleton-large"></div>
              <div className="skeleton skeleton-large"></div>
            </div>
          ) : leaderboard.length === 0 ? (
            <p style={{ opacity: 0.6, textAlign: 'center', padding: '2rem' }}>
              No rankings yet. Be the first to stake!
            </p>
          ) : (
            <div className="leaderboard-table">
              <div className="leaderboard-header">
                <div className="rank-col">Rank</div>
                <div className="address-col">Address</div>
                <div className="points-col">Points</div>
              </div>
              <div className="leaderboard-body">
                {leaderboard.map((entry, idx) => (
                  <div 
                    key={`${entry.address}-${idx}`} 
                    className={`leaderboard-row ${entry.rank <= 3 ? 'top-three' : ''}`}
                  >
                    <div className="rank-col">
                      #{entry.rank}
                    </div>
                    <div className="address-col">
                      <span className="address-text">{formatAddress(entry.address)}</span>
                      <button
                        className="btn-link small"
                        onClick={() => navigator.clipboard.writeText(entry.address)}
                        style={{ fontSize: '0.7rem', marginLeft: '0.5rem' }}
                      >
                        Copy
                      </button>
                    </div>
                    <div className="points-col" style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: '1.1rem', color: 'var(--text-green)' }}>
                        {(() => {
                          const pointsNum = parseFloat(entry.points);
                          if (pointsNum >= 1000000) {
                            return `${(pointsNum / 1000000).toFixed(2)}M`;
                          } else if (pointsNum >= 1000) {
                            return `${(pointsNum / 1000).toFixed(2)}K`;
                          } else {
                            return pointsNum.toLocaleString(undefined, { 
                              maximumFractionDigits: 2,
                              minimumFractionDigits: pointsNum < 1 ? 2 : 0
                            });
                          }
                        })()}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

