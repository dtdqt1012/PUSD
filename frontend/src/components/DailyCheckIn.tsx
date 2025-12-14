import { useState, useEffect, useRef } from 'react';
import { Contract } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { useNotification } from '../contexts/NotificationContext';
import { CONTRACTS } from '../config/contracts';
import { formatBalance } from '../utils/format';
import { executeTransaction, getTransactionErrorMessage } from '../utils/transaction';
import { loadWithTimeout } from '../utils/loadWithTimeout';
import { useExpandable } from '../hooks/useExpandable';

interface CheckInData {
  lastCheckIn: bigint;
  currentStreak: bigint;
  longestStreak: bigint;
  totalCheckIns: bigint;
  totalPoints: bigint;
  hasPOG: boolean;
}

export default function DailyCheckIn() {
  const { signer, account, isConnected } = useWeb3();
  const { showNotification } = useNotification();
  const { isExpanded, toggle, headerStyle, toggleIcon } = useExpandable();
  const [checkInData, setCheckInData] = useState<CheckInData | null>(null);
  const [canCheckIn, setCanCheckIn] = useState(false);
  const [daysUntilNext, setDaysUntilNext] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!signer || !account) {
      setLoadingData(false);
      return;
    }

    const loadCheckInData = async () => {
      try {
        const checkInContract = new Contract(
          CONTRACTS.DailyCheckIn.address,
          CONTRACTS.DailyCheckIn.abi,
          signer
        );

        const [data, canCheck, daysUntil] = await Promise.allSettled([
          loadWithTimeout(() => checkInContract.getUserCheckIn(account), 10000).catch(() => null),
          loadWithTimeout(() => checkInContract.canCheckIn(account), 5000).catch(() => false),
          loadWithTimeout(() => checkInContract.getDaysUntilNextCheckIn(account), 5000).catch(() => 0),
        ]);

        if (mountedRef.current) {
          if (data.status === 'fulfilled' && data.value) {
            setCheckInData({
              lastCheckIn: data.value.lastCheckIn,
              currentStreak: data.value.currentStreak,
              longestStreak: data.value.longestStreak,
              totalCheckIns: data.value.totalCheckIns,
              totalPoints: data.value.totalPoints,
              hasPOG: data.value.hasPOG,
            });
          }
          if (canCheck.status === 'fulfilled') {
            setCanCheckIn(canCheck.value === true);
          }
          if (daysUntil.status === 'fulfilled') {
            setDaysUntilNext(Number(daysUntil.value));
          }
        }
      } catch (error: any) {
        // Suppress rate limit and RPC errors
      } finally {
        if (mountedRef.current) {
          setLoadingData(false);
        }
      }
    };

    // Load immediately with cache
    loadCheckInData();

    // Refresh every 15 minutes to reduce RPC calls
    const interval = setInterval(loadCheckInData, 900000);

    return () => {
      clearInterval(interval);
    };
  }, [signer, account]);

  const handleCheckIn = async () => {
    if (!signer || !account) return;

    setLoading(true);
    try {
      const checkInContract = new Contract(
        CONTRACTS.DailyCheckIn.address,
        CONTRACTS.DailyCheckIn.abi,
        signer
      );

      await executeTransaction(
        checkInContract,
        'checkIn',
        [],
        signer
      );

      showNotification('Check-in successful! Points added to your account.', 'success');
      
      // Reload data after a delay
      setTimeout(() => {
        if (mountedRef.current) {
          setCanCheckIn(false);
          // Reload will happen via interval
        }
      }, 2000);
    } catch (error: any) {
      showNotification(getTransactionErrorMessage(error), 'error');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  const formatDate = (timestamp: bigint) => {
    if (timestamp === 0n) return 'Never';
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString();
  };

  const getNextCheckInTime = () => {
    if (!checkInData || checkInData.lastCheckIn === 0n) return 'Now';
    const lastCheckIn = new Date(Number(checkInData.lastCheckIn) * 1000);
    const nextCheckIn = new Date(lastCheckIn);
    nextCheckIn.setDate(nextCheckIn.getDate() + 1);
    nextCheckIn.setHours(0, 0, 0, 0);
    return nextCheckIn.toLocaleString();
  };

  if (!isConnected) {
    return (
      <div className="section">
        <h2 onClick={toggle} style={headerStyle}>
          Daily Check-In {toggleIcon}
        </h2>
        {isExpanded && (
          <div style={{ padding: '1rem', textAlign: 'center', opacity: 0.6 }}>
            Connect your wallet to check in daily and earn points!
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="section">
      <h2 onClick={toggle} style={headerStyle}>
        Daily Check-In {toggleIcon}
      </h2>
      {isExpanded && (
        <>
          {loadingData ? (
            <div className="loading-skeleton">
              <div className="skeleton skeleton-large"></div>
            </div>
          ) : (
            <div className="checkin-container">
              <div className="checkin-stats">
                <div className="checkin-stat-item">
                  <div className="checkin-stat-label">Current Streak</div>
                  <div className="checkin-stat-value highlight">
                    {checkInData ? Number(checkInData.currentStreak) : 0} days 🔥
                  </div>
                </div>
                <div className="checkin-stat-item">
                  <div className="checkin-stat-label">Longest Streak</div>
                  <div className="checkin-stat-value">
                    {checkInData ? Number(checkInData.longestStreak) : 0} days
                  </div>
                </div>
                <div className="checkin-stat-item">
                  <div className="checkin-stat-label">Total Check-Ins</div>
                  <div className="checkin-stat-value">
                    {checkInData ? Number(checkInData.totalCheckIns) : 0}
                  </div>
                </div>
                <div className="checkin-stat-item">
                  <div className="checkin-stat-label">Points Earned</div>
                  <div className="checkin-stat-value">
                    {checkInData ? formatBalance(checkInData.totalPoints) : '0'}
                  </div>
                </div>
              </div>

              {checkInData?.hasPOG && (
                <div className="checkin-pog-badge">
                  🏆 You earned a POG NFT at 66 days streak!
                </div>
              )}

              <div className="checkin-info">
                <div className="checkin-info-row">
                  <span className="checkin-label">Last Check-In:</span>
                  <span className="checkin-value">
                    {checkInData ? formatDate(checkInData.lastCheckIn) : 'Never'}
                  </span>
                </div>
                <div className="checkin-info-row">
                  <span className="checkin-label">Next Check-In:</span>
                  <span className="checkin-value">{getNextCheckInTime()}</span>
                </div>
                {checkInData && checkInData.currentStreak > 0n && (
                  <div className="checkin-info-row">
                    <span className="checkin-label">Streak Progress:</span>
                    <span className="checkin-value">
                      {Number(checkInData.currentStreak)} / 66 days (POG NFT at 66 days)
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={handleCheckIn}
                disabled={loading || !canCheckIn}
                className={`btn-primary ${canCheckIn ? 'pulse' : ''}`}
                style={{
                  width: '100%',
                  marginTop: '1rem',
                  padding: '1rem 1rem 1rem 3.5rem',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  ...(!canCheckIn && daysUntilNext === 0 ? {
                    background: '#000000',
                    border: '2px solid #00ff00',
                    color: '#00ff00',
                    fontFamily: 'Courier New, monospace',
                    textTransform: 'uppercase',
                    letterSpacing: '2px',
                    boxShadow: '0 0 10px rgba(0, 255, 0, 0.5)',
                    cursor: 'not-allowed',
                  } : {})
                }}
              >
                {loading ? (
                  'Checking in...'
                ) : canCheckIn ? (
                  'CHECK IN'
                ) : daysUntilNext > 0 ? (
                  `Check in available in ${daysUntilNext} day(s)`
                ) : (
                  'ALREADY CHECKED IN TODAY'
                )}
              </button>

              <div className="checkin-note" style={{ marginTop: '1rem', fontSize: '0.85rem', opacity: 0.7 }}>
                <p>• Check in daily to earn 0.001 points per check-in</p>
                <p>• Maintain a 66-day streak to earn a POG NFT</p>
                <p>• Missing a day resets your streak to 0</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

