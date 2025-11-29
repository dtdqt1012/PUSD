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
      
      // Check contract's checkDrawTime first
      const [isDailyTime, isWeeklyTime] = await lotteryContract.checkDrawTime();
      
      // Also check client-side: allow draw during entire hour (20:00-20:59 UTC)
      const now = new Date();
      const utcHour = now.getUTCHours();
      const isDrawHour = utcHour === 20; // Only 20:00-20:59 UTC
      
      // Allow if contract says yes OR if it's draw hour
      setCanTrigger(isDailyTime || isWeeklyTime || isDrawHour);
    } catch (error) {
      console.error('Error checking draw time:', error);
      // Fallback: check client-side only
      const now = new Date();
      const utcHour = now.getUTCHours();
      const isDrawHour = utcHour === 20; // Only 20:00-20:59 UTC
      setCanTrigger(isDrawHour);
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
      // But allow trying during entire hour (20:00-20:59 UTC)
      const now = new Date();
      const utcHour = now.getUTCHours();
      const isDrawHour = utcHour === 20;
      
      if (!isDrawHour) {
        showNotification('Draw time is 20:00-20:59 UTC daily. Please try again during that hour.', 'error');
        setTriggering(false);
        return;
      }
      
      // Still check contract's checkDrawTime for additional validation
      const [isDailyTime, isWeeklyTime] = await lotteryContract.checkDrawTime();
      if (!isDailyTime && !isWeeklyTime) {
        // Contract might reject if already drew today, but let user try anyway
        // The contract will give a clearer error message
      }

      showNotification('Triggering draw...', 'info');
      
      // Try to execute draw
      let tx;
      try {
        tx = await lotteryContract.executeDraw();
      } catch (error: any) {
        // Check specific error messages
        const errorMessage = error.reason || error.message || '';
        
        if (errorMessage.includes('Not time for draw yet')) {
          // Check if already drew today
          try {
            const currentDrawInfo = await lotteryContract.getCurrentDrawInfo();
            const lastDrawTimestamp = currentDrawInfo.timestamp;
            const lastDrawDate = new Date(Number(lastDrawTimestamp) * 1000);
            const currentDate = new Date();
            
            // Check if same day
            if (lastDrawDate.toDateString() === currentDate.toDateString()) {
              showNotification('Draw already executed today. Next draw is tomorrow at 20:00 UTC.', 'error');
            } else {
              showNotification('Not time for draw yet. Draw time is 20:00-20:59 UTC daily.', 'error');
            }
          } catch (checkError) {
            showNotification('Not time for draw yet. Draw time is 20:00-20:59 UTC daily.', 'error');
          }
        } else if (errorMessage.includes('Contract is paused')) {
          showNotification('Lottery is currently paused. Please try again later.', 'error');
        } else {
          showNotification(errorMessage || 'Failed to trigger draw. Please check if it\'s draw time (20:00-20:59 UTC).', 'error');
        }
        setTriggering(false);
        return;
      }
      
      showNotification('Transaction sent! Waiting for confirmation...', 'info');
      const receipt = await tx.wait();
      
      // Check if previous draw was resolved
      try {
        const lotteryContractRead = new ethers.Contract(
          CONTRACTS.PUSDLottery.address,
          CONTRACTS.PUSDLottery.abi,
          provider
        );
        
        const currentDrawId = await lotteryContractRead.currentDrawId();
        const previousDrawId = Number(currentDrawId) - 1;
        
        if (previousDrawId > 0) {
          const previousDraw = await lotteryContractRead.getDraw(previousDrawId);
          console.log(`Previous Draw #${previousDrawId}: resolved=${previousDraw.resolved}, winningNumber=${previousDraw.winningNumber}, ticketsSold=${previousDraw.ticketsSold}`);
          
          if (!previousDraw.resolved && previousDraw.ticketsSold > 0) {
            console.error(`⚠️ Previous Draw #${previousDrawId} was NOT resolved! This is a problem.`);
            showNotification(`Warning: Previous draw #${previousDrawId} was not resolved. Please check contract.`, 'error');
          } else if (previousDraw.resolved) {
            console.log(`✅ Previous Draw #${previousDrawId} was resolved successfully. Winning number: ${previousDraw.winningNumber.toString().padStart(6, '0')}`);
            showNotification(`Draw #${previousDrawId} resolved! Winning number: ${previousDraw.winningNumber.toString().padStart(6, '0')}`, 'success');
          }
        }
      } catch (error) {
        console.error('Error checking previous draw:', error);
      }
      
      showNotification('Draw triggered successfully!', 'success');
      
      // Wait a bit for blockchain to update
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Reload draw info
      await loadCurrentDraw();
      await checkCanTrigger();
      
      // Force refresh MyTickets if it's the active tab
      if (activeTab === 'tickets') {
        // Trigger a custom event to refresh MyTickets
        window.dispatchEvent(new CustomEvent('lottery-draw-triggered'));
      }
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
                <div style={{ marginBottom: '0.5rem' }}>
                  <span className="terminal-prompt">&gt;</span> Draw can be triggered from <strong>20:00 UTC</strong> to <strong>20:59 UTC</strong> daily
                </div>
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

