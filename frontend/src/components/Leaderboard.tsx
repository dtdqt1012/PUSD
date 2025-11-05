import { useState, useEffect, useRef } from 'react';
import { Contract, EventLog } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { CONTRACTS } from '../config/contracts';
import { formatBalance } from '../utils/format';

interface LeaderboardEntry {
  address: string;
  points: string;
  rank: number;
}

const loadWithTimeout = <T,>(promise: Promise<T>, timeout: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]);
};

export default function Leaderboard() {
  const { provider } = useWeb3();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
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

        // Get contract deployment block (or use 0 to search from beginning)
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 100000); // Last ~100k blocks

        // Query all Staked events to get all users
        const stakedEvents = await loadWithTimeout(
          stakingContract.queryFilter(stakingContract.filters.Staked(), fromBlock, currentBlock),
          30000
        ).catch(() => []);

        // Get unique users
        const userSet = new Set<string>();
        for (const event of stakedEvents) {
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
      <h2 onClick={() => setIsExpanded(!isExpanded)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        Leaderboard {isExpanded ? '▼' : '▶'}
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
                      {entry.rank === 1 && '🥇'}
                      {entry.rank === 2 && '🥈'}
                      {entry.rank === 3 && '🥉'}
                      {entry.rank > 3 && `#${entry.rank}`}
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

