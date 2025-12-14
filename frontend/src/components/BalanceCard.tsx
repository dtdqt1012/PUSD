import { useEffect, useState, useRef } from 'react';
import { Contract } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { useNotification } from '../contexts/NotificationContext';
import { CONTRACTS } from '../config/contracts';
import { formatBalance, formatPrice } from '../utils/format';
import { cache } from '../utils/cache';
import TerminalNumber from './TerminalNumber';
import { loadWithTimeout } from '../utils/loadWithTimeout';
import { isRateLimitError, isRPCError, rpcBatchHandler } from '../utils/rpcHandler';
import { getUserActiveStakes, Stake } from '../utils/stakingHelpers';
import { lazy, Suspense } from 'react';
const TVLChart = lazy(() => import('./TVLChart'));

export default function BalanceCard() {
  const { provider, account, signer } = useWeb3();
  const { showNotification } = useNotification();
  const [polBalance, setPolBalance] = useState<string>('0');
  const [pusdBalance, setPusdBalance] = useState<string>('0');
  const [polPrice, setPolPrice] = useState<string>('0');
  const [totalPusd, setTotalPusd] = useState<string>('0');
  const [vaultPol, setVaultPol] = useState<string>('0');
  const [totalStaked, setTotalStaked] = useState<string>('0');
  const [userCollateral, setUserCollateral] = useState<string>('0');
  const [userPoints, setUserPoints] = useState<string>('0');
  const [totalStakes, setTotalStakes] = useState<string>('0');
  const [swapPoolReserves, setSwapPoolReserves] = useState<string>('0');
  const [pusdStaked, setPusdStaked] = useState<string>('0');
  const [claimableRewards, setClaimableRewards] = useState<string>('0');
  const [claimablePolRewards, setClaimablePolRewards] = useState<string>('0');
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(false);
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
      // Clear user data when disconnected
      setPolBalance('0');
      setPusdBalance('0');
      setUserCollateral('0');
      setUserPoints('0');
      return;
    }

    // Load with minimal delay to avoid blocking initial page load
    const loadData = async () => {
      if (loadingRef.current || !mountedRef.current) return;
      loadingRef.current = true;
      
      // Very minimal delay - load almost immediately
      await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
          const cacheKey = 'balance-data';
          const cached = cache.get<any>(cacheKey);
          if (cached && mountedRef.current) {
            setPolPrice(cached.polPrice || '0');
            setTotalPusd(cached.totalPusd || '0');
            setVaultPol(cached.vaultPol || '0');
            setTotalStaked(cached.totalStaked || '0');
            setSwapPoolReserves(cached.swapPoolReserves || '0');
            setTotalStakes(cached.totalStakes || '0');
            setLoading(false);
          }

          const vaultAddress = CONTRACTS.MintingVault.address;
          const vaultABI = CONTRACTS.MintingVault.abi;
          const swapAddress = CONTRACTS.SwapPool.address;
          const swapABI = CONTRACTS.SwapPool.abi;

          // const pgoldVaultContract = CONTRACTS.PGOLDVault 
          //   ? new Contract(CONTRACTS.PGOLDVault.address, CONTRACTS.PGOLDVault.abi, provider)
          //   : null;
          
          const [oracleContract, pusdContract, vaultContract, stakingContract, swapContract] = await Promise.all([
            new Contract(CONTRACTS.OraclePriceFeed.address, CONTRACTS.OraclePriceFeed.abi, provider),
            new Contract(CONTRACTS.PUSDToken.address, CONTRACTS.PUSDToken.abi, provider),
            new Contract(vaultAddress, vaultABI, provider),
            new Contract(CONTRACTS.LockToEarnPool.address, CONTRACTS.LockToEarnPool.abi, provider),
            new Contract(swapAddress, swapABI, provider),
          ]);

            const results = await Promise.allSettled([
              loadWithTimeout(() => oracleContract.getPOLPrice(), 5000).catch(() => null),
              loadWithTimeout(() => pusdContract.totalSupply(), 5000).catch(() => null),
              loadWithTimeout(() => vaultContract.getBalance(), 5000).catch(() => null),
              loadWithTimeout(() => stakingContract.totalLocked(), 5000).catch(() => null),
              loadWithTimeout(() => stakingContract.totalLocks(), 5000).catch(() => null),
              loadWithTimeout(() => swapContract.getBalance(), 5000).catch(() => null),
              loadWithTimeout(() => stakingContract.totalPUSDLocked(), 5000).catch(() => null),
            ]);

          if (!mountedRef.current) return;

          const price = results[0].status === 'fulfilled' && results[0].value ? formatPrice(results[0].value) : cached?.polPrice || '0';
          const totalSupply = results[1].status === 'fulfilled' && results[1].value ? formatBalance(results[1].value) : cached?.totalPusd || '0';
          const vault = results[2].status === 'fulfilled' && results[2].value ? formatBalance(results[2].value) : cached?.vaultPol || '0';
          const staked = results[3].status === 'fulfilled' && results[3].value ? formatBalance(results[3].value) : cached?.totalStaked || '0';
          const stakesCount = results[4].status === 'fulfilled' && results[4].value ? results[4].value.toString() : cached?.totalStakes || '0';
          const swapReserves = results[5].status === 'fulfilled' && results[5].value ? formatBalance(results[5].value) : cached?.swapPoolReserves || '0';
          const pusdStakedValue = results[6].status === 'fulfilled' && results[6].value ? formatBalance(results[6].value) : cached?.pusdStaked || '0';

          if (mountedRef.current) {
          setPolPrice(price);
          setTotalPusd(totalSupply);
          setVaultPol(vault);
          setTotalStaked(staked);
          setTotalStakes(stakesCount);
          setSwapPoolReserves(swapReserves);
          setPusdStaked(pusdStakedValue);
          
          // Cache price display for MintSection (10 minutes)
          if (price && price !== '0') {
            cache.set('pol-price-display', price, 600000);
          }

            // Cache for 15 minutes to reduce RPC calls
            cache.set(cacheKey, { 
              polPrice: price, 
              totalPusd: totalSupply, 
              vaultPol: vault,
              totalStaked: staked,
              totalStakes: stakesCount,
              swapPoolReserves: swapReserves,
              pusdStaked: pusdStakedValue,
            }, 900000);
          }

          if (account && mountedRef.current) {
            const vaultContract = new Contract(CONTRACTS.MintingVault.address, CONTRACTS.MintingVault.abi, provider);
            const rewardContract = new Contract(CONTRACTS.RewardDistributor.address, CONTRACTS.RewardDistributor.abi, provider);
            
            // Use rpcBatchHandler for all user-specific RPC calls
            const [polBal, pusdBal, userColl, points, claimable, userStakes] = await Promise.allSettled([
              rpcBatchHandler.add(() => provider.getBalance(account)).catch(() => null),
              rpcBatchHandler.add(() => pusdContract.balanceOf(account)).catch(() => null),
              rpcBatchHandler.add(() => vaultContract.userCollateral(account)).catch(() => null),
              rpcBatchHandler.add(() => stakingContract.getUserTotalPoints(account)).catch(() => null),
              rpcBatchHandler.add(() => rewardContract.getClaimableRewards(account)).catch(() => null),
              getUserActiveStakes(stakingContract, account).catch(() => []),
            ]);
            
            const totalColl = userColl.status === 'fulfilled' && userColl.value ? userColl.value : 0n;
            
            // Calculate claimable POL from unlocked stakes
            let claimablePol = 0n;
            if (userStakes.status === 'fulfilled' && userStakes.value) {
              const currentTime = Math.floor(Date.now() / 1000);
              for (const stake of userStakes.value) {
                if (stake.active && Number(stake.lockUntil) <= currentTime) {
                  claimablePol += BigInt(stake.amount.toString());
                }
              }
            }
            
            if (mountedRef.current) {
              setPolBalance(polBal.status === 'fulfilled' && polBal.value ? formatBalance(polBal.value) : '0');
              setPusdBalance(pusdBal.status === 'fulfilled' && pusdBal.value ? formatBalance(pusdBal.value) : '0');
              setUserCollateral(formatBalance(totalColl));
              setUserPoints(points.status === 'fulfilled' && points.value ? formatBalance(points.value) : '0');
              setClaimableRewards(claimable.status === 'fulfilled' && claimable.value ? formatBalance(claimable.value) : '0');
              setClaimablePolRewards(formatBalance(claimablePol));
            }
          }
        } catch (error) {
          // Error loading balance data
        } finally {
          if (mountedRef.current) {
            setLoading(false);
            loadingRef.current = false;
          }
        }
      };

    // Load immediately
    loadData();

    const interval = setInterval(() => {
      if (!loadingRef.current && mountedRef.current && provider) {
        loadingRef.current = true;
        (async () => {
          try {
            const vaultAddress = CONTRACTS.MintingVault.address;
            const vaultABI = CONTRACTS.MintingVault.abi;
            const swapAddress = CONTRACTS.SwapPool.address;
            const swapABI = CONTRACTS.SwapPool.abi;

            // const pgoldVaultContract = CONTRACTS.PGOLDVault 
            //   ? new Contract(CONTRACTS.PGOLDVault.address, CONTRACTS.PGOLDVault.abi, provider)
            //   : null;
            
            const [oracleContract, pusdContract, vaultContract, stakingContract, swapContract] = await Promise.all([
              new Contract(CONTRACTS.OraclePriceFeed.address, CONTRACTS.OraclePriceFeed.abi, provider),
              new Contract(CONTRACTS.PUSDToken.address, CONTRACTS.PUSDToken.abi, provider),
              new Contract(vaultAddress, vaultABI, provider),
              new Contract(CONTRACTS.LockToEarnPool.address, CONTRACTS.LockToEarnPool.abi, provider),
              new Contract(swapAddress, swapABI, provider),
            ]);

            const results = await Promise.allSettled([
              loadWithTimeout(() => oracleContract.getPOLPrice(), 5000).catch(() => null),
              loadWithTimeout(() => pusdContract.totalSupply(), 5000).catch(() => null),
              loadWithTimeout(() => vaultContract.getBalance(), 5000).catch(() => null),
              loadWithTimeout(() => stakingContract.totalLocked(), 5000).catch(() => null),
              loadWithTimeout(() => stakingContract.totalLocks(), 5000).catch(() => null),
              loadWithTimeout(() => swapContract.getBalance(), 5000).catch(() => null),
              loadWithTimeout(() => stakingContract.totalPUSDLocked(), 5000).catch(() => null),
            ]);

            if (!mountedRef.current) return;

            const price = results[0]?.status === 'fulfilled' && results[0].value ? formatPrice(results[0].value) : null;
            const total = results[1]?.status === 'fulfilled' && results[1].value ? formatBalance(results[1].value) : null;
            const vault = results[2]?.status === 'fulfilled' && results[2].value ? formatBalance(results[2].value) : null;
            const staked = results[3]?.status === 'fulfilled' && results[3].value ? formatBalance(results[3].value) : null;
            const stakesCount = results[4]?.status === 'fulfilled' && results[4].value ? results[4].value.toString() : null;
            const swapReserves = results[5]?.status === 'fulfilled' && results[5].value ? formatBalance(results[5].value) : null;
            const pusdStakedValue = results[6]?.status === 'fulfilled' && results[6].value ? formatBalance(results[6].value) : null;

            if (mountedRef.current) {
              if (price) setPolPrice(price);
              if (total) setTotalPusd(total);
              if (vault) setVaultPol(vault);
              if (staked) setTotalStaked(staked);
              if (stakesCount) setTotalStakes(stakesCount);
              if (swapReserves) setSwapPoolReserves(swapReserves);
              if (pusdStakedValue) setPusdStaked(pusdStakedValue);

              if (price && price !== '0') {
                cache.set('pol-price-display', price, 300000); // 5 minutes
              }

              const cacheKey = 'balance-data';
              cache.set(cacheKey, { 
                polPrice: price || cache.get<any>(cacheKey)?.polPrice,
                totalPusd: total || cache.get<any>(cacheKey)?.totalPusd,
                vaultPol: vault || cache.get<any>(cacheKey)?.vaultPol,
                totalStaked: staked || cache.get<any>(cacheKey)?.totalStaked,
                totalStakes: stakesCount || cache.get<any>(cacheKey)?.totalStakes,
                swapPoolReserves: swapReserves || cache.get<any>(cacheKey)?.swapPoolReserves,
                pusdStaked: pusdStakedValue || cache.get<any>(cacheKey)?.pusdStaked,
              }, 300000); // 5 minutes

              // Refresh user data if account connected
              if (account && mountedRef.current) {
                const vaultContract = new Contract(CONTRACTS.MintingVault.address, CONTRACTS.MintingVault.abi, provider);
                const rewardContract = new Contract(CONTRACTS.RewardDistributor.address, CONTRACTS.RewardDistributor.abi, provider);
                
                // Use rpcBatchHandler for all user-specific RPC calls
                const [polBal, pusdBal, userColl, points, claimable, userStakes] = await Promise.allSettled([
                  rpcBatchHandler.add(() => provider.getBalance(account)).catch(() => null),
                  rpcBatchHandler.add(() => pusdContract.balanceOf(account)).catch(() => null),
                  rpcBatchHandler.add(() => vaultContract.userCollateral(account)).catch(() => null),
                  rpcBatchHandler.add(() => stakingContract.getUserTotalPoints(account)).catch(() => null),
                  rpcBatchHandler.add(() => rewardContract.getClaimableRewards(account)).catch(() => null),
                  getUserActiveStakes(stakingContract, account).catch(() => []),
                ]);
                
                const totalColl = userColl.status === 'fulfilled' && userColl.value ? userColl.value : 0n;
                
                // Calculate claimable POL from unlocked stakes
                let claimablePol = 0n;
                if (userStakes.status === 'fulfilled' && userStakes.value) {
                  const currentTime = Math.floor(Date.now() / 1000);
                  for (const stake of userStakes.value) {
                    if (stake.active && Number(stake.lockUntil) <= currentTime) {
                      claimablePol += BigInt(stake.amount.toString());
                    }
                  }
                }
                
                if (mountedRef.current) {
                  if (polBal.status === 'fulfilled' && polBal.value) setPolBalance(formatBalance(polBal.value));
                  if (pusdBal.status === 'fulfilled' && pusdBal.value) setPusdBalance(formatBalance(pusdBal.value));
                  setUserCollateral(formatBalance(totalColl));
                  if (points.status === 'fulfilled' && points.value) setUserPoints(formatBalance(points.value));
                  if (claimable.status === 'fulfilled' && claimable.value) setClaimableRewards(formatBalance(claimable.value));
                  setClaimablePolRewards(formatBalance(claimablePol));
                }
              }
            }
          } catch (error: any) {
            // Suppress rate limit and RPC errors
          } finally {
            loadingRef.current = false;
          }
        })();
      }
    }, 900000); // Auto-refresh every 15 minutes to reduce RPC calls

    return () => {
      clearInterval(interval);
      loadingRef.current = false;
    };
  }, [provider, account]);

  const handleClaimRewards = async () => {
    if (!signer || !account) return;
    if (parseFloat(claimableRewards) <= 0) {
      showNotification('No rewards to claim', 'error');
      return;
    }

    try {
      const rewardContract = new Contract(CONTRACTS.RewardDistributor.address, CONTRACTS.RewardDistributor.abi, signer);
      const tx = await rewardContract.claimRewards();
      await tx.wait();
      showNotification('Rewards claimed successfully!', 'success');
      // Refresh claimable rewards
      setClaimableRewards('0');
    } catch (error: any) {
      showNotification(error?.reason || 'Failed to claim rewards', 'error');
    }
  };

  if (loading && polPrice === '0') {
    return (
      <div className="balance-card">
        <h2>Balance & Stats</h2>
        <div className="balance-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="balance-item">
              <div className="skeleton skeleton-text"></div>
              <div className="skeleton skeleton-large"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="balance-card">
      <h2>Balance & Stats</h2>
      
      {/* Market Price */}
      <div className="balance-group">
        <div className="balance-item featured">
          <label>POL Price</label>
          <div className="value">
            <TerminalNumber value={polPrice} prefix="$" />
          </div>
        </div>
      </div>

      {/* User Stats */}
      {account && (
        <div className="balance-group">
          <h3 className="group-title">Your Stats</h3>
          <div className="balance-grid compact">
            <div className="balance-item">
              <label>POL Balance</label>
              <div className="value">
                <TerminalNumber value={parseFloat(polBalance).toFixed(4)} />
              </div>
            </div>
            <div className="balance-item">
              <label>PUSD Balance</label>
              <div className="value">
                <TerminalNumber value={parseFloat(pusdBalance).toFixed(2)} />
              </div>
            </div>
            <div className="balance-item">
              <label>Collateral</label>
              <div className="value">
                <TerminalNumber value={parseFloat(userCollateral).toFixed(4)} suffix=" POL" />
              </div>
            </div>
            <div className="balance-item">
              <label>Points</label>
              <div className="value">
                <TerminalNumber value={parseFloat(userPoints).toFixed(2)} />
              </div>
            </div>
            <div className="balance-item highlight">
              <label>Claimable Rewards</label>
              <div className="value">
                <TerminalNumber value={parseFloat(claimableRewards).toFixed(2)} suffix=" PUSD" />
              </div>
              {parseFloat(claimablePolRewards) > 0 && (
                <div className="value" style={{ marginTop: '4px', fontSize: '0.9rem' }}>
                  <TerminalNumber value={parseFloat(claimablePolRewards).toFixed(4)} suffix=" POL" />
                </div>
              )}
              {parseFloat(claimableRewards) > 0 && signer && (
                <button
                  onClick={handleClaimRewards}
                  className="claim-btn"
                  style={{
                    marginTop: '8px',
                    padding: '6px 12px',
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                    border: 'none',
                    borderRadius: '4px',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                >
                  Claim PUSD
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Platform Stats */}
      <div className="balance-group">
        <h3 className="group-title">Platform</h3>
        <div className="balance-grid compact">
          <div className="balance-item">
            <label>Total PUSD</label>
            <div className="value">
              <TerminalNumber value={parseFloat(totalPusd).toFixed(2)} />
            </div>
          </div>
          <div className="balance-item">
            <label>Vault POL</label>
            <div className="value">
              <TerminalNumber value={parseFloat(vaultPol).toFixed(4)} />
            </div>
          </div>
          <div className="balance-item">
            <label>Staked POL</label>
            <div className="value">
              <TerminalNumber value={parseFloat(totalStaked).toFixed(4)} />
            </div>
          </div>
          <div className="balance-item">
            <label>Swap Reserves</label>
            <div className="value">
              <TerminalNumber value={parseFloat(swapPoolReserves).toFixed(4)} />
            </div>
          </div>
          <div className="balance-item">
            <label>PUSD Staked</label>
            <div className="value">
              <TerminalNumber value={parseFloat(pusdStaked).toFixed(2)} suffix=" PUSD" />
            </div>
          </div>
        </div>
      </div>

      {/* TVL Chart - Lazy loaded to reduce initial RPC calls */}
      <div className="info-section">
        <Suspense fallback={<div style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontFamily: 'Courier New, monospace' }}><span style={{ color: '#00ff00' }}>&gt;</span> Loading...</div>}>
          <TVLChart />
        </Suspense>
      </div>

      {/* Key Metrics */}
      <div className="info-section">
        <h3>Key Metrics</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <strong>PUSD Staked</strong>
            <span>
              <TerminalNumber value={pusdStaked} suffix=" PUSD" />
            </span>
          </div>
          <div className="stat-item">
            <strong>Total Stakes</strong>
            <span>
              <TerminalNumber value={totalStakes} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
