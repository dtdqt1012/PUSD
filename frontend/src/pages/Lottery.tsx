import { useState, useEffect } from 'react';
import { useWeb3 } from '../hooks/useWeb3';
import { CONTRACTS } from '../config/contracts';
import { ethers } from 'ethers';
import { useNotification } from '../contexts/NotificationContext';
import BuyTickets from '../components/lottery/BuyTickets';
import MyTickets from '../components/lottery/MyTickets';
import LotteryStats from '../components/lottery/LotteryStats';
import LotteryResults from '../components/lottery/LotteryResults';
import '../index.css';

export default function Lottery() {
  const { provider, signer, account } = useWeb3();
  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState<'buy' | 'tickets' | 'stats' | 'results'>('buy');
  const [currentDraw, setCurrentDraw] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeUntilDraw, setTimeUntilDraw] = useState<string>('');
  const [triggering, setTriggering] = useState(false);
  const [canTrigger, setCanTrigger] = useState(false);

  useEffect(() => {
    if (provider && CONTRACTS.PUSDLottery) {
      loadCurrentDraw();
      checkCanTrigger();
    }
  }, [provider]);

  // Check if draw can be triggered
  useEffect(() => {
    if (provider && CONTRACTS.PUSDLottery) {
      const interval = setInterval(() => {
        checkCanTrigger();
      }, 60000); // Check every minute
      return () => clearInterval(interval);
    }
  }, [provider]);

  // Auto-update countdown every second
  useEffect(() => {
    const updateCountdown = () => {
      if (currentDraw) {
        const nextDrawTime = getNextDrawTime();
        setTimeUntilDraw(formatTimeUntilDraw(nextDrawTime));
      }
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [currentDraw]);

  const loadCurrentDraw = async () => {
    if (!provider || !CONTRACTS.PUSDLottery) {
      setLoading(false);
      return;
    }
    
    // Check if contract address is valid (not zero address)
    if (CONTRACTS.PUSDLottery.address === '0x0000000000000000000000000000000000000000') {
      setLoading(false);
      return;
    }
    
    try {
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        provider
      );

      const drawInfo = await lotteryContract.getCurrentDrawInfo();
      setCurrentDraw({
        drawId: drawInfo.drawId.toString(),
        drawType: drawInfo.drawType,
        jackpot: ethers.formatEther(drawInfo.jackpot || 0),
        ticketsSold: drawInfo.ticketsSold.toString(),
        timestamp: drawInfo.timestamp.toString(),
        resolved: drawInfo.resolved,
      });
    } catch (error) {
      console.error('Error loading draw info:', error);
      // Set default values if contract call fails
      setCurrentDraw({
        drawId: '1',
        drawType: 0,
        jackpot: '0',
        ticketsSold: '0',
        timestamp: Math.floor(Date.now() / 1000).toString(),
        resolved: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTimeUntilDraw = (timestamp: number) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = timestamp - now;
    
    if (diff <= 0) return 'Draw in progress...';
    
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const getNextDrawTime = () => {
    if (!currentDraw) return 0;
    // Daily draw at 20:00 UTC
    const now = new Date();
    const utcHour = now.getUTCHours();
    
    let nextDraw = new Date(now);
    nextDraw.setUTCHours(20, 0, 0, 0);
    
    if (utcHour >= 20) {
      nextDraw.setUTCDate(nextDraw.getUTCDate() + 1);
    }
    
    return Math.floor(nextDraw.getTime() / 1000);
  };

  const checkCanTrigger = async () => {
    if (!provider || !CONTRACTS.PUSDLottery) return;
    
    try {
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        provider
      );
      
      const [isDailyTime, isWeeklyTime] = await lotteryContract.checkDrawTime();
      setCanTrigger(isDailyTime || isWeeklyTime);
    } catch (error) {
      console.error('Error checking draw time:', error);
      setCanTrigger(false);
    }
  };

  const handleTriggerDraw = async () => {
    if (!signer || !CONTRACTS.PUSDLottery || !account) {
      showNotification('Please connect your wallet', 'error');
      return;
    }

    setTriggering(true);
    try {
      const lotteryContract = new ethers.Contract(
        CONTRACTS.PUSDLottery.address,
        CONTRACTS.PUSDLottery.abi,
        signer
      );

      // Check draw time first (to avoid wasting gas)
      const [isDailyTime, isWeeklyTime] = await lotteryContract.checkDrawTime();
      if (!isDailyTime && !isWeeklyTime) {
        showNotification('Not time for draw yet. Draw time is 20:00 UTC daily.', 'error');
        setTriggering(false);
        return;
      }

      showNotification('Triggering draw...', 'info');
      const tx = await lotteryContract.executeDraw();
      showNotification('Transaction sent! Waiting for confirmation...', 'info');
      
      await tx.wait();
      showNotification('Draw triggered successfully!', 'success');
      
      // Reload draw info
      await loadCurrentDraw();
      await checkCanTrigger();
    } catch (error: any) {
      console.error('Error triggering draw:', error);
      const errorMessage = error.reason || error.message || 'Failed to trigger draw';
      showNotification(errorMessage, 'error');
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="lottery-page">
      <div className="lottery-header">
        <h1>
          <span className="terminal-prompt">&gt;</span> PUSD Lottery
        </h1>
        <p className="lottery-subtitle">
          Win big with PUSD! Buy tickets for 0.1 PUSD each.
        </p>
      </div>

      {loading ? (
        <div className="lottery-loading">
          <span className="terminal-prompt">&gt;</span> Loading lottery data...
        </div>
      ) : (
        <>
          {/* Current Draw Info */}
          {currentDraw && (
            <div className="lottery-draw-info">
              <div className="draw-info-card">
                <div className="draw-info-label">Current Jackpot</div>
                <div className="draw-info-value">
                  {parseFloat(currentDraw.jackpot).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} PUSD
                </div>
              </div>
              <div className="draw-info-card">
                <div className="draw-info-label">Tickets Sold</div>
                <div className="draw-info-value">
                  {parseInt(currentDraw.ticketsSold).toLocaleString()}
                </div>
              </div>
              <div className="draw-info-card">
                <div className="draw-info-label">Next Draw</div>
                <div className="draw-info-value">
                  {timeUntilDraw || formatTimeUntilDraw(getNextDrawTime())}
                </div>
              </div>
            </div>
          )}

          {/* Trigger Draw Button */}
          <div className="trigger-draw-section">
            <div className="trigger-draw-info">
              <span className="terminal-prompt">&gt;</span> Help trigger the draw and keep the lottery running!
            </div>
            <button
              className={`btn-primary btn-trigger-draw ${canTrigger ? 'can-trigger' : ''}`}
              onClick={handleTriggerDraw}
              disabled={triggering || !account || !canTrigger}
            >
              {triggering ? (
                <>
                  <span className="terminal-prompt">&gt;</span> Triggering...
                </>
              ) : canTrigger ? (
                <>
                  <span className="terminal-prompt">&gt;</span> Trigger Draw Now
                </>
              ) : (
                <>
                  <span className="terminal-prompt">&gt;</span> Draw Time: 20:00 UTC
                </>
              )}
            </button>
            {!account && (
              <div className="trigger-draw-hint">
                Connect wallet to trigger draw
              </div>
            )}
            {account && !canTrigger && (
              <div className="trigger-draw-hint">
                Draw can only be triggered at 20:00 UTC daily
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="lottery-tabs">
            <button
              className={`lottery-tab ${activeTab === 'buy' ? 'active' : ''}`}
              onClick={() => setActiveTab('buy')}
            >
              Buy Tickets
            </button>
            <button
              className={`lottery-tab ${activeTab === 'tickets' ? 'active' : ''}`}
              onClick={() => setActiveTab('tickets')}
            >
              My Tickets
            </button>
            <button
              className={`lottery-tab ${activeTab === 'stats' ? 'active' : ''}`}
              onClick={() => setActiveTab('stats')}
            >
              Statistics
            </button>
            <button
              className={`lottery-tab ${activeTab === 'results' ? 'active' : ''}`}
              onClick={() => setActiveTab('results')}
            >
              Results
            </button>
          </div>

          {/* Tab Content */}
          <div className="lottery-content">
            {activeTab === 'buy' && (
              <BuyTickets
                onPurchaseSuccess={() => {
                  loadCurrentDraw();
                  setActiveTab('tickets');
                }}
              />
            )}
            {activeTab === 'tickets' && <MyTickets />}
            {activeTab === 'stats' && <LotteryStats />}
            {activeTab === 'results' && <LotteryResults />}
          </div>
        </>
      )}
    </div>
  );
}

