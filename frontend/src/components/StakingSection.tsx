import { useState, useEffect, useRef } from 'react';
import { Contract } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { useNotification } from '../contexts/NotificationContext';
import { CONTRACTS } from '../config/contracts';
import { parseAmount, formatBalance } from '../utils/format';
import { cache } from '../utils/cache';
import { executeTransaction, getTransactionErrorMessage } from '../utils/transaction';
import { loadWithTimeout } from '../utils/loadWithTimeout';
import { isRateLimitError, isRPCError, rpcBatchHandler } from '../utils/rpcHandler';
import { useExpandable } from '../hooks/useExpandable';
import { getUserActiveStakes, getUserActivePUSDStakes, Stake, PUSDStake } from '../utils/stakingHelpers';

export default function StakingSection() {
  const { signer, account, isConnected } = useWeb3();
  const { showNotification } = useNotification();
  const { isExpanded, toggle, headerStyle, toggleIcon } = useExpandable();
  const [polAmount, setPolAmount] = useState('');
  const [lockDays, setLockDays] = useState('30');
  const [stakes, setStakes] = useState<Stake[]>([]);
  const [pusdStakes, setPusdStakes] = useState<PUSDStake[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStakes, setLoadingStakes] = useState(true);
  const [showStakesList, setShowStakesList] = useState(false);
  const [claimableRewards, setClaimableRewards] = useState<string>('0');
  const [claimablePolRewards, setClaimablePolRewards] = useState<string>('0');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setStakes([]);
    setPusdStakes([]);
    setLoadingStakes(true);
    
    if (!signer || !account) {
      setLoadingStakes(false);
      return;
    }

    // Load immediately with cache
    const loadStakes = async () => {
      try {
          
          const cacheKey = `stakes-${account}`;
          const pusdCacheKey = `pusd-stakes-${account}`;
          const cached = cache.get<Stake[]>(cacheKey);
          const cachedPusd = cache.get<PUSDStake[]>(pusdCacheKey);
          if (cached && cachedPusd && mountedRef.current) {
            setStakes(cached);
            setPusdStakes(cachedPusd);
            setLoadingStakes(false);
          }

          const stakingContract = new Contract(CONTRACTS.LockToEarnPool.address, CONTRACTS.LockToEarnPool.abi, signer);
          const rewardContract = new Contract(CONTRACTS.RewardDistributor.address, CONTRACTS.RewardDistributor.abi, signer);
          
          // Use shared utilities with rpcBatchHandler
          const [userStakes, userPusdStakes, claimable] = await Promise.allSettled([
            getUserActiveStakes(stakingContract, account).catch(() => []),
            getUserActivePUSDStakes(stakingContract, account).catch(() => []),
            rpcBatchHandler.add(() => rewardContract.getClaimableRewards(account)).catch(() => 0n),
          ]);
          
          if (mountedRef.current) {
            const stakesData = userStakes.status === 'fulfilled' ? userStakes.value : [];
            const pusdStakesData = userPusdStakes.status === 'fulfilled' ? userPusdStakes.value : [];
            setStakes(stakesData);
            setPusdStakes(pusdStakesData);
            setClaimableRewards(claimable.status === 'fulfilled' && claimable.value ? formatBalance(claimable.value) : '0');
            
            // Calculate claimable POL from unlocked stakes
            const currentTime = Math.floor(Date.now() / 1000);
            let claimablePol = 0n;
            for (const stake of stakesData) {
              if (stake.active && Number(stake.lockUntil) <= currentTime) {
                claimablePol += BigInt(stake.amount.toString());
              }
            }
            setClaimablePolRewards(formatBalance(claimablePol));
            
            // Cache for 5 minutes to reduce RPC calls
            if (userStakes.status === 'fulfilled') {
              cache.set(cacheKey, userStakes.value, 300000);
            }
            if (userPusdStakes.status === 'fulfilled') {
              cache.set(pusdCacheKey, userPusdStakes.value, 300000);
            }
          }
        } catch (error: any) {
          // Don't log rate limit errors
          if (!isRateLimitError(error) && !isRPCError(error)) {
            // Failed to load stakes
          }
          if (mountedRef.current) {
            setStakes([]);
            setPusdStakes([]);
          }
        } finally {
          if (mountedRef.current) {
            setLoadingStakes(false);
          }
        }
      };

    // Load immediately
    loadStakes();

    const interval = setInterval(() => {
      if (signer && account && mountedRef.current) {
        (async () => {
          try {
            const stakingContract = new Contract(CONTRACTS.LockToEarnPool.address, CONTRACTS.LockToEarnPool.abi, signer);
            const rewardContract = new Contract(CONTRACTS.RewardDistributor.address, CONTRACTS.RewardDistributor.abi, signer);
            
            // Use shared utilities with rpcBatchHandler
            const [userStakes, userPusdStakes, claimable] = await Promise.allSettled([
              getUserActiveStakes(stakingContract, account).catch(() => []),
              getUserActivePUSDStakes(stakingContract, account).catch(() => []),
              rpcBatchHandler.add(() => rewardContract.getClaimableRewards(account)).catch(() => 0n),
            ]);
            
            if (mountedRef.current) {
              if (userStakes.status === 'fulfilled') {
                const stakesData = userStakes.value;
                setStakes(stakesData);
                cache.set(`stakes-${account}`, stakesData, 300000); // 5 minutes
                
                // Calculate claimable POL from unlocked stakes
                const currentTime = Math.floor(Date.now() / 1000);
                let claimablePol = 0n;
                for (const stake of stakesData) {
                  if (stake.active && Number(stake.lockUntil) <= currentTime) {
                    claimablePol += BigInt(stake.amount.toString());
                  }
                }
                setClaimablePolRewards(formatBalance(claimablePol));
              }
              if (userPusdStakes.status === 'fulfilled') {
                setPusdStakes(userPusdStakes.value);
                cache.set(`pusd-stakes-${account}`, userPusdStakes.value, 300000); // 5 minutes
              }
              if (claimable.status === 'fulfilled' && claimable.value) {
                setClaimableRewards(formatBalance(claimable.value));
              }
            }
          } catch (error: any) {
            // Don't log rate limit errors
            if (!isRateLimitError(error) && !isRPCError(error)) {
              // Failed to refresh stakes
            }
          }
        })();
      }
    }, 900000); // Auto-refresh every 15 minutes to reduce RPC calls

    return () => {
      clearInterval(interval);
    };
  }, [signer, account]);

  const handleStake = async () => {
    if (!signer || !polAmount || parseFloat(polAmount) <= 0) return;
    if (parseInt(lockDays) < 30) {
      showNotification('Lock period must be at least 30 days', 'error');
      return;
    }

    setLoading(true);
    try {
      const stakingContract = new Contract(CONTRACTS.LockToEarnPool.address, CONTRACTS.LockToEarnPool.abi, signer);
      const polWei = parseAmount(polAmount);
      
      await executeTransaction(
        stakingContract,
        'lock',
        [parseInt(lockDays)],
        signer,
        { value: polWei }
      );
      
      showNotification('Stake successful!', 'success');
      setPolAmount('');
      cache.delete(`stakes-${account}`);
      // Reload stakes
      const lockCount = await stakingContract.getUserLockCount(account);
      const updatedStakes: Stake[] = [];
      for (let i = 0; i < lockCount; i++) {
        const lock = await stakingContract.getUserLock(account, i);
        if (lock.active) {
          updatedStakes.push({
            amount: lock.amount,
            lockUntil: lock.lockUntil,
            points: lock.points,
            createdAt: lock.createdAt,
            active: lock.active,
          });
        }
      }
      if (mountedRef.current) {
        setStakes(updatedStakes);
      }
    } catch (error: any) {
      // Stake failed
      showNotification(getTransactionErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUnstake = async (stakeId: number) => {
    if (!signer || !account) return;

    setLoading(true);
    try {
      const stakingContract = new Contract(CONTRACTS.LockToEarnPool.address, CONTRACTS.LockToEarnPool.abi, signer);
      
      await executeTransaction(
        stakingContract,
        'unlock',
        [stakeId],
        signer
      );
      
      showNotification('Unstake successful!', 'success');
      cache.delete(`stakes-${account}`);
      // Reload stakes
      const lockCount = await stakingContract.getUserLockCount(account);
      const updatedStakes: Stake[] = [];
      for (let i = 0; i < lockCount; i++) {
        const lock = await stakingContract.getUserLock(account, i);
        if (lock.active) {
          updatedStakes.push({
            amount: lock.amount,
            lockUntil: lock.lockUntil,
            points: lock.points,
            createdAt: lock.createdAt,
            active: lock.active,
          });
        }
      }
      if (mountedRef.current) {
        setStakes(updatedStakes);
      }
    } catch (error: any) {
      // Unstake failed
      showNotification(getTransactionErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUnstakePUSD = async (stakeId: number) => {
    if (!signer || !account) return;

    setLoading(true);
    try {
      const stakingContract = new Contract(CONTRACTS.LockToEarnPool.address, CONTRACTS.LockToEarnPool.abi, signer);
      
      await executeTransaction(
        stakingContract,
        'unlockPUSD',
        [stakeId],
        signer
      );
      
      showNotification('Unstake PUSD successful!', 'success');
      cache.delete(`pusd-stakes-${account}`);
      const updatedStakes = await stakingContract.getUserActivePUSDStakes(account);
      if (mountedRef.current) {
        setPusdStakes(updatedStakes);
      }
    } catch (error: any) {
      // Unstake PUSD failed
      showNotification(getTransactionErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimRewards = async () => {
    if (!signer || !account) return;
    if (parseFloat(claimableRewards) <= 0) {
      showNotification('No rewards to claim', 'error');
      return;
    }

    setLoading(true);
    try {
      const rewardContract = new Contract(CONTRACTS.RewardDistributor.address, CONTRACTS.RewardDistributor.abi, signer);
      
      await executeTransaction(
        rewardContract,
        'claimRewards',
        [],
        signer
      );
      
      showNotification('Rewards claimed successfully!', 'success');
      setClaimableRewards('0');
    } catch (error: any) {
      // Claim rewards failed
      showNotification(getTransactionErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimAllPol = async () => {
    if (!signer || !account) return;
    if (parseFloat(claimablePolRewards) <= 0) {
      showNotification('No POL to claim', 'error');
      return;
    }

    setLoading(true);
    try {
      const stakingContract = new Contract(CONTRACTS.LockToEarnPool.address, CONTRACTS.LockToEarnPool.abi, signer);
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Find all unlocked stake IDs
      const unlockedStakeIds: number[] = [];
      for (let i = 0; i < stakes.length; i++) {
        if (stakes[i].active && Number(stakes[i].lockUntil) <= currentTime) {
          unlockedStakeIds.push(i);
        }
      }

      if (unlockedStakeIds.length === 0) {
        showNotification('No unlocked stakes to claim', 'error');
        setLoading(false);
        return;
      }

      // Unstake all unlocked stakes
      for (const stakeId of unlockedStakeIds) {
        await executeTransaction(
          stakingContract,
          'unlock',
          [stakeId],
          signer
        );
      }
      
      showNotification(`Successfully claimed ${unlockedStakeIds.length} stake(s)!`, 'success');
      setClaimablePolRewards('0');
      
      // Reload stakes
      const lockCount = await stakingContract.getUserLockCount(account);
      const userStakes: Stake[] = [];
      for (let i = 0; i < lockCount; i++) {
        const lock = await stakingContract.getUserLock(account, i);
        if (lock.active) {
          userStakes.push({
            amount: lock.amount,
            lockUntil: lock.lockUntil,
            points: lock.points,
            createdAt: lock.createdAt,
            active: lock.active,
          });
        }
      }
      setStakes(userStakes);
    } catch (error: any) {
      // Claim POL failed
      showNotification(getTransactionErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="section staking-section">
      <h2 onClick={toggle} style={headerStyle}>
        HOLD POL {toggleIcon}
      </h2>
      {isExpanded && (
        <>
          {!isConnected ? (
            <p>Please connect your wallet</p>
          ) : (
            <>
          <div className="input-group">
            <label>POL Amount</label>
            <input
              type="number"
              value={polAmount}
              onChange={(e) => setPolAmount(e.target.value)}
              placeholder="0.0"
              step="0.0001"
              min="0"
            />
          </div>
          <div className="input-group">
            <label>Lock Days</label>
            <div className="lock-days-selector">
              <button
                type="button"
                onClick={() => setLockDays('30')}
                className={lockDays === '30' ? 'active' : ''}
              >
                30 Days
              </button>
              <button
                type="button"
                onClick={() => setLockDays('60')}
                className={lockDays === '60' ? 'active' : ''}
              >
                60 Days
              </button>
              <button
                type="button"
                onClick={() => setLockDays('120')}
                className={lockDays === '120' ? 'active' : ''}
              >
                120 Days
              </button>
              <button
                type="button"
                onClick={() => setLockDays('365')}
                className={lockDays === '365' ? 'active' : ''}
              >
                365 Days
              </button>
            </div>
            <input
              type="number"
              value={lockDays}
              onChange={(e) => setLockDays(e.target.value)}
              min="30"
              placeholder="Or enter custom days"
              style={{ marginTop: '0.75rem' }}
            />
          </div>
          <button
            onClick={handleStake}
            disabled={loading || !polAmount || parseFloat(polAmount) <= 0}
            className="btn-primary"
          >
            {loading ? 'Holding...' : 'HOLD POL'}
          </button>

          {(parseFloat(claimableRewards) > 0 || parseFloat(claimablePolRewards) > 0) && (
            <div className="rewards-section" style={{
              marginTop: '20px',
              padding: '15px',
              background: 'rgba(139, 92, 246, 0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(139, 92, 246, 0.3)',
            }}>
              <div style={{ marginBottom: '10px' }}>
                <strong style={{ color: 'var(--purple-glow)' }}>Claimable Rewards</strong>
                {parseFloat(claimableRewards) > 0 && (
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--green-glow)', marginTop: '5px' }}>
                    {parseFloat(claimableRewards).toFixed(2)} PUSD
                  </div>
                )}
                {parseFloat(claimablePolRewards) > 0 && (
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--green-glow)', marginTop: '5px' }}>
                    {parseFloat(claimablePolRewards).toFixed(4)} POL
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {parseFloat(claimableRewards) > 0 && (
                  <button
                    onClick={handleClaimRewards}
                    disabled={loading}
                    className="btn-primary"
                    style={{
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                    }}
                  >
                    {loading ? 'Claiming...' : 'Claim PUSD'}
                  </button>
                )}
                {parseFloat(claimablePolRewards) > 0 && (
                  <button
                    onClick={handleClaimAllPol}
                    disabled={loading}
                    className="btn-primary"
                    style={{
                      background: 'linear-gradient(135deg, #00ff00 0%, #00cc00 100%)',
                    }}
                  >
                    {loading ? 'Claiming...' : 'Claim All POL'}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="stakes-list">
            <h3 
              onClick={() => setShowStakesList(!showStakesList)} 
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              POL HELD ({stakes.length + pusdStakes.length}) {showStakesList ? '▼' : '▶'}
            </h3>
            {showStakesList && (
              <>
                {loadingStakes ? (
                  <>
                    <div className="skeleton skeleton-large"></div>
                    <div className="skeleton skeleton-large"></div>
                  </>
                ) : stakes.length === 0 && pusdStakes.length === 0 ? (
                  <p style={{ opacity: 0.6 }}>No active stakes</p>
                ) : (
                  <>
                    {stakes.length > 0 && (
                      <div style={{ marginBottom: '1.5rem' }}>
                        <h4 style={{ color: 'var(--cyan-glow)', fontSize: '0.9rem', marginBottom: '0.75rem', textTransform: 'uppercase' }}>POL Stakes ({stakes.length})</h4>
                        <div className="stakes-table">
                          <div className="stakes-header">
                            <div>Amount</div>
                            <div>Points</div>
                            <div>Unlock Date</div>
                            <div>Action</div>
                          </div>
                          {stakes.map((stake, idx) => {
                            const isUnlocked = Date.now() / 1000 > Number(stake.lockUntil);
                            const unlockDate = new Date(Number(stake.lockUntil) * 1000);
                            const daysRemaining = Math.ceil((Number(stake.lockUntil) - Date.now() / 1000) / 86400);
                            return (
                              <div key={idx} className="stake-row">
                                <div className="stake-amount">
                                  <strong>{formatBalance(stake.amount)} POL</strong>
                                </div>
                                <div className="stake-points">
                                  {formatBalance(stake.points)}
                                </div>
                                <div className="stake-unlock">
                                  {isUnlocked ? (
                                    <span style={{ color: 'var(--green-glow)' }}>Unlocked</span>
                                  ) : (
                                    <span>{unlockDate.toLocaleDateString()} ({daysRemaining}d left)</span>
                                  )}
                                </div>
                                <div className="stake-action">
                                  {isUnlocked ? (
                                    <button
                                      onClick={() => handleUnstake(idx)}
                                      disabled={loading}
                                      className="btn-secondary small"
                                    >
                                      Unstake
                                    </button>
                                  ) : (
                                    <span style={{ opacity: 0.5 }}>Locked</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {pusdStakes.length > 0 && (
                      <div>
                        <h4 style={{ color: 'var(--cyan-glow)', fontSize: '0.9rem', marginBottom: '0.75rem', textTransform: 'uppercase' }}>PUSD Stakes ({pusdStakes.length})</h4>
                        <div className="stakes-table">
                          <div className="stakes-header">
                            <div>Amount</div>
                            <div>Points</div>
                            <div>Unlock Date</div>
                            <div>Action</div>
                          </div>
                          {pusdStakes.map((stake, idx) => {
                            const isUnlocked = Date.now() / 1000 > Number(stake.lockUntil);
                            const unlockDate = new Date(Number(stake.lockUntil) * 1000);
                            const daysRemaining = Math.ceil((Number(stake.lockUntil) - Date.now() / 1000) / 86400);
                            return (
                              <div key={`pusd-${idx}`} className="stake-row">
                                <div className="stake-amount">
                                  <strong>{formatBalance(stake.amount)} PUSD</strong>
                                </div>
                                <div className="stake-points">
                                  {formatBalance(stake.points)}
                                </div>
                                <div className="stake-unlock">
                                  {isUnlocked ? (
                                    <span style={{ color: 'var(--green-glow)' }}>Unlocked</span>
                                  ) : (
                                    <span>{unlockDate.toLocaleDateString()} ({daysRemaining}d left)</span>
                                  )}
                                </div>
                                <div className="stake-action">
                                  {isUnlocked ? (
                                    <button
                                      onClick={() => handleUnstakePUSD(idx)}
                                      disabled={loading}
                                      className="btn-secondary small"
                                    >
                                      Unstake
                                    </button>
                                  ) : (
                                    <span style={{ opacity: 0.5 }}>Locked</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
