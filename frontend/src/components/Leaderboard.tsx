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

        // Query from block 0 to get ALL stakers (including old ones who haven't staked recently)
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = 0; // Query from beginning to get all users

        // Query all Staked events (POL staking) - from beginning
        // Use longer timeout for full history query
        const stakedEvents = await loadWithTimeout(
          stakingContract.queryFilter(stakingContract.filters.Staked(), fromBlock, currentBlock),
          120000 // 2 minutes timeout for full history
        ).catch((error) => {
          console.warn('Staked events query timeout or error:', error);
          // Fallback: try from last 500k blocks if full query fails
          const fallbackFromBlock = Math.max(0, currentBlock - 500000);
          return stakingContract.queryFilter(
            stakingContract.filters.Staked(), 
            fallbackFromBlock, 
            currentBlock
          ).catch(() => []);
        });

        // Query all PUSDStaked events (PUSD staking) - from beginning
        const pusdStakedEvents = await loadWithTimeout(
          stakingContract.queryFilter(stakingContract.filters.PUSDStaked(), fromBlock, currentBlock),
          120000 // 2 minutes timeout for full history
        ).catch((error) => {
          console.warn('PUSDStaked events query timeout or error:', error);
          // Fallback: try from last 500k blocks if full query fails
          const fallbackFromBlock = Math.max(0, currentBlock - 500000);
          return stakingContract.queryFilter(
            stakingContract.filters.PUSDStaked(), 
            fallbackFromBlock, 
            currentBlock
          ).catch(() => []);
        });

        // Get unique users from both event types
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


        const users = Array.from(userSet);

        // Get points for each user
        const entries: LeaderboardEntry[] = [];
        for (const user of users) {
          try {
            const points = await loadWithTimeout(
              stakingContract.getUserTotalPoints(user),
              5000
            ).catch(() => 0n);

            if (points > 0n) {
              entries.push({
                address: user,
                points: formatBalance(points),
                rank: 0, // Will be set after sorting
              });
            }
          } catch (error) {
            // Skip if error
            continue;
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
        console.error('Failed to load leaderboard:', error);
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

