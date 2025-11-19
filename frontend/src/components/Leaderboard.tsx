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

        // Query from recent blocks only (last 100k blocks ~2 weeks) for faster loading
        // This ensures we get recent stakers without querying entire history
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 100000); // Last 100k blocks only

        // Query all Staked events (POL staking)
        const stakedEvents = await loadWithTimeout(
          stakingContract.queryFilter(stakingContract.filters.Staked(), fromBlock, currentBlock),
          30000
        ).catch(() => []);

        // Query all PUSDStaked events (PUSD staking)
        const pusdStakedEvents = await loadWithTimeout(
          stakingContract.queryFilter(stakingContract.filters.PUSDStaked(), fromBlock, currentBlock),
          30000
        ).catch(() => []);

        // Get unique users from both event types
        const userSet = new Set<string>();
        
        // Add users from POL staking events
        for (const event of stakedEvents) {
          const log = event as EventLog;
          if (log.args && log.args.user) {
            userSet.add(log.args.user.toString());
          }
        }
        
        // Add users from PUSD staking events
        for (const event of pusdStakedEvents) {
          const log = event as EventLog;
          if (log.args && log.args.user) {
            userSet.add(log.args.user.toString());
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
                    <div className="points-col">
                      <strong>{parseFloat(entry.points).toFixed(2)}</strong>
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

