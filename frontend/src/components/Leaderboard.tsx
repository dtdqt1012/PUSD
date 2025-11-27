import { useState, useEffect, useRef } from 'react';
import { Contract, EventLog } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { CONTRACTS } from '../config/contracts';
import { formatBalance } from '../utils/format';
import { loadWithTimeout } from '../utils/loadWithTimeout';
import { useExpandable } from '../hooks/useExpandable';

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
          CONTRACTS.StakingPool.address,
          CONTRACTS.StakingPool.abi,
          provider
        );

        const currentBlock = await provider.getBlockNumber();
        
        // Find deployment block by querying first event from multiple ranges
        let fromBlock = 0; // Start from block 0 to ensure we get all data
        try {
          // Try multiple search ranges to find first event
          const searchRanges = [
            { from: 0, to: Math.min(currentBlock, 1000000) }, // 1M blocks
            { from: 0, to: Math.min(currentBlock, 2000000) }, // 2M blocks
            { from: 0, to: currentBlock }, // All blocks
          ];
          
          for (const range of searchRanges) {
            try {
              const firstStakedEvents = await loadWithTimeout(
                stakingContract.queryFilter(stakingContract.filters.Staked(), range.from, range.to),
                10000
              ).catch(() => []);
              
              if (firstStakedEvents.length > 0) {
                const earliestBlock = Math.min(...firstStakedEvents.map(e => e.blockNumber));
                fromBlock = Math.max(0, earliestBlock - 100);
                break; // Found, stop searching
              }
            } catch (error) {
              // Continue to next range
            }
          }
        } catch (error) {
          // Use block 0 if all searches fail
          fromBlock = 0;
        }

        // Query events with pagination to get all data from deployment
        const queryWithPagination = async (filter: any): Promise<EventLog[]> => {
          const totalRange = currentBlock - fromBlock;
          const maxRangePerQuery = 200000;
          
          // If range is small, query directly
          if (totalRange <= maxRangePerQuery) {
            try {
              return await loadWithTimeout(
                stakingContract.queryFilter(filter, fromBlock, currentBlock),
                20000
              ).catch(() => []);
            } catch (error) {
              return [];
            }
          }
          
          // Query in batches from deployment to current
          const allEvents: EventLog[] = [];
          let batchFrom = fromBlock;
          
          while (batchFrom < currentBlock) {
            const batchTo = Math.min(batchFrom + maxRangePerQuery, currentBlock);
            try {
              const batchEvents = await loadWithTimeout(
                stakingContract.queryFilter(filter, batchFrom, batchTo),
                20000
              ).catch(() => []);
              
              allEvents.push(...batchEvents);
              batchFrom = batchTo + 1;
              
              if (batchFrom < currentBlock) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            } catch (error) {
              // Continue with next batch even if this one failed
              batchFrom = batchTo + 1;
            }
          }
          
          // Remove duplicates
          const uniqueEvents = allEvents.filter((event, index, self) =>
            index === self.findIndex(e => e.transactionHash === event.transactionHash && e.logIndex === event.logIndex)
          );
          
          return uniqueEvents;
        };

        // Query all events with pagination
        const [stakedEvents, pusdStakedEvents, lockExtendedEvents] = await Promise.all([
          queryWithPagination(stakingContract.filters.Staked()),
          queryWithPagination(stakingContract.filters.PUSDStaked()),
          queryWithPagination(stakingContract.filters.LockExtended()),
        ]);

        // Get unique users from all event types to ensure we capture all users
        const userSet = new Set<string>();
        
        // Add users from POL staking events
        for (const event of stakedEvents) {
          const log = event as EventLog;
          if (log.args && log.args.user) {
            userSet.add(log.args.user.toString().toLowerCase());
          }
        }
        
        // Add users from PUSD staking events
        for (const event of pusdStakedEvents) {
          const log = event as EventLog;
          if (log.args && log.args.user) {
            userSet.add(log.args.user.toString().toLowerCase());
          }
        }

        // Add users from LockExtended events (users who extended their locks)
        for (const event of lockExtendedEvents) {
          const log = event as EventLog;
          if (log.args && log.args.user) {
            userSet.add(log.args.user.toString().toLowerCase());
          }
        }

        const users = Array.from(userSet);

        // Batch query points for all users to improve performance
        const entries: LeaderboardEntry[] = [];
        const batchSize = 20; // Process 20 users at a time
        
        for (let i = 0; i < users.length; i += batchSize) {
          const batch = users.slice(i, i + batchSize);
          const batchPromises = batch.map(async (user) => {
            try {
              const points = await loadWithTimeout(
                stakingContract.getUserTotalPoints(user),
                10000 // Longer timeout for batch processing
              ).catch(() => 0n);

              if (points > 0n) {
                return {
                  address: user,
                  points: formatBalance(points),
                  rank: 0, // Will be set after sorting
                };
              }
              return null;
            } catch (error) {
              // Skip if error
              return null;
            }
          });

          const batchResults = await Promise.all(batchPromises);
          const validEntries = batchResults.filter((entry): entry is LeaderboardEntry => entry !== null);
          entries.push(...validEntries);

          // Small delay between batches to avoid overwhelming the RPC
          if (i + batchSize < users.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
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
      } catch (error) {
        // Error loading leaderboard
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    loadLeaderboard();
    const interval = setInterval(loadLeaderboard, 60000); // Refresh every 60 seconds

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

